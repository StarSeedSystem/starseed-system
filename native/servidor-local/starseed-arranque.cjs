#!/usr/bin/env node
/*
 * starseed-arranque.cjs — la puerta del servidor local de la app nativa (APP1107A, 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md
 *
 * La app de escritorio de StarSeed OS lanza `starseed-node starseed-arranque.cjs` dentro de la
 * carpeta del servidor (`<recursos>/servidor`, el build `standalone` de Next + .next/static +
 * public). Este envoltorio:
 *
 *   1. Arranca el `server.js` de Next en un puerto interno (127.0.0.1, elegido al azar).
 *   2. Escucha en 127.0.0.1:STARSEED_PUERTO (el que ve la ventana) y reparte:
 *        · GET /__starseed/salud → { servidor, firma, listo, red } (Rust comprueba su firma antes de
 *          llevar la ventana aquí: así nunca abre otro programa que haya ocupado el puerto).
 *        · GET /__starseed/red   → { red: en-linea | sin-conexion | desconocida } (lo lee el aviso
 *          «Sin conexión: trabajando en local» de la web).
 *        · /api/* CON internet  → a la web publicada (STARSEED_WEB_PUBLICADA). Es lo que la app hacía
 *          hasta ahora: las rutas que necesitan claves del servidor siguen funcionando igual.
 *        · /api/* SIN internet  → al Next local (lo que no necesita claves funciona; lo demás
 *          contesta su propio error). Un fallo de red al ir a la web se repite en local si la
 *          petición se puede repetir (cuerpo ≤ 8 MB).
 *        · todo lo demás        → al Next local (páginas, /_next/static, public).
 *   3. Sale solo cuando se cierra su entrada estándar: la app la tiene abierta mientras vive; si la
 *      app muere aunque sea de golpe, el sistema la cierra y este proceso no queda huérfano.
 *
 * Nunca escucha fuera de 127.0.0.1 y no lleva claves: el servidor local no tiene secretos.
 * Pruebas: native/servidor-local/__tests__/arranque.test.cjs (`node --test`).
 */
"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");

const HOST = "127.0.0.1";
const RUTA_SALUD = "/__starseed/salud";
const RUTA_RED = "/__starseed/red";
const NOMBRE = "starseed-os-local";
const LIMITE_CUERPO = 8 * 1024 * 1024;
const ESPERA_CONECTAR_MS = 5000;
const SALTO = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "transfer-encoding", "upgrade",
]);
const ERRORES_DE_RED = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH",
  "EHOSTUNREACH", "ENETDOWN", "EHOSTDOWN", "EPIPE", "ECONNABORTED", "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
]);

// ───────────────────────────── Lógica pura ─────────────────────────────

function leerConfig(env) {
  const puerto = Number.parseInt(env.STARSEED_PUERTO || "", 10);
  const web = String(env.STARSEED_WEB_PUBLICADA || "https://starseed-os.vercel.app").replace(/\/+$/, "");
  const localSiempre = String(env.STARSEED_API_SOLO_LOCAL || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("/api/"));
  return {
    puerto: Number.isInteger(puerto) && puerto > 0 && puerto < 65536 ? puerto : null,
    firma: String(env.STARSEED_FIRMA || ""),
    web,
    apiRemota: env.STARSEED_API_REMOTA !== "nunca",
    localSiempre,
    pausaRedMs: Math.max(100, Number.parseInt(env.STARSEED_PAUSA_RED_MS || "", 10) || 20_000),
    vigiaPadre: env.STARSEED_VIGIA_PADRE !== "0",
  };
}

function rutaDe(url) {
  const i = String(url || "/").search(/[?#]/);
  return i === -1 ? String(url || "/") : String(url).slice(0, i);
}

/** ¿A dónde va esta petición? "salud" | "red" | "web" | "local". */
function destino(url, cfg, red, ahora) {
  const ruta = rutaDe(url);
  if (ruta === RUTA_SALUD) return "salud";
  if (ruta === RUTA_RED) return "red";
  if (!ruta.startsWith("/api/")) return "local";
  if (!cfg.apiRemota) return "local";
  if (cfg.localSiempre.some((p) => ruta === p || ruta.startsWith(p.endsWith("/") ? p : p + "/"))) return "local";
  if (red.sinConexionHasta > ahora) return "local";
  return "web";
}

function esErrorDeRed(err) {
  if (!err) return false;
  const codigo = err.code || (err.cause && err.cause.code) || "";
  return ERRORES_DE_RED.has(codigo) || err.starseedRed === true;
}

/** Estado de la red visto desde el servidor local, para el aviso de la web. */
function estadoRed(red, ahora) {
  if (red.sinConexionHasta > ahora) return "sin-conexion";
  if (red.ultimaRespuesta && ahora - red.ultimaRespuesta < 120_000) return "en-linea";
  return "desconocida";
}

function cabecerasLimpias(h) {
  const out = {};
  const conexion = String(h.connection || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  for (const [k, v] of Object.entries(h || {})) {
    const n = k.toLowerCase();
    if (SALTO.has(n) || conexion.includes(n) || v === undefined) continue;
    out[n] = v;
  }
  return out;
}

/** Cabeceras hacia la web publicada: el host, el origen y la referencia pasan a ser los de la web. */
function cabecerasHaciaWeb(h, web) {
  const u = new URL(web);
  const out = cabecerasLimpias(h);
  out.host = u.host;
  if (out.origin) out.origin = u.origin;
  if (typeof out.referer === "string") {
    try {
      const r = new URL(out.referer);
      out.referer = u.origin + r.pathname + r.search;
    } catch {
      delete out.referer;
    }
  }
  delete out["x-forwarded-host"];
  delete out["x-forwarded-proto"];
  delete out["x-forwarded-for"];
  return out;
}

/** Una cookie de la web publicada sirve en 127.0.0.1: sin Domain (sería de otro sitio) ni Secure (es http). */
function adaptarCookie(c) {
  return String(c)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !/^domain=/i.test(s) && !/^secure$/i.test(s))
    .map((s) => (/^samesite=none$/i.test(s) ? "SameSite=Lax" : s))
    .join("; ");
}

function cabecerasDeVuelta(h) {
  const out = cabecerasLimpias(h);
  delete out["strict-transport-security"];
  if (out["set-cookie"]) {
    const lista = Array.isArray(out["set-cookie"]) ? out["set-cookie"] : [out["set-cookie"]];
    out["set-cookie"] = lista.map(adaptarCookie);
  }
  return out;
}

function cuerpoSalud(estado, ahora) {
  return JSON.stringify({
    servidor: NOMBRE,
    firma: estado.firma,
    listo: Boolean(estado.listo),
    red: estadoRed(estado.red, ahora),
    puertoInterno: estado.puertoInterno || null,
    node: process.version,
  });
}

// ───────────────────────────── Servidor ─────────────────────────────

function log(...a) {
  console.log("[starseed-arranque]", new Date().toISOString(), ...a);
}

function puertoLibreAlAzar() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, HOST, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function esperarPuerto(puerto, alListo) {
  const probar = () => {
    const c = net.connect({ host: HOST, port: puerto });
    c.once("connect", () => {
      c.destroy();
      alListo();
    });
    c.once("error", () => {
      c.destroy();
      setTimeout(probar, 100);
    });
  };
  probar();
}

function json(res, codigo, cuerpo, extra) {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
    "cache-control": "no-store",
    ...(extra || {}),
  });
  res.end(texto);
}

function crearPuerta(cfg, estado) {
  const agenteWeb = new (cfg.web.startsWith("https:") ? https : http).Agent({ keepAlive: true, maxSockets: 32 });
  const moduloWeb = cfg.web.startsWith("https:") ? https : http;

  function marcarSinConexion(err) {
    const antes = estadoRed(estado.red, Date.now());
    estado.red.sinConexionHasta = Date.now() + cfg.pausaRedMs;
    if (antes !== "sin-conexion") log("sin conexión con la web publicada:", (err && err.code) || String(err), "→ trabajando en local");
  }

  function alLocal(req, res, cuerpo) {
    if (!estado.listo) {
      return json(res, 503, { error: "arrancando", mensaje: "El servidor local está arrancando." }, { "retry-after": "1" });
    }
    const p = http.request(
      { host: HOST, port: estado.puertoInterno, method: req.method, path: req.url, headers: cabecerasLimpias(req.headers) },
      (r) => {
        res.writeHead(r.statusCode || 502, { ...cabecerasLimpias(r.headers), "x-starseed-ruta": "local" });
        r.pipe(res);
      },
    );
    p.on("error", (e) => {
      if (!res.headersSent) json(res, 502, { error: "servidor-local", mensaje: String(e.message || e) });
      else res.destroy();
    });
    if (cuerpo) p.end(cuerpo);
    else req.pipe(p);
  }

  function aLaWeb(req, res) {
    const repetible = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    const trozos = [];
    let tam = 0;
    let resuelto = false;
    let terminado = repetible;
    let alTerminar = null;

    const remota = moduloWeb.request(new URL(req.url, cfg.web), {
      method: req.method,
      headers: cabecerasHaciaWeb(req.headers, cfg.web),
      agent: agenteWeb,
    });
    remota.on("socket", (s) => {
      if (!s.connecting) return;
      const t = setTimeout(() => {
        const e = new Error("la web publicada no contestó a tiempo");
        e.code = "ETIMEDOUT";
        remota.destroy(e);
      }, ESPERA_CONECTAR_MS);
      s.once(cfg.web.startsWith("https:") ? "secureConnect" : "connect", () => clearTimeout(t));
      s.once("close", () => clearTimeout(t));
    });
    remota.on("response", (r) => {
      if (resuelto) return r.resume();
      resuelto = true;
      estado.red.ultimaRespuesta = Date.now();
      estado.red.sinConexionHasta = 0;
      res.writeHead(r.statusCode || 502, { ...cabecerasDeVuelta(r.headers), "x-starseed-ruta": "web" });
      r.pipe(res);
    });
    remota.on("error", (e) => {
      if (resuelto) return res.headersSent ? res.destroy() : undefined;
      resuelto = true;
      if (res.headersSent) return res.destroy();
      if (!esErrorDeRed(e)) return json(res, 502, { error: "web-publicada", mensaje: String(e.message || e) });
      marcarSinConexion(e);
      if (repetible) return alLocal(req, res, null);
      // Sin red: se repite en local con la copia del cuerpo, cuando haya llegado entero.
      const repetir = () =>
        tam <= LIMITE_CUERPO
          ? alLocal(req, res, Buffer.concat(trozos))
          : json(res, 503, { error: "sin-conexion", mensaje: "Sin conexión, y el envío es demasiado grande para repetirlo en local." });
      if (terminado) repetir();
      else alTerminar = repetir;
    });

    if (repetible) {
      remota.end();
      return;
    }
    // Se guarda una copia del cuerpo (hasta 8 MB) para repetir en local si no hay red.
    req.on("data", (c) => {
      tam += c.length;
      if (tam <= LIMITE_CUERPO) trozos.push(c);
      if (!remota.destroyed) remota.write(c);
    });
    req.on("end", () => {
      terminado = true;
      if (!remota.destroyed) remota.end();
      if (alTerminar) alTerminar();
    });
    req.on("error", () => remota.destroy());
  }

  function sondearWeb() {
    return new Promise((resolve) => {
      const p = moduloWeb.request(new URL("/version.json", cfg.web), { method: "HEAD", agent: agenteWeb, timeout: 3000 }, (r) => {
        r.resume();
        estado.red.ultimaRespuesta = Date.now();
        estado.red.sinConexionHasta = 0;
        resolve();
      });
      p.on("timeout", () => p.destroy(Object.assign(new Error("tiempo"), { code: "ETIMEDOUT" })));
      p.on("error", (e) => {
        marcarSinConexion(e);
        resolve();
      });
      p.end();
    });
  }

  async function manejar(req, res) {
    const ahora = Date.now();
    switch (destino(req.url, cfg, estado.red, ahora)) {
      case "salud":
        return json(res, 200, cuerpoSalud(estado, ahora));
      case "red": {
        if (estadoRed(estado.red, ahora) === "desconocida") await sondearWeb();
        return json(res, 200, { red: estadoRed(estado.red, Date.now()), apiRemota: cfg.apiRemota, web: cfg.web });
      }
      case "web":
        return aLaWeb(req, res);
      default:
        return alLocal(req, res, null);
    }
  }

  // WebSocket y demás «upgrade»: siempre al Next local.
  function alActualizar(req, socket, cabeza) {
    if (!estado.listo) return socket.destroy();
    const s = net.connect({ host: HOST, port: estado.puertoInterno }, () => {
      const lineas = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lineas.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      s.write(lineas.join("\r\n") + "\r\n\r\n");
      if (cabeza && cabeza.length) s.write(cabeza);
      s.pipe(socket);
      socket.pipe(s);
    });
    s.on("error", () => socket.destroy());
    socket.on("error", () => s.destroy());
  }

  return { manejar, alActualizar };
}

async function principal() {
  const cfg = leerConfig(process.env);
  if (!cfg.puerto) {
    console.error("[starseed-arranque] falta STARSEED_PUERTO: este archivo lo lanza la app nativa.");
    process.exit(2);
  }
  const estado = { firma: cfg.firma, listo: false, puertoInterno: null, red: { sinConexionHasta: 0, ultimaRespuesta: 0 } };

  if (cfg.vigiaPadre && !process.stdin.isTTY) {
    process.stdin.on("end", () => {
      log("la app se cerró: salgo");
      process.exit(0);
    });
    process.stdin.on("error", () => process.exit(0));
    process.stdin.resume();
  }
  for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => process.exit(0));

  const puerta = crearPuerta(cfg, estado);
  const servidor = http.createServer((req, res) => {
    puerta.manejar(req, res).catch((e) => {
      if (!res.headersSent) json(res, 500, { error: "puerta", mensaje: String(e && e.message ? e.message : e) });
      else res.destroy();
    });
  });
  servidor.on("upgrade", puerta.alActualizar);
  servidor.on("error", (e) => {
    console.error("[starseed-arranque] no puedo escuchar en", `${HOST}:${cfg.puerto}`, String(e.code || e));
    process.exit(3);
  });
  await new Promise((r) => servidor.listen(cfg.puerto, HOST, r));
  log(`puerta en http://${HOST}:${cfg.puerto} (web publicada: ${cfg.web}, /api en línea → ${cfg.apiRemota ? "web" : "local"})`);

  estado.puertoInterno = await puertoLibreAlAzar();
  process.env.PORT = String(estado.puertoInterno);
  process.env.HOSTNAME = HOST;
  process.env.NODE_ENV = "production";
  esperarPuerto(estado.puertoInterno, () => {
    estado.listo = true;
    log(`Next listo en el puerto interno ${estado.puertoInterno}`);
  });
  require(path.join(__dirname, "server.js"));
}

module.exports = {
  leerConfig, rutaDe, destino, esErrorDeRed, estadoRed, cabecerasLimpias, cabecerasHaciaWeb,
  adaptarCookie, cabecerasDeVuelta, cuerpoSalud, RUTA_SALUD, RUTA_RED, NOMBRE, LIMITE_CUERPO,
};

if (require.main === module) {
  principal().catch((e) => {
    console.error("[starseed-arranque] fallo al arrancar:", e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
