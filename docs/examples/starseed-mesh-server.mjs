// Servidor de referencia — Protocolo de Red Sináptica StarSeed (servidor propio).
// ============================================================================
// Implementa el contrato de architecture/servidor-propio-protocolo.md con un
// almacén EN MEMORIA (demo). Sin dependencias: solo Node.
//
//   node docs/examples/starseed-mesh-server.mjs        # escucha en :8787
//
// En Señales → Servidor, añade un servidor con endpoint http://TU_HOST:8787 y
// selecciónalo como activo. La neurona enviará (POST) y recibirá (GET) por él.
// Para producción: sustituye el almacén por Postgres/SQLite, añade auth y TTL.

import http from "node:http";

const PORT = process.env.PORT || 8787;

/** Almacén en memoria (demo). */
const publicItems = []; // { id, device_id, cls, ptype, body, at }
const relayItems = []; // { id, device_id, recipient, cls, ptype, body, at }
let seq = 0;

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

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return json(res, 204, {});

  // Envío público (texto plano)
  if (req.method === "POST" && u.pathname === "/mesh/public") {
    const b = await readBody(req);
    const env = b.envelope || {};
    const item = {
      id: `p${++seq}`,
      device_id: b.device_id || null,
      cls: env.cls || "P2",
      ptype: env.ptype || "post",
      body: env.body ?? null,
      at: Date.now(),
    };
    publicItems.push(item);
    if (publicItems.length > 2000) publicItems.shift();
    return json(res, 200, { ok: true, id: item.id });
  }

  // Envío de relé privado (body YA cifrado por el cliente; aquí solo se transporta)
  if (req.method === "POST" && u.pathname === "/mesh/relay") {
    const b = await readBody(req);
    const env = b.envelope || {};
    relayItems.push({
      id: `r${++seq}`,
      device_id: b.device_id || null,
      recipient: env.recipient || null,
      cls: env.cls || "P2",
      ptype: env.ptype || "message",
      body: env.body ?? null,
      at: Date.now(),
    });
    if (relayItems.length > 2000) relayItems.shift();
    return json(res, 200, { ok: true });
  }

  // Recepción del feed público posterior a `since`
  if (req.method === "GET" && u.pathname === "/mesh/public") {
    const since = Number(u.searchParams.get("since") || 0);
    return json(res, 200, { items: publicItems.filter((i) => i.at > since).slice(-100) });
  }

  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`StarSeed mesh reference server escuchando en :${PORT}`);
});
