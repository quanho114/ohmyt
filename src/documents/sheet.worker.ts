import { read, utils } from "xlsx";
self.onmessage = (e) => {
  try {
    const input = e.data;
    const book = read(input.semantic ? input.data : input, {
      type: "array",
      cellStyles: true,
      cellDates: false,
    });
    if (input.semantic) {
      let text = "";
      for (const name of book.SheetNames) {
        text +=
          `\n[Sheet: ${name}]\n` +
          utils
            .sheet_to_csv({
              ...book.Sheets[name],
              "!ref": (() => {
                const range = utils.decode_range(
                  book.Sheets[name]["!ref"] || "A1",
                );
                range.e.r = Math.min(range.e.r, range.s.r + 149);
                range.e.c = Math.min(range.e.c, range.s.c + 99);
                return utils.encode_range(range);
              })(),
            })
            .slice(0, 16000 - text.length);
        if (text.length >= 16000) break;
      }
      self.postMessage({ text: text.slice(0, 16000) });
    } else self.postMessage({ book });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
