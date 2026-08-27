/**
 * IndexedDB key-value store with localStorage fallback.
 */
(function (global) {
  const DB_NAME = "ordinatura";
  const DB_VERSION = 1;
  const STORE = "kv";

  let dbPromise = null;
  let useFallback = false;
  const memory = {};

  function openDB() {
    if (useFallback) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!("indexedDB" in global)) {
        useFallback = true;
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => {
        useFallback = true;
        resolve(null);
      };
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
    });
    return dbPromise;
  }

  function lsKey(k) {
    return `ordinatura:${k}`;
  }

  async function get(key) {
    const db = await openDB();
    if (!db || useFallback) {
      try {
        const raw = localStorage.getItem(lsKey(key));
        return raw != null ? JSON.parse(raw) : memory[key];
      } catch {
        return memory[key];
      }
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function set(key, value) {
    const db = await openDB();
    if (!db || useFallback) {
      try {
        localStorage.setItem(lsKey(key), JSON.stringify(value));
      } catch {
        memory[key] = value;
      }
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function del(key) {
    const db = await openDB();
    if (!db || useFallback) {
      try {
        localStorage.removeItem(lsKey(key));
      } catch {
        delete memory[key];
      }
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  global.OrdinaturaDB = { get, set, del };
})(typeof window !== "undefined" ? window : globalThis);
