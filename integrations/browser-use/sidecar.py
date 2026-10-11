"""Bounded direct Browser Use runtime; no autonomous agent or model calls."""
import base64
import asyncio
import ipaddress
import json
import os
import re
import signal
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse, urljoin

# Reserve stdout for the wire protocol, including during third-party imports.
wire = sys.stdout
sys.stdout = sys.stderr
os.environ.update(ANONYMIZED_TELEMETRY="false", BROWSER_USE_SETUP_LOGGING="false",
                  BROWSER_USE_LOGGING_LEVEL="critical")
from browser_use import BrowserSession
from browser_use.browser import events
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog


class ActionError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class Runtime:
    def __init__(self):
        self.browser = None
        self.snapshot = None
        self.domains = json.loads(os.environ["OHMYT_BU_DOMAINS"])

    def check_url(self, url):
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
            raise ValueError("Only HTTP/HTTPS URLs without credentials are permitted")
        if host not in self.domains:
            raise ActionError("DOMAIN_DENIED")
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError("IP addresses are not permitted")
        if host == "localhost" or host.endswith((".localhost", ".local")):
            raise ValueError("Local destinations are not permitted")

    async def start(self):
        if self.browser:
            return
        root = Path(os.environ["OHMYT_BU_ROOT"])
        # Prevent the upstream fallback from downloading/installing Chromium at run time.
        cdp_url = os.environ.get("OHMYT_BU_CDP")
        executable = None if cdp_url else os.environ.get("OHMYT_BU_EXECUTABLE") or LocalBrowserWatchdog._find_installed_browser_path()
        if not cdp_url and (not executable or not Path(executable).is_file() or not os.access(executable, os.X_OK)):
            raise ValueError("Install Chromium/Chrome and configure an executable path")
        profile = BrowserProfile(
            user_data_dir=root / "profile", downloads_path=root / "downloads",
            headless=os.environ.get("OHMYT_BU_HEADLESS") == "1",
            executable_path=executable,
            allowed_domains=self.domains, block_ip_addresses=True,
            accept_downloads=False, enable_default_extensions=False,
            disable_security=False, keep_alive=bool(cdp_url),
            cdp_url=cdp_url or None, is_local=not bool(cdp_url),
            enable_captcha_solver=False,
            proxy={"server": os.environ["OHMYT_BU_PROXY"], "bypass": "<-loopback>"} if os.environ.get("OHMYT_BU_PROXY") and not cdp_url else None,
            args=["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
        )
        self.browser = BrowserSession(browser_profile=profile)
        await self.browser.start()

    async def state(self):
        state = await self.browser.get_browser_state_summary(include_screenshot=False, cached=False)
        if state.url != "about:blank":
            self.check_url(state.url)
        return state

    @staticmethod
    def fingerprint(state):
        return (state.url, tuple((i, n.backend_node_id, n.frame_id, n.tag_name,
                                tuple(sorted(n.attributes.items())), n.get_all_children_text(max_depth=2)[:200])
                               for i, n in state.dom_state.selector_map.items()))

    @staticmethod
    def sensitive(attrs):
        hints = " ".join(str(attrs.get(key, "")) for key in ("type", "name", "id", "autocomplete", "placeholder", "aria-label"))
        return bool(re.search(r"password|passwd|secret|token|credit|card.?number|cc-|cvv|cvc|otp|one.time", hints, re.I))

    @classmethod
    def redact_dom(cls, state):
        secrets = set()
        pending = [state.dom_state._root] if state.dom_state._root else []
        while pending:
            simplified = pending.pop()
            pending.extend(simplified.children)
            node = simplified.original_node
            if not cls.sensitive(node.attributes):
                continue
            for key in ("value", "data-value"):
                if node.attributes.get(key):
                    secrets.add(str(node.attributes[key]))
                    node.attributes[key] = "[REDACTED]"
            if node.snapshot_node and node.snapshot_node.input_value:
                secrets.add(node.snapshot_node.input_value)
                node.snapshot_node.input_value = "[REDACTED]"
            if node.ax_node and node.ax_node.properties:
                for prop in node.ax_node.properties:
                    if prop.name in ("value", "valuetext") and prop.value:
                        secrets.add(str(prop.value))
                        prop.value = "[REDACTED]"
        return secrets

    async def observe(self):
        self.snapshot = None
        state = await self.state()
        token = str(uuid.uuid4())
        self.snapshot = (token, time.monotonic(), self.fingerprint(state))
        secrets = self.redact_dom(state)
        dom = state.dom_state.llm_representation()
        for secret in secrets:
            dom = dom.replace(secret, "[REDACTED]")
        return {"url": state.url, "title": state.title, "targetId": self.browser.agent_focus_target_id, "snapshotId": token,
                "dom": dom[:60000], "truncated": len(dom) > 60000,
                "elements": [{"index": i, "tag": n.tag_name,
                              "text": "[REDACTED]" if self.sensitive(n.attributes) else n.get_all_children_text(max_depth=2)[:200]}
                             for i, n in list(state.dom_state.selector_map.items())[:200]]}

    async def dispatch(self, event):
        result = self.browser.event_bus.dispatch(event)
        await result
        return await result.event_result(raise_if_any=True, raise_if_none=False)

    async def execute(self, action, args):
        if action == "invalidate":
            self.snapshot = None
            return {"invalidated": True}
        if action in ("navigate", "new_tab"):
            self.check_url(args["url"])
        if action not in ("navigate", "read", "click", "type", "scroll", "back", "forward", "reload", "find_text", "dropdown_options", "select_dropdown", "tabs", "new_tab", "switch", "close_tab", "upload_file", "keypress", "wait", "accessibility", "screenshot"):
            raise ValueError("Unsupported action")
        await self.start()
        if action == "screenshot":
            await self.state()
            page = await self.browser.get_current_page()
            mask = "input[type=password],input[autocomplete*=password],input[autocomplete*=cc-],input[autocomplete=one-time-code],input[name*=secret i],input[name*=token i],input[name*=otp i],[data-ohmyt-sensitive],iframe{visibility:hidden!important}"
            style_id = "ohmyt-redact-" + str(uuid.uuid4())
            await page.evaluate("() => {const e=document.createElement('style');e.id=" + json.dumps(style_id) + ";e.textContent=" + json.dumps(mask) + ";document.documentElement.append(e);}")
            try:
                image = await self.dispatch(events.ScreenshotEvent(full_page=False))
            finally:
                await page.evaluate("() => document.getElementById(" + json.dumps(style_id) + ")?.remove()")
            return {"screenshot": image, "mime": "image/png"}
        if action == "accessibility":
            state = await self.state()
            self.redact_dom(state)
            nodes = []
            for index, node in list(state.dom_state.selector_map.items())[:200]:
                ax = node.ax_node
                if ax:
                    nodes.append({"index": index, "role": ax.role, "name": "[REDACTED]" if self.sensitive(node.attributes) else (ax.name or "")[:200], "description": "" if self.sensitive(node.attributes) else (ax.description or "")[:200]})
            return {"nodes": nodes, "truncated": len(state.dom_state.selector_map) > 200}
        if action == "wait":
            milliseconds = args["milliseconds"]
            if not isinstance(milliseconds, int) or not 0 <= milliseconds <= 10000:
                raise ActionError("ACTION_FAILED")
            await asyncio.sleep(milliseconds / 1000)
            return await self.observe()
        if action == "keypress":
            await self.state()
            keys = args["key"]
            if keys not in ("Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Control+A"):
                raise ActionError("ACTION_FAILED")
            page = await self.browser.get_current_page()
            blocked = await page.evaluate("() => {const e=document.activeElement;return !!e && /password|passwd|secret|token|credit|card.?number|cc-|cvv|cvc|otp|one.time/i.test(['type','name','id','autocomplete','placeholder','aria-label'].map(k=>e.getAttribute(k)||'').join(' '));}")
            if str(blocked).lower() == "true":
                raise ActionError("SENSITIVE_FIELD")
            self.snapshot = None
            await self.dispatch(events.SendKeysEvent(keys=keys))
            return await self.observe()
        if action == "tabs":
            state = await self.state()
            return {"tabs": [{"targetId": t.target_id, "url": t.url, "title": t.title} for t in state.tabs]}
        if action in ("switch", "close_tab"):
            state = await self.state()
            if args["targetId"] not in [t.target_id for t in state.tabs]:
                raise ValueError("Unknown scoped tab")
            self.snapshot = None
            if action == "switch":
                await self.dispatch(events.SwitchTabEvent(target_id=args["targetId"]))
                return await self.observe()
            await self.dispatch(events.CloseTabEvent(target_id=args["targetId"]))
            return {"closed": args["targetId"]}
        if action == "read":
            try:
                return await self.observe()
            except ActionError:
                raise
            except Exception:
                # Retry perception once; never replay a click, upload, input or submission.
                await asyncio.sleep(0.2)
                return await self.observe()
        if action in ("navigate", "new_tab"):
            self.snapshot = None
            await self.dispatch(events.NavigateToUrlEvent(url=args["url"], new_tab=action == "new_tab"))
        elif action in ("back", "forward", "reload", "find_text"):
            await self.state()
            self.snapshot = None
            if action == "find_text":
                await self.dispatch(events.ScrollToTextEvent(text=args["text"]))
            else:
                page = await self.browser.get_current_page()
                await getattr(page, {"back": "go_back", "forward": "go_forward", "reload": "reload"}[action])()
        elif action == "scroll":
            await self.state()
            self.snapshot = None
            await self.dispatch(events.ScrollEvent(direction=args["direction"], amount=600))
        else:
            snapshot = self.snapshot
            self.snapshot = None  # One attempted mutation consumes the observation.
            if not snapshot or snapshot[0] != args["snapshotId"] or time.monotonic() - snapshot[1] > 30:
                raise ActionError("STALE_SNAPSHOT")
            state = await self.state()
            if self.fingerprint(state) != snapshot[2]:
                raise ActionError("PAGE_CHANGED")
            node = state.dom_state.selector_map.get(args["index"])
            if not node:
                raise ActionError("ELEMENT_MISSING")
            attrs = node.attributes
            hints = " ".join(str(attrs.get(key, "")) for key in
                             ("type", "name", "id", "autocomplete", "placeholder", "aria-label"))
            if self.sensitive(attrs) or action != "upload_file" and attrs.get("type", "").lower() == "file":
                raise ActionError("SENSITIVE_FIELD")
            if action == "upload_file":
                root = Path(os.environ["OHMYT_BU_UPLOAD_ROOT"]).resolve()
                file_path = Path(args["filePath"])
                if attrs.get("type", "").lower() != "file" or file_path.is_symlink() or root not in file_path.resolve().parents or not re.fullmatch(r"[0-9a-f-]{36}", file_path.parent.name) or not file_path.is_file():
                    raise ActionError("SENSITIVE_FIELD")
                session = await self.browser.get_or_create_cdp_session()
                tree = await session.cdp_client.send.Page.getFrameTree(session_id=session.session_id)
                owner_node = node
                while owner_node and not owner_node.frame_id:
                    owner_node = owner_node.parent_node
                frame_id = owner_node.frame_id if owner_node else None
                pending = [tree.get("frameTree", {})]
                while pending:
                    frame_tree = pending.pop()
                    frame = frame_tree.get("frame", {})
                    if frame_id and frame.get("id") == frame_id:
                        self.check_url(frame.get("url", ""))
                        break
                    pending.extend(frame_tree.get("childFrames", []))
                else:
                    raise ActionError("DOMAIN_DENIED")
                await self.dispatch(events.UploadFileEvent(node=node, file_path=str(file_path)))
            elif action == "dropdown_options":
                options = await self.dispatch(events.GetDropdownOptionsEvent(node=node))
                observation = await self.observe()
                observation["options"] = options
                return observation
            elif action == "select_dropdown":
                await self.dispatch(events.SelectDropdownOptionEvent(node=node, text=args["text"]))
            elif action == "click":
                if attrs.get("href"):
                    self.check_url(urljoin(state.url, attrs["href"]))
                await self.dispatch(events.ClickElementEvent(node=node))
            else:
                if len(args["text"]) > 10000:
                    raise ValueError("Text exceeds 10000 characters")
                await self.dispatch(events.TypeTextEvent(node=node, text=args["text"]))
        return await self.observe()

    async def close(self):
        if self.browser:
            await self.browser.kill()


async def main():
    runtime = Runtime()
    task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(signum, task.cancel)
        except (NotImplementedError, RuntimeError):
            pass
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline, 131073)
            if not line:
                break
            request = {}
            try:
                if len(line) > 131072:
                    raise ValueError("Request too large")
                request = json.loads(line)
                if request["action"] == "close":
                    break
                result = await runtime.execute(request["action"], request.get("args", {}))
                response = {"id": request["id"], "result": result}
            except Exception as error:
                # Third-party errors may contain page content or text entered by the user.
                # Do not forward arbitrary exceptions into persisted logs or model context.
                response = {"id": request.get("id"), "error": "Browser Use action failed; refresh the observation and check runtime configuration/domain policy.", "code": error.code if isinstance(error, ActionError) else "ACTION_FAILED"}
            wire.write(json.dumps(response, ensure_ascii=True) + "\n")
            wire.flush()
    finally:
        try:
            await asyncio.wait_for(runtime.close(), timeout=5)
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
