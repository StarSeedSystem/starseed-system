// Servidor de referencia — Protocolo de Red Sináptica StarSeed (paquete).
// ============================================================================
// architecture/servidor-propio-protocolo.md con:
//   · PERSISTENCIA: Postgres (DATABASE_URL + `pg`) → node:sqlite (STARSEED_DB) → memoria.
//   · AUTH DE GRUPO: STARSEED_TOKENS = JSON { "<token>": ["<identidad>"] } (o
//     STARSEED_SERVER_TOKEN). El buzón dirigido exige que el token incluya el recipient.
//   · REALTIME (SSE): GET /mesh/stream?recipients=<ids>&token= empuja al instante.
//   · FEDERACIÓN robusta: peer-pull con DEDUP por oid, marca de agua POR PAR, CONTROL DE
//     SALTOS (STARSEED_MAX_HOPS, def 4) y VERIFICACIÓN opcional de la firma de origen
//     (STARSEED_VERIFY=1: solo se acepta contenido público con firma válida).

import http from "node:http";
import { createHash, webcrypto } from "node:crypto";

const PORT = process.env.PORT || 8787;
const DB_PATH = process.env.STARSEED_DB || ":memory:";
const SINGLE_TOKEN = process.env.STARSEED_SERVER_TOKEN || "";
const TOKENS = (() => { try { return process.env.STARSEED_TOKENS ? JSON.parse(process.env.STARSEED_TOKENS) : null; } catch { return null; } })();
const PEERS = (process.env.STARSEED_PEERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const FEDERATE_MS = Number(process.env.STARSEED_FEDERATE_MS || 20000);
const MAX_HOPS = Number(process.env.STARSEED_MAX_HOPS || 4);
const VERIFY = process.env.STARSEED_VERIFY === "1";
// Reputación de pares (Adenda 108): cuarentena de un par que reenvía firmas
// inválidas — si (malas − buenas) supera el umbral, se aísla un tiempo.
const PEER_MAX_BAD = Number(process.env.STARSEED_PEER_MAX_BAD || 20);
const PEER_QUARANTINE_MS = Number(process.env.STARSEED_PEER_QUARANTINE_MS || 300000);

/* ── Persistencia (Postgres → SQLite → memoria); todas con oid único + hops ──── */
let store;
async function makeStore() {
  if (process.env.DATABASE_URL) {
    try {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(`CREATE TABLE IF NOT EXISTS items (id BIGSERIAL PRIMARY KEY, oid TEXT UNIQUE,
        channel TEXT NOT NULL, device_id TEXT, recipient TEXT, cls TEXT, ptype TEXT, body JSONB, hops INT DEFAULT 0, lc BIGINT, at BIGINT NOT NULL)`);
      const map = (r) => ({ id: r.oid, oid: r.oid, device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: r.body, hops: Number(r.hops) || 0, lc: r.lc == null ? undefined : Number(r.lc), at: Number(r.at) });
      return {
        kind: "postgres",
        add: async (ch, r) => { try { const res = await pool.query("INSERT INTO items(oid,channel,device_id,recipient,cls,ptype,body,hops,lc,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (oid) DO NOTHING", [r.oid, ch, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.hops ?? 0, typeof r.lc === "number" ? r.lc : null, r.at]); return (res.rowCount ?? 0) > 0; } catch { return false; } },
        publicSince: async (s) => (await pool.query("SELECT oid,device_id,cls,ptype,body,hops,lc,at FROM items WHERE channel='public' AND at>$1 ORDER BY at DESC LIMIT 100", [s])).rows.map(map),
        relayFor: async (rc, s) => (await pool.query("SELECT oid,device_id,cls,ptype,body,hops,lc,at FROM items WHERE channel='relay' AND recipient=$1 AND at>$2 ORDER BY at DESC LIMIT 100", [rc, s])).rows.map(map),
      };
    } catch (e) { console.warn("[persistencia] Postgres no disponible:", e?.message ?? e); }
  }
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, oid TEXT UNIQUE,
      channel TEXT NOT NULL, device_id TEXT, recipient TEXT, cls TEXT, ptype TEXT, body TEXT, hops INTEGER DEFAULT 0, lc INTEGER, at INTEGER NOT NULL)`);
    const ins = db.prepare("INSERT OR IGNORE INTO items(oid,channel,device_id,recipient,cls,ptype,body,hops,lc,at) VALUES(?,?,?,?,?,?,?,?,?,?)");
    const selP = db.prepare("SELECT oid,device_id,cls,ptype,body,hops,lc,at FROM items WHERE channel='public' AND at>? ORDER BY at DESC LIMIT 100");
    const selR = db.prepare("SELECT oid,device_id,cls,ptype,body,hops,lc,at FROM items WHERE channel='relay' AND recipient=? AND at>? ORDER BY at DESC LIMIT 100");
    const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return v; } };
    const map = (r) => ({ id: r.oid, oid: r.oid, device_id: r.device_id, cls: r.cls, ptype: r.ptype, body: parse(r.body), hops: r.hops || 0, lc: r.lc == null ? undefined : Number(r.lc), at: r.at });
    return {
      kind: "sqlite",
      add: async (ch, r) => { const res = ins.run(r.oid, ch, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.hops ?? 0, typeof r.lc === "number" ? r.lc : null, r.at); return (res?.changes ?? 0) > 0; },
      publicSince: async (s) => selP.all(s).map(map),
      relayFor: async (rc, s) => selR.all(rc, s).map(map),
    };
  } catch {
    const items = []; const seen = new Set();
    const map = (i) => ({ id: i.oid, oid: i.oid, device_id: i.device_id, cls: i.cls, ptype: i.ptype, body: i.body, hops: i.hops || 0, lc: i.lc, at: i.at });
    return {
      kind: "memory",
      add: async (ch, r) => { if (seen.has(r.oid)) return false; seen.add(r.oid); items.push({ channel: ch, ...r }); if (items.length > 5000) items.shift(); return true; },
      publicSince: async (s) => items.filter((i) => i.channel === "public" && i.at > s).slice(-100).map(map),
      relayFor: async (rc, s) => items.filter((i) => i.channel === "relay" && i.recipient === rc && i.at > s).slice(-100).map(map),
    };
  }
}

/** Id de origen ESTABLE de un item (dedup global entre pares). */
function oidOf(r) {
  if (r.oid) return String(r.oid);
  return createHash("sha256").update(`${r.device_id ?? ""}|${JSON.stringify(r.body ?? null)}`).digest("base64url").slice(0, 24);
}

/** Verifica la firma de origen de un sobre público {v:1,b,s,k,f} (ECDSA P-256). */
async function verifyWrapped(body) {
  try {
    if (!body || typeof body !== "object" || body.v !== 1) return !VERIFY; // sin firma: solo se bloquea en modo VERIFY
    if (!body.s || !body.k) return false;
    const key = await webcrypto.subtle.importKey("jwk", body.k, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const bytes = new TextEncoder().encode(JSON.stringify(body.b ?? null));
    const sig = Buffer.from(String(body.s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, bytes);
  } catch { return false; }
}

/* ── Auth de grupo (con EXPIRACIÓN opcional, Adenda 108) ─────────────────────
 * STARSEED_TOKENS admite dos formas por token (retrocompatibles):
 *   · ["id1","id2"]                       → sin caducidad.
 *   · { "ids":["id1"], "exp":1730000000000 } → caduca en ese epoch ms (UTC).
 * Un token caducado se trata como inexistente (401/403). */
function tokenOf(req, u) { const h = req.headers["authorization"] || ""; return h.startsWith("Bearer ") ? h.slice(7) : (u && u.searchParams.get("token")) || ""; }
function tokenEntry(token) {
  if (!TOKENS || !token) return null;
  const v = TOKENS[token];
  if (!v) return null;
  if (Array.isArray(v)) return { ids: v, exp: 0 };
  return { ids: Array.isArray(v.ids) ? v.ids : [], exp: Number(v.exp) || 0 };
}
function tokenValid(e) { return !!e && (!e.exp || e.exp > Date.now()); }
function canWrite(req, u) { if (TOKENS) return tokenValid(tokenEntry(tokenOf(req, u))); if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN; return true; }
function canReadMailbox(req, u, rc) { if (TOKENS) { const e = tokenEntry(tokenOf(req, u)); return tokenValid(e) && e.ids.includes(rc); } if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN; return true; }

/* ── SSE (realtime) ────────────────────────────────────────────────────────── */
const sseClients = new Set();
function broadcast(channel, item) {
  const payload = `data: ${JSON.stringify({ channel, ...item })}\n\n`;
  for (const c of sseClients) {
    try {
      if (channel === "public") c.res.write(payload);
      else if (channel === "relay" && item.recipient && c.recipients.has(item.recipient)) c.res.write(payload);
    } catch { /* */ }
  }
}

/* ── HTTP ──────────────────────────────────────────────────────────────────── */
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "content-type,accept,authorization"); }
function json(res, code, obj) { cors(res); res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); }
function readBody(req) { return new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); }); }

async function addItem(channel, r) {
  const rec = { ...r, oid: oidOf(r), hops: r.hops ?? 0, lc: typeof r.lc === "number" ? r.lc : undefined };
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
    if (VERIFY && !(await verifyWrapped(e.body))) return json(res, 400, { error: "firma inválida" });
    await addItem("public", { device_id: b.device_id, cls: e.cls, ptype: e.ptype || "post", body: e.body, oid: e.oid, lc: e.lc, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    if (!canWrite(req, u)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req); const e = b.envelope || {};
    await addItem("relay", { device_id: b.device_id, recipient: e.recipient || null, cls: e.cls, ptype: e.ptype || "message", body: e.body, oid: e.oid, lc: e.lc, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    return json(res, 200, { items: await store.publicSince(Number(u.searchParams.get("since") || 0)) });
  }
  if (req.method === "GET" && u.pathname === "/mesh/relay") {
    const rc = u.searchParams.get("recipient") || "";
    if (!rc) return json(res, 400, { error: "falta recipient" });
    if (!canReadMailbox(req, u, rc)) return json(res, 403, { error: "buzón ajeno" });
    return json(res, 200, { items: await store.relayFor(rc, Number(u.searchParams.get("since") || 0)) });
  }
  if (req.method === "GET" && u.pathname === "/mesh/stream") {
    cors(res); res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": ok\n\n");
    const recipients = new Set((u.searchParams.get("recipients") || "").split(",").map((s) => s.trim()).filter(Boolean));
    const client = { res, recipients }; sseClients.add(client);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* */ } }, 25000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(client); });
    return;
  }
  return json(res, 404, { error: "not found" });
}

/* ── Federación (dedup por oid · watermark por par · saltos · firma · reputación) ─ */
const peerWatermark = new Map();
const peerRep = new Map(); // peer → { bad, good, until } (Adenda 108)
async function federate() {
  for (const peer of PEERS) {
    const rep = peerRep.get(peer) || { bad: 0, good: 0, until: 0 };
    if (rep.until > Date.now()) continue; // par en cuarentena: se salta este ciclo
    const since = peerWatermark.get(peer) || 0;
    try {
      const r = await fetch(`${peer.replace(/\/$/, "")}/mesh/public?since=${since}`, { headers: { accept: "application/json" } });
      if (!r.ok) { peerRep.set(peer, rep); continue; }
      const j = await r.json();
      const items = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : [];
      let maxAt = since;
      for (const it of items) {
        maxAt = Math.max(maxAt, Number(it.at) || 0);
        const hops = (Number(it.hops) || 0) + 1;
        if (hops > MAX_HOPS) continue; // control de saltos: no propagar más allá
        if (VERIFY && !(await verifyWrapped(it.body))) { rep.bad++; continue; } // firma inválida: cuenta en contra del par
        if (VERIFY) rep.good++;
        // addItem dedup por oid → un ítem re-federado por varios pares se ignora (anti-bucle).
        await addItem("public", { device_id: it.device_id, cls: it.cls, ptype: it.ptype || "post", body: it.body, oid: it.oid, hops, at: Number(it.at) || Date.now() });
      }
      peerWatermark.set(peer, maxAt);
      // Reputación: si el par es NETO malo por un margen, se aísla un tiempo.
      if (VERIFY && rep.bad - rep.good > PEER_MAX_BAD) {
        rep.until = Date.now() + PEER_QUARANTINE_MS;
        rep.bad = 0; rep.good = 0;
        console.warn(`[federación] par en cuarentena ${PEER_QUARANTINE_MS}ms (firmas inválidas): ${peer}`);
      }
      peerRep.set(peer, rep);
    } catch { peerRep.set(peer, rep); /* par caído: se reintenta */ }
  }
}

/* ── Arranque ──────────────────────────────────────────────────────────────── */
store = await makeStore();
const server = http.createServer((req, res) => { handler(req, res).catch(() => json(res, 500, { error: "interno" })); });
server.listen(PORT, () => {
  console.log(`StarSeed mesh server :${PORT} · persistencia=${store.kind}${TOKENS || SINGLE_TOKEN ? " · auth" : ""} · SSE${PEERS.length ? ` · federando(${PEERS.length}, saltos≤${MAX_HOPS}${VERIFY ? `, verify, cuarentena>${PEER_MAX_BAD}` : ""})` : ""}`);
});
if (PEERS.length) setInterval(() => { void federate(); }, FEDERATE_MS);
