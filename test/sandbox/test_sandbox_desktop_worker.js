import assert from 'node:assert/strict';

try {
  assert(process.versions.electron,'Desktop worker must run under Electron');
  const test=process.env.OHMYT_SANDBOX_TEST;
  assert(['test_project_isolation.js','test_large_sandbox.js'].includes(test));
  await import(new URL(test,import.meta.url));
  // Utility services keep their parent port open after the module finishes.
  process.exit(0);
} catch(error) {
  console.error(error);
  process.exit(1);
}
