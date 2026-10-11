import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  validateOfficeArchive,
  documentCapabilities,
} from "../src/documents/format.ts";
const archive = zipSync({ "word/document.xml": strToU8("<document/>") });
validateOfficeArchive(archive);
assert.throws(
  () => validateOfficeArchive(new Uint8Array(30)),
  /Invalid Office/,
);
assert.throws(
  () => validateOfficeArchive(zipSync({ "../outside": strToU8("bad") })),
  /Unsafe Office/,
);
assert.throws(
  () =>
    validateOfficeArchive(zipSync({ "word/vbaProject.bin": strToU8("macro") })),
  /Unsafe Office/,
);
assert.throws(
  () =>
    validateOfficeArchive(
      zipSync({ "large.xml": new Uint8Array(21 * 1024 * 1024) }),
    ),
  /safe expansion/,
);
assert.equal(documentCapabilities.docx.manualEdit, false);
console.log(
  "Document format validation: valid ZIP, corrupt ZIP, traversal, macros, expansion limits passed",
);

const { documentPrompt, visibleDocumentPrompt } =
  await import("../src/documents/chatContext.ts");
const reference = {
  path: "Notes/Plan.md",
  grantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  version: "a".repeat(64),
};
const message = documentPrompt("Review", [
  {
    key: "file",
    name: "Plan.md",
    text: "Reference: " + JSON.stringify(reference) + "\nContent: notes",
  },
]);
assert.deepEqual(visibleDocumentPrompt(message), {
  text: "Review",
  names: ["Plan.md"],
});
assert.equal(documentPrompt("plain", []), "plain");
assert.equal(visibleDocumentPrompt("plain").text, "plain");
assert.equal(
  visibleDocumentPrompt(message.replace('"path"', '"invalid"')).text,
  message.replace('"path"', '"invalid"'),
);
console.log(
  "Document chat snapshots: readable display and invalid reference fallback passed",
);
