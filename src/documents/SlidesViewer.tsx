import { useEffect, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
const xml = (bytes: Uint8Array) => {
  const d = new DOMParser().parseFromString(
    strFromU8(bytes),
    "application/xml",
  );
  if (d.querySelector("parsererror")) throw Error("Invalid PPTX XML");
  return d;
};
const nodes = (e: Document | Element, name: string) =>
  Array.from(e.getElementsByTagNameNS("*", name));
export default function SlidesViewer({ data }: { data: Uint8Array }) {
  const [slides, setSlides] = useState<{ name: string; html: string }[]>([]),
    [page, setPage] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      const files = unzipSync(data, {
        filter: (f) => f.originalSize < 20 * 1024 * 1024,
      });
      const presentation = xml(files["ppt/presentation.xml"]);
      const size = nodes(presentation, "sldSz")[0];
      const width = Number(size?.getAttribute("cx") || 9144000) / 9525,
        height = Number(size?.getAttribute("cy") || 6858000) / 9525;
      if (
        ![width, height].every(
          (n) => Number.isFinite(n) && n > 0 && n < 100000000,
        )
      )
        throw Error("Invalid slide dimensions");
      const names = Object.keys(files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort(
          (a, b) =>
            Number(a.match(/slide(\d+)/)?.[1]) -
            Number(b.match(/slide(\d+)/)?.[1]),
        );
      if (names.length > 200) throw Error("Tối đa 200 slides");
      setSlides(
        names.map((name) => {
          const d = xml(files[name]);
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
          svg.setAttribute("width", "100%");
          svg.setAttribute("font-family", "Arial, sans-serif");
          const bg = document.createElementNS(svg.namespaceURI, "rect");
          bg.setAttribute("width", String(width));
          bg.setAttribute("height", String(height));
          bg.setAttribute("fill", "white");
          svg.append(bg);
          const relName = name.replace("slides/", "slides/_rels/") + ".rels";
          const rels = files[relName] ? xml(files[relName]) : null;
          for (const shape of Array.from(
            nodes(d, "spTree")[0]?.children || [],
          ).filter((n) => ["sp", "pic"].includes(n.localName))) {
            const xfrm = nodes(shape, "xfrm")[0];
            if (!xfrm) continue;
            const off = nodes(xfrm, "off")[0],
              ext = nodes(xfrm, "ext")[0];
            const x = Number(off?.getAttribute("x") || 0) / 9525,
              y = Number(off?.getAttribute("y") || 0) / 9525,
              w = Number(ext?.getAttribute("cx") || 0) / 9525,
              h = Number(ext?.getAttribute("cy") || 0) / 9525;
            if (shape.localName === "pic") {
              const id = nodes(shape, "blip")[0]?.getAttributeNS(
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                "embed",
              );
              const rel =
                rels &&
                nodes(rels, "Relationship").find(
                  (r) =>
                    r.getAttribute("Id") === id &&
                    r.getAttribute("TargetMode") !== "External",
                );
              const target = rel
                ?.getAttribute("Target")
                ?.replace(/^\.\.\//, "ppt/");
              if (target && files[target] && /\.(png|jpe?g)$/i.test(target)) {
                const image = document.createElementNS(
                  svg.namespaceURI,
                  "image",
                );
                for (const [k, v] of Object.entries({
                  x,
                  y,
                  width: w,
                  height: h,
                }))
                  image.setAttribute(k, String(v));
                const b64 = btoa(
                  Array.from(files[target], (b) => String.fromCharCode(b)).join(
                    "",
                  ),
                );
                image.setAttribute(
                  "href",
                  `data:image/${/png$/i.test(target) ? "png" : "jpeg"};base64,${b64}`,
                );
                svg.append(image);
              }
              continue;
            }
            const geometry =
              nodes(shape, "prstGeom")[0]?.getAttribute("prst") || "rect";
            const fill = nodes(
              nodes(shape, "spPr")[0] || shape,
              "srgbClr",
            )[0]?.getAttribute("val");
            if (fill && /^[a-f0-9]{6}$/i.test(fill)) {
              const rect = document.createElementNS(
                svg.namespaceURI,
                geometry === "ellipse" ? "ellipse" : "rect",
              );
              if (geometry === "ellipse") {
                for (const [k, v] of Object.entries({
                  cx: x + w / 2,
                  cy: y + h / 2,
                  rx: w / 2,
                  ry: h / 2,
                }))
                  rect.setAttribute(k, String(v));
              } else
                for (const [k, v] of Object.entries({
                  x,
                  y,
                  width: w,
                  height: h,
                }))
                  rect.setAttribute(k, String(v));
              rect.setAttribute("fill", "#" + fill);
              svg.append(rect);
            }
            let lineY = y + 240000 / 9525;
            for (const para of nodes(shape, "p")) {
              const t = document.createElementNS(svg.namespaceURI, "text");
              t.setAttribute("x", String(x + 80000 / 9525));
              t.setAttribute("y", String(lineY));
              const run = nodes(para, "rPr")[0];
              const font = Math.min(
                200,
                Math.max(
                  1,
                  (Number(run?.getAttribute("sz") || 1800) * 127) / 9525,
                ),
              );
              t.setAttribute("font-size", String(font));
              t.setAttribute("fill", "#202020");
              if (run?.getAttribute("b") === "1")
                t.setAttribute("font-weight", "bold");
              t.textContent = nodes(para, "t")
                .map((n) => n.textContent)
                .join("");
              svg.append(t);
              lineY += font * 1.3;
            }
          }
          return { name, html: new XMLSerializer().serializeToString(svg) };
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  }, [data]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <div>
      <div className="document-toolbar">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          ‹
        </button>
        <span>
          Slide {page + 1} / {slides.length}
        </span>
        <button
          disabled={page >= slides.length - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>
      <p className="document-note">
        Preview cơ bản: text, ảnh PNG/JPEG và shape đơn giản. Chưa hỗ trợ theme,
        master, chart, animation.
      </p>
      {slides[page] && (
        <div
          className="document-slide"
          dangerouslySetInnerHTML={{ __html: slides[page].html }}
        />
      )}
    </div>
  );
}
