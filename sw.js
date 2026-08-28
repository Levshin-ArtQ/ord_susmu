const CACHE = "ordinatura-v1.9.0";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/db.js",
  "./js/parse.js",
  "./js/xlsx.js",
  "./js/schedule.js",
  "./js/app.js",
  "./data/seed.js",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/icon-maskable.svg"
];

function toRequest(path) {
  return new Request(new URL(path, self.registration.scope), { cache: "reload" });
}

function isNav(req) {
  if (req.mode === "navigate") return true;
  if (req.destination === "document") return true;
  const accept = req.headers.get("accept") || "";
  return accept.indexOf("text/html") !== -1;
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    ASSETS.map(async (path) => {
      try {
        const req = toRequest(path);
        const res = await fetch(req);
        if (!res || !res.ok) return;
        const buf = await res.arrayBuffer();
        const headers = new Headers(res.headers);
        const copy = () =>
          new Response(buf.slice(0), { status: res.status, statusText: res.statusText, headers });
        await cache.put(req, copy());
        await cache.put(path, copy());
        if (path === "./" || path === "./index.html") {
          await cache.put(new Request(self.registration.scope), copy());
          await cache.put(new URL("index.html", self.registration.scope).href, copy());
        }
      } catch (_) {}
    })
  );
}

async function matchCache(req) {
  const cache = await caches.open(CACHE);
  const opts = { ignoreSearch: true, ignoreVary: true };
  const direct = await cache.match(req, opts);
  if (direct) return direct;
  try {
    const url = new URL(req.url);
    const path = url.pathname || "/";
    const keys = [
      path,
      path.endsWith("/") ? path + "index.html" : path + "/index.html",
      "." + path,
      "./" + path.replace(/^\//, ""),
      path.replace(/^\//, "")
    ];
    if (path === "/" || path === "/index.html" || /\/$/.test(path)) {
      keys.push("./", "./index.html", "index.html", "/index.html", "/", self.registration.scope);
    }
    for (let i = 0; i < keys.length; i++) {
      const hit = await cache.match(keys[i], opts);
      if (hit) return hit;
    }
  } catch (_) {}
  return null;
}

function offlineShell() {
  return new Response(
    `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#146B3A" />
  <title>ЮУГМУ · Ординатура</title>
  <style>
    html,body{margin:0;background:#f3f6f3;color:#14241a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
    main{padding:48px 24px;text-align:center;}
    h1{font-size:1.2rem;margin:0 0 8px;}
    p{color:#5b6f62;line-height:1.45;margin:0;}
  </style>
</head>
<body>
  <main>
    <h1>Нет сети</h1>
    <p>Откройте приложение один раз с интернетом — после этого расписание останется на телефоне.</p>
  </main>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
    }
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await matchCache(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
        }
        return net;
      } catch (_) {
        if (isNav(req)) {
          return (
            (await matchCache(new Request(self.registration.scope))) ||
            (await matchCache(new Request(new URL("index.html", self.registration.scope)))) ||
            offlineShell()
          );
        }
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
