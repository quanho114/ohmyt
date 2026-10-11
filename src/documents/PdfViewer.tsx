import { useEffect, useRef, useState } from "react";
import { type PDFDocumentProxy, TextLayer } from "pdfjs-dist";
import { openPdf } from "./pdfEngine.ts";
export default function PdfViewer({ data }: { data: Uint8Array }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [result, setResult] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setPdf(null);
    setError("");
    const task = openPdf(data);
    task.promise
      .then((value) => {
        if (active) setPdf(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [data]);
  useEffect(() => {
    if (!pdf) return;
    let stale = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    let layer: TextLayer | undefined;
    void pdf
      .getPage(page)
      .then(async (p) => {
        if (stale || !canvas.current || !text.current) return;
        const viewport = p.getViewport({ scale: zoom });
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        text.current.replaceChildren();
        text.current.style.setProperty("--total-scale-factor", String(zoom));
        render = p.render({ canvas: c, viewport });
        const content = await p.getTextContent();
        if (stale) return;
        layer = new TextLayer({
          textContentSource: content,
          container: text.current,
          viewport,
        });
        await Promise.all([layer.render(), render.promise]);
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
      render?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, zoom]);
  const search = async () => {
    if (!pdf || !query.trim()) return;
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      if (
        content.items
          .map((x) => ("str" in x ? x.str : ""))
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      ) {
        setPage(i);
        setResult(`Trang ${i}`);
        return;
      }
    }
    setResult("Không tìm thấy văn bản (PDF scan cần OCR).");
  };
  const fitWidth = async () => {
    if (!pdf || !canvas.current) return;
    const available = canvas.current.closest(
      ".document-pdf-scroll",
    )?.clientWidth;
    if (!available) return;
    const current = await pdf.getPage(page);
    setZoom(
      Math.max(
        0.25,
        Math.min(2, (available - 24) / current.getViewport({ scale: 1 }).width),
      ),
    );
  };
  return (
    <div className="document-pdf">
      <div className="document-toolbar">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          ‹
        </button>
        <span>
          {page} / {pdf?.numPages || "…"}
        </span>
        <button
          disabled={!pdf || page === pdf.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
        <select
          aria-label="Zoom"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        >
          {![0.5, 0.75, 1, 1.25, 1.5].includes(zoom) && (
            <option value={zoom}>{Math.round(zoom * 100)}%</option>
          )}
          {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
            <option value={z} key={z}>
              {z * 100}%
            </option>
          ))}
        </select>
        <button
          disabled={!pdf}
          onClick={() => void fitWidth().catch((e) => setError(e.message))}
        >
          Vừa chiều rộng
        </button>
      </div>
      <div className="document-toolbar">
        <input
          placeholder="Tìm trong PDF"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={() => void search().catch((e) => setError(e.message))}>
          Tìm
        </button>
      </div>
      {result && <small>{result}</small>}
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="document-pdf-scroll">
          <div className="document-pdf-page">
            <canvas ref={canvas} />
            <div className="document-text-layer" ref={text} />
          </div>
        </div>
      )}
    </div>
  );
}
