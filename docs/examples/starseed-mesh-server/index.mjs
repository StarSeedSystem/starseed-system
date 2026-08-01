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
import { createHash, webcrypto, randomUUID, createHmac } from "node:crypto";

const PORT = process.env.PORT || 8787;
const DB_PATH = process.env.STARSEED_DB || ":memory:";
const SINGLE_TOKEN = process.env.STARSEED_SERVER_TOKEN || "";
const TOKENS = (() => { try { return process.env.STARSEED_TOKENS ? JSON.parse(process.env.STARSEED_TOKENS) : null; } catch { return null; } })();
const PEERS = (process.env.STARSEED_PEERS || "").split(",").map((s) => s.trim()).filter(Boolean);
// Ciclo de vida de tokens (Adenda 116): emisión/refresh/revocación por un admin.
const ADMIN_TOKEN = process.env.STARSEED_ADMIN_TOKEN || "";
const TOKEN_TTL_MS = Number(process.env.STARSEED_TOKEN_TTL_MS || 3600000);
// Firma HMAC de tokens dinámicos con clave ROTABLE (Adenda 117): los tokens
// emitidos son AUTO-VERIFICABLES (sobreviven a un reinicio si STARSEED_TOKEN_SIGN_KEY
// es fija) y una ROTACIÓN de la clave los invalida a todos de golpe — palanca de
// revocación masiva ante compromiso. La clave nunca sale del servidor.
let signCur = { kid: "k1", secret: process.env.STARSEED_TOKEN_SIGN_KEY || (randomUUID() + randomUUID()).replace(/-/g, "") };
let signPrev = null; // clave anterior con GRACIA tras rotar (los tokens viejos aún verifican hasta caducar)
// Descubrimiento automático de pares (PEX, Adenda 116): fusiona pares de las
// listas /peers de los pares conocidos, con tope.
const PEX = process.env.STARSEED_PEX === "1";
const MAX_PEERS = Number(process.env.STARSEED_MAX_PEERS || 16);
const SELF_URL = (process.env.STARSEED_SELF_URL || "").replace(/\/$/, "");
// PEX DE CONFIANZA (Adenda 117): si se define, discoverPeers SOLO añade pares
// cuya URL casa con alguno de estos prefijos/subcadenas (lista blanca). Sin él,
// el PEX es abierto (comportamiento 116).
const PEX_ALLOW = (process.env.STARSEED_PEX_ALLOW || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
const FEDERATE_MS = Number(process.env.STARSEED_FEDERATE_MS || 20000);
const MAX_HOPS = Number(process.env.STARSEED_MAX_HOPS || 4);
const VERIFY = process.env.STARSEED_VERIFY === "1";
// Reputación de pares (Adenda 108): cuarentena de un par que reenvía firmas
// inválidas — si (malas − buenas) supera el umbral, se aísla un tiempo.
const PEER_MAX_BAD = Number(process.env.STARSEED_PEER_MAX_BAD || 20);
const PEER_QUARANTINE_MS = Number(process.env.STARSEED_PEER_QUARANTINE_MS || 300000);
// Rate-limiting / anti-DoS (Adenda 119): ventana fija por CLAVE (token, si hay;
// si no device_id/IP) en las escrituras. STARSEED_RATE_MAX=0 lo desactiva.
const RATE_MAX = Number(process.env.STARSEED_RATE_MAX ?? 120);
const RATE_WINDOW_MS = Number(process.env.STARSEED_RATE_WINDOW_MS || 60000);
// Tope de conexiones SSE simultáneas (anti-agotamiento de descriptores/memoria).
const MAX_SSE = Number(process.env.STARSEED_MAX_SSE || 1000);

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
    if (!body || typeof body !== "object") return !VERIFY;
    if (body.v !== 1 && body.v !== 2) return !VERIFY; // sin firma conocida: solo se bloquea en modo VERIFY
    if (!body.s || !body.k) return false;
    const key = await webcrypto.subtle.importKey("jwk", body.k, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    // v:2 firma {b,ts,nonce} (anti-replay, Adenda 119); v:1 firma solo b.
    const signed = body.v === 2 ? { b: body.b ?? null, ts: body.ts, nonce: body.nonce } : (body.b ?? null);
    const bytes = new TextEncoder().encode(JSON.stringify(signed));
    const sig = Buffer.from(String(body.s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, bytes);
  } catch { return false; }
}

/* ── Rate-limiting por clave (ventana fija · Adenda 119) ─────────────────────── */
const rateBuckets = new Map(); // key → { count, resetAt }
/** IP del CLIENTE respetando X-Forwarded-For (Vercel/Cloud Run ponen su propia IP). */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim(); // primer salto = cliente
  return (req.socket && req.socket.remoteAddress) || "";
}
/** Clave de tasa: por TOKEN si hay auth; si no, por IP de red. NUNCA por el
 *  `device_id` del cuerpo (lo controla el cliente y podría rotarlo para evadir). */
function rateKey(req, u) {
  const tok = tokenOf(req, u);
  if (tok) return "t:" + tok;
  return "ip:" + (clientIp(req) || "anon");
}
function rateLimited(key) {
  if (!RATE_MAX || RATE_MAX <= 0) return false; // desactivado
  const now = Date.now();
  const refill = RATE_MAX / RATE_WINDOW_MS; // tokens por ms
  let b = rateBuckets.get(key);
  if (!b) { b = { tokens: RATE_MAX, last: now }; rateBuckets.set(key, b); }
  // Token-bucket (ventana DESLIZANTE, Adenda 122): rellena según el tiempo transcurrido,
  // sin la ráfaga de hasta 2×RATE_MAX en el borde que permitía la ventana fija.
  b.tokens = Math.min(RATE_MAX, b.tokens + Math.max(0, now - b.last) * refill); // max(0,…): sin drenaje si el reloj salta atrás
  b.last = now;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.last > RATE_WINDOW_MS * 2) rateBuckets.delete(k); // inactivos
    while (rateBuckets.size > 5000) { const f = rateBuckets.keys().next().value; if (f === undefined) break; rateBuckets.delete(f); } // tope duro
  }
  if (b.tokens < 1) return true; // sin tokens → limitado
  b.tokens -= 1;
  return false;
}

/* ── Auth de grupo (con EXPIRACIÓN opcional, Adenda 108) ─────────────────────
 * STARSEED_TOKENS admite dos formas por token (retrocompatibles):
 *   · ["id1","id2"]                       → sin caducidad.
 *   · { "ids":["id1"], "exp":1730000000000 } → caduca en ese epoch ms (UTC).
 * Un token caducado se trata como inexistente (401/403). */
const revokedTokens = new Set(); // lista de revocación de tokens (por cadena completa)
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uToBuf = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
function tokenSecretFor(kid) { if (kid === signCur.kid) return signCur.secret; if (signPrev && kid === signPrev.kid) return signPrev.secret; return null; }
/** Emite un token dinámico FIRMADO (HMAC): `tk_<payloadB64u>.<sigB64u>` (Adenda 117). */
function signToken(ids, exp) {
  const jti = randomUUID().replace(/-/g, "").slice(0, 12);
  const body = "tk_" + b64u(Buffer.from(JSON.stringify({ ids, exp, kid: signCur.kid, jti })));
  const sig = b64u(createHmac("sha256", signCur.secret).update(body).digest());
  return body + "." + sig;
}
/** Verifica un token firmado → { ids, exp } o null (firma/kid inválidos). */
function verifySignedToken(token) {
  if (!token || !token.startsWith("tk_") || !token.includes(".")) return null;
  const dot = token.lastIndexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  let payload;
  try { payload = JSON.parse(b64uToBuf(body.slice(3)).toString("utf8")); } catch { return null; }
  const secret = tokenSecretFor(payload?.kid);
  if (!secret) return null; // kid desconocido (clave rotada fuera de gracia): inválido
  const expect = b64u(createHmac("sha256", secret).update(body).digest());
  if (sig.length !== expect.length) return null;
  let diff = 0; for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff) return null; // firma inválida (comparación en tiempo ~constante)
  return { ids: Array.isArray(payload.ids) ? payload.ids.map(String) : [], exp: Number(payload.exp) || 0 };
}
function tokenOf(req, u) { const h = req.headers["authorization"] || ""; return h.startsWith("Bearer ") ? h.slice(7) : (u && u.searchParams.get("token")) || ""; }
function tokenEntry(token) {
  if (!token || revokedTokens.has(token)) return null;
  if (TOKENS && TOKENS[token]) {
    const v = TOKENS[token];
    return Array.isArray(v) ? { ids: v, exp: 0 } : { ids: Array.isArray(v.ids) ? v.ids : [], exp: Number(v.exp) || 0 };
  }
  return verifySignedToken(token); // token dinámico firmado (Adenda 117)
}
function tokenValid(e) { return !!e && (!e.exp || e.exp > Date.now()); }
function tokensActive() { return !!TOKENS || !!ADMIN_TOKEN; }
function canWrite(req, u) { if (tokensActive()) return tokenValid(tokenEntry(tokenOf(req, u))); if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN; return true; }
function canReadMailbox(req, u, rc) { if (tokensActive()) { const e = tokenEntry(tokenOf(req, u)); return tokenValid(e) && e.ids.includes(rc); } if (SINGLE_TOKEN) return tokenOf(req, u) === SINGLE_TOKEN; return true; }
function isAdmin(req, u) { return !!ADMIN_TOKEN && tokenOf(req, u) === ADMIN_TOKEN; }
/** Orden causal: por reloj lógico lc (desc) y at (desc) como desempate (Adenda 116). */
function byLamportDesc(a, b) { return ((b.lc ?? -1) - (a.lc ?? -1)) || ((b.at ?? 0) - (a.at ?? 0)); }

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
    const b = await readBody(req);
    if (rateLimited(rateKey(req, u))) return json(res, 429, { error: "límite de tasa" });
    const e = b.envelope || {};
    if (VERIFY && !(await verifyWrapped(e.body))) return json(res, 400, { error: "firma inválida" });
    await addItem("public", { device_id: b.device_id, cls: e.cls, ptype: e.ptype || "post", body: e.body, oid: e.oid, lc: e.lc, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    if (!canWrite(req, u)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req);
    if (rateLimited(rateKey(req, u))) return json(res, 429, { error: "límite de tasa" });
    const e = b.envelope || {};
    await addItem("relay", { device_id: b.device_id, recipient: e.recipient || null, cls: e.cls, ptype: e.ptype || "message", body: e.body, oid: e.oid, lc: e.lc, at: Date.now() });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    const items = (await store.publicSince(Number(u.searchParams.get("since") || 0))).sort(byLamportDesc);
    return json(res, 200, { items });
  }
  if (req.method === "GET" && u.pathname === "/mesh/relay") {
    const rc = u.searchParams.get("recipient") || "";
    if (!rc) return json(res, 400, { error: "falta recipient" });
    if (!canReadMailbox(req, u, rc)) return json(res, 403, { error: "buzón ajeno" });
    const items = (await store.relayFor(rc, Number(u.searchParams.get("since") || 0))).sort(byLamportDesc);
    return json(res, 200, { items });
  }
  // ── Ciclo de vida de tokens (Adenda 116) ──
  if (req.method === "POST" && u.pathname === "/tokens/issue") {
    if (!isAdmin(req, u)) return json(res, 401, { error: "solo admin" });
    const b = await readBody(req);
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    const ttl = Number(b.ttlMs) > 0 ? Number(b.ttlMs) : TOKEN_TTL_MS;
    const exp = Date.now() + ttl;
    return json(res, 200, { token: signToken(ids, exp), ids, exp, kid: signCur.kid });
  }
  if (req.method === "POST" && u.pathname === "/tokens/refresh") {
    const t = tokenOf(req, u);
    if (revokedTokens.has(t)) return json(res, 401, { error: "token revocado" });
    const e = verifySignedToken(t);
    if (!e || !tokenValid(e)) return json(res, 401, { error: "token no renovable" });
    const b = await readBody(req);
    const ttl = Number(b.ttlMs) > 0 ? Number(b.ttlMs) : TOKEN_TTL_MS;
    const exp = Date.now() + ttl;
    // Re-firma con caducidad extendida (los tokens firmados son inmutables → uno nuevo).
    return json(res, 200, { token: signToken(e.ids, exp), ids: e.ids, exp });
  }
  if (req.method === "POST" && u.pathname === "/tokens/revoke") {
    if (!isAdmin(req, u)) return json(res, 401, { error: "solo admin" });
    const b = await readBody(req);
    const t = String(b.token || "");
    if (!t) return json(res, 400, { error: "falta token" });
    revokedTokens.add(t);
    return json(res, 200, { ok: true, revoked: t });
  }
  if (req.method === "POST" && u.pathname === "/tokens/rotate-key") {
    if (!isAdmin(req, u)) return json(res, 401, { error: "solo admin" });
    const b = await readBody(req);
    // Rota la clave de firma: la actual pasa a "previa" (GRACIA: los tokens ya
    // emitidos siguen verificando hasta caducar) y se genera una nueva. Con
    // dropPrev:true se descarta la previa al instante → INVALIDA de golpe todos
    // los tokens firmados con ella (revocación masiva ante compromiso de clave).
    signPrev = b.dropPrev ? null : signCur;
    const nextN = Number(String(signCur.kid).replace(/^k/, ""));
    signCur = { kid: "k" + (Number.isFinite(nextN) ? nextN + 1 : Date.now()), secret: (randomUUID() + randomUUID()).replace(/-/g, "") };
    return json(res, 200, { ok: true, kid: signCur.kid, gracePrev: !!signPrev });
  }
  // ── Descubrimiento de pares (PEX, Adenda 116) ──
  if (req.method === "GET" && u.pathname === "/peers") {
    return json(res, 200, { peers: [...knownPeers] });
  }
  if (req.method === "GET" && u.pathname === "/mesh/stream") {
    if (sseClients.size >= MAX_SSE) return json(res, 503, { error: "demasiadas conexiones SSE" });
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
const knownPeers = new Set(PEERS); // conjunto DINÁMICO (crece por PEX · Adenda 116)
async function federate() {
  for (const peer of [...knownPeers]) {
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
        await addItem("public", { device_id: it.device_id, cls: it.cls, ptype: it.ptype || "post", body: it.body, oid: it.oid, hops, lc: it.lc, at: Number(it.at) || Date.now() });
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
  if (PEX) await discoverPeers();
}

/**
 * PEX (Adenda 116): pregunta a los pares conocidos por SUS pares (GET /peers) y
 * fusiona los nuevos hasta MAX_PEERS. Descubrimiento automático de la federación,
 * sin lista estática completa. No añade a sí mismo (SELF_URL) ni duplicados.
 */
async function discoverPeers() {
  for (const peer of [...knownPeers]) {
    if (knownPeers.size >= MAX_PEERS) break;
    try {
      const r = await fetch(`${peer.replace(/\/$/, "")}/peers`, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const list = Array.isArray(j?.peers) ? j.peers : [];
      for (const p of list) {
        const u = String(p || "").trim().replace(/\/$/, "");
        if (!u || knownPeers.size >= MAX_PEERS) continue;
        if (u === SELF_URL || knownPeers.has(u)) continue; // ni yo ni repetidos
        // PEX de confianza (Adenda 117): con lista blanca, solo se añaden pares que casen.
        if (PEX_ALLOW.length && !PEX_ALLOW.some((a) => u === a || u.startsWith(a) || u.includes(a))) {
          console.log(`[PEX] par IGNORADO (fuera de la lista de confianza): ${u}`);
          continue;
        }
        knownPeers.add(u);
        console.log(`[PEX] par descubierto: ${u} (total ${knownPeers.size})`);
      }
    } catch { /* par caído */ }
  }
}

/* ── Arranque ──────────────────────────────────────────────────────────────── */
store = await makeStore();
const server = http.createServer((req, res) => { handler(req, res).catch(() => json(res, 500, { error: "interno" })); });
server.listen(PORT, () => {
  console.log(`StarSeed mesh server :${PORT} · persistencia=${store.kind}${TOKENS || SINGLE_TOKEN || ADMIN_TOKEN ? " · auth" : ""}${ADMIN_TOKEN ? ` · tokens-firmados(${signCur.kid})` : ""} · SSE${knownPeers.size ? ` · federando(${knownPeers.size}, saltos≤${MAX_HOPS}${VERIFY ? `, verify, cuarentena>${PEER_MAX_BAD}` : ""}${PEX ? `, PEX≤${MAX_PEERS}${PEX_ALLOW.length ? `(confianza:${PEX_ALLOW.length})` : ""}` : ""})` : ""}`);
});
if (knownPeers.size || PEX) setInterval(() => { void federate(); }, FEDERATE_MS);
