export const documentCapabilities = {
  md: { preview: true, manualEdit: true, agentEdit: true, offline: true },
  pdf: { preview: true, manualEdit: false, agentEdit: false, offline: true },
  docx: { preview: true, manualEdit: false, agentEdit: false, offline: true },
  xlsx: { preview: true, manualEdit: false, agentEdit: false, offline: true },
  xls: { preview: true, manualEdit: false, agentEdit: false, offline: true },
  pptx: { preview: true, manualEdit: false, agentEdit: false, offline: true },
};
// Bound OOXML ZIP expansion before handing untrusted archives to a rendering engine.
export function validateOfficeArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Invalid Office archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true),
    total = 0;
  if (count > 5000 || count === 65535)
    throw Error("Office archive has too many entries");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw Error("Invalid Office directory");
    if (view.getUint16(offset + 8, true) & 1)
      throw Error("Encrypted Office files are unsupported");
    const size = view.getUint32(offset + 24, true),
      nameLength = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    total += size;
    if (size > 20 * 1024 * 1024 || total > 60 * 1024 * 1024)
      throw Error("Office archive exceeds safe expansion limit (60 MB).");
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (/(?:^|\/)\.\.(?:\/|$)|vbaProject\.bin$/i.test(name))
      throw Error("Unsafe Office entry");
    offset += 46 + nameLength + extra + comment;
  }
}
