/**
 * Minimal xlsx reader: values, fills, merges. No dependencies.
 * Uses DecompressionStream for deflate (Safari 16.4+ / Chromium).
 */
(function (global) {
  function u8(buf) {
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }

  function readStr(view, off, len) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + off, len);
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[i]);
      return s;
    }
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Этот браузер не умеет распаковывать xlsx. Загрузите файл через Safari / Chrome.");
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function findEOCD(view, bytes) {
    const min = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async function unzip(arrayBuffer) {
    const bytes = u8(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEOCD(view, bytes);
    if (eocd < 0) throw new Error("Файл не похож на xlsx (zip).");
    const count = view.getUint16(eocd + 10, true);
    let cd = view.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < count; n++) {
      if (view.getUint32(cd, true) !== 0x02014b50) throw new Error("Повреждённый xlsx.");
      const method = view.getUint16(cd + 10, true);
      const compSize = view.getUint32(cd + 20, true);
      const nameLen = view.getUint16(cd + 28, true);
      const extraLen = view.getUint16(cd + 30, true);
      const commentLen = view.getUint16(cd + 32, true);
      const localOff = view.getUint32(cd + 42, true);
      const name = readStr(view, cd + 46, nameLen);
      const locNameLen = view.getUint16(localOff + 26, true);
      const locExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + locNameLen + locExtraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      let data;
      if (method === 0) data = comp;
      else if (method === 8) data = await inflateRaw(comp);
      else throw new Error("Неподдерживаемое сжатие в xlsx (" + method + ")");
      files[name] = data;
      cd += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function xml(u8data) {
    const text = new TextDecoder("utf-8").decode(u8data);
    return new DOMParser().parseFromString(text, "application/xml");
  }

  function attr(el, name) {
    return el.getAttribute(name);
  }

  function colRow(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
    if (!m) return null;
    let col = 0;
    for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { col, row: +m[2] };
  }

  function parseSharedStrings(doc) {
    const out = [];
    const sis = doc.getElementsByTagName("si");
    for (let i = 0; i < sis.length; i++) {
      const texts = sis[i].getElementsByTagName("t");
      let s = "";
      for (let j = 0; j < texts.length; j++) s += texts[j].textContent || "";
      out.push(s);
    }
    return out;
  }

  function parseFills(stylesDoc) {
    const fills = [];
    const fillEls = stylesDoc.getElementsByTagName("fill");
    for (let i = 0; i < fillEls.length; i++) {
      const fg = fillEls[i].getElementsByTagName("fgColor")[0];
      let rgb = null;
      if (fg) {
        const raw = attr(fg, "rgb");
        if (raw) {
          let h = raw.toUpperCase();
          if (h.length === 8) h = h.slice(2);
          if (h && h !== "000000" && h !== "FFFFFF") rgb = h;
        }
      }
      fills.push(rgb);
    }
    const xfs = [];
    const cellXfs = stylesDoc.getElementsByTagName("cellXfs")[0];
    const xfEls = cellXfs ? cellXfs.getElementsByTagName("xf") : [];
    for (let i = 0; i < xfEls.length; i++) {
      const fillId = parseInt(attr(xfEls[i], "fillId") || "0", 10);
      xfs.push(fills[fillId] || null);
    }
    return xfs;
  }

  function parseMerges(sheetDoc) {
    const out = [];
    const els = sheetDoc.getElementsByTagName("mergeCell");
    for (let i = 0; i < els.length; i++) {
      const ref = attr(els[i], "ref") || "";
      const parts = ref.split(":");
      if (parts.length !== 2) continue;
      const a = colRow(parts[0]);
      const b = colRow(parts[1]);
      if (!a || !b) continue;
      out.push({
        minRow: Math.min(a.row, b.row),
        minCol: Math.min(a.col, b.col),
        maxRow: Math.max(a.row, b.row),
        maxCol: Math.max(a.col, b.col)
      });
    }
    return out;
  }

  function parseSheet(sheetDoc, shared, xfs) {
    const grid = new Map();
    const cs = sheetDoc.getElementsByTagName("c");
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const ref = attr(c, "r");
      const pos = colRow(ref);
      if (!pos) continue;
      const t = attr(c, "t");
      const sIdx = attr(c, "s");
      const fill = sIdx != null ? xfs[+sIdx] || null : null;
      let value = null;
      if (t === "s") {
        const v = c.getElementsByTagName("v")[0];
        value = v ? shared[+v.textContent] : "";
      } else if (t === "inlineStr") {
        const ts = c.getElementsByTagName("t");
        let s = "";
        for (let j = 0; j < ts.length; j++) s += ts[j].textContent || "";
        value = s;
      } else {
        const v = c.getElementsByTagName("v")[0];
        if (v) {
          const num = Number(v.textContent);
          value = Number.isNaN(num) ? v.textContent : num;
        }
      }
      grid.set(pos.row + "," + pos.col, { value, fill });
    }
    return grid;
  }

  async function readXlsx(arrayBuffer, sourceName) {
    const files = await unzip(arrayBuffer);
    const ssFile = files["xl/sharedStrings.xml"];
    const stFile = files["xl/styles.xml"];
    let sheetPath = "xl/worksheets/sheet1.xml";
    if (!files[sheetPath]) {
      const found = Object.keys(files).find((k) => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
      if (!found) throw new Error("В файле нет листа с расписанием.");
      sheetPath = found;
    }
    const shared = ssFile ? parseSharedStrings(xml(ssFile)) : [];
    const xfs = stFile ? parseFills(xml(stFile)) : [];
    const sheetDoc = xml(files[sheetPath]);
    const grid = parseSheet(sheetDoc, shared, xfs);
    const merges = parseMerges(sheetDoc);
    return {
      sourceName: sourceName || "import.xlsx",
      merges,
      cell(row, col) {
        return grid.get(row + "," + col) || { value: null, fill: null };
      }
    };
  }

  function sheetsExportUrl(url) {
    if (!url) return "";
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!m) return "";
    const gid = (String(url).match(/gid=([0-9]+)/) || [])[1] || "0";
    return "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=xlsx&gid=" + gid;
  }

  global.OrdinaturaXlsx = { readXlsx, sheetsExportUrl, unzip };
})(typeof window !== "undefined" ? window : globalThis);
