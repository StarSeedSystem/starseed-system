// Servidor de referencia — Protocolo de Red Sináptica StarSeed (paquete).
// ============================================================================
// Implementa architecture/servidor-propio-protocolo.md con:
//   · PERSISTENCIA: Postgres (DATABASE_URL + `pg`), o node:sqlite (STARSEED_DB),
//     o en memoria (respaldo). Se elige sola según el entorno.
//   · AUTENTICACIÓN DE GRUPO: STARSEED_TOKENS = JSON { "<token>": ["<identidad>"] }
//     (uuid de cuenta o "group:<slug>"). El buzón dirigido exige que el token
//     incluya el `recipient`. Compat: STARSEED_SERVER_TOKEN = un token abierto.
//   · REALTIME (SSE): GET /mesh/stream?recipients=<ids> empuja al instante el
//     feed público y el buzón dirigido a esas identidades.
//   · FEDERACIÓN robusta: STARSEED_PEERS = pares; peer-pull del feed público con
//     DEDUP por oid (id de origen estable), marca de agua POR PAR y anti-bucle.
//
//   node index.mjs
//   DATABASE_URL=postgres://… node index.mjs
//   STARSEED_TOKENS='{"tok":["acc-uuid","group:barrio"]}' node index.mjs
//   STARSEED_PEERS='https://otro:8787,https://tercero:8787' node index.mjs

import http from "node:http";
import { createHash } from "node:crypto";

const PORT = process.env.PORT || 8787;
const DB_PATH = process.env.STARSEED_DB || ":memory:";
const SINGLE_TOKEN = process.env.STARSEED_SERVER_TOKEN || "";
const TOKENS = (() => { try { return process.env.STARSEED_TOKENS ? JSON.parse(process.env.STARSEED_TOKENS) : null; } catch { return null; } })();
const PEERS = (process.env.STARSEED_PEERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const FEDERATE_MS = Number(process.env.STARSEED_FEDERATE_MS || 20000);

/* ── Persistencia (Postgres → SQLite → memoria) ────────────────────────────── */
let store;
async function makeStore() {
  if (process.env.DATABASE_URL) {
    try {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(`CREATE TABLE IF NOT EXISTS items (
        id BIGSERIAL PRIMARY KEY, oid TEXT UNIQUE, channel TEXT NOT NULL, device_id TEXT,
        recipient TEXT, cls TEXT, ptype TEXT, body JSONB, at BIGINT NOT NULL)`);
      return {
        kind: "postgres",
        add: async (channel, r) => {
          try {
            await pool.query("INSERT INTO items(oid,channel,device_id,recipient,cls,ptype,body,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (oid) DO NOTHING",
              [r.oid, channel, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.at]);
            return true;
          } catch { return false; }
        },
        publicSince: async (since) => (await pool.query("SELECT oid,device_id,cls,ptype,body,at FROM items WHERE channel='public' AND at>$1 ORDER BY at DESC LIMIT 100", [since])).rows.map((r) => ({ id: r.oid, oid: r.oid, device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: r.body, at: Number(r.at) })),
        relayFor: async (recipient, since) => (await pool.query("SELECT oid,device_id,cls,ptype,body,at FROM items WHERE channel='relay' AND recipient=$1 AND at>$2 ORDER BY at DESC LIMIT 100", [recipient, since])).rows.map((r) => ({ id: r.oid, oid: r.oid, device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: r.body, at: Number(r.at) })),
      };
    } catch (e) { console.warn("[persistencia] Postgres no disponible:", e?.message ?? e); }
  }
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, oid TEXT UNIQUE,
      channel TEXT NOT NULL, device_id TEXT, recipient TEXT, cls TEXT, ptype TEXT, body TEXT, at INTEGER NOT NULL)`);
    const ins = db.prepare("INSERT OR IGNORE INTO items(oid,channel,device_id,recipient,cls,ptype,body,at) VALUES(?,?,?,?,?,?,?,?)");
    const selP = db.prepare("SELECT oid,device_id,cls,ptype,body,at FROM items WHERE channel='public' AND at>? ORDER BY at DESC LIMIT 100");
    const selR = db.prepare("SELECT oid,device_id,cls,ptype,body,at FROM items WHERE channel='relay' AND recipient=? AND at>? ORDER BY at DESC LIMIT 100");
    const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; } };
    const map = (r) => ({ id: r.oid, oid: r.oid, device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: parse(r.body), at: r.at });
    return {
      kind: "sqlite",
      add: async (channel, r) => { const res = ins.run(r.oid, channel, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.at); return (res?.changes ?? 0) > 0; },
      publicSince: async (since) => selP.all(since).map(map),
      relayFor: async (recipient, since) => selR.all(recipient, since).map(map),
    };
  } catch {
    const items = [];
    const seen = new Set();
    const map = (i) => ({ id: i.oid, oid: i.oid, device_id: i.device_id, cls: i.cls, ptype: i.ptype, body: i.body, at: i.at });
    return {
      kind: "memory",
      add: async (channel, r) => { if (seen.has(r.oid)) return false; seen.add(r.oid); items.push({ channel, ...r }); if (items.length > 5000) items.shift(); return true; },
      publicSince: async (since) => items.filter((i) => i.channel === "public" && i.at > since).slice(-100).map(map),
      relayFor: async (recipient, since) => items.filter((i) => i.channel === "relay" && i.recipient === recipient && i.at > since).slice(-100).map(map),
    };
  }
}

/** Id de origen ESTABLE de un item (dedup global entre pares). */
function oidOf(r) {
  if (r.oid) return String(r.oid);
  const h = createHash("sha256").update(`${r.device_id ?? ""}|${JSON.stringify(r.body ?? null)}`).digest("base64url");
  return h.slice(0, 24);
}

/* ── Auth de grupo ─────────────────────────────────────────────────────────── */
function tokenOf(req, u) {
  const h = req.headers["authorization"] || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return (u && u.searchParams.get("token")) || ""; // SSE no puede mandar cabeceras
}
function canWrite(req, u) {
  if (TOKENS) return !!TOKENS[tokenOf(req, u)];
  if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN;
  return true;
}
function canReadMailbox(req, u, recipient) {
  if (TOKENS) { const ids = TOKENS[tokenOf(req, u)]; return Array.isArray(ids) && ids.includes(recipient); }
  if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN;
  return true;
}

/* ── SSE (realtime) ────────────────────────────────────────────────────────── */
const sseClients = new Set(); // { res, recipients:Set }
function broadcast(channel, item) {
  const payload = `data: ${JSON.stringify({ channel, ...item })}\n\n`;
  for (const c of sseClients) {
    try {
      if (channel === "public") c.res.write(payload);
      else if (channel === "relay" && item.recipient && c.recipients.has(item.recipient)) c.res.write(payload);
    } catch { /* cliente caído */ }
  }
}

/* ── HTTP ──────────────────────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,accept,authorization");
}
function json(res, code, obj) { cors(res); res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); }); }

async function addItem(channel, r) {
  const rec = { ...r, oid: oidOf(r) };
  const added = await store.add(channel, rec);
  if (added) broadcast(channel, rec);
  return added;
}

async function handler(req, res) {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "POST" && u.pathname === "/mesh/public") {
    if (!canWrite(req, u)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req); const e = b.envelope || {};
    await addItem("public", { device_id: b.device_id, cls: e.cls, ptype: e.ptype || "post", body: e.body, oid: e.oid, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    if (!canWrite(req, u)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req); const e = b.envelope || {};
    await addItem("relay", { device_id: b.device_id, recipient: e.recipient || null, cls: e.cls, ptype: e.ptype || "message", body: e.body, oid: e.oid, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    return json(res, 200, { items: await store.publicSince(Number(u.searchParams.get("since") || 0)) });
  }
  if (req.method === "GET" && u.pathname === "/mesh/relay") {
    const recipient = u.searchParams.get("recipient") || "";
    if (!recipient) return json(res, 400, { error: "falta recipient" });
    if (!canReadMailbox(req, u, recipient)) return json(res, 403, { error: "buzón ajeno" });
    return json(res, 200, { items: await store.relayFor(recipient, Number(u.searchParams.get("since") || 0)) });
  }
  if (req.method === "GET" && u.pathname === "/mesh/stream") {
    cors(res);
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": ok\n\n");
    const recipients = new Set((u.searchParams.get("recipients") || "").split(",").map((s) => s.trim()).filter(Boolean));
    const client = { res, recipients };
    sseClients.add(client);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* */ } }, 25000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(client); });
    return;
  }
  return json(res, 404, { error: "not found" });
}

/* ── Federación (peer-pull con dedup por oid + watermark por par) ───────────── */
const peerWatermark = new Map(); // peer → último `at` visto
async function federate() {
  for (const peer of PEERS) {
    const since = peerWatermark.get(peer) || 0;
    try {
      const r = await fetch(`${peer.replace(/\/$/, "")}/mesh/public?since=${since}`, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const items = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
      let maxAt = since;
      for (const it of items) {
        maxAt = Math.max(maxAt, Number(it.at) || 0);
        // addItem dedup por oid: si ya lo tenemos (nuestro o de otro par), se ignora → anti-bucle.
        await addItem("public", { device_id: it.device_id, cls: it.cls, ptype: it.ptype || "post", body: it.body, oid: it.oid, at: Number(it.at) || Date.now() });
      }
      peerWatermark.set(peer, maxAt);
    } catch { /* par caído: se reintenta */ }
  }
}

/* ── Arranque ──────────────────────────────────────────────────────────────── */
store = await makeStore();
const server = http.createServer((req, res) => { handler(req, res).catch(() => json(res, 500, { error: "interno" })); });
server.listen(PORT, () => {
  console.log(`StarSeed mesh server :${PORT} · persistencia=${store.kind}${TOKENS || SINGLE_TOKEN ? " · auth ON" : ""} · SSE${PEERS.length ? ` · federando(${PEERS.length})` : ""}`);
});
if (PEERS.length) setInterval(() => { void federate(); }, FEDERATE_MS);
