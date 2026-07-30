// Servidor de referencia — Protocolo de Red Sináptica StarSeed (servidor propio).
// ============================================================================
// Implementa el contrato de architecture/servidor-propio-protocolo.md con
// PERSISTENCIA REAL (node:sqlite si está disponible; si no, en memoria),
// AUTENTICACIÓN opcional por bearer token y BUZÓN DIRIGIDO por `recipient`.
//
//   node docs/examples/starseed-mesh-server.mjs                 # :8787, sin auth
//   STARSEED_SERVER_TOKEN=secreto node docs/.../starseed-mesh-server.mjs   # con auth
//   STARSEED_DB=/ruta/mesh.db node ...                          # fichero SQLite
//
// En Señales → Servidor añade endpoint http://TU_HOST:8787 (+ el token si lo usas)
// y selecciónalo como activo. La neurona envía (POST) y recibe (GET) por él.
// Endpoints: POST /mesh/public · POST /mesh/relay · GET /mesh/public · GET /mesh/relay

import http from "node:http";

const PORT = process.env.PORT || 8787;
const TOKEN = process.env.STARSEED_SERVER_TOKEN || ""; // vacío = abierto
const DB_PATH = process.env.STARSEED_DB || ":memory:";

/* ── Persistencia: node:sqlite si existe; si no, en memoria ────────────────── */
let store;
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB_PATH);
  db.exec(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL, device_id TEXT, recipient TEXT,
    cls TEXT, ptype TEXT, body TEXT, at INTEGER NOT NULL
  );`);
  const ins = db.prepare(
    "INSERT INTO items (channel,device_id,recipient,cls,ptype,body,at) VALUES (?,?,?,?,?,?,?)",
  );
  const selPublic = db.prepare(
    "SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='public' AND at>? ORDER BY at DESC LIMIT 100",
  );
  const selRelay = db.prepare(
    "SELECT id,device_id,cls,ptype,body,at FROM items WHERE channel='relay' AND recipient=? AND at>? ORDER BY at DESC LIMIT 100",
  );
  store = {
    kind: "sqlite",
    add: (channel, r) => ins.run(channel, r.device_id ?? null, r.recipient ?? null, r.cls ?? "P2", r.ptype ?? "post", JSON.stringify(r.body ?? null), r.at),
    publicSince: (since) => selPublic.all(since).map(rowToItem),
    relayFor: (recipient, since) => selRelay.all(recipient, since).map(rowToItem),
  };
  // eslint-disable-next-line no-console
  console.log(`[persistencia] SQLite (${DB_PATH})`);
} catch {
  const items = [];
  let seq = 0;
  store = {
    kind: "memory",
    add: (channel, r) => {
      items.push({ id: ++seq, channel, device_id: r.device_id ?? null, recipient: r.recipient ?? null, cls: r.cls ?? "P2", ptype: r.ptype ?? "post", body: r.body ?? null, at: r.at });
      if (items.length > 5000) items.shift();
    },
    publicSince: (since) => items.filter((i) => i.channel === "public" && i.at > since).slice(-100),
    relayFor: (recipient, since) => items.filter((i) => i.channel === "relay" && i.recipient === recipient && i.at > since).slice(-100),
  };
  // eslint-disable-next-line no-console
  console.log("[persistencia] en memoria (node:sqlite no disponible)");
}

function rowToItem(row) {
  let body = row.body;
  try {
    body = typeof row.body === "string" ? JSON.parse(row.body) : row.body;
  } catch {
    /* deja el string */
  }
  return { id: String(row.id), device_id: row.device_id, cls: row.cls, ptype: row.ptype, body, at: row.at };
}

/* ── HTTP ──────────────────────────────────────────────────────────────────── */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,accept,authorization");
}
function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(b || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
function authOk(req) {
  if (!TOKEN) return true;
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return json(res, 204, {});

  // Envío público (texto plano). Auth si hay token.
  if (req.method === "POST" && u.pathname === "/mesh/public") {
    if (!authOk(req)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req);
    const env = b.envelope || {};
    store.add("public", { device_id: b.device_id, cls: env.cls, ptype: env.ptype || "post", body: env.body, at: Date.now() });
    return json(res, 200, { ok: true });
  }

  // Envío de relé dirigido (body YA cifrado por el cliente; solo se transporta).
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    if (!authOk(req)) return json(res, 401, { error: "no autorizado" });
    const b = await readBody(req);
    const env = b.envelope || {};
    store.add("relay", { device_id: b.device_id, recipient: env.recipient || null, cls: env.cls, ptype: env.ptype || "message", body: env.body, at: Date.now() });
    return json(res, 200, { ok: true });
  }

  // Recepción del feed público posterior a `since`.
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    const since = Number(u.searchParams.get("since") || 0);
    return json(res, 200, { items: store.publicSince(since) });
  }

  // Recepción del BUZÓN dirigido de un `recipient` posterior a `since`. Auth si hay token.
  if (req.method === "GET" && u.pathname === "/mesh/relay") {
    if (!authOk(req)) return json(res, 401, { error: "no autorizado" });
    const recipient = u.searchParams.get("recipient") || "";
    const since = Number(u.searchParams.get("since") || 0);
    if (!recipient) return json(res, 400, { error: "falta recipient" });
    return json(res, 200, { items: store.relayFor(recipient, since) });
  }

  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`StarSeed mesh reference server escuchando en :${PORT}${TOKEN ? " (auth ON)" : ""}`);
});
