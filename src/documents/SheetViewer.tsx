import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
export default function SheetViewer({ data }: { data: Uint8Array }) {
  const [book, setBook] = useState<XLSX.WorkBook | null>(null),
    [sheet, setSheet] = useState(0),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const worker = new Worker(new URL("./sheet.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      if (e.data.error) setError(e.data.error);
      else setBook(e.data.book);
    };
    worker.postMessage(data);
    return () => worker.terminate();
  }, [data]);
  if (error) return <p role="alert">{error}</p>;
  if (!book) return <p role="status">Đang đọc workbook…</p>;
  const ws = book.Sheets[book.SheetNames[sheet]],
    range = XLSX.utils.decode_range(ws["!ref"] || "A1"),
    rows = Math.min(range.e.r + 1, offset + 150),
    cols = Math.min(range.e.c + 1, 100),
    cell = ws[selected];
  const merges = ws["!merges"] || [];
  return (
    <div className="document-sheet">
      <div className="document-toolbar">
        <select
          aria-label="Worksheet"
          value={sheet}
          onChange={(e) => {
            setSheet(+e.target.value);
            setOffset(0);
            setSelected("");
          }}
        >
          {book.SheetNames.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <input
          placeholder="Tìm giá trị"
          aria-label="Tìm ô"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="document-formula">
        {selected || "Chọn ô"}{" "}
        {cell?.f ? `= ${cell.f}` : cell?.w || String(cell?.v ?? "")}
      </div>
      <div className="document-grid">
        <table>
          <thead>
            <tr>
              <th></th>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c}>{XLSX.utils.encode_col(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows - offset }, (_, index) => {
              const r = offset + index;
              return (
                <tr key={r}>
                  <th>{r + 1}</th>
                  {Array.from({ length: cols }, (_, c) => {
                    const merge = merges.find(
                      (m) =>
                        r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c,
                    );
                    if (merge && (r !== merge.s.r || c !== merge.s.c))
                      return null;
                    const address = XLSX.utils.encode_cell({ r, c }),
                      item = ws[address],
                      value = item?.w || String(item?.v ?? "");
                    return (
                      <td
                        key={c}
                        rowSpan={merge ? merge.e.r - merge.s.r + 1 : 1}
                        colSpan={merge ? merge.e.c - merge.s.c + 1 : 1}
                      >
                        <button
                          className={
                            selected === address
                              ? "selected"
                              : query &&
                                  value
                                    .toLowerCase()
                                    .includes(query.toLowerCase())
                                ? "match"
                                : ""
                          }
                          onClick={() => setSelected(address)}
                        >
                          {value}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="document-toolbar">
        <button
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 150))}
        >
          Trước
        </button>
        <span>
          {offset + 1}–{rows} / {range.e.r + 1} hàng
        </span>
        <button
          disabled={rows > range.e.r}
          onClick={() => setOffset(offset + 150)}
        >
          Tiếp
        </button>
      </div>
      <small>
        Chỉ đọc · Giá trị lưu sẵn, không tính lại công thức · Tối đa 100 cột
      </small>
    </div>
  );
}
