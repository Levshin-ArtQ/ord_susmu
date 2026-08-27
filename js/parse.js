/**
 * Turn a raw year-grid (xlsx cells) into groups + colored discipline blocks.
 * Mirrors scripts/parse_schedule.py so a re-imported sheet matches the seed.
 */
(function (global) {
  const MONTHS = {
    январь: 1,
    февраль: 2,
    март: 3,
    апрель: 4,
    май: 5,
    июнь: 6,
    июль: 7,
    август: 8,
    сентябрь: 9,
    октябрь: 10,
    ноябрь: 11,
    декабрь: 12
  };
  const PRACTICE_FILL = "B6D7A8";
  const RED_FILLS = { FF0000: 1, CC0000: 1 };
  const PLUS_GROUPS = /\s*\+\s*(\d+(?:-\d+)?(?:\s*\+\s*\d+(?:-\d+)?)*)\s*$/;
  const SINGLE_LETTER = /^[A-Za-zА-Яа-яЁё]$/;

  const ABBR = {
    "Кл фармакология": "Клиническая фармакология",
    "НиЭМП": "Неотложная и экстренная медицинская помощь",
    "ЭМП": "Экстренная медицинская помощь",
    "ОЗО": "Организация здравоохранения и общественное здоровье",
    "ЗОЖ": "Здоровый образ жизни",
    "КЛД": "Клиническая лабораторная диагностика",
    "ИТ в медицине": "Информационные технологии в медицине",
    "ЛФ и СМ": "Лечебная физкультура и спортивная медицина",
    "ФРМ": "Физическая и реабилитационная медицина",
    "РЭВДЛ": "Рентгенэндоваскулярные диагностика и лечение",
    "ОВП": "Общая врачебная практика",
    "ФД": "Функциональная диагностика",
    "МЧС": "Медицина катастроф",
    "ПА": "Промежуточная аттестация",
    "ОМБ": "ОМБ"
  };

  const SHORT = {
    "Клиническая фармакология": "Кл фарм",
    "Кл фармакология": "Кл фарм",
    "Неотложная и экстренная медицинская помощь": "НиЭМП",
    "НиЭМП": "НиЭМП",
    "Экстренная медицинская помощь": "ЭМП",
    "ЭМП": "ЭМП",
    "Организация здравоохранения и общественное здоровье": "ОЗО",
    "ОЗО": "ОЗО",
    "Здоровый образ жизни": "ЗОЖ",
    "ЗОЖ": "ЗОЖ",
    "Клиническая лабораторная диагностика": "КЛД",
    "КЛД": "КЛД",
    "Информационные технологии в медицине": "ИТ",
    "ИТ в медицине": "ИТ",
    "Педагогика, психология и проф. коммуникации": "Педагогика",
    "Акушерство и гинекология": "Акушерство",
    "Дерматовенерология": "Дерма",
    "Патологическая анатомия": "Патанат.",
    "Медицинская реабилитация": "Реабилитация",
    "Анестезиология и реаниматология": "Анестезиол.",
    "Анестезиология и реанимация": "Анестезиол.",
    "Промежуточная аттестация": "ПА",
    "Практика": "Практика",
    "Каникулы": "Каникулы",
    "Неучебный день": "вых.",
    "Электив": "Электив",
    "Онкология": "Онкология",
    "Урология": "Урология",
    "Неонатология": "Неонатол.",
    "Неонаталогия": "Неонатол.",
    "ОМБ": "ОМБ",
    "Лучевая диагностика": "Лучевая",
    "Патофизиология": "Патфизиол.",
    "Инфекционные болезни": "Инфекции",
    "Функциональная диагностика": "ФД",
    "Фтизиатрия": "Фтизиатрия"
  };

  function cellText(val) {
    if (val == null) return "";
    if (typeof val === "number" && Number.isInteger(val)) return String(val);
    if (typeof val === "number" && val === Math.floor(val)) return String(Math.floor(val));
    return String(val).trim();
  }

  function normalizeTitle(raw) {
    return String(raw || "")
      .replace(/ё/gi, (ch) => (ch === "Ё" ? "Е" : "е"))
      .replace(/\s+/g, " ")
      .trim();
  }

  function baseTitle(raw) {
    let t = normalizeTitle(raw);
    t = t.replace(PLUS_GROUPS, "").replace(/[ ,+]+$/g, "").trim();
    return t.replace(/\s+/g, " ");
  }

  function plusGroups(raw) {
    const m = normalizeTitle(raw).match(PLUS_GROUPS);
    if (!m) return [];
    return m[1].match(/\d+(?:-\d+)?/g) || [];
  }

  function expandName(title) {
    const b = baseTitle(title);
    return ABBR[b] || title;
  }

  function shortName(title) {
    const raw = normalizeTitle(title);
    if (!raw) return "";
    if (SHORT[raw]) return SHORT[raw];
    const b = baseTitle(raw);
    if (SHORT[b]) return SHORT[b];
    const expanded = expandName(b);
    if (SHORT[expanded]) return SHORT[expanded];
    if (b.length <= 11) return b;
    const words = b.split(/[\s,/]+/).filter(Boolean);
    if (words.length === 1) return b.slice(0, 10);
    if (words[0].length >= 5) return words[0].slice(0, 11);
    return (words[0] + " " + (words[1] || "")).trim().slice(0, 12);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function isoDate(y, m, d) {
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function buildDays(getValue) {
    const monthHeaderAt = {};
    for (let col = 1; col <= 400; col++) {
      const v = cellText(getValue(1, col)).toLowerCase();
      if (MONTHS[v]) monthHeaderAt[col] = MONTHS[v];
    }
    let lastCol = 2;
    for (let col = 3; col <= 400; col++) {
      if (getValue(2, col) != null && cellText(getValue(2, col)) !== "") lastCol = col;
    }

    const days = [];
    let year = 2026;
    let month = 9;
    let lastDayNum = 0;

    for (let col = 3; col <= lastCol; col++) {
      const raw = getValue(2, col);
      if (raw == null || cellText(raw) === "") continue;
      const text = cellText(raw);
      if (/[-–]/.test(text) && /каник|\d{1,2}\.\d{1,2}\.\d{4}/i.test(text)) {
        const m = text.match(
          /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
        );
        let start = "2027-07-12";
        let end = "2027-08-31";
        if (m) {
          let y1 = +m[3];
          let y2 = +m[6];
          const last = days[days.length - 1];
          if (last && last.date >= "2027-07-01" && y1 === 2026) {
            y1 = 2027;
            y2 = 2027;
          }
          start = isoDate(y1, +m[2], +m[1]);
          end = isoDate(y2, +m[5], +m[4]);
        }
        days.push({ col, date: start, end, kind: "range", label: text, w: null });
        continue;
      }
      const dayNum = parseInt(text, 10);
      if (!dayNum) continue;
      if (lastDayNum && dayNum < lastDayNum) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      days.push({
        col,
        date: isoDate(year, month, dayNum),
        end: null,
        kind: "day",
        label: null,
        w: new Date(year, month - 1, dayNum).getDay()
      });
      lastDayNum = dayNum;
    }
    return days;
  }

  function classifyRaw(text, fill) {
    const t = normalizeTitle(text);
    const low = t.toLowerCase();
    const f = (fill || "").toUpperCase();
    if (low.includes("каник")) return ["vacation", "Каникулы"];
    if (low === "практика") return ["practice", "Практика"];
    if (RED_FILLS[f]) {
      if (t === "П" || t === "А" || t === "ПА" || t === "ПП") return ["attestation", t];
      if (!t) return ["off", "Неучебный день"];
      return ["off", t];
    }
    if (f === PRACTICE_FILL) {
      if (!t || SINGLE_LETTER.test(t)) return ["practice", "Практика"];
      return ["course", t];
    }
    if (t && !SINGLE_LETTER.test(t) && t !== "П" && t !== "А" && t !== "ПА") return ["course", t];
    if (t && SINGLE_LETTER.test(t)) return ["letter", t];
    return ["empty", ""];
  }

  function spreadCourseFills(cells) {
    let last = null;
    for (const c of cells) {
      if (c.kind === "course" && c.fill) {
        last = { fill: c.fill, title: c.title, plus: c.plus || [], vshare: c.vshare || [] };
        continue;
      }
      if ((c.kind === "empty" || c.kind === "letter") && last && c.fill === last.fill) {
        c.kind = "course";
        c.title = last.title;
        c.raw = last.title;
        c.plus = Array.from(new Set([...(c.plus || []), ...last.plus]));
        c.vshare = Array.from(new Set([...(c.vshare || []), ...last.vshare]));
        continue;
      }
      if (c.kind !== "empty") last = null;
    }
  }

  function applyLetterRuns(cells) {
    let i = 0;
    while (i < cells.length) {
      const k = cells[i].kind;
      const t = cells[i].title;
      const isL =
        k === "letter" || k === "attestation" || (k === "off" && t && t.length === 1);
      if (!isL) {
        i++;
        continue;
      }
      const idxs = [];
      const letters = [];
      let j = i;
      while (j < cells.length) {
        const ck = cells[j].kind;
        const ct = cells[j].title;
        if (ck === "letter" || ck === "attestation" || (ck === "off" && ct && ct.length === 1)) {
          letters.push(ct);
          idxs.push(j);
          j++;
        } else break;
      }
      const joined = letters.join("").toLowerCase().replace(/ё/g, "е");
      if (joined === "практика") {
        idxs.forEach((ix) => {
          cells[ix].kind = "practice";
          cells[ix].title = "Практика";
          cells[ix].raw = "Практика";
        });
      } else if (joined === "па" || joined === "пп") {
        idxs.forEach((ix) => {
          cells[ix].kind = "attestation";
          cells[ix].title = "Промежуточная аттестация";
          cells[ix].raw = "ПА";
        });
      }
      i = j > i ? j : i + 1;
    }
  }

  function coalescePractice(cells) {
    const practiceIdx = [];
    cells.forEach((c, i) => {
      if (c.kind === "practice") practiceIdx.push(i);
    });
    if (!practiceIdx.length) {
      cells.forEach((c) => {
        if (c.fill === PRACTICE_FILL && (c.kind === "empty" || c.kind === "letter")) {
          c.kind = "practice";
          c.title = "Практика";
          c.raw = "Практика";
        }
      });
      return;
    }
    let start = Math.min(...practiceIdx);
    let end = Math.max(...practiceIdx);
    while (
      start > 0 &&
      cells[start - 1].fill === PRACTICE_FILL &&
      ["empty", "letter", "practice"].includes(cells[start - 1].kind)
    ) {
      start--;
    }
    while (
      end + 1 < cells.length &&
      cells[end + 1].fill === PRACTICE_FILL &&
      ["empty", "letter", "practice"].includes(cells[end + 1].kind)
    ) {
      end++;
    }
    for (let i = start; i <= end; i++) {
      if (["empty", "letter", "practice"].includes(cells[i].kind)) {
        cells[i].kind = "practice";
        cells[i].title = "Практика";
        cells[i].raw = "Практика";
      }
    }
  }

  function toBlocks(groupId, speciality, cells) {
    const blocks = [];
    let i = 0;
    while (i < cells.length) {
      const c = cells[i];
      let kind = c.kind;
      let title;
      let color;
      if (kind === "empty" || kind === "letter") {
        kind = "specialty";
        title = speciality;
        color = null;
      } else {
        title = c.title || speciality;
        color = c.fill || null;
      }
      let j = i;
      while (j + 1 < cells.length) {
        const nxt = cells[j + 1];
        let nkind = nxt.kind;
        let ntitle;
        let ncolor;
        if (nkind === "empty" || nkind === "letter") {
          nkind = "specialty";
          ntitle = speciality;
          ncolor = null;
        } else {
          ntitle = nxt.title || speciality;
          ncolor = nxt.fill || null;
        }
        let same = nkind === kind && baseTitle(ntitle) === baseTitle(title);
        if (kind === "course") same = same && (ncolor === color || !ncolor || !color);
        if (!same) break;
        j++;
      }
      const shared = [];
      for (let k = i; k <= j; k++) {
        (cells[k].plus || []).forEach((s) => shared.push(s));
        (cells[k].vshare || []).forEach((s) => shared.push(s));
      }
      const start = cells[i].date;
      const end = cells[j].end || cells[j].date;
      let workDays = 0;
      for (let k = i; k <= j; k++) if (!cells[k].range) workDays++;
      if (workDays === 0 && start && end) {
        const d0 = new Date(start + "T12:00:00");
        const d1 = new Date(end + "T12:00:00");
        workDays = Math.round((d1 - d0) / 86400000) + 1;
      }
      blocks.push({
        id: groupId + ":" + start + ":" + kind + ":" + baseTitle(title).slice(0, 40),
        kind,
        title: kind === "specialty" ? speciality : title,
        base: baseTitle(kind === "specialty" ? speciality : title),
        color,
        start,
        end,
        dayCount: workDays,
        sharedHint: Array.from(new Set(shared.filter((s) => s && s !== groupId))).sort(),
        raw: c.raw || title
      });
      i = j + 1;
    }
    return blocks;
  }

  /**
   * @param {{cell: (r:number,c:number)=>{value:any, fill:string|null}, merges: Array<{minRow:number,minCol:number,maxRow:number,maxCol:number}>, maxRow?:number, maxCol?:number, sourceName?:string}} wb
   */
  function parseWorkbook(wb) {
    const groups = [];
    for (let row = 3; row < 200; row++) {
      const spec = cellText(wb.cell(row, 1).value);
      const grp = wb.cell(row, 2).value;
      if (!spec && (grp == null || cellText(grp) === "")) {
        if (groups.length && row > 10) break;
        continue;
      }
      if (grp == null || cellText(grp) === "") continue;
      groups.push({ id: cellText(grp), speciality: normalizeTitle(spec), row });
    }
    if (!groups.length) throw new Error("Не найдены группы (столбцы «специальность» и «группа»).");

    const getValue = (r, c) => wb.cell(r, c).value;
    const daysMeta = buildDays(getValue);
    if (daysMeta.length < 10) throw new Error("Не удалось прочитать даты в шапке таблицы.");

    const master = new Map();
    (wb.merges || []).forEach((rng) => {
      for (let r = rng.minRow; r <= rng.maxRow; r++) {
        for (let c = rng.minCol; c <= rng.maxCol; c++) {
          master.set(r + "," + c, rng);
        }
      }
    });
    const rowToGid = {};
    groups.forEach((g) => {
      rowToGid[g.row] = g.id;
    });

    const parsedGroups = groups.map((g) => {
      const cells = daysMeta.map((d) => {
        let mrow = g.row;
        let mcol = d.col;
        const vshare = [];
        const rng = master.get(g.row + "," + d.col);
        if (rng) {
          mrow = rng.minRow;
          mcol = rng.minCol;
          for (let rr = rng.minRow; rr <= rng.maxRow; rr++) {
            const gid = rowToGid[rr];
            if (gid && gid !== g.id) vshare.push(gid);
          }
        }
        const cell = wb.cell(mrow, mcol);
        const text = cellText(cell.value);
        const fill = cell.fill || wb.cell(g.row, d.col).fill || null;
        const [kind0, title] = classifyRaw(text, fill);
        const isRange = d.kind === "range";
        return {
          date: d.date,
          end: d.end,
          range: isRange,
          kind: isRange && kind0 === "empty" ? "vacation" : kind0,
          title: isRange && (kind0 === "empty" || kind0 === "vacation") ? "Каникулы" : title,
          raw: text,
          fill,
          plus: plusGroups(text),
          vshare
        };
      });
      spreadCourseFills(cells);
      applyLetterRuns(cells);
      coalescePractice(cells);
      cells.forEach((c) => {
        if (c.range) {
          c.kind = "vacation";
          c.title = "Каникулы";
        }
      });
      return {
        id: g.id,
        speciality: g.speciality,
        blocks: toBlocks(g.id, g.speciality, cells)
      };
    });

    const days = daysMeta.map((d) =>
      d.kind === "range"
        ? { date: d.date, end: d.end, w: d.w, kind: "range", label: d.label }
        : { date: d.date, w: d.w, kind: "day" }
    );

    return {
      version: 1,
      academicYear: "2026-2027",
      yearLabel: "1 год",
      title: "Расписание ординатуры 2026–2027",
      sourceName: wb.sourceName || "import.xlsx",
      importedAt: new Date().toISOString(),
      groups: parsedGroups,
      days
    };
  }

  function coalesceDayMap(schedule, speciality, dayMap) {
    const cells = [];
    (schedule.days || []).forEach((d) => {
      if (d.kind === "range") {
        const rec = dayMap[d.date] || { kind: "vacation", title: "Каникулы", color: null };
        cells.push({
          date: d.date,
          end: d.end,
          range: true,
          kind: rec.kind || "vacation",
          title: rec.title || "Каникулы",
          fill: rec.color || null,
          plus: [],
          vshare: rec.sharedHint || [],
          raw: rec.title
        });
        return;
      }
      const rec = dayMap[d.date] || { kind: "specialty", title: speciality, color: null };
      cells.push({
        date: d.date,
        end: null,
        range: false,
        kind: rec.kind || "specialty",
        title: rec.title || speciality,
        fill: rec.color || null,
        plus: [],
        vshare: rec.sharedHint || [],
        raw: rec.title
      });
    });
    return toBlocks("_", speciality, cells);
  }

  global.OrdinaturaParse = {
    ABBR,
    SHORT,
    PRACTICE_FILL,
    parseWorkbook,
    baseTitle,
    plusGroups,
    expandName,
    shortName,
    normalizeTitle,
    coalesceDayMap,
    cellText
  };
})(typeof window !== "undefined" ? window : globalThis);
