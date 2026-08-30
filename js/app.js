(function () {
  const S = window.OrdinaturaSched;
  const DB = window.OrdinaturaDB;
  const P = window.OrdinaturaParse;
  const X = window.OrdinaturaXlsx;

  const state = {
    view: "today",
    schedule: null,
    settings: S.defaultSettings(),
    user: S.emptyUser(),
    cal: { y: 2026, m: 8 },
    viewDate: "",
    cycleFilter: "all",
    cycleQuery: "",
    compare: [],
    compareRange: { mode: "cycle", from: "", to: "" },
    ready: false
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function hex(c) {
    if (!c) return "#D0D5DD";
    return c.charAt(0) === "#" ? c : "#" + c;
  }

  function hslHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * c)
        .toString(16)
        .padStart(2, "0");
    };
    return (f(0) + f(8) + f(4)).toUpperCase();
  }

  const PALETTE_HUES = [0, 25, 48, 72, 128, 172, 212, 278];
  const PALETTE = PALETTE_HUES.map((h) => hslHex(h, 90, 52))
    .concat(PALETTE_HUES.map((h) => hslHex(h, 68, 70)))
    .concat(PALETTE_HUES.map((h) => hslHex(h, 38, 86)))
    .concat(["1C2430", "64748B", "D9D9D9", "D0E0E3", "CFE2F3", "B6D7A8", "FFF2CC", "E6B8AF"]);

  function recTitle(rec) {
    if (!rec) return "Нет занятий";
    const base = rec.base || P.baseTitle(rec.title || "");
    const custom = state.user.titles && state.user.titles[base];
    return S.expandName(custom || rec.title || "");
  }

  function recColor(rec, speciality) {
    if (!rec) return "D0D5DD";
    const base = rec.base || P.baseTitle(rec.title || "");
    const custom = state.user.colors && state.user.colors[base];
    if (custom) return custom.replace("#", "");
    return S.colorOf(rec, speciality);
  }

  function paletteHtml(selected, inputId) {
    const cur = String(selected || "").replace("#", "").toUpperCase();
    const list = PALETTE.slice();
    if (cur && /^[0-9A-F]{6}$/.test(cur) && list.indexOf(cur) < 0) list.push(cur);
    const chips = list
      .map((p) => {
        const on = cur === p ? " on" : "";
        return `<button type="button" class="swatch-btn${on}" data-pal="${p}" style="background:#${p}" aria-label="${p}"></button>`;
      })
      .join("");
    return `<div class="palette" data-pal-input="${esc(inputId)}">${chips}</div>
      <input type="hidden" id="${esc(inputId)}" value="${esc(cur)}" />`;
  }

  function bindPalette(sheet) {
    $$(".swatch-btn", sheet).forEach((btn) => {
      btn.addEventListener("click", () => {
        const box = btn.closest(".palette");
        $$(".swatch-btn", box).forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        const id = box.getAttribute("data-pal-input");
        const inp = $("#" + id, sheet);
        if (inp) inp.value = btn.getAttribute("data-pal");
      });
    });
  }

  function splitHM(hhmm, fallback) {
    const src = hhmm || fallback || "09:00";
    const p = String(src).split(":");
    return { h: S.formatClock(src).split(":")[0] ? String(parseInt(p[0], 10)) : "9", m: (p[1] || "00").slice(0, 2) };
  }

  function timePickHtml(prefix, value, fallback) {
    const hm = splitHM(value, fallback);
    const hVal = padNum(parseInt(hm.h, 10));
    const mVal = padNum(parseInt(hm.m, 10) || 0);
    const hours = [];
    for (let i = 7; i <= 21; i++) {
      const v = padNum(i);
      hours.push(`<option value="${v}" ${v === hVal ? "selected" : ""}>${i}</option>`);
    }
    if (parseInt(hVal, 10) < 7 || parseInt(hVal, 10) > 21) {
      hours.unshift(`<option value="${hVal}" selected>${parseInt(hVal, 10)}</option>`);
    }
    const mins = ["00", "15", "30", "45"];
    if (mVal && mins.indexOf(mVal) < 0) mins.push(mVal);
    mins.sort();
    const minOpts = mins
      .map((m) => `<option value="${m}" ${m === mVal ? "selected" : ""}>${m}</option>`)
      .join("");
    return `<div class="time-pick">
      <select id="${prefix}-h" aria-label="часы">${hours.join("")}</select>
      <span class="time-colon">:</span>
      <select id="${prefix}-m" aria-label="минуты">${minOpts}</select>
    </div>`;
  }

  function padNum(n) {
    n = +n;
    return n < 10 ? "0" + n : String(n);
  }

  function readTimePick(sheet, prefix, fallback) {
    const h = $("#" + prefix + "-h", sheet);
    const m = $("#" + prefix + "-m", sheet);
    if (!h || !m) return fallback || "";
    return h.value + ":" + m.value;
  }

  function partsHtml(parts) {
    const p = S.normalizeParts(parts);
    const hasP = p.indexOf("practice") >= 0;
    const hasL = p.indexOf("lecture") >= 0;
    const first = p[0] === "lecture" ? "lecture" : "practice";
    const orderLabel =
      first === "lecture" ? "сначала лекция, потом практика" : "сначала практика, потом лекция";
    return `<div class="parts">
      <div class="seg">
        <button type="button" class="seg-btn${hasP ? " on" : ""}" data-part="practice">Практика</button>
        <button type="button" class="seg-btn${hasL ? " on" : ""}" data-part="lecture">Лекция</button>
      </div>
      <button type="button" class="order-btn" data-order="${first}" ${p.length < 2 ? "hidden" : ""}>${orderLabel}</button>
    </div>`;
  }

  function bindParts(sheet) {
    const box = $(".parts", sheet);
    if (!box) return;
    const orderBtn = $("[data-order]", box);
    const paintTimes = () => {
      const parts = readParts(sheet);
      ["practice", "lecture"].forEach((k) => {
        const row = $('[data-slot="' + k + '"]', sheet);
        if (row) row.hidden = parts.indexOf(k) < 0;
      });
      if (orderBtn) {
        orderBtn.hidden = parts.length < 2;
        const first = orderBtn.getAttribute("data-order");
        orderBtn.textContent =
          first === "lecture" ? "сначала лекция, потом практика" : "сначала практика, потом лекция";
      }
    };
    $$("[data-part]", box).forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("on");
        if (!$$("[data-part].on", box).length) btn.classList.add("on");
        paintTimes();
      });
    });
    if (orderBtn) {
      orderBtn.addEventListener("click", () => {
        orderBtn.setAttribute(
          "data-order",
          orderBtn.getAttribute("data-order") === "lecture" ? "practice" : "lecture"
        );
        paintTimes();
      });
    }
    paintTimes();
  }

  function readParts(sheet) {
    const box = $(".parts", sheet);
    if (!box) return ["practice", "lecture"];
    const on = $$("[data-part].on", box).map((b) => b.getAttribute("data-part"));
    const first = ($("[data-order]", box) && $("[data-order]", box).getAttribute("data-order")) || "practice";
    const ordered = first === "lecture" ? ["lecture", "practice"] : ["practice", "lecture"];
    const parts = ordered.filter((k) => on.indexOf(k) >= 0);
    return parts.length ? parts : ["practice", "lecture"];
  }

  function slotBlock(kind, start, end) {
    const label = kind === "practice" ? "Практика" : "Лекция";
    const pref = kind === "practice" ? "pr" : "lc";
    return `<div data-slot="${kind}">
      <div class="field" style="margin-bottom:8px"><label>${label}</label>
        <div class="time-row"><span class="lbl">с</span>${timePickHtml(pref + "-s", start, start)}</div>
        <div class="time-row"><span class="lbl">до</span>${timePickHtml(pref + "-e", end, end)}</div>
      </div>
    </div>`;
  }

  function readSlotTimes(sheet, kind) {
    const pref = kind === "practice" ? "pr" : "lc";
    return {
      start: readTimePick(sheet, pref + "-s", kind === "practice" ? "09:00" : "12:30"),
      end: readTimePick(sheet, pref + "-e", kind === "practice" ? "12:00" : "15:00")
    };
  }

  function liveSpan(sheet, prefixes, outId) {
    const paint = () => {
      const a = readTimePick(sheet, prefixes[0]);
      const b = readTimePick(sheet, prefixes[1]);
      const el = $("#" + outId, sheet);
      if (el) el.textContent = S.formatTimeSpan(a, b);
    };
    prefixes.forEach((p) => {
      const h = $("#" + p + "-h", sheet);
      const m = $("#" + p + "-m", sheet);
      if (h) h.addEventListener("change", paint);
      if (m) m.addEventListener("change", paint);
    });
    paint();
  }

  async function persist() {
    await DB.set("settings", state.settings);
    await DB.set("user", state.user);
    rememberThemePref();
  }

  function rememberThemePref() {
    try {
      localStorage.setItem("ordinatura:theme", state.settings.theme || "auto");
    } catch (_) {}
  }

  function resolvedTheme() {
    const pref = (state.settings && state.settings.theme) || "auto";
    if (pref === "dark" || pref === "light") return pref;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    const mode = resolvedTheme();
    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.style.colorScheme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0c1410" : "#146B3A");
    const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (apple) apple.setAttribute("content", mode === "dark" ? "black-translucent" : "default");
    rememberThemePref();
  }

  async function setThemePref(pref) {
    state.settings.theme = pref;
    applyTheme();
    await persist();
    render();
  }

  async function persistSchedule() {
    await DB.set("schedule", state.schedule);
  }

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function offlineBanner() {
    if (!isOffline()) return "";
    return `<div class="offline-bar">Нет сети. Работает копия на телефоне.</div>`;
  }

  function myGroupId() {
    return state.settings.groupId;
  }

  function viewGroupId() {
    return state.settings.peekId || state.settings.groupId;
  }

  function groupOf(id) {
    return S.getGroup(state.schedule, id);
  }

  function ctx() {
    const id = viewGroupId();
    const group = groupOf(id);
    if (!group) return null;
    const eff = S.effective(state.schedule, group, state.user);
    return { id, group, eff };
  }

  function displayTitle(rec) {
    return recTitle(rec);
  }

  function appBar(title, sub, extraHtml) {
    return `<header class="app-bar">
      <div>
        <div class="brand-uni">ЮУГМУ</div>
        <h1>${esc(title)}</h1>
        ${sub ? `<p class="sub">${sub}</p>` : ""}
      </div>
      ${extraHtml || ""}
    </header>`;
  }

  /* ---------- modal ---------- */
  function closeModal() {
    const root = $("#modal-root");
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function dismissSheet() {
    const nest = $(".sheet-nest");
    const main = $(".sheet-main");
    if (nest && !nest.hidden) {
      nest.hidden = true;
      nest.innerHTML = "";
      if (main) main.hidden = false;
      return;
    }
    closeModal();
  }

  function openSheet(html) {
    const root = $("#modal-root");
    document.body.classList.add("modal-open");
    root.hidden = false;
    root.innerHTML = `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><div class="grab"></div><button type="button" class="sheet-x" data-close="1" aria-label="Закрыть">✕</button></div>
      <div class="sheet-main">${html}</div>
      <div class="sheet-nest" hidden></div>
    </div></div>`;
    const backdrop = $(".sheet-backdrop", root);
    const sheet = $(".sheet", root);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) dismissSheet();
    });
    $$("[data-close]", root).forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSheet();
      });
    });
    let startY = 0;
    let dragging = false;
    const onStart = (y) => {
      if (sheet.scrollTop > 2) return;
      startY = y;
      dragging = true;
    };
    const onMove = (y) => {
      if (!dragging) return;
      const dy = y - startY;
      if (dy > 0) sheet.style.transform = "translateY(" + Math.min(dy, 280) + "px)";
    };
    const onEnd = (y) => {
      if (!dragging) return;
      dragging = false;
      const dy = y - startY;
      sheet.style.transform = "";
      if (dy > 72) dismissSheet();
    };
    sheet.addEventListener(
      "touchstart",
      (e) => onStart(e.touches[0].clientY),
      { passive: true }
    );
    sheet.addEventListener(
      "touchmove",
      (e) => onMove(e.touches[0].clientY),
      { passive: true }
    );
    sheet.addEventListener("touchend", (e) => onEnd(e.changedTouches[0].clientY), { passive: true });
    return sheet;
  }

  /* ---------- onboarding / pickers ---------- */
  function specialityList(query) {
    const q = (query || "").trim().toLowerCase();
    return S.specialities(state.schedule).filter((s) => !q || s.name.toLowerCase().includes(q) || s.groups.some((g) => g.id.includes(q)));
  }

  function groupLine(id) {
    const g = groupOf(id);
    if (!g) return id || "не выбрана";
    return g.id + " · " + g.speciality;
  }

  function ownGroupWarningHtml(gid, source) {
    const prev = myGroupId();
    const nextG = groupOf(gid);
    const first = !prev;
    const adopt = source === "adopt";
    const title = first ? "Моя группа?" : "Сменить группу?";
    const lead = first
      ? "Будем показывать расписание этой группы."
      : adopt
        ? "Сейчас вы только смотрите эту группу. Сделать её моей?"
        : "Моё расписание станет как у этой группы.";
    const fromto = first
      ? `<div class="warn-now">
          <div class="k">Группа</div>
          <div class="t">${esc(nextG ? nextG.id : gid)}</div>
          <div class="s">${esc(nextG ? nextG.speciality : "")}</div>
        </div>`
      : `<div class="warn-fromto">
          <div>
            <div class="k">Сейчас</div>
            <div class="t">${esc(groupLine(prev))}</div>
          </div>
          <div class="warn-arrow" aria-hidden="true">→</div>
          <div>
            <div class="k">Будет</div>
            <div class="t">${esc(nextG ? nextG.id : gid)}</div>
            <div class="s">${esc(nextG ? nextG.speciality : "")}</div>
          </div>
        </div>`;
    const points = first
      ? [
          "Это моё расписание на каждый день.",
          "Другие группы можно просто посмотреть — моя не изменится.",
          "Поменять группу можно позже во вкладке «Ещё»."
        ]
      : [
          "Поменяется расписание на всех вкладках.",
          "Другие группы по-прежнему можно просто посмотреть.",
          "Заметки по старой группе останутся."
        ];
    const yes = first ? "Да, это моя" : "Да, сменить";
    return `
      <h1>${title}</h1>
      <p class="sub" style="margin:0 0 12px">${lead}</p>
      <div class="warn-card">${fromto}</div>
      <ul class="warn-list">${points.map((p) => `<li>${p}</li>`).join("")}</ul>
      <div class="btn-row">
        <button type="button" class="btn" data-own-confirm="no">Отмена</button>
        <button type="button" class="btn primary" data-own-confirm="yes">${yes}</button>
      </div>
    `;
  }

  function askOwnGroupChange(gid, source) {
    return new Promise((resolve) => {
      const html = ownGroupWarningHtml(gid, source);
      const root = $("#modal-root");
      const sheet = root && !root.hidden ? $(".sheet", root) : null;
      const nest = sheet && $(".sheet-nest", sheet);
      const main = sheet && $(".sheet-main", sheet);
      let host;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      if (nest && main) {
        main.hidden = true;
        nest.hidden = false;
        nest.innerHTML = html;
        host = nest;
      } else {
        host = openSheet(html);
      }
      const no = $("[data-own-confirm='no']", host);
      const yes = $("[data-own-confirm='yes']", host);
      if (no) {
        no.addEventListener("click", () => {
          if (nest && host === nest) {
            nest.hidden = true;
            nest.innerHTML = "";
            main.hidden = false;
          } else {
            closeModal();
          }
          finish(false);
        });
      }
      if (yes) yes.addEventListener("click", () => finish(true));
    });
  }

  async function commitOwnGroup(gid) {
    state.settings.groupId = gid;
    state.settings.peekId = "";
    state.settings.seenOnboarding = true;
    await persist();
    closeModal();
    toast("Группа " + gid);
    render();
  }

  function renderGroupPicker(opts) {
    const mode = opts.mode || "set"; // set | peek | compare
    const q = opts.query || "";
    const titles = {
      peek: "Другая группа",
      compare: "Добавить группу",
      set: "Моя группа"
    };
    const hints = {
      peek: "Просто посмотреть расписание. Моя группа не изменится.",
      compare: "Поставим рядом на выбранные дни.",
      set: "Выберите специальность и номер."
    };
    const sheet = openSheet(`
      <h1>${titles[mode] || titles.set}</h1>
      <p class="small muted" style="margin:0 0 10px">${hints[mode] || hints.set}</p>
      <input class="search" id="gp-q" placeholder="Поиск: терапия, 141-1…" value="${esc(q)}" />
      <div id="gp-list"></div>
    `);
    function paint(query) {
      const list = specialityList(query);
      const current = mode === "peek" ? viewGroupId() : myGroupId();
      $("#gp-list", sheet).innerHTML = list
        .map((s) => {
          const groups = s.groups
            .map((g) => {
              const on = g.id === current ? " on" : "";
              const mine = g.id === myGroupId() ? `<span class="chip-note">моя</span>` : "";
              return `<button type="button" class="chip${on}" data-gid="${esc(g.id)}">${esc(g.id)}${mine}</button>`;
            })
            .join("");
          return `<div class="card" style="padding:12px 14px">
            <div class="t" style="font-weight:800;margin-bottom:8px">${esc(s.name)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">${groups}</div>
          </div>`;
        })
        .join("");
      $$("#gp-list [data-gid]", sheet).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const gid = btn.getAttribute("data-gid");
          if (mode === "peek") {
            state.settings.peekId = gid === myGroupId() ? "" : gid;
            await persist();
            closeModal();
            render();
            return;
          }
          if (mode === "compare") {
            if (!state.compare.includes(gid) && gid !== viewGroupId()) state.compare.push(gid);
            await persistCompare();
            closeModal();
            openCompare();
            return;
          }
          if (gid === myGroupId()) {
            closeModal();
            return;
          }
          const ok = await askOwnGroupChange(gid, myGroupId() ? "change" : "first");
          if (!ok) return;
          await commitOwnGroup(gid);
        });
      });
    }
    paint(q);
    const inp = $("#gp-q", sheet);
    inp.addEventListener("input", () => paint(inp.value));
    setTimeout(() => inp.focus(), 50);
  }

  /* ---------- day editor ---------- */
  function openDay(iso) {
    const c = ctx();
    if (!c) return;
    const rec = S.recAt(c.eff, iso) || {
      kind: weekdaySunday(iso) ? "off" : "specialty",
      title: c.group.speciality,
      color: null
    };
    const teacher = S.teacherFor(state.user.teachers, rec, c.id);
    const loc = S.locationFor(state.user.locations, rec, c.id);
    const locObj = state.user.locations[(rec.base || P.baseTitle(rec.title || ""))] || {};
    const color = recColor(rec, c.group.speciality);
    const ov = ((state.user.days || {})[c.id] || {})[iso] || {};
    const kinds = [
      ["specialty", "Профильная дисциплина"],
      ["course", "Цикл"],
      ["practice", "Практика"],
      ["attestation", "Аттестация"],
      ["off", "Без занятий"],
      ["vacation", "Каникулы"]
    ];
    const slots = S.slotsFor(state.settings, state.user.times, Object.assign({}, rec, ov), iso);
    const parts = slots.map((s) => s.kind);
    const byKind = {};
    slots.forEach((s) => {
      byKind[s.kind] = s;
    });
    const pr = byKind.practice || { start: "09:00", end: "12:00" };
    const lc = byKind.lecture || { start: "12:30", end: "15:00" };
    const sheet = openSheet(`
      <h1>${esc(S.formatLong(iso))}</h1>
      <div class="field"><label>Дисциплина</label>
        <input id="ed-title" value="${esc(recTitle(rec))}" />
      </div>
      <div class="field"><label>Тип</label>
        <select id="ed-kind">${kinds
          .map(([k, l]) => `<option value="${k}" ${rec.kind === k ? "selected" : ""}>${l}</option>`)
          .join("")}</select>
      </div>
      <div class="field"><label>Цвет цикла</label>
        ${paletteHtml(color, "ed-color")}
      </div>
      <div class="field"><label>Из чего состоит день</label>
        ${partsHtml(parts)}
        ${slotBlock("practice", pr.start, pr.end)}
        ${slotBlock("lecture", lc.start, lc.end)}
      </div>
      <div class="field"><label>Место в этот день</label>
        <input id="ed-loc" value="${esc(ov.location || loc || "")}" placeholder="например, ГКБ №1, Ленинский пр-т" />
      </div>
      <div class="field"><label>Ссылка на карту</label>
        <input id="ed-loc-url" value="${esc(ov.locationUrl || (locObj && locObj.url) || "")}" placeholder="https://yandex.ru/maps/…" />
      </div>
      <div class="field"><label>Заметка к этому дню</label>
        <textarea id="ed-notes">${esc(ov.notes || rec.notes || "")}</textarea>
      </div>
      <button type="button" class="btn ghost wide" id="ed-teacher">Преподаватель${teacher && teacher.name ? ": " + esc(teacher.name) : ""}</button>
      <div class="btn-row">
        <button type="button" class="btn primary" id="ed-save">Сохранить</button>
        <button type="button" class="btn" id="ed-reset">Сбросить</button>
      </div>
    `);
    bindPalette(sheet);
    bindParts(sheet);
    $("#ed-teacher", sheet).addEventListener("click", () => {
      openTeacher(rec, true);
    });
    $("#ed-save", sheet).addEventListener("click", async () => {
      const title = $("#ed-title", sheet).value.trim();
      const kind = $("#ed-kind", sheet).value;
      const colorVal = ($("#ed-color", sheet).value || "").trim().replace("#", "").toUpperCase();
      const partsNow = readParts(sheet);
      const location = $("#ed-loc", sheet).value.trim();
      const locationUrl = ($("#ed-loc-url", sheet).value || "").trim();
      const notes = $("#ed-notes", sheet).value.trim();
      const origBase = rec.base || P.baseTitle(rec.title || "");
      const newBase = P.baseTitle(title || rec.title);
      if (!state.user.days[c.id]) state.user.days[c.id] = {};
      const recDay = {
        parts: partsNow,
        location: location || undefined,
        locationUrl: locationUrl || undefined,
        notes: notes || undefined
      };
      if (partsNow.indexOf("practice") >= 0) recDay.practice = readSlotTimes(sheet, "practice");
      if (partsNow.indexOf("lecture") >= 0) recDay.lecture = readSlotTimes(sheet, "lecture");
      if (kind === "off") {
        recDay.off = true;
      } else if (newBase !== origBase || (kind !== rec.kind && rec.kind !== "off")) {
        recDay.split = true;
        recDay.title = title || rec.title;
        recDay.kind = kind;
        recDay.base = newBase;
        recDay.color = colorVal || rec.color;
      }
      state.user.days[c.id][iso] = recDay;
      if (location || locationUrl) {
        const prev = state.user.locations[origBase] || {};
        if (!prev.text && !prev.url) state.user.locations[origBase] = { text: location, url: locationUrl };
      }
      await persist();
      closeModal();
      toast(kind === "off" ? "День без занятий" : recDay.split ? "День сохранён отдельно" : "День сохранён");
      render();
    });
    $("#ed-reset", sheet).addEventListener("click", async () => {
      if (state.user.days[c.id]) delete state.user.days[c.id][iso];
      await persist();
      closeModal();
      toast("Вернули как было");
      render();
    });
  }

  function weekdaySunday(iso) {
    return S.weekday(iso) === 0;
  }

  function teacherFormHtml(rec, nested) {
    const base = P.baseTitle((rec && rec.title) || rec.base || "");
    const t = (state.user.teachers || {})[base] || {};
    return `
      <h1>Преподаватель</h1>
      <p class="sub" style="margin-bottom:12px">${esc(S.expandName(rec.title || rec.base || ""))}</p>
      <div class="field"><label>ФИО</label><input id="t-name" value="${esc(t.name || "")}" /></div>
      <div class="field"><label>Телефон</label><input id="t-phone" inputmode="tel" value="${esc(t.phone || "")}" placeholder="+7 …" /></div>
      <div class="field"><label>Telegram</label><input id="t-tg" value="${esc(t.telegram || "")}" placeholder="@username" /></div>
      <div class="field"><label>Почта</label><input id="t-email" value="${esc(t.email || "")}" /></div>
      <div class="field"><label>Важное</label><textarea id="t-notes" placeholder="кафедра, часы консультаций, что взять с собой…">${esc(t.notes || "")}</textarea></div>
      <button type="button" class="btn primary wide" id="t-save">Сохранить</button>
      <button type="button" class="btn danger wide" id="t-del" style="margin-top:8px">Удалить преподавателя</button>
      ${nested ? `<button type="button" class="btn wide" id="t-back" style="margin-top:8px">Назад</button>` : ""}
    `;
  }

  function bindTeacherForm(rootEl, rec, onDone) {
    const base = P.baseTitle((rec && rec.title) || rec.base || "");
    $("#t-save", rootEl).addEventListener("click", async () => {
      state.user.teachers[base] = {
        name: $("#t-name", rootEl).value.trim(),
        phone: $("#t-phone", rootEl).value.trim(),
        telegram: $("#t-tg", rootEl).value.trim(),
        email: $("#t-email", rootEl).value.trim(),
        notes: $("#t-notes", rootEl).value.trim()
      };
      await persist();
      toast("Контакты сохранены");
      if (onDone) onDone();
      else {
        closeModal();
        render();
      }
    });
    const back = $("#t-back", rootEl);
    if (back) back.addEventListener("click", () => onDone && onDone());
    const del = $("#t-del", rootEl);
    if (del) {
      del.addEventListener("click", async () => {
        if (!confirm("Удалить карточку этого преподавателя?")) return;
        delete state.user.teachers[base];
        await persist();
        toast("Преподаватель удалён");
        if (onDone) onDone();
        else {
          closeModal();
          render();
        }
        render();
      });
    }
  }

  function openTeacher(rec, nested) {
    if (nested) {
      const sheet = $(".sheet");
      const main = sheet && $(".sheet-main", sheet);
      const nest = sheet && $(".sheet-nest", sheet);
      if (!sheet || !nest) return openTeacher(rec, false);
      if (main) main.hidden = true;
      nest.hidden = false;
      nest.innerHTML = teacherFormHtml(rec, true);
      bindTeacherForm(nest, rec, () => {
        nest.hidden = true;
        nest.innerHTML = "";
        if (main) main.hidden = false;
      });
      return;
    }
    const sheet = openSheet(teacherFormHtml(rec, false));
    bindTeacherForm(sheet, rec);
  }

  function openTimes(rec) {
    const st = state.settings;
    const iso = state.viewDate || S.todayISO();
    const base = rec ? rec.base || P.baseTitle(rec.title) : "";
    const disc = (base && state.user.times.discipline && state.user.times.discipline[base]) || {};
    const slots = S.slotsFor(st, state.user.times, rec || {}, iso);
    const parts = slots.map((s) => s.kind);
    const byKind = {};
    slots.forEach((s) => {
      byKind[s.kind] = s;
    });
    const pr = byKind.practice || { start: st.practiceStart, end: st.practiceEnd };
    const lc = byKind.lecture || { start: st.lectureStart, end: st.lectureEnd };
    const sheet = openSheet(`
      <h1>Время занятий</h1>
      ${rec ? `<p class="sub" style="margin-bottom:10px">${esc(recTitle(rec))}</p>` : ""}
      <div class="field">
        <label>По будням · практика</label>
        <div class="time-row"><span class="lbl">с</span>${timePickHtml("gp-s", st.practiceStart, "09:00")}</div>
        <div class="time-row"><span class="lbl">до</span>${timePickHtml("gp-e", st.practiceEnd, "12:00")}</div>
      </div>
      <div class="field">
        <label>По будням · лекция</label>
        <div class="time-row"><span class="lbl">с</span>${timePickHtml("gl-s", st.lectureStart, "12:30")}</div>
        <div class="time-row"><span class="lbl">до</span>${timePickHtml("gl-e", st.lectureEnd, "15:00")}</div>
      </div>
      <div class="field">
        <label>Суббота · практика</label>
        <div class="time-row"><span class="lbl">с</span>${timePickHtml("sp-s", st.saturdayPracticeStart, "09:00")}</div>
        <div class="time-row"><span class="lbl">до</span>${timePickHtml("sp-e", st.saturdayPracticeEnd, "11:00")}</div>
      </div>
      <div class="field">
        <label>Суббота · лекция</label>
        <div class="time-row"><span class="lbl">с</span>${timePickHtml("sl-s", st.saturdayLectureStart, "11:15")}</div>
        <div class="time-row"><span class="lbl">до</span>${timePickHtml("sl-e", st.saturdayLectureEnd, "13:00")}</div>
      </div>
      ${
        rec
          ? `<div class="field">
        <label>Этот цикл</label>
        ${partsHtml(disc.parts || parts)}
        ${slotBlock("practice", (disc.practice && disc.practice.start) || pr.start, (disc.practice && disc.practice.end) || pr.end)}
        ${slotBlock("lecture", (disc.lecture && disc.lecture.start) || lc.start, (disc.lecture && disc.lecture.end) || lc.end)}
      </div>`
          : ""
      }
      <button type="button" class="btn primary wide" id="tm-save">Сохранить</button>
    `);
    if (rec) bindParts(sheet);
    $("#tm-save", sheet).addEventListener("click", async () => {
      state.settings.practiceStart = readTimePick(sheet, "gp-s", "09:00");
      state.settings.practiceEnd = readTimePick(sheet, "gp-e", "12:00");
      state.settings.lectureStart = readTimePick(sheet, "gl-s", "12:30");
      state.settings.lectureEnd = readTimePick(sheet, "gl-e", "15:00");
      state.settings.saturdayPracticeStart = readTimePick(sheet, "sp-s", "09:00");
      state.settings.saturdayPracticeEnd = readTimePick(sheet, "sp-e", "11:00");
      state.settings.saturdayLectureStart = readTimePick(sheet, "sl-s", "11:15");
      state.settings.saturdayLectureEnd = readTimePick(sheet, "sl-e", "13:00");
      state.settings.defaultStart = state.settings.practiceStart;
      state.settings.defaultEnd = state.settings.lectureEnd;
      state.settings.saturdayStart = state.settings.saturdayPracticeStart;
      state.settings.saturdayEnd = state.settings.saturdayLectureEnd;
      if (rec) {
        const partsNow = readParts(sheet);
        const recT = { parts: partsNow };
        if (partsNow.indexOf("practice") >= 0) recT.practice = readSlotTimes(sheet, "practice");
        if (partsNow.indexOf("lecture") >= 0) recT.lecture = readSlotTimes(sheet, "lecture");
        state.user.times.discipline[base] = recT;
      }
      await persist();
      closeModal();
      toast("Время обновлено");
      render();
    });
  }

  function openCycleEditor(block, opts) {
    opts = opts || {};
    const c = ctx();
    if (!c) return;
    const gid = c.id;
    const isNew = !!opts.isNew;
    const b = block || {
      origin: "extra",
      id: "x-" + Date.now(),
      kind: "course",
      title: "",
      start: state.viewDate || S.todayISO(),
      end: addDaysIso(state.viewDate || S.todayISO(), 4),
      skip: [],
      color: "4A86E8"
    };
    const base = b.base || P.baseTitle(b.title || "");
    const color = recColor(b, c.group.speciality);
    const teacher = S.teacherFor(state.user.teachers, b, gid);
    const loc = S.locationFor(state.user.locations, b, gid);
    const locUrl = S.locationUrlFor(state.user.locations, b, gid);
    const locObj = state.user.locations[base] || {};
    const disc = (state.user.times.discipline || {})[base] || {};
    const iso = b.start || state.viewDate || S.todayISO();
    const slots = S.slotsFor(state.settings, state.user.times, b, iso);
    const byKind = {};
    slots.forEach((s) => {
      byKind[s.kind] = s;
    });
    const pr = byKind.practice || { start: "09:00", end: "12:00" };
    const lc = byKind.lecture || { start: "12:30", end: "15:00" };
    const kinds = [
      ["specialty", "Профильная дисциплина"],
      ["course", "Цикл"],
      ["practice", "Практика"],
      ["attestation", "Аттестация"],
      ["vacation", "Каникулы"]
    ];
    const skipSet = new Set(b.skip || []);
    const workIn = () => {
      const a = $("#cy-start") && $("#cy-start").value;
      const e = $("#cy-end") && $("#cy-end").value;
      const from = a || b.start;
      const to = e || b.end;
      return S.workingDates(state.schedule).filter((d) => d >= from && d <= to);
    };
    const skipHtml = (days) =>
      days
        .map((d) => {
          const dt = S.parseISO(d);
          const on = skipSet.has(d);
          return `<button type="button" class="skip-day${on ? " off" : ""}" data-skip="${d}">${S.formatDM(d)}</button>`;
        })
        .join("");
    const sheet = openSheet(`
      <h1>${isNew ? "Новый цикл" : "Цикл"}</h1>
      <div class="field"><label>Название</label>
        <input id="cy-title" value="${esc(b.title || "")}" />
      </div>
      <div class="field"><label>Тип</label>
        <select id="cy-kind">${kinds
          .map(([k, l]) => `<option value="${k}" ${b.kind === k ? "selected" : ""}>${l}</option>`)
          .join("")}</select>
      </div>
      <div class="field"><label>Цвет</label>
        ${paletteHtml(color, "cy-color")}
      </div>
      <div class="field"><label>Даты цикла</label>
        <div class="cmp-custom" style="margin:0">
          <input type="date" id="cy-start" value="${esc(b.start || "")}" />
          <span class="muted">—</span>
          <input type="date" id="cy-end" value="${esc(b.end || "")}" />
        </div>
      </div>
      <div class="field"><label>Выходные внутри цикла</label>
        <p class="small muted" style="margin:0 0 8px">Нажмите дату — станет выходным. Цикл останется целым.</p>
        <div class="skip-grid" id="cy-skip">${skipHtml(S.workingDates(state.schedule).filter((d) => d >= b.start && d <= b.end))}</div>
      </div>
      <div class="field"><label>Практика и лекция</label>
        ${partsHtml(disc.parts || slots.map((s) => s.kind))}
        ${slotBlock("practice", (disc.practice && disc.practice.start) || pr.start, (disc.practice && disc.practice.end) || pr.end)}
        ${slotBlock("lecture", (disc.lecture && disc.lecture.start) || lc.start, (disc.lecture && disc.lecture.end) || lc.end)}
      </div>
      <div class="field"><label>Место</label>
        <input id="cy-loc" value="${esc(loc || locObj.text || "")}" placeholder="корпус, адрес" />
      </div>
      <div class="field"><label>Ссылка на карту</label>
        <input id="cy-loc-url" value="${esc(locUrl || locObj.url || "")}" placeholder="https://yandex.ru/maps/…" />
      </div>
      <button type="button" class="btn ghost wide" id="cy-teacher">Преподаватель${teacher && teacher.name ? ": " + esc(teacher.name) : ""}</button>
      <button type="button" class="btn primary wide" id="cy-save" style="margin-top:10px">Сохранить цикл</button>
      ${!isNew ? `<button type="button" class="btn danger wide" id="cy-del" style="margin-top:8px">Удалить цикл</button>` : ""}
    `);
    bindPalette(sheet);
    bindParts(sheet);
    const skipBox = $("#cy-skip", sheet);
    const paintSkip = () => {
      skipBox.innerHTML = skipHtml(workIn());
    };
    $("#cy-start", sheet).addEventListener("change", paintSkip);
    $("#cy-end", sheet).addEventListener("change", paintSkip);
    skipBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-skip]");
      if (!btn) return;
      const d = btn.getAttribute("data-skip");
      if (skipSet.has(d)) skipSet.delete(d);
      else skipSet.add(d);
      btn.classList.toggle("off");
    });
    $("#cy-teacher", sheet).addEventListener("click", () => {
      openTeacher({ title: $("#cy-title", sheet).value || b.title, base: P.baseTitle($("#cy-title", sheet).value || b.title || base) }, true);
    });
    $("#cy-save", sheet).addEventListener("click", async () => {
      let start = $("#cy-start", sheet).value;
      let end = $("#cy-end", sheet).value;
      if (start && end && start > end) {
        const t = start;
        start = end;
        end = t;
      }
      const title = $("#cy-title", sheet).value.trim() || "Цикл";
      const kind = $("#cy-kind", sheet).value;
      const colorVal = ($("#cy-color", sheet).value || "").trim().replace("#", "").toUpperCase();
      const skip = Array.from(skipSet).filter((d) => d >= start && d <= end);
      const locText = $("#cy-loc", sheet).value.trim();
      const locHref = $("#cy-loc-url", sheet).value.trim();
      const newBase = P.baseTitle(title);
      const partsNow = readParts(sheet);
      const recT = { parts: partsNow };
      if (partsNow.indexOf("practice") >= 0) recT.practice = readSlotTimes(sheet, "practice");
      if (partsNow.indexOf("lecture") >= 0) recT.lecture = readSlotTimes(sheet, "lecture");
      state.user.times.discipline[newBase] = recT;
      state.user.colors[newBase] = colorVal;
      if (title) state.user.titles[newBase] = title;
      state.user.locations[newBase] = { text: locText, url: locHref };
      if (b.origin === "split" && state.user.days[gid] && state.user.days[gid][b.start]) {
        delete state.user.days[gid][b.start].split;
      }
      if (isNew || b.origin === "extra" || b.origin === "split") {
        if (!state.user.extraCycles[gid]) state.user.extraCycles[gid] = [];
        const item = { id: b.id, kind, title, color: colorVal, start, end, skip };
        const list = state.user.extraCycles[gid];
        const ix = list.findIndex((x) => x.id === b.id);
        if (ix >= 0) list[ix] = item;
        else list.push(item);
      } else {
        if (!state.user.cyclePatches[gid]) state.user.cyclePatches[gid] = {};
        state.user.cyclePatches[gid][b.id] = { start, end, skip, title, kind, color: colorVal };
      }
      await persist();
      closeModal();
      toast("Цикл сохранён");
      render();
    });
    const del = $("#cy-del", sheet);
    if (del) {
      del.addEventListener("click", async () => {
        if (!confirm("Удалить этот цикл?")) return;
        if (b.origin === "extra") {
          state.user.extraCycles[gid] = (state.user.extraCycles[gid] || []).filter((x) => x.id !== b.id);
        } else {
          if (!state.user.cyclePatches[gid]) state.user.cyclePatches[gid] = {};
          state.user.cyclePatches[gid][b.id] = Object.assign({}, state.user.cyclePatches[gid][b.id] || {}, {
            deleted: true
          });
        }
        await persist();
        closeModal();
        toast("Цикл удалён");
        render();
      });
    }
  }

  function openDiscipline(rec) {
    const c = ctx();
    if (!c || !rec) return;
    const block =
      (rec.id && c.eff.blocks.find((b) => b.id === rec.id)) ||
      c.eff.blocks.find((b) => (b.base || P.baseTitle(b.title)) === (rec.base || P.baseTitle(rec.title || "")));
    openCycleEditor(block || rec);
  }

  function openLocation(rec) {
    const base = P.baseTitle(rec.title);
    const cur = state.user.locations[base] || {};
    const sheet = openSheet(`
      <h1>Место занятий</h1>
      <p class="sub" style="margin-bottom:12px">${esc(S.expandName(rec.title))}</p>
      <div class="field"><label>Адрес / корпус / сторона города</label>
        <textarea id="l-text">${esc(cur.text || "")}</textarea>
      </div>
      <div class="field"><label>Ссылка на карту (необязательно)</label>
        <input id="l-url" value="${esc(cur.url || "")}" placeholder="https://yandex.ru/maps/…" />
      </div>
      <button type="button" class="btn primary wide" id="l-save">Сохранить</button>
    `);
    $("#l-save", sheet).addEventListener("click", async () => {
      state.user.locations[base] = {
        text: $("#l-text", sheet).value.trim(),
        url: $("#l-url", sheet).value.trim()
      };
      await persist();
      closeModal();
      toast("Место сохранено");
      render();
    });
  }

  function addDaysIso(iso, n) {
    const d = S.parseISO(iso);
    d.setDate(d.getDate() + n);
    return S.toISO(d);
  }

  function mondayOf(iso) {
    const dt = S.parseISO(iso);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return S.toISO(dt);
  }

  async function persistCompare() {
    state.settings.compareIds = state.compare.slice();
    state.settings.compareMode = (state.compareRange && state.compareRange.mode) || "cycle";
    state.settings.compareFrom = (state.compareRange && state.compareRange.from) || "";
    state.settings.compareTo = (state.compareRange && state.compareRange.to) || "";
    await persist();
  }

  function compareDates(c) {
    const anchor = state.viewDate || S.todayISO();
    const work = S.workingDates(state.schedule);
    const range = state.compareRange || { mode: "cycle" };
    let from;
    let to;
    if (range.mode === "week") {
      from = mondayOf(anchor);
      to = addDaysIso(from, 6);
    } else if (range.mode === "2weeks") {
      from = mondayOf(anchor);
      to = addDaysIso(from, 13);
    } else if (range.mode === "month") {
      const dt = S.parseISO(anchor);
      from = S.toISO(new Date(dt.getFullYear(), dt.getMonth(), 1));
      to = S.toISO(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
    } else if (range.mode === "custom" && range.from && range.to) {
      from = range.from <= range.to ? range.from : range.to;
      to = range.from <= range.to ? range.to : range.from;
    } else {
      const near = S.nearest(state.schedule, c.eff, anchor);
      const block = S.blockAt(c.eff, anchor) || near.block;
      if (block) {
        from = block.start;
        to = block.end;
      } else {
        from = mondayOf(anchor);
        to = addDaysIso(from, 6);
      }
    }
    return { from, to, dates: work.filter((d) => d >= from && d <= to) };
  }

  function openCompare() {
    const c = ctx();
    if (!c) return;
    if (!state.compareRange) state.compareRange = { mode: "cycle", from: "", to: "" };
    const mode = state.compareRange.mode || "cycle";
    const span = compareDates(c);
    const dates = span.dates;
    const ids = [c.id, ...state.compare.filter((g) => g !== c.id)].slice(0, 6);
    const compact = dates.length > 16 ? " compact" : "";
    const head = dates
      .map((d) => {
        const dt = S.parseISO(d);
        return `<th>${S.WD_SHORT[dt.getDay()]}<br>${S.formatDM(d)}</th>`;
      })
      .join("");
    const rows = ids
      .map((gid) => {
        const g = groupOf(gid);
        if (!g) return "";
        const eff = S.effective(state.schedule, g, state.user);
        const cells = dates
          .map((d) => {
            const rec = S.recAt(eff, d);
            if (!rec) return `<td class="empty"></td>`;
            const col = hex(recColor(rec, g.speciality));
            const ink = S.textOn(col.replace("#", ""));
            const short = S.shortName(recTitle(rec));
            const hol = rec.kind === "off" || rec.kind === "attestation" || rec.kind === "vacation";
            return `<td class="${hol ? "hol" : ""}" style="background:${col};color:${ink}" title="${esc(recTitle(rec))}">${esc(short)}</td>`;
          })
          .join("");
        const mine = gid === c.id ? " me" : "";
        return `<tr><th class="g${mine}">${esc(g.id)}</th>${cells}</tr>`;
      })
      .join("");

    const shares = [];
    ids.forEach((gid) => {
      if (gid === c.id) return;
      const g = groupOf(gid);
      if (!g) return;
      const eff = S.effective(state.schedule, g, state.user);
      let n = 0;
      const titles = [];
      dates.forEach((d) => {
        const a = S.recAt(c.eff, d);
        const b = S.recAt(eff, d);
        if (!a || !b) return;
        const ba = P.baseTitle(a.base || a.title);
        const bb = P.baseTitle(b.base || b.title);
        if (ba && ba === bb && a.kind !== "off" && a.kind !== "vacation") {
          n++;
          const lab = S.shortName(a.title);
          if (titles.indexOf(lab) < 0) titles.push(lab);
        }
      });
      if (n) shares.push({ g, n, titles });
    });
    shares.sort((a, b) => b.n - a.n);

    const modes = [
      ["cycle", "Цикл"],
      ["week", "Неделя"],
      ["2weeks", "2 недели"],
      ["month", "Месяц"],
      ["custom", "Даты"]
    ];
    const sheet = openSheet(`
      <h1>Сравнение групп</h1>
      <p class="sub" style="margin-bottom:8px">${esc(S.formatRange(span.from, span.to))} · ${dates.length} ${S.plural(dates.length, "день", "дня", "дней")}</p>
      <div class="filters">${modes
        .map(
          ([k, l]) =>
            `<button type="button" class="chip${mode === k ? " on" : ""}" data-cmp-mode="${k}">${l}</button>`
        )
        .join("")}</div>
      <div class="cmp-custom"${mode === "custom" ? "" : " hidden"}>
        <input type="date" id="cmp-from" value="${esc(state.compareRange.from || span.from)}" />
        <span class="muted">—</span>
        <input type="date" id="cmp-to" value="${esc(state.compareRange.to || span.to)}" />
      </div>
      <div class="compare-table${compact}"><table><thead><tr><th class="g">Гр.</th>${head}</tr></thead><tbody>${
        dates.length ? rows : `<tr><td class="g" colspan="2">Нет учебных дней в этом окне</td></tr>`
      }</tbody></table></div>
      <div class="btn-row">
        <button type="button" class="btn ghost" id="cmp-add">+ группу</button>
        <button type="button" class="btn" id="cmp-clear">Очистить</button>
      </div>
      <h2 style="margin-top:16px">Совпадения в этом периоде</h2>
      ${
        shares.length
          ? shares
              .map(
                (s) => `<div class="peer">
            <div><div class="gid">${esc(s.g.id)}</div><div class="sp">${esc(s.g.speciality)}</div></div>
            <div class="small muted">${s.n} ${S.plural(s.n, "день", "дня", "дней")}${
                  s.titles.length ? " · " + esc(s.titles.join(", ")) : ""
                }</div>
          </div>`
              )
              .join("")
          : `<p class="muted small">В эти дни нет общих занятий с добавленными группами.</p>`
      }
    `);
    $$("[data-cmp-mode]", sheet).forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.compareRange.mode = btn.getAttribute("data-cmp-mode");
        await persistCompare();
        closeModal();
        openCompare();
      });
    });
    const fromInp = $("#cmp-from", sheet);
    const toInp = $("#cmp-to", sheet);
    const applyCustom = async () => {
      if (!fromInp || !toInp || !fromInp.value || !toInp.value) return;
      state.compareRange.mode = "custom";
      state.compareRange.from = fromInp.value;
      state.compareRange.to = toInp.value;
      await persistCompare();
      closeModal();
      openCompare();
    };
    if (fromInp) fromInp.addEventListener("change", applyCustom);
    if (toInp) toInp.addEventListener("change", applyCustom);
    $("#cmp-add", sheet).addEventListener("click", () => {
      closeModal();
      renderGroupPicker({ mode: "compare" });
    });
    $("#cmp-clear", sheet).addEventListener("click", async () => {
      state.compare = [];
      await persistCompare();
      closeModal();
      openCompare();
    });
  }

  /* ---------- views ---------- */
  function isHoliday(iso, rec) {
    if (S.weekday(iso) === 0) return true;
    if (rec && rec.off) return true;
    return !!(rec && (rec.kind === "off" || rec.kind === "attestation" || rec.kind === "vacation"));
  }

  function weekRow(monday, selectedIso, c) {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const id = S.toISO(d);
      const recs = S.recsAt(c.eff, id).filter((r) => !r.off);
      const rec = recs[0];
      const isToday = id === S.todayISO();
      const isSel = id === selectedIso;
      const hol = isHoliday(id, rec) || (S.weekday(id) === 0);
      const dots = recs.length
        ? recs
            .slice(0, 3)
            .map((r) => `<i class="dot" style="background:${hex(recColor(r, c.group.speciality))}"></i>`)
            .join("")
        : `<i class="dot" style="background:${hol ? "#e8d4d0" : "#d0d5dd"}"></i>`;
      const monthBit = d.getDate() === 1 || i === 0 ? `<div class="mo">${S.MONTHS_SHORT[d.getMonth()]}</div>` : `<div class="mo">&nbsp;</div>`;
      cells.push(`<button type="button" class="d${isToday ? " today" : ""}${isSel ? " active" : ""}${recs.length ? "" : " off"}${hol ? " hol" : ""}" data-jump="${id}">
        <div class="wd">${S.WD_SHORT[d.getDay()]}</div>
        <div class="n">${d.getDate()}</div>
        ${monthBit}
        <div class="dots">${dots}</div>
      </button>`);
    }
    return `<div class="week">${cells.join("")}</div>`;
  }

  function weekStrip(iso, c) {
    const dt = S.parseISO(iso);
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const prev = new Date(monday);
    prev.setDate(monday.getDate() - 7);
    const next = new Date(monday);
    next.setDate(monday.getDate() + 7);
    const sun = new Date(monday);
    sun.setDate(monday.getDate() + 6);
    const cap = S.formatRange(S.toISO(monday), S.toISO(sun));
    return `<div class="week-block">
      <div class="week-cap">${esc(cap)}</div>
      <div class="week-swipe"><div class="week-track">
      ${weekRow(prev, iso, c)}
      ${weekRow(monday, iso, c)}
      ${weekRow(next, iso, c)}
    </div></div></div>`;
  }

  function teacherLine(teacher) {
    if (!teacher || !teacher.name) return "не указан";
    return teacher.name;
  }

  function mapsHref(loc, url) {
    if (url) return url;
    if (!loc) return "";
    return "https://yandex.ru/maps/?text=" + encodeURIComponent(loc);
  }

  function renderToday() {
    if (!myGroupId()) return renderOnboarding();
    const c = ctx();
    if (!c) return renderOnboarding();
    const today = S.todayISO();
    const span = S.academicSpan(state.schedule);
    if (!state.viewDate) {
      state.viewDate = today < span.firstWork ? span.firstWork : today;
    }
    const viewDate = state.viewDate;
    const title = viewDate === today ? "Сегодня" : S.formatShort(viewDate);

    let body;
    if (today < span.firstWork && viewDate === today) {
      const left = Math.round((S.parseISO(span.firstWork) - S.parseISO(today)) / 86400000);
      const first = c.eff.blocks[0];
      body = `
        <div class="card">
          <div class="hero-date">${esc(S.formatLong(today))}</div>
          <div class="muted">Учебный год ещё не начался</div>
          <div class="countdown">${left}</div>
          <div class="muted">${S.plural(left, "день", "дня", "дней")} до ${esc(S.formatShort(span.firstWork))}</div>
        </div>
        ${first ? cycleCard(c, first, span.firstWork, { preview: true }) : ""}`;
    } else {
      const recs = S.recsAt(c.eff, viewDate).filter((r) => !r.off);
      const all = S.recsAt(c.eff, viewDate);
      if (!recs.length) {
        body = `
          <div class="card">
            <div class="hero-date">${esc(S.formatLong(viewDate))}</div>
            <p class="sub">${weekdaySunday(viewDate) ? "Воскресенье, выходной." : "Занятий нет."}</p>
          </div>`;
        const nxt = S.nextBlock(c.eff, viewDate);
        if (nxt) body += cycleCard(c, nxt, nxt.start, { nextLabel: "Ближайший цикл" });
      } else {
        body = recs
          .map((r, i) => {
            const block = (r.id && c.eff.blocks.find((b) => b.id === r.id)) || S.blockAt(c.eff, viewDate);
            return cycleCard(c, block, viewDate, {
              nextLabel: i === 0 && recs.length > 1 ? "В этот день" : "",
              hideNext: i < recs.length - 1
            });
          })
          .join("");
      }
    }

    return `
      ${peekBanner(c)}
      ${appBar(
        title,
        esc(c.group.speciality) + " · " + esc(c.group.id),
        `<div class="app-bar-actions">${
          viewDate !== today
            ? `<button type="button" class="btn ghost" data-act="jump-today">К сегодня</button>`
            : ""
        }<button type="button" class="group-pill${state.settings.peekId ? " peeking" : ""}" data-act="peek">${esc(c.group.id)} ▾</button></div>`
      )}
      ${weekStrip(viewDate, c)}
      ${body}
      <div class="btn-row">
        <button type="button" class="btn ghost" data-act="compare">Кто рядом</button>
        <button type="button" class="btn" data-act="peek">Другая группа</button>
      </div>
    `;
  }

  function peekBanner(c) {
    if (!state.settings.peekId) return "";
    const mine = groupOf(myGroupId());
    return `<div class="peek-banner">
      <div>
        <div class="peek-k">Смотрите другую</div>
        <div>${esc(c.group.id)} · ${esc(c.group.speciality)}</div>
        ${mine ? `<div class="small">моя: ${esc(mine.id)}</div>` : ""}
      </div>
      <div class="peek-actions">
        <button type="button" class="btn primary" data-act="unpeek">К моей</button>
        <button type="button" class="btn" data-act="adopt-peek">Это моя</button>
      </div>
    </div>`;
  }

  function cycleCard(c, block, iso, opts) {
    opts = opts || {};
    if (!block) return "";
    const rec =
      (block &&
        S.recsAt(c.eff, iso).find((r) => r.id === block.id)) ||
      S.recAt(c.eff, iso) ||
      block;
    const color = hex(recColor(rec, c.group.speciality));
    const title = displayTitle(rec);
    const orig = rec.title && S.expandName(rec.title) !== rec.title ? rec.title : "";
    const prog = S.progress(state.schedule, block, iso);
    const slots = S.slotsFor(state.settings, state.user.times, rec, iso);
    const teacher = S.teacherFor(state.user.teachers, rec, c.id);
    const loc = S.locationFor(state.user.locations, rec, c.id);
    const locObj = state.user.locations[rec.base] || {};
    const peers = S.peers(state.schedule, c.group, block, state.user).slice(0, 8);
    const nxt = S.nextBlock(c.eff, block.end);
    const pct = prog ? Math.round((prog.gone / prog.total) * 100) : 0;
    const leftPhrase = prog
      ? prog.left === 0
        ? "последний день цикла"
        : "осталось " + prog.left + " " + S.plural(prog.left, "день", "дня", "дней")
      : "";
    const sameYear = c.eff.blocks.filter((b) => b.kind === block.kind && b.base === block.base);
    const yearTotal = sameYear.reduce((s, b) => s + (b.dayCount || 0), 0);
    let yearGone = 0;
    sameYear.forEach((b) => {
      if (b.end < iso) yearGone += b.dayCount || 0;
      else if (b.start <= iso && b.end >= iso && prog) yearGone += prog.index;
    });
    const yearLine =
      yearTotal > (prog ? prog.total : 0)
        ? `<div class="small muted" style="margin-top:6px">Всего по дисциплине в году: день ${yearGone} из ${yearTotal}</div>`
        : "";
    const maps = mapsHref(loc, rec.locationUrl || locObj.url || S.locationUrlFor(state.user.locations, rec, c.id));
    const tel = teacher && teacher.phone ? `tel:${teacher.phone.replace(/\s/g, "")}` : "";
    const tg = teacher && teacher.telegram
      ? teacher.telegram.startsWith("http")
        ? teacher.telegram
        : "https://t.me/" + teacher.telegram.replace(/^@/, "")
      : "";

    return `
      ${opts.nextLabel ? `<h2>${esc(opts.nextLabel)}</h2>` : opts.preview ? `<h2>Первый цикл</h2>` : ""}
      <article class="card disc-card" style="border-color:${color}33">
        <div class="stripe" style="background:${color}"></div>
        <div class="kind-chip">${esc(S.kindLabel(block.kind))}</div>
        <h3 class="disc-title">${esc(title)}</h3>
        ${orig ? `<div class="disc-orig">${esc(orig)}</div>` : ""}
        <div class="small muted">${esc(S.formatRange(block.start, block.end))}</div>
        ${
          prog
            ? `<div class="progress">
          <div class="progress-meta"><span>День ${prog.index} из ${prog.total}</span><span>${esc(leftPhrase)}</span></div>
          <div class="bar"><span style="width:${pct}%;background:${color}"></span></div>
        </div>${yearLine}`
            : ""
        }
        <div class="meta-row">
          <div class="meta-item" data-act="times">
            <div class="body"><div class="k">Время</div>
              <div class="slot-list">${slots
                .map(
                  (s) =>
                    `<div class="slot"><span class="slot-k">${esc(s.label)}</span><span class="slot-t">${esc(
                      S.formatTimeSpan(s.start, s.end)
                    )}</span></div>`
                )
                .join("")}</div>
            </div>
          </div>
          <div class="meta-item" data-act="location">
            <div class="body"><div class="k">Место</div><div class="v">${esc(loc || "не указано")}</div></div>
            ${maps && loc ? `<a class="plain" href="${esc(maps)}" target="_blank" rel="noopener">карта</a>` : ""}
          </div>
          <div class="meta-item" data-act="teacher">
            <div class="body"><div class="k">Преподаватель</div><div class="v">${esc(teacherLine(teacher))}</div>
              ${teacher && teacher.notes ? `<div class="small muted">${esc(teacher.notes)}</div>` : ""}
            </div>
            ${tel ? `<a class="plain" href="${esc(tel)}">вызвать</a>` : ""}
            ${tg ? `<a class="plain" href="${esc(tg)}" target="_blank" rel="noopener">TG</a>` : ""}
          </div>
        </div>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn" data-day="${iso}">День</button>
          <button type="button" class="btn ghost" data-cycle="${esc(block.id || "")}">Цикл</button>
        </div>
      </article>
      ${
        peers.length
          ? `<div class="card"><h2>Вместе в этот период</h2>
        ${peers
          .map(
            (p) => `<button type="button" class="peer" data-peek="${esc(p.group.id)}" style="width:100%;background:none;border:0;border-bottom:1px solid var(--border);text-align:left">
            <div><div class="gid">${esc(p.group.id)}</div><div class="sp">${esc(p.group.speciality)}</div></div>
            <div class="small muted">${esc(S.formatRange(p.block.start, p.block.end))}</div>
          </button>`
          )
          .join("")}
        <button type="button" class="btn wide" data-act="compare" style="margin-top:8px">Сравнить на календаре</button>
      </div>`
          : ""
      }
      ${
        nxt && !opts.hideNext
          ? `<div class="card">
        <h2>Дальше</h2>
        <div class="disc-title" style="font-size:1.05rem">${esc(S.expandName(nxt.title))}</div>
        <div class="small muted">${esc(S.formatRange(nxt.start, nxt.end))} · ${nxt.dayCount} ${S.plural(nxt.dayCount, "день", "дня", "дней")}</div>
      </div>`
          : ""
      }
    `;
  }

  function weekBars(week, c) {
    const spans = [];
    (c.eff.blocks || []).forEach((b) => {
      let i = 0;
      while (i < 7) {
        const iso = week[i];
        const recs = iso ? S.recsAt(c.eff, iso).filter((r) => !r.off && r.id === b.id) : [];
        if (!recs.length) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < 7) {
          const niso = week[j + 1];
          const nrecs = niso ? S.recsAt(c.eff, niso).filter((r) => !r.off && r.id === b.id) : [];
          if (!nrecs.length) break;
          j++;
        }
        spans.push({ col: i + 1, span: j - i + 1, rec: recs[0], block: b, iso: week[i] });
        i = j + 1;
      }
    });
    spans.sort((a, b) => a.col - b.col || b.span - a.span);
    const laneEnd = [];
    spans.forEach((s) => {
      let lane = 0;
      while (laneEnd[lane] != null && s.col <= laneEnd[lane]) lane++;
      s.lane = lane;
      laneEnd[lane] = s.col + s.span - 1;
    });
    return { bars: spans, lanes: Math.max(1, laneEnd.length, 1) };
  }

  function renderMonth(c, y, m, today) {
    const weeks = S.monthWeeks(y, m);
    const wds = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
      .map((w) => `<div class="cal-wd">${w}</div>`)
      .join("");
    const weekHtml = weeks
      .map((week) => {
        const nums = week
          .map((iso, idx) => {
            if (!iso) return `<div class="cal-num empty" style="grid-column:${idx + 1}"></div>`;
            const dt = S.parseISO(iso);
            const recs = S.recsAt(c.eff, iso).filter((r) => !r.off);
            const rec = recs[0];
            const hol = isHoliday(iso, rec) || !recs.length;
            const cls = `cal-num${iso === today ? " today" : ""}${hol ? " hol" : ""}${recs.length ? " has" : ""}`;
            return `<button type="button" class="${cls}" data-day="${iso}" style="grid-column:${idx + 1}">${dt.getDate()}${
              dt.getDate() === 1 ? `<span class="cal-mo">${S.MONTHS_SHORT[dt.getMonth()]}</span>` : ""
            }</button>`;
          })
          .join("");
        const packed = weekBars(week, c);
        const bars = packed.bars
          .map((b) => {
            const col = hex(recColor(b.rec, c.group.speciality));
            const ink = S.textOn(col.replace("#", ""));
            const edge = S.darken(col, 0.35);
            const title = recTitle(b.rec);
            const short = S.shortName(title);
            const label = b.span === 1 ? short.slice(0, 5) : b.span === 2 ? short.slice(0, 9) : short;
            const row = 2 + (b.lane || 0);
            return `<button type="button" class="cal-bar" data-cycle="${esc(b.block.id || "")}" title="${esc(title)}"
              style="grid-column:${b.col} / span ${b.span};grid-row:${row};background:${col};color:${ink};border-left-color:${edge}">${esc(label)}</button>`;
          })
          .join("");
        return `<div class="cal-week" style="--lanes:${packed.lanes}">${nums}${bars}</div>`;
      })
      .join("");
    return `<section class="cal-month">
      <h2 class="cal-month-title">${esc(S.MONTHS[m])} ${y}</h2>
      <div class="cal-wd-row">${wds}</div>
      ${weekHtml}
    </section>`;
  }

  function renderCalendar() {
    const c = ctx();
    if (!c) return renderOnboarding();
    if (!state.cal.span) state.cal.span = state.settings.calSpan || 3;
    const span = state.cal.span;
    const today = S.todayISO();
    const months = [];
    const legendMap = new Map();
    for (let i = 0; i < span; i++) {
      const sm = S.shiftMonth(state.cal.y, state.cal.m, i);
      months.push(renderMonth(c, sm.y, sm.m, today));
      S.monthCells(sm.y, sm.m)
        .filter(Boolean)
        .forEach((iso) => {
          S.recsAt(c.eff, iso)
            .filter((r) => !r.off)
            .forEach((rec) => {
              const key = rec.kind + "|" + (rec.base || rec.title) + "|" + (rec.id || "");
              if (!legendMap.has(key)) legendMap.set(key, rec);
            });
        });
    }
    const start = { y: state.cal.y, m: state.cal.m };
    const end = S.shiftMonth(state.cal.y, state.cal.m, span - 1);
    let rangeLabel;
    if (span === 1) rangeLabel = S.MONTHS[start.m] + " " + start.y;
    else if (start.y === end.y) rangeLabel = S.MONTHS[start.m].slice(0, 4) + "–" + S.MONTHS[end.m].slice(0, 4) + " " + start.y;
    else rangeLabel = S.MONTHS[start.m].slice(0, 3) + " " + start.y + " – " + S.MONTHS[end.m].slice(0, 3) + " " + end.y;

    const legend = Array.from(legendMap.values())
      .map((rec) => {
        const col = hex(recColor(rec, c.group.speciality));
        const base = rec.base || P.baseTitle(rec.title || "");
        return `<button type="button" class="legend-chip" data-cycle="${esc(rec.id || "")}" data-disc="${esc(base)}" title="${esc(recTitle(rec))}">
          <i class="swatch" style="background:${col}"></i>${esc(S.shortName(recTitle(rec)))}
        </button>`;
      })
      .join("");

    return `
      ${peekBanner(c)}
      ${appBar("План", esc(c.group.speciality) + " · " + esc(c.group.id), `<button type="button" class="btn" data-act="cal-today">Сегодня</button>`)}
      <div class="cal-sticky">
        <div class="cal-nav">
          <button type="button" class="btn ico" data-act="cal-prev">‹</button>
          <h1>${esc(rangeLabel)}</h1>
          <button type="button" class="btn ico" data-act="cal-next">›</button>
        </div>
        <div class="filters" style="padding-top:0">
          <button type="button" class="chip${span === 1 ? " on" : ""}" data-act="cal-span-1">1 месяц</button>
          <button type="button" class="chip${span === 3 ? " on" : ""}" data-act="cal-span-3">3 месяца</button>
        </div>
      </div>
      ${months.join("")}
      <div class="legend">${legend}
        <button type="button" class="legend-chip add" data-act="new-cycle" title="Добавить цикл">＋</button>
      </div>
    `;
  }

  function renderCycles() {
    const c = ctx();
    if (!c) return renderOnboarding();
    const q = state.cycleQuery.trim().toLowerCase();
    const f = state.cycleFilter;
    const filters = [
      ["all", "Все"],
      ["course", "Циклы"],
      ["specialty", "Профиль"],
      ["practice", "Практика"]
    ];
    let lastMonth = "";
    const items = [];
    c.eff.blocks.forEach((b) => {
      if (f !== "all" && b.kind !== f) return;
      if (q && !(b.title + " " + S.expandName(b.title)).toLowerCase().includes(q)) return;
      const month = S.MONTHS[S.parseISO(b.start).getMonth()] + " " + S.parseISO(b.start).getFullYear();
      if (month !== lastMonth) {
        items.push(`<div class="month-label">${esc(month)}</div>`);
        lastMonth = month;
      }
      const col = hex(recColor(b, c.group.speciality));
      items.push(`<button type="button" class="cycle" data-cycle="${esc(b.id)}">
        <div class="mark" style="background:${col}"></div>
        <div>
          <div class="when">${esc(S.formatRange(b.start, b.end))}</div>
          <div class="name">${esc(recTitle(b))}</div>
          <div class="n">${esc(S.kindLabel(b.kind))} · ${b.dayCount} ${S.plural(b.dayCount, "день", "дня", "дней")}</div>
        </div>
      </button>`);
    });
    return `
      ${peekBanner(c)}
      ${appBar("Циклы", esc(c.group.speciality) + " · " + esc(c.group.id), `<button type="button" class="btn primary" data-act="new-cycle">＋ цикл</button>`)}
      <input class="search" id="cyc-q" placeholder="Найти дисциплину…" value="${esc(state.cycleQuery)}" />
      <div class="filters">${filters
        .map(([k, l]) => `<button type="button" class="chip${f === k ? " on" : ""}" data-filter="${k}">${l}</button>`)
        .join("")}</div>
      ${items.join("") || `<div class="empty">Ничего не найдено</div>`}
      <button type="button" class="btn primary wide" data-act="new-cycle" style="margin-top:12px">Добавить цикл</button>
    `;
  }

  function renderMore() {
    const g = groupOf(myGroupId());
    const teachers = Object.keys(state.user.teachers || {}).filter((k) => {
      const t = state.user.teachers[k];
      return t && (t.name || t.phone || t.telegram || t.notes);
    });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `
      ${appBar("Ещё")}
      <div class="card">
        <div class="setting-row">
          <div><div class="t">Моя группа</div><div class="s">${g ? esc(g.speciality) + " · " + esc(g.id) : "не выбрана"}</div></div>
          <button type="button" class="btn" data-act="set-group">Сменить</button>
        </div>
        <div class="setting-row">
          <div><div class="t">Время по умолчанию</div><div class="s">практика ${esc(S.formatTimeSpan(state.settings.practiceStart, state.settings.practiceEnd))}<br>лекция ${esc(S.formatTimeSpan(state.settings.lectureStart, state.settings.lectureEnd))}</div></div>
          <button type="button" class="btn" data-act="times-global">Изменить</button>
        </div>
        <div class="setting-row stack">
          <div>
            <div class="t">Оформление</div>
            <div class="s">${
              (state.settings.theme || "auto") === "auto"
                ? "как на телефоне · сейчас " + (resolvedTheme() === "dark" ? "тёмное" : "светлое")
                : state.settings.theme === "dark"
                  ? "всегда тёмное"
                  : "всегда светлое"
            }</div>
          </div>
          <div class="seg theme-seg">
            <button type="button" class="seg-btn${(state.settings.theme || "auto") === "auto" ? " on" : ""}" data-act="theme-auto">Авто</button>
            <button type="button" class="seg-btn${state.settings.theme === "light" ? " on" : ""}" data-act="theme-light">Светлая</button>
            <button type="button" class="seg-btn${state.settings.theme === "dark" ? " on" : ""}" data-act="theme-dark">Тёмная</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Преподаватели</h2>
        ${
          teachers.length
            ? teachers
                .map((k) => {
                  const t = state.user.teachers[k];
                  return `<div class="teach-row">
                    <button type="button" class="list-btn" data-teach="${esc(k)}" style="margin:0;flex:1">
                    <div class="t">${esc(t.name || S.expandName(k))}</div>
                    <div class="s">${esc(S.expandName(k))}${t.phone ? " · " + esc(t.phone) : ""}</div>
                  </button>
                    <button type="button" class="btn danger" data-del-teach="${esc(k)}" aria-label="Удалить">✕</button>
                  </div>`;
                })
                .join("")
            : `<p class="small muted">Пока пусто. Контакты можно добавить в карточке цикла.</p>`
        }
      </div>
      <div class="card">
        <h2>Расписание</h2>
        <p class="small muted">Хранится на этом телефоне. Само не обновляется — только кнопкой ниже.</p>
        <p class="small muted">Обновлено: ${esc(state.schedule && state.schedule.savedAt ? S.formatShort(state.schedule.savedAt.slice(0, 10)) : "как в приложении")}</p>
        <div class="field"><label>Ссылка на таблицу</label>
          <input id="sheets-url" value="${esc(state.settings.sheetsUrl || "")}" />
        </div>
        ${
          isOffline()
            ? `<p class="small muted">Без сети таблицу не обновить — можно выбрать файл Excel с телефона.</p>`
            : `<button type="button" class="btn primary wide" data-act="import-sheets">Обновить из таблицы</button>`
        }
        <div class="btn-row">
          <button type="button" class="btn" data-act="import-file">Файл Excel</button>
          <button type="button" class="btn" data-act="restore-seed">Как в приложении</button>
        </div>
      </div>
      <div class="card">
        <h2>Копия данных</h2>
        <p class="small muted">На случай нового телефона, очистки Safari или удаления ярлыка.</p>
        <div class="btn-row">
          <button type="button" class="btn" data-act="export-backup">Скачать</button>
          <button type="button" class="btn" data-act="import-backup">Загрузить</button>
        </div>
        <div class="btn-row">
          <button type="button" class="btn danger" data-act="reset-notes">Стереть мои правки</button>
        </div>
      </div>
      <div class="card">
        <h2>На экран «Домой»</h2>
        <p class="small muted">Всё хранится только на этом телефоне, не в облаке. Без интернета открывается, если хотя бы раз заходили с сетью.</p>
        ${
          ios
            ? `<p class="small muted">Safari иногда сам чистит сайты. С ярлыка данные обычно живут дольше.</p>
        <p class="small muted">Safari и ярлык — разные копии. Если уже пользовались в Safari: сначала «Скачать», потом откройте с экрана Домой и «Загрузить».</p>
        <p class="small muted">Safari → Поделиться → На экран «Домой».</p>`
            : `<p class="small muted">В браузере и с ярлыка обычно одни и те же данные.</p>
        <p class="small muted">В меню браузера: «Установить приложение» или «На главный экран».</p>`
        }
      </div>
      <p class="small faint" style="text-align:center;margin:18px 0 8px">ЮУГМУ · ординатура · ${esc((state.schedule && state.schedule.yearLabel) || "2026–2027")}</p>
    `;
  }

  function renderOnboarding() {
    return `
      ${appBar("Ординатура", "Южно-Уральский государственный медицинский университет")}
      <div class="card">
        <p>Выберите группу — покажем её расписание. Цвета как в общей таблице.</p>
        <button type="button" class="btn primary wide" data-act="set-group" style="margin-top:12px">Выбрать группу</button>
      </div>
    `;
  }

  function render() {
    const main = $("#app-content");
    let html;
    if (!state.ready) html = `<div class="empty">Загрузка…</div>`;
    else if (state.view === "today") html = renderToday();
    else if (state.view === "calendar") html = renderCalendar();
    else if (state.view === "cycles") html = renderCycles();
    else html = renderMore();
    main.innerHTML = html;
    if (isOffline() && !main.querySelector(".offline-bar")) {
      main.insertAdjacentHTML("afterbegin", offlineBanner());
    }
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === state.view));
    bindView();
  }

  function bindView() {
    const root = $("#app-content");
    const cyc = $("#cyc-q", root);
    if (cyc) {
      cyc.addEventListener("input", () => {
        state.cycleQuery = cyc.value;
        render();
        const el = $("#cyc-q");
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = el.value.length;
        }
      });
    }
    const su = $("#sheets-url", root);
    if (su) {
      su.addEventListener("change", async () => {
        state.settings.sheetsUrl = su.value.trim();
        await persist();
      });
    }
    const swipe = $(".week-swipe", root);
    const track = swipe && $(".week-track", swipe);
    if (swipe && track) {
      const width = () => swipe.getBoundingClientRect().width;
      let x0 = 0;
      let y0 = 0;
      let dx = 0;
      let axis = null;
      let startTx = 0;
      const apply = (tx, anim) => {
        track.style.transition = anim ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
        track.style.transform = "translate3d(" + tx + "px,0,0)";
      };
      apply(-width(), false);
      swipe.addEventListener(
        "touchstart",
        (e) => {
          x0 = e.touches[0].clientX;
          y0 = e.touches[0].clientY;
          dx = 0;
          axis = null;
          startTx = -width();
          track.style.transition = "none";
        },
        { passive: true }
      );
      swipe.addEventListener(
        "touchmove",
        (e) => {
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          dx = x - x0;
          const dy = y - y0;
          if (axis == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (axis !== "x") return;
          apply(startTx + dx, false);
        },
        { passive: true }
      );
      swipe.addEventListener(
        "touchend",
        () => {
          if (axis !== "x") return;
          const w = width();
          const go = Math.abs(dx) > Math.min(72, w * 0.18);
          const dir = dx < 0 ? 1 : -1;
          if (go) {
            apply(startTx - dir * w, true);
            let finished = false;
            const done = () => {
              if (finished) return;
              finished = true;
              track.removeEventListener("transitionend", done);
              const d = S.parseISO(state.viewDate || S.todayISO());
              d.setDate(d.getDate() + 7 * dir);
              state.viewDate = S.toISO(d);
              render();
            };
            track.addEventListener("transitionend", done);
            setTimeout(done, 400);
          } else {
            apply(startTx, true);
          }
        },
        { passive: true }
      );
    }
  }

  async function onAction(act, el) {
    if (act === "theme-auto") return setThemePref("auto");
    if (act === "theme-light") return setThemePref("light");
    if (act === "theme-dark") return setThemePref("dark");
    if (act === "set-group" || act === "pick-group") return renderGroupPicker({ mode: "set" });
    if (act === "peek") return renderGroupPicker({ mode: "peek" });
    if (act === "unpeek") {
      state.settings.peekId = "";
      await persist();
      return render();
    }
    if (act === "adopt-peek" && state.settings.peekId) {
      const gid = state.settings.peekId;
      if (gid === myGroupId()) {
        state.settings.peekId = "";
        await persist();
        return render();
      }
      const ok = await askOwnGroupChange(gid, "adopt");
      if (!ok) return;
      return commitOwnGroup(gid);
    }
    if (act === "jump-today") {
      state.viewDate = S.todayISO();
      return render();
    }
    if (act === "new-cycle") {
      openCycleEditor(null, { isNew: true });
      return;
    }
    if (act === "compare") return openCompare();
    if (act === "times" || act === "times-global") {
      const c = ctx();
      const iso = state.viewDate || S.todayISO();
      const rec = c ? S.recAt(c.eff, iso) || (c.eff.blocks[0] ? { title: c.eff.blocks[0].title, base: c.eff.blocks[0].base } : null) : null;
      return openTimes(act === "times-global" ? null : rec);
    }
    if (act === "location") {
      const c = ctx();
      const iso = state.viewDate || S.todayISO();
      const rec = c && (S.recAt(c.eff, iso) || c.eff.blocks[0]);
      if (rec) openLocation(rec);
      return;
    }
    if (act === "teacher") {
      const c = ctx();
      const iso = state.viewDate || S.todayISO();
      const rec = c && (S.recAt(c.eff, iso) || c.eff.blocks[0]);
      if (rec) openTeacher(rec);
      return;
    }
    if (act === "cal-prev") {
      state.cal.m--;
      if (state.cal.m < 0) {
        state.cal.m = 11;
        state.cal.y--;
      }
      return render();
    }
    if (act === "cal-next") {
      state.cal.m++;
      if (state.cal.m > 11) {
        state.cal.m = 0;
        state.cal.y++;
      }
      return render();
    }
    if (act === "cal-today") {
      const t = new Date();
      const span = S.academicSpan(state.schedule);
      let y = t.getFullYear();
      let m = t.getMonth();
      if (S.todayISO() < span.firstWork) {
        const d = S.parseISO(span.firstWork);
        y = d.getFullYear();
        m = d.getMonth();
      }
      state.cal = { y, m, span: state.cal.span || 3 };
      return render();
    }
    if (act === "cal-span-1" || act === "cal-span-3") {
      state.cal.span = act === "cal-span-1" ? 1 : 3;
      state.settings.calSpan = state.cal.span;
      await persist();
      return render();
    }
    if (act === "import-file") {
      if (
        !confirm("Заменить расписание файлом? Заметки останутся.")
      )
        return;
      $("#xlsx-input").click();
      return;
    }
    if (act === "import-sheets") {
      if (isOffline()) return toast("Нет сети. Можно выбрать файл Excel с телефона.");
      return importFromSheets();
    }
    if (act === "restore-seed") return restoreSeed();
    if (act === "export") return exportNotes();
    if (act === "export-backup") return exportBackup();
    if (act === "import-backup") {
      $("#backup-input").click();
      return;
    }
    if (act === "reset-notes") return resetNotes();
  }

  async function importFromSheets() {
    if (isOffline()) return toast("Нет сети. Можно выбрать файл Excel с телефона.");
    const url = state.settings.sheetsUrl || $("#sheets-url")?.value;
    if (!url) return toast("Вставьте ссылку на таблицу");
    if (
      !confirm("Обновить расписание из таблицы? Заметки останутся.")
    )
      return;
    state.settings.sheetsUrl = url;
    await persist();
    const exp = X.sheetsExportUrl(url);
    if (!exp) return toast("Не похоже на ссылку Google Таблицы");
    toast("Запрашиваю таблицу…");
    try {
      const res = await fetch(exp);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = await res.arrayBuffer();
      await ingestXlsx(buf, "google-sheets.xlsx");
    } catch (err) {
      toast("Таблица не открылась. Скачайте файл и нажмите «Файл Excel».");
    }
  }

  async function ingestXlsx(buf, name) {
    toast("Читаю таблицу…");
    const wb = await X.readXlsx(buf, name);
    const parsed = P.parseWorkbook(wb);
    if (!parsed.groups.length) throw new Error("Группы не найдены");
    parsed.savedAt = new Date().toISOString();
    parsed.source = name || "file";
    state.schedule = parsed;
    await persistSchedule();
    if (state.settings.groupId && !S.getGroup(parsed, state.settings.groupId)) {
      state.settings.groupId = "";
      await persist();
    }
    toast("Расписание обновлено · " + parsed.groups.length + " групп");
    render();
  }

  async function restoreSeed() {
    if (!window.SEED) return toast("Встроенное расписание недоступно");
    if (
      !confirm("Вернуть исходное расписание из приложения? Заметки останутся.")
    )
      return;
    const copy = JSON.parse(JSON.stringify(window.SEED));
    copy.savedAt = new Date().toISOString();
    copy.source = "bundled";
    state.schedule = copy;
    await persistSchedule();
    toast("Вернули исходное расписание");
    render();
  }

  function exportNotes() {
    exportBackup();
  }

  function exportBackup() {
    const payload = {
      version: 2,
      app: "ordinatura",
      exportedAt: new Date().toISOString(),
      schedule: state.schedule,
      settings: state.settings,
      user: state.user
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const day = S.toISO(new Date());
    a.download = "ordinatura-backup-" + day + ".json";
    a.click();
    toast("Копия скачана");
  }

  async function importBackupFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Это не JSON");
    }
    if (!data || typeof data !== "object") throw new Error("Пустой файл");
    const settings = data.settings || {};
    const user = data.user || {};
    const sched = data.schedule;
    if (sched && !Array.isArray(sched.groups)) throw new Error("В файле нет расписания");
    if (
      !confirm("Заменить всё данными из файла?")
    )
      return;
    if (sched && sched.groups) {
      state.schedule = sched;
      await persistSchedule();
    }
    state.settings = Object.assign(S.defaultSettings(), settings);
    state.user = Object.assign(S.emptyUser(), user);
    if (!state.user.days) state.user.days = {};
    if (!state.user.teachers) state.user.teachers = {};
    if (!state.user.locations) state.user.locations = {};
    if (!state.user.times) state.user.times = { discipline: {} };
    if (!state.user.cyclePatches) state.user.cyclePatches = {};
    if (!state.user.extraCycles) state.user.extraCycles = {};
    state.compare = Array.isArray(state.settings.compareIds) ? state.settings.compareIds.slice() : [];
    state.compareRange = {
      mode: state.settings.compareMode || "cycle",
      from: state.settings.compareFrom || "",
      to: state.settings.compareTo || ""
    };
    if (!state.settings.theme) state.settings.theme = "auto";
    applyTheme();
    await persist();
    toast("Копия восстановлена");
    render();
  }

  async function resetNotes() {
    if (!confirm("Удалить все мои заметки, места и контакты? Расписание останется.")) return;
    state.user = S.emptyUser();
    await persist();
    toast("Правки удалены");
    render();
  }

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-view]");
    if (nav && nav.closest(".bottom-nav")) {
      state.view = nav.getAttribute("data-view");
      render();
      return;
    }
    const act = e.target.closest("[data-act]");
    if (act && !act.closest("#modal-root") && !e.target.closest("a")) {
      onAction(act.getAttribute("data-act"), act);
      return;
    }
    const peek = e.target.closest("[data-peek]");
    if (peek) {
      state.settings.peekId = peek.getAttribute("data-peek");
      persist();
      state.view = "today";
      render();
      return;
    }
    const jump = e.target.closest("[data-jump]");
    if (jump) {
      state.viewDate = jump.getAttribute("data-jump");
      state.view = "today";
      render();
      return;
    }
    const delTeach = e.target.closest("[data-del-teach]");
    if (delTeach) {
      const key = delTeach.getAttribute("data-del-teach");
      if (confirm("Удалить этого преподавателя?")) {
        delete state.user.teachers[key];
        persist().then(() => {
          toast("Преподаватель удалён");
          render();
        });
      }
      return;
    }
    const cycBtn = e.target.closest("[data-cycle]");
    if (cycBtn && cycBtn.getAttribute("data-cycle") && !e.target.closest("a")) {
      const id = cycBtn.getAttribute("data-cycle");
      const cnow = ctx();
      const block = cnow && cnow.eff.blocks.find((b) => b.id === id);
      if (block) openCycleEditor(block);
      else openDiscipline({ base: id, title: id });
      return;
    }
    const disc = e.target.closest("[data-disc]");
    if (disc && !e.target.closest("a")) {
      const base = disc.getAttribute("data-disc");
      const c = ctx();
      const rec =
        (c && c.eff.blocks.find((b) => (b.base || P.baseTitle(b.title)) === base)) || {
          title: base,
          base,
          kind: "course"
        };
      openDiscipline(rec);
      return;
    }
    const day = e.target.closest("[data-day]");
    if (day && !e.target.closest("a")) {
      openDay(day.getAttribute("data-day"));
      return;
    }
    const filter = e.target.closest("[data-filter]");
    if (filter) {
      state.cycleFilter = filter.getAttribute("data-filter");
      render();
      return;
    }
    const teach = e.target.closest("[data-teach]");
    if (teach) {
      openTeacher({ title: teach.getAttribute("data-teach"), base: teach.getAttribute("data-teach") });
    }
  });

  $("#xlsx-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      await ingestXlsx(buf, file.name);
    } catch (err) {
      console.error(err);
      toast(err.message || "Не удалось прочитать файл");
    }
  });

  $("#backup-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      await importBackupFile(file);
    } catch (err) {
      console.error(err);
      toast(err.message || "Не удалось прочитать файл");
    }
  });

  window.addEventListener("online", () => {
    if (state.ready) render();
  });
  window.addEventListener("offline", () => {
    if (state.ready) render();
  });
  const themeMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onThemeMq = () => {
    if ((state.settings.theme || "auto") === "auto") {
      applyTheme();
      if (state.ready && state.view === "more") render();
    }
  };
  if (themeMq) {
    if (themeMq.addEventListener) themeMq.addEventListener("change", onThemeMq);
    else if (themeMq.addListener) themeMq.addListener(onThemeMq);
  }

  async function boot() {
    const [savedSched, savedSettings, savedUser] = await Promise.all([
      DB.get("schedule"),
      DB.get("settings"),
      DB.get("user")
    ]);
    if (savedSched && savedSched.groups) {
      state.schedule = savedSched;
    } else if (window.SEED) {
      state.schedule = JSON.parse(JSON.stringify(window.SEED));
      state.schedule.savedAt = new Date().toISOString();
      state.schedule.source = "bundled";
      await persistSchedule();
    } else {
      state.schedule = { groups: [], days: [], yearLabel: "" };
    }
    state.settings = Object.assign(S.defaultSettings(), savedSettings || {});
    if (!state.settings.theme) state.settings.theme = "auto";
    applyTheme();
    state.compare = Array.isArray(state.settings.compareIds) ? state.settings.compareIds.slice() : [];
    state.compareRange = {
      mode: state.settings.compareMode || "cycle",
      from: state.settings.compareFrom || "",
      to: state.settings.compareTo || ""
    };
    state.user = Object.assign(S.emptyUser(), savedUser || {});
    if (!state.user.days) state.user.days = {};
    if (!state.user.teachers) state.user.teachers = {};
    if (!state.user.locations) state.user.locations = {};
    if (!state.user.times) state.user.times = { discipline: {} };
    if (!state.user.colors) state.user.colors = {};
    if (!state.user.titles) state.user.titles = {};
    if (!state.user.cyclePatches) state.user.cyclePatches = {};
    if (!state.user.extraCycles) state.user.extraCycles = {};
    if (!state.user.times.discipline) state.user.times.discipline = {};
    const t = new Date();
    const span = S.academicSpan(state.schedule);
    const calSpan = state.settings.calSpan || 3;
    if (span.firstWork && S.todayISO() < span.firstWork) {
      const d = S.parseISO(span.firstWork);
      state.cal = { y: d.getFullYear(), m: d.getMonth(), span: calSpan };
      state.viewDate = span.firstWork;
    } else {
      state.cal = { y: t.getFullYear(), m: t.getMonth(), span: calSpan };
      state.viewDate = S.todayISO();
    }
    state.ready = true;
    render();
  }

  boot().catch((err) => {
    console.error(err);
    const box = $("#app-content");
    if (box) {
      box.innerHTML = `<div class="empty">${
        isOffline()
          ? "Нет сети, и на телефоне ещё нет копии. Откройте один раз с интернетом."
          : "Не удалось открыть приложение. Обновите страницу."
      }</div>`;
    }
  });
})();
