const { app, BrowserWindow, dialog } = require("electron");
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const testProfile = require("node:fs").mkdtempSync(path.join(os.tmpdir(),"ohmyt-document-profile-"));
app.setPath("userData", testProfile);
app.on("window-all-closed", () => {});
app
  .whenReady()
  .then(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ohmyt-document-ui-"));
    const out = path.join(process.cwd(), "output/document-workspace");
    await fs.mkdir(out, { recursive: true });
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Revenue", "Amount"],
      ["January", 1200],
      ["February", 1500],
      ["Total", 2700],
    ]);
    sheet.B4.f = "SUM(B2:B3)";
    sheet["!cols"] = [{ wch: 14 }, { wch: 24 }];
    sheet["!rows"] = [{ hpt: 30 }];
    sheet["!merges"] = [{ s: { r: 5, c: 0 }, e: { r: 5, c: 1 } }];
    sheet.A6 = { t: "s", v: "Merged cell" };
    sheet["!ref"] = "A1:B6";
    XLSX.utils.book_append_sheet(book, sheet, "Revenue");
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["Second sheet"]]),
      "Notes",
    );
    await fs.writeFile(
      path.join(root, "Revenue.xlsx"),
      XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    );
    await fs.writeFile(
      path.join(root, "Legacy.xls"),
      XLSX.write(book, { type: "buffer", bookType: "biff8" }),
    );
    const { zipSync, strToU8 } = await import("fflate");
    const zip = async (name, files) =>
      fs.writeFile(
        path.join(root, name),
        zipSync(
          Object.fromEntries(
            Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
          ),
        ),
      );
    await zip("Report.docx", {
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      "_rels/.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/document.xml":
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Revenue report</w:t></w:r></w:p><w:p><w:r><w:t>January revenue: 1200</w:t></w:r></w:p><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Month</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Second page</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
    });
    const slide =
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="400000" y="800000"/><a:ext cx="7000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="E8EDF2"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="3200"/><a:t>Revenue presentation</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    await zip("Slides.pptx", {
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
      "_rels/.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
      "ppt/presentation.xml":
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>',
      "ppt/_rels/presentation.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>',
      "ppt/slides/slide1.xml": slide,
      "ppt/slides/slide2.xml": slide.replace(
        "Revenue presentation",
        "Second slide",
      ),
    });
    // A real two-page PDF with searchable text and valid cross-reference offsets.
    const stream = "BT /F1 24 Tf 40 700 Td (Revenue PDF report) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((o, i) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n ")
      .join(
        "\n",
      )}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    await fs.writeFile(path.join(root, "Report.pdf"), pdf);
    await fs.mkdir(path.join(root, "Notes"));
    await fs.writeFile(
      path.join(root, "Notes", "Plan.md"),
      '# Project notes\n\n| Month | Revenue |\n| --- | --- |\n| January | 1200 |\n\n- Review results\n\n```js\nconsole.log("hello");\n```',
    );
    const { createDaemon } = await import("../../server/index.js");
    let proposalSequence = 0;
    const daemon = createDaemon({
      dbPath: ":memory:",
      port: 0,
      workspaceRoot: process.cwd(),
      pluginOverrides: {
        "core/llm": {
          name: "core/llm",
          apply(ctx) {
            ctx.provide("llm", {
              streamChat: async (options) => {
                if (options.messages.at(-1)?.role === "tool") {
                  options.onChunk("Đề xuất sẵn sàng để duyệt.");
                  return { completed: true };
                }
                const prompt =
                  options.messages.map(m=>m.content).join("\n");
                const reference = Array.from(
                  String(prompt).matchAll(/Reference: (\{[^\n]+\})/g),
                ).at(-1)?.[1];
                if (!reference) {
                  options.onChunk("No document snapshot.");
                  return { completed: true };
                }
                options.onChunk("Đang chuẩn bị đề xuất sửa tài liệu…");
                await new Promise((r) => setTimeout(r, 800));
                options.onToolCall({
                  id: "document-proposal-fixture-" + ++proposalSequence,
                  name: "document_propose",
                  arguments: {
                    reference,
                    content: "# AI revised notes",
                    summary: "Đổi tiêu đề báo cáo.",
                  },
                });
                return { completed: true };
              },
            });
          },
        },
      },
    });
    daemon.db.createSession(
      "documents-test",
      daemon.db.getAgents()[0].id,
      "Document workspace",
    );
    daemon.db.createProvider({
      id: "document-fixture",
      name: "Document test fixture",
      type: "custom",
      base_url: "http://127.0.0.1:1",
    });
    daemon.db.createModel({
      provider_id: "document-fixture",
      model_id: "fixture",
      capabilities_json: { tools: true },
    });
    daemon.db.setSessionModelOverride("documents-test", {
      providerId: "document-fixture",
      modelId: "fixture",
    });
    const { port } = await daemon.start();
    const opaqueApi = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'null' } });
    assert.equal(opaqueApi.status, 403, 'opaque origins cannot access APIs');
    const asset = require('node:fs').readdirSync(path.join(process.cwd(), 'dist/assets')).find(name => name.endsWith('.js'));
    const opaqueAsset = await fetch(`http://127.0.0.1:${port}/assets/${asset}`, { headers: { Origin: 'null' } });
    assert.equal(opaqueAsset.status, 200);
    assert.equal(opaqueAsset.headers.get('access-control-allow-origin'), '*');
    const missingAsset = await fetch(`http://127.0.0.1:${port}/assets/missing.js`, { headers: { Origin: 'null' } });
    assert.equal(missingAsset.status, 404, 'missing preview assets never fall back to the app');
    let vite;
    let appUrl = `http://127.0.0.1:${port}`;
    if (process.env.OHMYT_DOCUMENT_TEST_DEV === '1') {
      vite = await (await import('vite')).createServer({
        server: { host: '127.0.0.1', port: 5173, strictPort: true,
          proxy: { '/api': { target: appUrl, changeOrigin: true } } },
      });
      await vite.listen();
      appUrl = 'http://127.0.0.1:5173';
    }
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, "../../electron/preload.cjs"),
        additionalArguments: [`--ohmyt-runtime-port=${port}`],
      },
    });
    let earlyFrameLoads = 0;
    let failViewerModule = true;
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (details, done) => {
        const cancel = !details.url.startsWith(`http://127.0.0.1:${port}/`) && !details.url.startsWith(`${appUrl}/`);
        if (!cancel && failViewerModule && (/\/assets\/main-[^/]+\.js/.test(details.url) || details.url.includes('/src/documents/viewer/main.tsx'))) {
          failViewerModule = false;
          done({ cancel: true });
          return;
        }
        if (!cancel && (/\/assets\/documentViewer-[^/]+\.js/.test(details.url) || details.url.includes('/src/documents/viewer/bootstrap.ts'))) {
          // A load notification before module initialization must never consume
          // the one-use MessagePort. Also reject a spoofed ready from the app.
          earlyFrameLoads++;
          void win.webContents.executeJavaScript(`(() => {
            const frame = document.querySelector('.document-flyfish-frame');
            if (!frame) return;
            frame.dispatchEvent(new Event('load'));
            window.postMessage({ type: 'ohmyt-document-ready', id: new URL(frame.src).hash.slice(1) }, '*');
          })()`);
          setTimeout(() => done({ cancel: false }), 200);
        } else done({ cancel });
      },
    );
    require("../../electron/documents.cjs").registerDocuments(
      require("electron").ipcMain,
      win,
    );
    dialog.showOpenDialog = async (_window,options) => ({
      canceled: false,
      filePaths: [options.properties.includes("openFile") ? path.join(root,"Report.docx") : root],
    });
    for (const channel of [
      "browser-chat",
      "browser-bounds",
      "browser-features",
      "browser-resize-finish",
    ])
      require("electron").ipcMain.handle(channel, () => {});
    require("electron").ipcMain.handle("window-is-maximized", () => false);
    dialog.showMessageBox = async () => ({ response: 0 });
    const errors = [];
    win.webContents.on("console-message", (_e, ...args) => {
      const details = typeof _e.message === 'string' ? _e : args[0];
      const message = details?.message || args[1];
      if (message) { errors.push(message); console.log('Browser:', message); }
    });
    const js = async (code) => {
      try {
        return await win.webContents.executeJavaScript(code);
      } catch (e) {
        throw Error(code + "\n" + e.message + "\n" + errors.join("\n"));
      }
    };
    const wait = async (expr) => {
      for (let i = 0; i < 750; i++) {
        if (await js(expr)) return;
        await new Promise((r) => setTimeout(r, 40));
      }
      await screenshot("failed");
      throw Error(
        "Timed out: " +
          expr +
          " visible: " +
          (await js(
            "document.querySelector('.document-workspace')?.innerText",
          )) +
          " errors: " +
          errors.join("\n"),
      );
    };
    const viewerJs = async code => {
      const frame = win.webContents.mainFrame.framesInSubtree.find(frame => frame.url.includes('/document-viewer.html'));
      assert(frame, 'sandboxed Flyfish frame exists');
      return frame.executeJavaScript(`(() => {
        const roots = [document];
        for (let i = 0; i < roots.length; i++) for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
        const nodes = roots.flatMap(root => [...root.querySelectorAll('*')]);
        ${code}
      })()`);
    };
    const click = async (label) =>
      js(
        `(()=>{const b=[...document.querySelectorAll('.document-workspace:not([hidden]) button'),...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button '+${JSON.stringify(label)});b.click();})()`,
      );
    const screenshot = async (name) => {
      await new Promise((r) => setTimeout(r, 200));
      await fs.writeFile(
        path.join(out, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    };
    try {
      await win.loadURL(`${appUrl}/#session/documents-test`);
      await wait(
        "Boolean(document.querySelector('.chat-composer-region textarea'))",
      );
      if (!vite) {
        const resources = await js("performance.getEntriesByType('resource').map(entry => entry.name)");
        for (const resource of resources) {
          const pathname = new URL(resource).pathname;
          if (!pathname.startsWith('/assets/') || !pathname.endsWith('.js')) continue;
          const source = await fs.readFile(path.join(process.cwd(), 'dist', pathname), 'utf8');
          assert(!source.includes('file-viewer-web-shell'), 'chat startup does not load the Flyfish runtime');
        }
      }
      await screenshot("closed");
      await click("Mở tài liệu");
      // Opening either pane hides the other even in a wide desktop window.
      await js("window.dispatchEvent(new Event('ohmyt-browser-toggle'))");
      await wait("document.querySelector('.integrated-browser-pane')?.dataset.open === 'true' && document.querySelector('.document-workspace')?.hidden === true");
      await click("Mở tài liệu");
      await wait("document.querySelector('.integrated-browser-pane')?.dataset.open === 'false' && document.querySelector('.document-workspace')?.hidden === false");
      await click("Đóng tài liệu");
      await wait("document.querySelector('.document-workspace')?.hidden === true");
      await js("[...document.querySelectorAll('button[aria-label=\"Tác vụ và đính kèm\"]')].find(b=>b.getBoundingClientRect().width>0).click()");
      await wait("[...document.querySelectorAll('[role=menuitem]')].some(el=>/Thêm tài liệu|Add document/.test(el.textContent))");
      await js("[...document.querySelectorAll('[role=menuitem]')].find(el=>/Thêm tài liệu|Add document/.test(el.textContent)).click()");
      await wait("document.querySelector('.document-flyfish')?.dataset.state==='error'");
      await click("Thử lại");
      await wait("document.querySelector('.document-flyfish')?.dataset.state==='ready'");
      assert.equal(await js("document.querySelector('.document-explorer').hidden"),true);
      await screenshot("single-file");
      const originalWord=await fs.readFile(path.join(root,"Report.docx"));
      await wait("Boolean(sessionStorage.getItem('ohmyt-tabs:documents-test')?.includes('Report.docx'))");
      win.webContents.reload();
      await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
      await wait("document.querySelector('.document-flyfish')?.dataset.state==='ready'");
      assert(await js("document.querySelector('[role=tab]')?.textContent.includes('Report.docx')"));
      assert.deepEqual(await fs.readFile(path.join(root,"Report.docx")),originalWord,'reload preserves original Word bytes');

      await click("Quay lại Files");
      await click("Mở thư mục");
      await wait("document.querySelectorAll('.document-file').length===6");
      await screenshot("explorer");
      await click("Notes");
      await wait(
        "[...document.querySelectorAll('.document-file')].some(b=>b.textContent.includes('Plan.md'))",
      );
      await screenshot("folder-expanded");
      for (const [name, ready, shot] of [
        [
          "Plan.md",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "markdown",
        ],
        [
          "Revenue.xlsx",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "excel",
        ],
        [
          "Legacy.xls",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "xls",
        ],
        [
          "Slides.pptx",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "powerpoint",
        ],
        [
          "Report.pdf",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "pdf",
        ],
        [
          "Report.docx",
          "document.querySelector('.document-flyfish')?.dataset.state==='ready'",
          "word",
        ],
      ]) {
        console.log("Testing " + name);
        const started = Date.now();
        await click(name);
        await wait(ready);
        if (/\.xlsx?$/.test(name)) {
          let parsed = false;
          for (let attempt = 0; attempt < 300; attempt++) {
            if (await viewerJs("return nodes.some(node => node.classList?.contains('sheet-tab') && node.textContent === 'Revenue') && nodes.some(node => node.tagName === 'CANVAS' && node.width > 100);")) { parsed = true; break; }
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          assert(parsed, name + ' parses workbook in Worker');
        }
        const expected = { 'Plan.md': 'Project notes', 'Revenue.xlsx': 'January', 'Legacy.xls': 'January', 'Slides.pptx': 'Revenue presentation', 'Report.pdf': 'Revenue PDF report', 'Report.docx': 'Revenue report' }[name];
        let rendered = false;
        for (let attempt = 0; attempt < 300; attempt++) {
          rendered = Boolean(await viewerJs(`return nodes.some(node => node.tagName !== 'STYLE' && node.textContent.includes(${JSON.stringify(expected)})) || (${JSON.stringify(name)}.match(/\\.xlsx?$/) && nodes.some(node => node.classList?.contains('sheet-tab') && node.textContent === 'Revenue'));`));
          if (rendered) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await screenshot(shot);
        assert(rendered, name + ' renders actual content');
        assert(await viewerJs("try { void parent.document.body; return false; } catch { return true; }"), 'preview cannot access app DOM');
        assert(await viewerJs("return window.electronAPI === undefined;"), 'preview has no desktop bridge');
        assert(await viewerJs("return fetch('/api/health').then(() => false, () => true);"), 'preview cannot fetch daemon APIs');

        console.log(name + " ready " + (Date.now() - started) + "ms");
        await screenshot(shot);
        await click("Quay lại Files");
      }
      await click("Plan.md");
      await wait("document.querySelector('.document-flyfish')?.dataset.state==='ready'");
      await wait(
        "!document.querySelector('.composer-document-context') && document.querySelector('.document-preview')?.getAttribute('aria-busy')==='false'",
      );
      await click("Chỉnh sửa");
      await wait("Boolean(document.querySelector('.document-editor'))");
      await js(
        `(()=>{const e=document.querySelector('.document-editor');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'# Changed in workspace');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await click("Lưu •");
      await wait(
        "[...document.querySelectorAll('.document-workspace button')].some(b=>b.textContent.trim()==='Lưu'&&b.disabled)",
      );
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan.md"), "utf8"),
        "# Changed in workspace",
      );
      await wait(
        "!document.querySelector('.composer-document-context') && document.querySelector('.document-preview')?.getAttribute('aria-busy')==='false'",
      );
      // Simulate loss of the backend's transient map before send.
      daemon.agentLoop.documentContexts.clear('documents-test');
      await js(
        `(()=>{const input=document.querySelector('.chat-composer-region textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Đọc tài liệu đang mở');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));})()`,
      );
      await wait("Boolean(document.querySelector('.document-agent-status'))");
      await screenshot("agent-processing");
      await wait("Boolean(document.querySelector('.document-review'))");
      await screenshot("change-review");
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan.md"), "utf8"),
        "# Changed in workspace",
      );
      assert(daemon.agentLoop.documentContexts.prompt('documents-test').includes('# Changed in workspace'));
      assert(daemon.db.getMessages('documents-test').filter(m=>m.sender==='user').every(m=>m.content==='Đọc tài liệu đang mở'));
      await click("Duyệt và lưu");
      await wait("!document.querySelector('.document-review')");
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan.md"), "utf8"),
        "# AI revised notes",
      );
      const requestProposal = async () => {
          await wait(
          "!document.querySelector('.composer-document-context') && document.querySelector('.document-preview')?.getAttribute('aria-busy')==='false'",
        );
        await js(
          `(()=>{const input=document.querySelector('.chat-composer-region textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Đọc tài liệu đang mở');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));})()`,
        );
        await wait("Boolean(document.querySelector('.document-review'))");
      };
      await requestProposal();
      await click("Từ chối");
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan.md"), "utf8"),
        "# AI revised notes",
      );
      await requestProposal();
      await click("Lưu bản sao");
      await wait("!document.querySelector('.document-review')");
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan-ai.md"), "utf8"),
        "# AI revised notes",
      );
      assert.equal(
        await fs.readFile(path.join(root, "Notes", "Plan.md"), "utf8"),
        "# AI revised notes",
      );
      await click("Đóng tài liệu");
      await click("Mở tài liệu");
      assert(await js("Boolean(document.querySelector('.document-editor'))"));
      assert(await js("document.querySelectorAll('[role=tab]').length>=6"));
      await js("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.includes('Revenue.xlsx')).click()");
      await wait("document.querySelector('.document-flyfish')?.dataset.state==='ready'");
      await js("[...document.querySelectorAll('[role=tab]')].find(b=>b.textContent.includes('Plan-ai.md')).click()");
      await wait("Boolean(document.querySelector('.document-editor'))");
      await screenshot("document-tabs");
      await click("Đóng tab Revenue.xlsx");
      assert(!(await js("[...document.querySelectorAll('[role=tab]')].some(b=>b.textContent.includes('Revenue.xlsx'))")));
      for (const [w, h] of [
        [1366, 768],
        [1280, 800],
        [1024, 768],
        [1920, 1080],
      ]) {
        win.setSize(w, h);
        await new Promise((r) => setTimeout(r, 100));
        assert(
          await js(
            "document.querySelector('.chat-composer-region textarea').getBoundingClientRect().width>200",
          ),
        );
        await screenshot(`${w}x${h}`);
      }
      await click("Quay lại Files");
      await click("File mới");
      await wait(
        "Boolean(document.querySelector('[aria-label=\"Tên mục mới\"]'))",
      );
      await js(
        `(()=>{const e=document.querySelector('[aria-label="Tên mục mới"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Created.md');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await click("Xác nhận");
      await wait(
        "[...document.querySelectorAll('.document-file')].some(b=>b.textContent.includes('Created.md'))",
      );
      assert.equal(
        await fs.readFile(path.join(root, "Created.md"), "utf8"),
        "",
      );
      await click("Thao tác Created.md");
      await click("Đổi tên");
      await wait(
        "Boolean(document.querySelector('[aria-label=\"Tên mục mới\"]'))",
      );
      await js(
        `(()=>{const e=document.querySelector('[aria-label="Tên mục mới"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Renamed.md');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await click("Xác nhận");
      await wait(
        "[...document.querySelectorAll('.document-file')].some(b=>b.textContent.includes('Renamed.md'))",
      );
      assert.equal(
        await fs.readFile(path.join(root, "Renamed.md"), "utf8"),
        "",
      );
      await click("Thao tác Renamed.md");
      await click("Xóa…");
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        await fs.readFile(path.join(root, "Renamed.md"), "utf8"),
        "",
      );
      assert.equal(failViewerModule, false, 'tested failed module startup and retry');
      assert(earlyFrameLoads > 0, 'tested early iframe load and spoofed readiness during bootstrap');
      console.log(
        "Electron document workspace: all six formats, navigation, save, state, responsive tests passed",
      );
    } finally {
      win.destroy();
      await vite?.close();
      await daemon.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
