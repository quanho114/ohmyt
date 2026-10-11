"""Wire fixture: add only test hostname resolution to the production sidecar."""
import importlib.util
import asyncio
from pathlib import Path

spec = importlib.util.spec_from_file_location("ohmyt_bu", Path(__file__).resolve().parents[2] / "integrations/browser-use/sidecar.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
asyncio.run(module.main())
