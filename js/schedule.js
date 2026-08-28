/**
 * Queries over the year schedule + user overrides.
 */
(function (global) {
  const P = () => global.OrdinaturaParse;
  const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const WD_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const MONTHS = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь"
  ];
  const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const MONTHS_GEN = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря"
  ];

  function plural(n, one, few, many) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toISO(dt) {
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    return y + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
  }

  function todayISO() {
    return toISO(new Date());
  }

  function weekday(iso) {
    return parseISO(iso).getDay();
  }

  function formatLong(iso) {
    const dt = parseISO(iso);
    const wd = WD[dt.getDay()];
    return wd + ", " + dt.getDate() + " " + MONTHS_GEN[dt.getMonth()] + " " + dt.getFullYear();
  }

  function formatShort(iso) {
    const dt = parseISO(iso);
    return dt.getDate() + " " + MONTHS_GEN[dt.getMonth()];
  }

  function formatDM(iso) {
    const dt = parseISO(iso);
    return pad2(dt.getDate()) + "." + pad2(dt.getMonth() + 1);
  }

  function formatDayMon(iso) {
    const dt = parseISO(iso);
    return dt.getDate() + " " + MONTHS_SHORT[dt.getMonth()];
  }

  function formatRange(a, b) {
    if (a === b) return formatShort(a);
    const da = parseISO(a);
    const db = parseISO(b);
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) {
      return da.getDate() + "–" + db.getDate() + " " + MONTHS_GEN[da.getMonth()];
    }
    return formatDayMon(a) + " — " + formatDayMon(b);
  }

  function pad2(n) {
    n = +n;
    return n < 10 ? "0" + n : String(n);
  }

  function isClock(v) {
    if (v == null || v === "") return false;
    const m = String(v).trim().match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
    if (!m) return false;
    const h = +m[1];
    return h >= 0 && h <= 23;
  }

  function clockFrom(rec) {
    if (!rec) return { start: "", end: "" };
    const start = isClock(rec.timeStart) ? rec.timeStart : isClock(rec.start) ? rec.start : "";
    const end = isClock(rec.timeEnd) ? rec.timeEnd : isClock(rec.end) ? rec.end : "";
    return { start, end };
  }

  function formatClock(hhmm) {
    if (!isClock(hhmm)) return "";
    const parts = String(hhmm).trim().split(":");
    return parseInt(parts[0], 10) + ":" + pad2(parts[1]);
  }

  function formatTimeSpan(start, end) {
    const a = isClock(start) ? start : "";
    const b = isClock(end) ? end : "";
    if (!a && !b) return "время не указано";
    return "с " + formatClock(a || "09:00") + " до " + formatClock(b || "15:00");
  }

  function darken(hex, amt) {
    const h = String(hex || "888888").replace("#", "");
    if (h.length < 6) return "#555555";
    const ch = (i) =>
      Math.max(0, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - (amt || 0.28))))
        .toString(16)
        .padStart(2, "0");
    return "#" + ch(0) + ch(2) + ch(4);
  }

  function shiftMonth(y, m, delta) {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }

  function monthWeeks(year, month) {
    const cells = monthCells(year, month);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  function kindLabel(kind) {
    return (
      {
        specialty: "Профильная дисциплина",
        course: "Цикл",
        practice: "Практика",
        attestation: "Аттестация",
        vacation: "Каникулы",
        off: "Неучебный день"
      }[kind] || kind
    );
  }

  function luminance(hex) {
    if (!hex) return 200;
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return r * 0.299 + g * 0.587 + b * 0.114;
  }

  function textOn(hex) {
    return luminance(hex) > 158 ? "#1c2430" : "#ffffff";
  }

  function hashColor(str) {
    let h = 0;
    for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return hslToHex(hue, 28, 78);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0");
    return (hex(f(0)) + hex(f(8)) + hex(f(4))).toUpperCase();
  }

  function colorOf(rec, speciality) {
    if (rec.kind === "specialty") return rec.color || hashColor(speciality || rec.title || "s");
    if (rec.color) return rec.color;
    if (rec.kind === "practice") return "B6D7A8";
    if (rec.kind === "attestation" || rec.kind === "off") return "E07070";
    if (rec.kind === "vacation") return "CFE2F3";
    return "D0D5DD";
  }

  function getGroup(schedule, id) {
    return ((schedule && schedule.groups) || []).find((g) => g.id === id) || null;
  }

  function specialities(schedule) {
    const map = new Map();
    ((schedule && schedule.groups) || []).forEach((g) => {
      if (!map.has(g.speciality)) map.set(g.speciality, []);
      map.get(g.speciality).push(g);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "ru"))
      .map(([name, groups]) => ({ name, groups }));
  }

  function workingDates(schedule) {
    return ((schedule && schedule.days) || []).filter((d) => d.kind === "day").map((d) => d.date);
  }

  function datesOf(schedule, block) {
    const skip = new Set(block.skip || []);
    if (block.kind === "vacation" && block.start && block.end && block.start !== block.end) {
      const out = [];
      const d0 = parseISO(block.start);
      const d1 = parseISO(block.end);
      for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
        const iso = toISO(d);
        if (!skip.has(iso)) out.push(iso);
      }
      return out;
    }
    return workingDates(schedule).filter((d) => d >= block.start && d <= block.end && !skip.has(d));
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function resolvedCycles(schedule, group, overrides) {
    const gid = group.id;
    const ov = overrides || {};
    const patches = (ov.cyclePatches && ov.cyclePatches[gid]) || {};
    const extras = (ov.extraCycles && ov.extraCycles[gid]) || [];
    const dayOv = (ov.days && ov.days[gid]) || {};
    const work = workingDates(schedule);
    const cycles = [];

    function countDays(start, end, skip) {
      const sk = new Set(skip || []);
      return work.filter((d) => d >= start && d <= end && !sk.has(d)).length;
    }

    (group.blocks || []).forEach((b) => {
      const p = patches[b.id] || {};
      if (p.deleted) return;
      const start = p.start || b.start;
      const end = p.end || b.end;
      const skip = uniq(
        (p.skip || []).concat(
          work.filter((d) => d >= start && d <= end && dayOv[d] && (dayOv[d].off || dayOv[d].split))
        )
      );
      const title = p.title || b.title;
      cycles.push({
        id: b.id,
        origin: "seed",
        kind: p.kind || b.kind,
        title,
        base: P().baseTitle(title),
        color: p.color != null ? p.color : b.color,
        start,
        end,
        skip,
        sharedHint: b.sharedHint || [],
        dayCount: countDays(start, end, skip)
      });
    });

    extras.forEach((b) => {
      if (!b || b.deleted) return;
      const skip = uniq(b.skip || []);
      cycles.push({
        id: b.id,
        origin: "extra",
        kind: b.kind || "course",
        title: b.title || "Цикл",
        base: P().baseTitle(b.title || "Цикл"),
        color: b.color || null,
        start: b.start,
        end: b.end,
        skip,
        sharedHint: [],
        dayCount: countDays(b.start, b.end, skip)
      });
    });

    Object.keys(dayOv).forEach((d) => {
      const o = dayOv[d];
      if (!o || !o.split) return;
      const title = o.title || "Цикл";
      cycles.push({
        id: "split:" + gid + ":" + d,
        origin: "split",
        kind: o.kind || "course",
        title,
        base: o.base || P().baseTitle(title),
        color: o.color || null,
        start: d,
        end: d,
        skip: [],
        sharedHint: [],
        dayCount: 1
      });
    });

    cycles.sort((a, b) => (a.start || "").localeCompare(b.start || "") || (a.id || "").localeCompare(b.id || ""));
    return cycles;
  }

  function overlayDay(rec, o) {
    if (!o || o.split || o.deleted) return rec;
    const next = Object.assign({}, rec);
    if (o.notes != null) next.notes = o.notes;
    if (o.location) next.location = o.location;
    if (o.locationUrl) next.locationUrl = o.locationUrl;
    if (o.parts) next.parts = o.parts;
    if (o.practice) next.practice = o.practice;
    if (o.lecture) next.lecture = o.lecture;
    if (o.off) next.off = true;
    return next;
  }

  function effective(schedule, group, overrides) {
    const cycles = resolvedCycles(schedule, group, overrides);
    const dayOv = (overrides && overrides.days && overrides.days[group.id]) || {};
    const map = {};
    cycles.forEach((b) => {
      const skip = new Set(b.skip || []);
      const span =
        b.kind === "vacation"
          ? datesOf(schedule, Object.assign({}, b, { skip: [] }))
          : workingDates(schedule).filter((d) => d >= b.start && d <= b.end);
      span.forEach((d) => {
        const rec = overlayDay(
          {
            id: b.id,
            origin: b.origin,
            kind: b.kind,
            title: b.title,
            base: b.base,
            color: b.color,
            start: b.start,
            end: b.end,
            skip: b.skip,
            sharedHint: b.sharedHint,
            off: skip.has(d),
            source: b.origin === "seed" ? "seed" : "user"
          },
          dayOv[d]
        );
        if (!map[d]) map[d] = [];
        map[d].push(rec);
      });
    });
    return { map, blocks: cycles };
  }

  function recsAt(eff, date) {
    const v = eff.map[date];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  function recAt(eff, date) {
    const recs = recsAt(eff, date);
    return recs.find((r) => !r.off) || recs[0] || null;
  }

  function blockAt(eff, date) {
    const rec = recAt(eff, date);
    if (rec && rec.id) return (eff.blocks || []).find((b) => b.id === rec.id) || rec;
    return (
      (eff.blocks || []).find((b) => date >= b.start && date <= b.end && !(b.skip || []).includes(date)) || null
    );
  }

  function nearest(schedule, eff, date) {
    const rec = recAt(eff, date);
    if (rec) return { date, rec, block: blockAt(eff, date), exact: true };
    const work = workingDates(schedule);
    const next = work.find((d) => d >= date);
    const prev = [...work].reverse().find((d) => d < date);
    const pick = next || prev;
    if (!pick) return { date, rec: null, block: null, exact: false };
    return { date: pick, rec: recAt(eff, pick), block: blockAt(eff, pick), exact: false, next, prev };
  }

  function progress(schedule, block, date) {
    if (!block) return null;
    const days = datesOf(schedule, block);
    const work = block.kind === "vacation" ? days.filter((d) => parseISO(d).getDay() !== 0) : days;
    let idx = work.indexOf(date);
    if (idx < 0) {
      idx = work.filter((d) => d <= date).length - 1;
    }
    const total = work.length || block.dayCount || 1;
    const index = Math.max(0, idx) + 1;
    return {
      index,
      total,
      left: Math.max(0, total - index),
      gone: Math.min(index, total),
      days: work
    };
  }

  function yearProgress(eff, block, date) {
    if (!block) return null;
    const same = eff.blocks.filter((b) => b.kind === block.kind && b.base === block.base);
    let gone = 0;
    let total = 0;
    same.forEach((b) => {
      total += b.dayCount || 0;
      if (b.end < date) gone += b.dayCount || 0;
      else if (b.start <= date && b.end >= date) {
        const days = [];
        // counted in caller via progress
      }
    });
    return { stretches: same.length, total };
  }

  function peers(schedule, group, block, overrides) {
    if (!block) return [];
    const base = P().baseTitle(block.base || block.title);
    const out = [];
    (schedule.groups || []).forEach((g) => {
      if (g.id === group.id) return;
      const eff = effective(schedule, g, overrides);
      const hit = eff.blocks.find(
        (b) =>
          P().baseTitle(b.base || b.title) === base &&
          b.kind === block.kind &&
          b.start <= block.end &&
          b.end >= block.start
      );
      if (hit) out.push({ group: g, block: hit });
    });
    const hinted = new Set(block.sharedHint || []);
    out.sort((a, b) => {
      const ha = hinted.has(a.group.id) ? 0 : 1;
      const hb = hinted.has(b.group.id) ? 0 : 1;
      if (ha !== hb) return ha - hb;
      return a.group.id.localeCompare(b.group.id, "ru");
    });
    return out;
  }

  function monthCells(year, month) {
    const first = new Date(year, month, 1);
    const startOff = (first.getDay() + 6) % 7; // Monday-first
    const daysIn = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOff; i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) {
      cells.push(toISO(new Date(year, month, d)));
    }
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function normalizeParts(parts) {
    const allowed = ["practice", "lecture"];
    const out = (Array.isArray(parts) ? parts : []).filter((p) => allowed.indexOf(p) >= 0);
    return out.length ? out : ["practice", "lecture"];
  }

  function defaultPartTimes(settings, iso, kind) {
    const sat = weekday(iso) === 6;
    if (kind === "practice") {
      return {
        start: sat
          ? settings.saturdayPracticeStart || settings.saturdayStart || "09:00"
          : settings.practiceStart || settings.defaultStart || "09:00",
        end: sat
          ? settings.saturdayPracticeEnd || "11:00"
          : settings.practiceEnd || "12:00"
      };
    }
    return {
      start: sat
        ? settings.saturdayLectureStart || "11:15"
        : settings.lectureStart || "12:30",
      end: sat
        ? settings.saturdayLectureEnd || settings.saturdayEnd || "13:00"
        : settings.lectureEnd || settings.defaultEnd || "15:00"
    };
  }

  function slotsFor(settings, times, rec, iso) {
    const base = rec && rec.base;
    const disc = base && times && times.discipline && times.discipline[base];
    const parts = normalizeParts((rec && rec.parts) || (disc && disc.parts) || settings.defaultParts);
    return parts.map((kind) => {
      const fromDay = rec && rec[kind];
      const fromDisc = disc && disc[kind];
      const def = defaultPartTimes(settings, iso || todayISO(), kind);
      return {
        kind,
        label: kind === "practice" ? "Практика" : "Лекция",
        start:
          isClock(fromDay && fromDay.start) ? fromDay.start : isClock(fromDisc && fromDisc.start) ? fromDisc.start : def.start,
        end: isClock(fromDay && fromDay.end) ? fromDay.end : isClock(fromDisc && fromDisc.end) ? fromDisc.end : def.end
      };
    });
  }

  function timeFor(settings, times, rec, iso) {
    const slots = slotsFor(settings, times, rec, iso);
    if (slots.length) {
      return { start: slots[0].start, end: slots[slots.length - 1].end, source: "slots", slots };
    }
    return { start: settings.defaultStart || "09:00", end: settings.defaultEnd || "15:00", source: "default", slots: [] };
  }

  function teacherFor(teachers, rec, groupId) {
    if (!rec || !teachers) return null;
    const base = rec.base || P().baseTitle(rec.title);
    return teachers[groupId + "::" + base] || teachers[base] || null;
  }

  function locText(v) {
    if (!v) return "";
    if (typeof v === "object") return v.text || "";
    return String(v);
  }

  function locUrl(v, rec) {
    if (rec && rec.locationUrl) return rec.locationUrl;
    if (v && typeof v === "object") return v.url || "";
    return "";
  }

  function locationFor(locations, rec, groupId) {
    if (rec && rec.location) return locText(rec.location);
    if (!rec || !locations) return "";
    const base = rec.base || P().baseTitle(rec.title);
    const loc = locations[groupId + "::" + base] || locations[base];
    return locText(loc);
  }

  function locationUrlFor(locations, rec, groupId) {
    if (rec && rec.locationUrl) return rec.locationUrl;
    if (rec && rec.location && typeof rec.location === "object") return rec.location.url || "";
    if (!rec || !locations) return "";
    const base = rec.base || P().baseTitle(rec.title);
    const loc = locations[groupId + "::" + base] || locations[base];
    return locUrl(loc, rec);
  }

  function academicSpan(schedule) {
    const work = workingDates(schedule);
    const vac = ((schedule && schedule.days) || []).find((d) => d.kind === "range");
    return {
      start: work[0] || "",
      end: vac ? vac.end : work[work.length - 1] || "",
      firstWork: work[0] || "",
      lastWork: work[work.length - 1] || ""
    };
  }

  function nextBlock(eff, date) {
    return (
      (eff.blocks || [])
        .filter((b) => b.start > date && b.kind !== "off")
        .sort((a, b) => a.start.localeCompare(b.start))[0] || null
    );
  }

  function defaultSettings() {
    return {
      groupId: "",
      peekId: "",
      sheetsUrl: "https://docs.google.com/spreadsheets/d/1siBUrx0SMJTvETICVq7vqxk_KxiT6Pag_ucvXvZqc6Q/edit",
      defaultStart: "09:00",
      defaultEnd: "15:00",
      saturdayStart: "09:00",
      saturdayEnd: "13:00",
      practiceStart: "09:00",
      practiceEnd: "12:00",
      lectureStart: "12:30",
      lectureEnd: "15:00",
      saturdayPracticeStart: "09:00",
      saturdayPracticeEnd: "11:00",
      saturdayLectureStart: "11:15",
      saturdayLectureEnd: "13:00",
      defaultParts: ["practice", "lecture"],
      seenOnboarding: false,
      weekStartsMonday: true,
      calSpan: 3,
      compareIds: [],
      compareMode: "cycle",
      compareFrom: "",
      compareTo: ""
    };
  }

  function emptyUser() {
    return {
      days: {},
      teachers: {},
      locations: {},
      times: { discipline: {} },
      colors: {},
      titles: {},
      cyclePatches: {},
      extraCycles: {}
    };
  }

  global.OrdinaturaSched = {
    WD,
    WD_SHORT,
    MONTHS,
    MONTHS_SHORT,
    MONTHS_GEN,
    plural,
    parseISO,
    toISO,
    todayISO,
    weekday,
    formatLong,
    formatShort,
    formatDM,
    formatDayMon,
    formatRange,
    isClock,
    clockFrom,
    formatClock,
    formatTimeSpan,
    darken,
    shiftMonth,
    monthWeeks,
    kindLabel,
    luminance,
    textOn,
    hashColor,
    colorOf,
    getGroup,
    specialities,
    workingDates,
    datesOf,
    effective,
    recsAt,
    resolvedCycles,
    recAt,
    blockAt,
    nearest,
    progress,
    yearProgress,
    peers,
    monthCells,
    timeFor,
    slotsFor,
    normalizeParts,
    teacherFor,
    locationFor,
    locationUrlFor,
    academicSpan,
    nextBlock,
    defaultSettings,
    emptyUser,
    expandName: function (t) {
      return P().expandName(t);
    },
    shortName: function (t) {
      return P().shortName(t);
    },
    baseTitle: function (t) {
      return P().baseTitle(t);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
