const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { constants } = require("node:fs");
class DocumentStore {
  constructor() {
    this.grants = new Map();
    this.saving = new Set();
  }
  async grant(root, scope) {
    root = await fs.realpath(root);
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw Error("Not a directory");
    const id = crypto.randomUUID();
    this.grants.set(id, { root, scope, identity: `${stat.dev}:${stat.ino}` });
    return { id, name: path.basename(root), path: root };
  }
  async resolve(id, scope, relative = "") {
    const grant = this.grants.get(id);
    if (!grant || grant.scope !== scope)
      throw Error("Thư mục chưa được cấp quyền cho chat này.");
    if (grant.files && !grant.files.has(relative)) throw Error("File chưa được cấp quyền.");
    if (
      typeof relative !== "string" ||
      relative.includes("\0") ||
      path.isAbsolute(relative) ||
      relative.split(/[\\/]/).includes("..")
    )
      throw Error("Invalid path");
    const { isSecretPath } = await import("../server/project_scope.js");
    if (isSecretPath(relative) || relative.split(/[\\/]/).includes(".git"))
      throw Error("Sensitive path");
    const rootStat = await fs.stat(grant.root);
    if (
      (await fs.realpath(grant.root)) !== grant.root ||
      `${rootStat.dev}:${rootStat.ino}` !== grant.identity
    )
      throw Error("Workspace changed");
    const target = path.resolve(grant.root, relative);
    const real = await fs.realpath(target);
    const rel = path.relative(grant.root, real);
    if (rel.startsWith("..") || path.isAbsolute(rel) || real !== target)
      throw Error("Symlink/path boundary");
    return target;
  }
  async list(id, scope, relative) {
    const target = await this.resolve(id, scope, relative);
    const entries = await fs.readdir(target, { withFileTypes: true });
    if (entries.length > 5000)
      throw Error("Thư mục quá lớn (tối đa 5000 mục).");
    return entries
      .filter((e) => !e.isSymbolicLink() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: path.posix.join(relative || "", e.name),
        directory: e.isDirectory(),
      }))
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name),
      );
  }
  async read(id, scope, relative) {
    const target = await this.resolve(id, scope, relative);
    const handle = await fs.open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1 || stat.size > 25 * 1024 * 1024)
        throw Error("File không hợp lệ hoặc vượt 25 MB.");
      const data = await handle.readFile();
      return {
        data: new Uint8Array(data),
        version: crypto.createHash("sha256").update(data).digest("hex"),
        bytes: stat.size,
      };
    } finally {
      await handle.close();
    }
  }
  async search(id, scope, query) {
    if (typeof query !== "string" || query.length > 200)
      throw Error("Invalid search");
    const pending = [""],
      entries = [];
    let visited = 0,
      items = 0;
    while (
      pending.length &&
      visited < 500 &&
      items < 20000 &&
      entries.length < 200
    ) {
      const directory = pending.shift();
      visited++;
      for (const entry of await this.list(id, scope, directory)) {
        items++;
        if (entry.directory) pending.push(entry.path);
        else if (
          entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        )
          entries.push(entry);
        if (items >= 20000 || entries.length >= 200) break;
      }
    }
    return {
      entries,
      truncated: pending.length > 0 || items >= 20000 || entries.length >= 200,
    };
  }
  async save(id, scope, relative, content, version) {
    const key = JSON.stringify([id, scope, relative]);
    if (this.saving.has(key)) throw Error("File đang được lưu.");
    this.saving.add(key);
    try {
      return await this.saveDocument(id, scope, relative, content, version);
    } finally {
      this.saving.delete(key);
    }
  }
  async saveDocument(id, scope, relative, content, version) {
    if (
      !/\.md$/i.test(relative) ||
      typeof content !== "string" ||
      Buffer.byteLength(content) > 2 * 1024 * 1024
    )
      throw Error("Chỉ hỗ trợ lưu Markdown tối đa 2 MB.");
    const target = await this.resolve(id, scope, relative);
    const current = await this.read(id, scope, relative);
    if (current.version !== version)
      throw Error("File đã thay đổi bên ngoài. Tải lại trước khi lưu.");
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.copyFile(
        target,
        `${target}.ohmyt-backup`,
        constants.COPYFILE_EXCL,
      );
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      await fs.copyFile(
        target,
        `${target}.${crypto.randomUUID()}.ohmyt-backup`,
        constants.COPYFILE_EXCL,
      );
    }
    try {
      await fs.writeFile(temp, content, { flag: "wx", mode: 0o600 });
      if ((await this.read(id, scope, relative)).version !== version)
        throw Error("File changed");
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return this.read(id, scope, relative);
  }
}
function registerDocuments(ipcMain, window) {
  const store = new DocumentStore();
  for (const op of [
    "pick",
    "list",
    "read",
    "save",
    "reveal",
    "mutate",
    "search",
    "saveCopy",
  ]) {
    ipcMain.removeHandler(`documents-${op}`);
    ipcMain.handle(`documents-${op}`, async (event, args = {}) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw Error("Unknown sender");
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw Error("Invalid request");
      if (typeof args.scope !== "string" || args.scope.length > 200)
        throw Error("Invalid scope");
      if (op === "pick") {
        const single = args.mode === "file";
        const result = await require("electron").dialog.showOpenDialog(window, {
          title: single ? "Mở tài liệu" : "Mở thư mục tài liệu",
          properties: [single ? "openFile" : "openDirectory"],
          ...(single ? {filters:[{name:"Tài liệu",extensions:["md","pdf","docx","xlsx","xls","pptx"]}]} : {}),
        });
        if(result.canceled || !result.filePaths[0]) return null;
        if(!single) return store.grant(result.filePaths[0],args.scope);
        const selectedPath=result.filePaths[0];
        const grant=await store.grant(path.dirname(selectedPath),args.scope);
        const name=path.basename(selectedPath);
        store.grants.get(grant.id).files=new Set([name]);
        return {...grant,entry:{name,path:name,directory:false}};
      }
      if (op === "saveCopy") {
        const source = await store.resolve(args.id, args.scope, args.path);
        if (
          typeof args.name !== "string" ||
          args.name.length > 120 ||
          !args.name.endsWith(".md") ||
          /[\\/\x00-\x1f]/.test(args.name) ||
          args.name.startsWith(".") ||
          /[. ]$/.test(args.name)
        )
          throw Error("Invalid Markdown filename");
        const { isSecretPath } = await import("../server/project_scope.js");
        if (isSecretPath(args.name)) throw Error("Sensitive filename");
        if (
          typeof args.content !== "string" ||
          Buffer.byteLength(args.content) > 2 * 1024 * 1024
        )
          throw Error("Invalid copy content");
        const destination = path.join(path.dirname(source), args.name);
        await fs.writeFile(destination, args.content, {
          flag: "wx",
          mode: 0o600,
        });
        const grant = store.grants.get(args.id);
        const relative = path
          .relative(grant.root, destination)
          .split(path.sep)
          .join("/");
        if(grant.files) grant.files.add(relative);
        return {
          entry: { name: args.name, path: relative, directory: false },
          file: await store.read(args.id, args.scope, relative),
        };
      }
      if (op === "search") return store.search(args.id, args.scope, args.query);
      if (op === "mutate") {
        if (
          !["createFile", "createFolder", "rename", "delete"].includes(
            args.action,
          )
        )
          throw Error("Invalid action");
        const target = await store.resolve(
          args.id,
          args.scope,
          args.path || "",
        );
        const { dialog, shell } = require("electron");
        if (args.action === "delete") {
          if (!args.path) throw Error("Cannot delete root");
          const answer = await dialog.showMessageBox(window, {
            type: "warning",
            buttons: ["Hủy", "Chuyển vào thùng rác"],
            defaultId: 0,
            cancelId: 0,
            message: `Xóa ${path.basename(target)}?`,
            detail: "Thao tác này chỉ áp dụng cho mục được chọn.",
          });
          if (answer.response === 1) await shell.trashItem(target);
          return;
        }
        if (
          typeof args.name !== "string" ||
          args.name.length > 120 ||
          !args.name.trim() ||
          /[\\/\x00-\x1f]/.test(args.name) ||
          args.name.startsWith(".") ||
          /[. ]$/.test(args.name)
        )
          throw Error("Invalid filename");
        const { isSecretPath } = await import("../server/project_scope.js");
        if (isSecretPath(args.name)) throw Error("Sensitive filename");
        if (args.action === "createFile" && !/\.md$/i.test(args.name))
          throw Error("File mới cần có đuôi .md.");
        const parent = args.action === "rename" ? path.dirname(target) : target;
        if (args.action === "rename" && !args.path)
          throw Error("Cannot rename root");
        const destination = path.join(parent, args.name);
        try {
          await fs.lstat(destination);
          throw Error("Tên đã tồn tại.");
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        if (args.action === "rename") await fs.rename(target, destination);
        else if (args.action === "createFolder") await fs.mkdir(destination);
        else await fs.writeFile(destination, "", { flag: "wx", mode: 0o600 });
        return;
      }
      if (op === "reveal") {
        require("electron").shell.showItemInFolder(
          await store.resolve(args.id, args.scope, args.path),
        );
        return;
      }
      return store[op](
        args.id,
        args.scope,
        args.path,
        args.content,
        args.version,
      );
    });
  }
  window.on("closed", () => store.grants.clear());
  return store;
}
module.exports = { DocumentStore, registerDocuments };
