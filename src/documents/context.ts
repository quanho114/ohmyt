import { validateOfficeArchive } from "./format.ts";
export async function extractDocumentContext(
  name: string,
  data: Uint8Array,
  pages?: { start: number; end: number },
): Promise<string> {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "md") return new TextDecoder().decode(data).slice(0, 16000);
  if (ext === "xlsx" || ext === "xls")
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./sheet.worker.ts", import.meta.url), {
        type: "module",
      });
      const timer = setTimeout(() => {
        worker.terminate();
        reject(Error("Document extraction timed out"));
      }, 15000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        if (e.data.error) reject(Error(e.data.error));
        else resolve(e.data.text);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(Error("Workbook extraction failed"));
      };
      worker.postMessage({ data, semantic: true });
    });
  if (ext === "docx" || ext === "pptx") {
    validateOfficeArchive(data);
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(data);
    const names = Object.keys(files).filter((n) =>
      ext === "docx"
        ? n === "word/document.xml"
        : /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    let result = "";
    for (const path of names) {
      const doc = new DOMParser().parseFromString(
        strFromU8(files[path]),
        "application/xml",
      );
      if (doc.querySelector("parsererror")) throw Error("Invalid document XML");
      result +=
        `\n[${path}]\n` +
        Array.from(doc.getElementsByTagNameNS("*", "p"))
          .map((p) =>
            Array.from(p.getElementsByTagNameNS("*", "t"))
              .map((t) => t.textContent)
              .join(""),
          )
          .join("\n");
      if (result.length >= 16000) break;
    }
    return result.slice(0, 16000);
  }
  if (ext === "pdf") {
    const { openPdf } = await import("./pdfEngine.ts");
    const task = openPdf(data);
    try {
      const pdf = await task.promise;
      const start = pages?.start || 1,
        end = pages?.end || Math.min(pdf.numPages, 10);
      if (start < 1 || end < start || end > pdf.numPages || end - start > 9)
        throw Error("Chọn tối đa 10 trang trong phạm vi PDF.");
      let result = "";
      for (let page = start; page <= end; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        result +=
          `\n[Page ${page}]\n` +
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
        if (result.length >= 16000) break;
      }
      return result.slice(0, 16000);
    } finally {
      await task.destroy();
    }
  }
  throw Error("Định dạng này chưa có bộ trích xuất nội dung.");
}
