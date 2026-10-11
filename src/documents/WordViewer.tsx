import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
export default function WordViewer({ data }: { data: Uint8Array }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const container = document.createElement("div");
    void renderAsync(data, container, undefined, {
      inWrapper: true,
      breakPages: true,
      useBase64URL: true,
      renderAltChunks: false,
    })
      .then(() => {
        if (!active) return;
        container
          .querySelectorAll("a")
          .forEach((a) => a.removeAttribute("href"));
        container.querySelectorAll("[src]").forEach((n) => {
          if (!n.getAttribute("src")?.startsWith("data:"))
            n.removeAttribute("src");
        });
        if (frame.current)
          frame.current.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{margin:0;background:#eee}.docx-wrapper{padding:12px!important}section.docx{max-width:100%;box-sizing:border-box}</style>${container.innerHTML}`;
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [data]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <iframe
      ref={frame}
      title="Word preview"
      sandbox=""
      className="document-frame"
    />
  );
}
