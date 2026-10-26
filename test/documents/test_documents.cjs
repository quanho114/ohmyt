const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { DocumentStore } = require("../../electron/documents.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ohmyt-documents-"));
  try {
    const store = new DocumentStore();
    await fs.writeFile(path.join(root, "a.md"), "# Original");
    await fs.mkdir(path.join(root, "child"));
    await fs.symlink(os.tmpdir(), path.join(root, "escape"));
    await fs.writeFile(path.join(root, ".env"), "secret");
    const grant = await store.grant(root, "chat-a");
    assert.equal((await store.list(grant.id, "chat-a", ""))[0].name, "child");
    assert(
      !(await store.list(grant.id, "chat-a", "")).some(
        (e) => e.name === "escape" || e.name === ".env",
      ),
    );
    for (const rel of ["../outside", "escape/file", "/etc/passwd", ".env"])
      await assert.rejects(store.read(grant.id, "chat-a", rel));
    await assert.rejects(store.read(grant.id, "chat-b", "a.md"));
    // A project grant comes from the session's backend binding, never a path
    // supplied by the renderer. Reassignment revokes old access immediately.
    let project={id:'project-a',path:root};
    const resolveProject=async scope=>scope==='project-chat'?project:null;
    const linked=await store.grantProject('project-chat',resolveProject);
    await fs.mkdir(path.join(root,'.github'));await fs.mkdir(path.join(root,'.git'));
    const projectEntries=await store.list(linked.id,'project-chat','');
    assert(projectEntries.some(entry=>entry.name==='.github'));
    assert(!projectEntries.some(entry=>entry.name==='.git'||entry.name==='.env'));
    assert.equal((await store.grantProject('project-chat',resolveProject)).id,linked.id);
    assert.equal(linked.path,root);
    assert.equal(new TextDecoder().decode((await store.read(linked.id,'project-chat','a.md')).data),'# Original');
    await assert.rejects(store.read(linked.id,'other-chat','a.md'));
    project={id:'project-b',path:root};
    await assert.rejects(store.read(linked.id,'project-chat','a.md'),/Project changed/);
    assert.equal(await store.grantProject('unbound-chat',resolveProject),null);
    await fs.writeFile(path.join(root, "child", "Nested.md"), "nested");
    const search = await store.search(grant.id, "chat-a", "nested");
    assert.equal(search.entries[0].path, "child/Nested.md");
    await assert.rejects(store.search(grant.id, "other", "nested"));
    const single=await store.grant(root,"single-chat");
    store.grants.get(single.id).files=new Set(["a.md"]);
    await store.read(single.id,"single-chat","a.md");
    await assert.rejects(store.read(single.id,"single-chat","child/Nested.md"));
    await assert.rejects(store.list(single.id,"single-chat",""));
    const read = await store.read(grant.id, "chat-a", "a.md");
    assert.equal(new TextDecoder().decode(read.data), "# Original");
    await assert.rejects(
      store.save(grant.id, "chat-a", "a.md", "new", "bad-version"),
    );
    const saved = await store.save(
      grant.id,
      "chat-a",
      "a.md",
      "# Updated",
      read.version,
    );
    assert.equal(new TextDecoder().decode(saved.data), "# Updated");
    assert.equal(
      await fs.readFile(path.join(root, "a.md.ohmyt-backup"), "utf8"),
      "# Original",
    );
    const second = await store.save(
      grant.id,
      "chat-a",
      "a.md",
      "# Second",
      saved.version,
    );
    assert.equal(new TextDecoder().decode(second.data), "# Second");
    await assert.rejects(
      store.save(grant.id, "chat-a", "a.md", "stale", saved.version),
    );
    await fs.writeFile(
      path.join(root, "large.md"),
      Buffer.alloc(26 * 1024 * 1024),
    );
    await assert.rejects(store.read(grant.id, "chat-a", "large.md"));
    console.log(
      "Document grants, traversal, symlinks, isolation, size, conflict and backup tests passed",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
