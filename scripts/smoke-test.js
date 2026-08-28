#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/schedule.json"), "utf8"));

const errors = [];
function ok(cond, msg) {
  try {
    assert.ok(cond, msg);
  } catch (e) {
    errors.push(e.message);
  }
}

ok(data.groups.length === 66, "66 groups, got " + data.groups.length);
ok(data.days.length >= 250, "enough days");
const work = data.days.filter((d) => d.kind === "day").map((d) => d.date);
ok(work[0] === "2026-09-01", "year starts 2026-09-01, got " + work[0]);
ok(work[work.length - 1] === "2027-07-10", "last work day 2027-07-10, got " + work[work.length - 1]);
for (let i = 1; i < work.length; i++) {
  if (work[i] <= work[i - 1]) {
    errors.push("non-increasing " + work[i - 1] + " -> " + work[i]);
    break;
  }
}

const g = data.groups.find((x) => x.id === "101-1");
ok(g, "group 101-1");
ok(g.speciality.includes("Акушерство"), "101-1 speciality");
const pharm = g.blocks.find((b) => b.title.includes("фармакология"));
ok(pharm && pharm.dayCount === 4, "Кл фармакология is 4 days");
ok(pharm && pharm.color === "00FFFF", "cyan color kept");
const practice = g.blocks.find((b) => b.kind === "practice");
ok(practice && practice.dayCount >= 40, "practice block");
const vac = g.blocks.find((b) => b.kind === "vacation");
ok(vac && vac.start.startsWith("2027-07"), "vacation in July 2027");
const att = g.blocks.find((b) => b.kind === "attestation");
ok(att && att.start === "2027-02-01", "ПА on 2027-02-01");
ok(
  g.blocks.some((b) => b.kind === "specialty" && b.dayCount > 10),
  "long specialty stretches"
);

data.groups.forEach((gr) => {
  ok(gr.blocks.some((b) => b.kind === "practice"), gr.id + " has practice");
  ok(gr.blocks.some((b) => b.kind === "vacation"), gr.id + " has vacation");
  ok(gr.speciality && gr.id, "group fields");
});

const ids = new Set(data.groups.map((x) => x.id));
ok(ids.has("141-1") && ids.has("148-3") && ids.has("103"), "representative groups");

const files = [
  "index.html",
  "manifest.json",
  "sw.js",
  "css/styles.css",
  "js/app.js",
  "js/db.js",
  "js/parse.js",
  "js/xlsx.js",
  "js/schedule.js",
  "data/seed.js",
  "icons/icon-192.svg"
];
files.forEach((f) => ok(fs.existsSync(path.join(root, f)), "missing " + f));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
ok(html.includes("lang=\"ru\""), "html lang ru");
ok(html.includes("js/app.js"), "app.js linked");
ok(html.includes("data/seed.js"), "seed linked");

global.window = global;
global.OrdinaturaParse = undefined;
require(path.join(root, "js/parse.js"));
require(path.join(root, "js/schedule.js"));
const S = global.OrdinaturaSched;
const g101 = S.getGroup(data, "101-1");
const eff = S.effective(data, g101, S.emptyUser());
const rec = S.recAt(eff, "2026-09-02");
ok(rec && rec.title.includes("фармакология"), "sep 2 is pharmacology");
const block = S.blockAt(eff, "2026-09-02");
const prog = S.progress(data, block, "2026-09-02");
ok(prog && prog.index === 1 && prog.total === 4 && prog.left === 3, "progress 1/4");
const spec = S.recAt(eff, "2026-09-01");
ok(spec && spec.kind === "specialty", "sep 1 is specialty");
const peers = S.peers(data, g101, S.blockAt(eff, "2026-09-07"), S.emptyUser());
ok(peers.some((p) => p.group.id === "101-2"), "ОМБ shared with 101-2");
const prac = S.recAt(eff, "2027-06-01");
ok(prac && prac.kind === "practice", "june is practice");
ok(S.expandName("Кл фармакология").includes("Клиническая"), "abbr expand");
ok(S.shortName("Кл фармакология") === "Кл фарм", "short name pharm");
ok(S.shortName("Педагогика, психология и проф. коммуникации") === "Педагогика", "short pedagogy");
ok(S.formatTimeSpan("09:00", "15:00") === "с 9:00 до 15:00", "readable time span");
ok(S.formatDM("2026-09-01") === "01.09", "dm date");
ok(S.formatDayMon("2026-09-01") === "1 сен", "day mon");
const slots = S.slotsFor(S.defaultSettings(), { discipline: {} }, { base: "x" }, "2026-09-02");
ok(slots.length === 2 && slots[0].kind === "practice" && slots[1].kind === "lecture", "default practice then lecture");
ok(slots[0].start === "09:00" && slots[1].start === "12:30", "default part times");
const onlyL = S.slotsFor(
  S.defaultSettings(),
  { discipline: {} },
  { base: "x", parts: ["lecture"] },
  "2026-09-02"
);
ok(onlyL.length === 1 && onlyL[0].kind === "lecture", "lecture only");
ok(S.isClock("09:00") && !S.isClock("2026-09-02"), "clock vs date");
const tf = S.timeFor(
  S.defaultSettings(),
  { discipline: {} },
  { start: "2026-09-02", end: "2026-09-05", title: "x", base: "x" },
  "2026-09-02"
);
ok(tf.start === "09:00" && tf.end === "15:00", "block dates are not class times, got " + tf.start + "-" + tf.end);
ok(!S.formatTimeSpan("2026-09-02", "2026-09-05").includes("2026:00"), "no year-as-hour");
ok(S.kindLabel("specialty") === "Профильная дисциплина", "ru labels");
ok(S.monthWeeks(2026, 8).length >= 5, "september weeks");

if (errors.length) {
  console.error("FAIL\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
}
console.log("ok", {
  groups: data.groups.length,
  days: data.days.length,
  workDays: work.length,
  blocks101: g.blocks.length
});
