"""Real Chromium fixture, no paid LLM or production network required.

Run with the installed Browser Use environment, from the repository root.
Only this test maps an allowed test hostname to a loopback fixture.
"""
import asyncio
import importlib.util
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "fixture.example.test"
HTML = b'''<!doctype html><html><head><title>Browser Use Fixture</title></head>
<body><h1>Fixture ready</h1><input id="message" placeholder="Message">
<button id="save" onclick="document.getElementById('status').textContent='Saved '+document.getElementById('message').value">Save</button>
<div id="status">Nothing saved</div><input id="password" type="password">
<a href="https://other.example.test/">Disallowed destination</a></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(HTML)

    def log_message(self, *args):
        pass


async def smoke():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    with tempfile.TemporaryDirectory(prefix="ohmyt-bu-smoke-") as root:
        os.environ.update(OHMYT_BU_ROOT=root, OHMYT_BU_DOMAINS=json.dumps([HOST]),
                          OHMYT_BU_HEADLESS="1", BROWSER_USE_VERSION_CHECK="false",
                          BROWSER_USE_CONFIG_DIR=str(Path(root) / "config"))
        spec = importlib.util.spec_from_file_location("ohmyt_sidecar", Path(__file__).resolve().parents[1] / "integrations/browser-use/sidecar.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        from browser_use import BrowserSession
        from browser_use.browser.profile import BrowserProfile
        runtime = module.Runtime()
        runtime.browser = BrowserSession(browser_profile=BrowserProfile(
            user_data_dir=Path(root) / "profile", downloads_path=Path(root) / "downloads",
            headless=True, executable_path=os.environ.get("OHMYT_BROWSER_USE_EXECUTABLE") or None,
            allowed_domains=[HOST], block_ip_addresses=True, accept_downloads=False,
            enable_default_extensions=False, disable_security=False,
            args=[f"--host-resolver-rules=MAP {HOST} 127.0.0.1", "--no-proxy-server"],
        ))
        try:
            await runtime.browser.start()
            first = await runtime.execute("navigate", {"url": f"http://{HOST}:{server.server_port}/"})
            assert "Fixture ready" in first["dom"]
            state = await runtime.state()
            index = next(i for i, n in state.dom_state.selector_map.items() if n.attributes.get("id") == "message")
            typed = await runtime.execute("type", {"index": index, "snapshotId": first["snapshotId"], "text": "hello"})
            try:
                await runtime.execute("click", {"index": index, "snapshotId": first["snapshotId"]})
                raise AssertionError("Old snapshot was accepted")
            except ValueError:
                pass
            fresh = await runtime.execute("read", {})
            state = await runtime.state()
            button = next(i for i, n in state.dom_state.selector_map.items() if n.attributes.get("id") == "save")
            saved = await runtime.execute("click", {"index": button, "snapshotId": fresh["snapshotId"]})
            assert "Saved hello" in saved["dom"], saved["dom"]
            state = await runtime.state()
            password = next(i for i, n in state.dom_state.selector_map.items() if n.attributes.get("id") == "password")
            try:
                await runtime.execute("type", {"index": password, "snapshotId": saved["snapshotId"], "text": "secret"})
                raise AssertionError("Password input was accepted")
            except ValueError:
                pass
            fresh = await runtime.execute("read", {})
            state = await runtime.state()
            link = next(i for i, n in state.dom_state.selector_map.items() if n.attributes.get("href"))
            try:
                await runtime.execute("click", {"index": link, "snapshotId": fresh["snapshotId"]})
                raise AssertionError("Disallowed link was accepted")
            except ValueError:
                pass
            for url in ("http://127.0.0.1/", "file:///etc/passwd", "https://other.example.test/"):
                try:
                    runtime.check_url(url)
                    raise AssertionError("Disallowed URL was accepted")
                except ValueError:
                    pass
            module.wire.write("PASS real Browser Use Chromium: DOM, type, click, result verification, stale snapshot, sensitive field and disallowed URL/link\n")
        finally:
            await runtime.close()
            server.shutdown()
            server.server_close()


asyncio.run(asyncio.wait_for(smoke(), timeout=90))
