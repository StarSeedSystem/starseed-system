// Servidor de referencia — Protocolo de Red Sináptica StarSeed (paquete).
// ============================================================================
// Implementa architecture/servidor-propio-protocolo.md con:
//   · PERSISTENCIA: Postgres (DATABASE_URL + `pg`), o node:sqlite (STARSEED_DB),
//     o en memoria (respaldo). Se elige sola según el entorno.
//   · AUTENTICACIÓN DE GRUPO: STARSEED_TOKENS = JSON { "<token>": ["<identidad>"] }
//     donde una identidad es un uuid de cuenta o "group:<slug>". El GET del buzón
//     dirigido exige que el token incluya el `recipient` pedido. (Compat:
//     STARSEED_SERVER_TOKEN = un único token abierto.)
//   · FEDERACIÓN: STARSEED_PEERS = lista separada por comas de otros servidores;
//     este servidor sondea su /mesh/public y fusiona (dedup), tejiendo una malla
//     de servidores propios.
//
//   node index.mjs                 # :8787
//   DATABASE_URL=postgres://…  node index.mjs
//   STARSEED_TOKENS='{"tok1":["acc-uuid","group:barrio"]}'  node index.mjs
//   STARSEED_PEERS='https://otro:8787,https://tercero:8787'  node index.mjs

import http from "node:http";

const PORT = process.env.PORT || 8787;
const DB_PATH = process.env.STARSEED_DB || ":memory:";
const SINGLE_TOKEN = process.env.STARSEED_SERVER_TOKEN || "";
const TOKENS = (() => {
  try {
    return process.env.STARSEED_TOKENS ? JSON.parse(process.env.STARSEED_TOKENS) : null;
  } catch {
    return null;
  }
})();
const PEERS = (process.env.STARSEED_PEERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const FEDERATE_MS = Number(process.env.STARSEED_FEDERATE_MS || 20000);

/* ── Persistencia (Postgres → SQLite → memoria) ────────────────────────────── */
let store;
async function makeStore() {
  // 1) Postgres si hay DATABASE_URL y el paquete `pg` está disponible.
  if (process.env.DATABASE_URL) {
    try {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(`CREATE TABLE IF NOT EXISTS items (
        id BIGSERIAL PRIMARY KEY, channel TEXT NOT NULL, device_id TEXT, recipient TEXT,
        cls TEXT, ptype TEXT, body JSONB, at BIGINT NOT NULL)`);
      return {
        kind: "postgres",
        add: async (channel, r) => {
          await pool.query("INSERT INTO items(channel,device_id,recipient,cls,ptype,body,at) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [channel, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.at]);
        },
        publicSince: async (since) => (await pool.query(
          "SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='public' AND at>$1 ORDER BY at DESC LIMIT 100", [since])).rows.map(pgRow),
        relayFor: async (recipient, since) => (await pool.query(
          "SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='relay' AND recipient=$1 AND at>$2 ORDER BY at DESC LIMIT 100", [recipient, since])).rows.map(pgRow),
      };
    } catch (e) {
      console.warn("[persistencia] Postgres no disponible:", e?.message ?? e);
    }
  }
  // 2) node:sqlite
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL, device_id TEXT, recipient TEXT, cls TEXT, ptype TEXT, body TEXT, at INTEGER NOT NULL)`);
    const ins = db.prepare("INSERT INTO items(channel,device_id,recipient,cls,ptype,body,at) VALUES(?,?,?,?,?,?,?)");
    const selP = db.prepare("SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='public' AND at>? ORDER BY at DESC LIMIT 100");
    const selR = db.prepare("SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='relay' AND recipient=? AND at>? ORDER BY at DESC LIMIT 100");
    return {
      kind: "sqlite",
      add: async (channel, r) => ins.run(channel, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.at),
      publicSince: async (since) => selP.all(since).map(sqliteRow),
      relayFor: async (recipient, since) => selR.all(recipient, since).map(sqliteRow),
    };
  } catch {
    // 3) memoria
    const items = [];
    let seq = 0;
    return {
      kind: "memory",
      add: async (channel, r) => { items.push({ id: ++seq, channel, ...r }); if (items.length > 5000) items.shift(); },
      publicSince: async (since) => items.filter((i) => i.channel === "public" && i.at > since).slice(-100).map(memRow),
      relayFor: async (recipient, since) => items.filter((i) => i.channel === "relay" && i.recipient === recipient && i.at > since).slice(-100).map(memRow),
    };
  }
}
const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; } };
const pgRow = (r) => ({ id: String(r.id), device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: r.body, at: Number(r.at) });
const sqliteRow = (r) => ({ id: String(r.id), device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: parse(r.body), at: r.at });
const memRow = (i) => ({ id: String(i.id), device_id: i.device_id, cls: i.cls, ptype: i.ptype, body: i.body, at: i.at });

/* ── Auth de grupo ─────────────────────────────────────────────────────────── */
function tokenOf(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
/** ¿Puede este request escribir? (POST). null = no auth configurada → abierto. */
function canWrite(req) {
  if (TOKENS) return !!TOKENS[tokenOf(req)];
  if (SINGLE_TOKEN) return tokenOf(req) === SINGLE_TOKEN;
  return true;
}
/** ¿Puede este request leer el buzón de `recipient`? */
function canReadMailbox(req, recipient) {
  if (TOKENS) {
    const ids = TOKENS[tokenOf(req)];
    return Array.isArray(ids) && ids.includes(recipient);
  }
  if (SINGLE_TOKEN) return tokenOf(req) === SINGLE_TOKEN;
  return true;
}

/* ── HTTP ──────────────────────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,accept,authorization");
}
function json(res, code, obj) { cors(res); res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });
}

async function handler(req, res) {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "POST" && u.pathname === "/mesh/public") {
    if (!canWrite(req)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req); const e = b.envelope || {};
    await store.add("public", { device_id: b.device_id, cls: e.cls, ptype: e.ptype || "post", body: e.body, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    if (!canWrite(req)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req); const e = b.envelope || {};
    await store.add("relay", { device_id: b.device_id, recipient: e.recipient || null, cls: e.cls, ptype: e.ptype || "message", body: e.body, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    const since = Number(u.searchParams.get("since") || 0);
    return json(res, 200, { items: await store.publicSince(since) });
  }
  if (req.method === "GET" && u.pathname === "/mesh/relay") {
    const recipient = u.searchParams.get("recipient") || "";
    if (!recipient) return json(res, 400, { error: "falta recipient" });
    if (!canReadMailbox(req, recipient)) return json(res, 403, { error: "buzón ajeno" });
    const since = Number(u.searchParams.get("since") || 0);
    return json(res, 200, { items: await store.relayFor(recipient, since) });
  }
  return json(res, 404, { error: "not found" });
}

/* ── Federación (peer pull del feed público) ───────────────────────────────── */
let fedWatermark = 0;
async function federate() {
  if (!PEERS.length) return;
  const since = fedWatermark;
  fedWatermark = Date.now();
  for (const peer of PEERS) {
    try {
      const r = await fetch(`${peer.replace(/\/$/, "")}/mesh/public?since=${since}`, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const items = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
      for (const it of items) {
        await store.add("public", { device_id: it.device_id, cls: it.cls, ptype: it.ptype || "post", body: it.body, at: it.at || Date.now() });
      }
    } catch { /* peer caído: se reintenta */ }
  }
}

/* ── Arranque ──────────────────────────────────────────────────────────────── */
store = await makeStore();
const server = http.createServer((req, res) => { handler(req, res).catch(() => json(res, 500, { error: "interno" })); });
server.listen(PORT, () => {
  console.log(`StarSeed mesh server :${PORT} · persistencia=${store.kind}${TOKENS || SINGLE_TOKEN ? " · auth ON" : ""}${PEERS.length ? ` · federando(${PEERS.length})` : ""}`);
});
if (PEERS.length) setInterval(() => { void federate(); }, FEDERATE_MS);
