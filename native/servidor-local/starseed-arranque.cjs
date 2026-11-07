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
 *        · GET /__starseed/migracion (+ su script) → la página que trae, UNA vez, lo que la app tenía en
 *          el origen de la web publicada (APP1107B · T4; la lógica: migracion-origen.js). Sin el código
 *          del OS: así nada escribe valores por defecto antes de importar.
 *        · /api/mando/**        → 404 siempre (APP1107B · T8): es el motor de la consola de MetaGenesis,
 *          que solo vive en la Mac de desarrollo; su puerta (`guardianMando`) trata 127.0.0.1 como «esta
 *          Mac» y aquí lo abriría sin sesión. El build nativo además lo quita (solo-mac.mjs).
 *   3. Sale solo cuando se cierra su entrada estándar: la app la tiene abierta mientras vive; si la
 *      app muere aunque sea de golpe, el sistema la cierra y este proceso no queda huérfano.
 *
 * Nunca escucha fuera de 127.0.0.1 y no lleva claves: el servidor local no tiene secretos.
 * Pruebas: native/servidor-local/__tests__/arranque.test.cjs (`node --test`).
 */
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");

const HOST = "127.0.0.1";
const RUTA_SALUD = "/__starseed/salud";
const RUTA_RED = "/__starseed/red";
const RUTA_MIGRACION = "/__starseed/migracion";
const RUTA_MIGRACION_JS = "/__starseed/migracion-origen.js";
const ARCHIVO_MIGRACION_JS = "migracion-origen.js";
/** Rutas que solo viven en la Mac de desarrollo: nunca se sirven desde la app (APP1107B · T8). */
const RUTAS_SOLO_MAC = ["/api/mando"];
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

/** La ruta como la entendería un servidor: sin `//`, sin `.`/`..` y con %xx decodificado. */
function rutaNormalizada(ruta) {
  let r = String(ruta || "/");
  try {
    r = decodeURIComponent(r);
  } catch {}
  r = path.posix.normalize("/" + r.replace(/\\/g, "/").replace(/\/+/g, "/"));
  return r.length > 1 ? r.replace(/\/+$/, "") : r;
}

/** ¿Es una ruta que solo vive en la Mac de desarrollo? (sin distinguir mayúsculas: defensa). */
function esSoloMac(ruta) {
  const r = rutaNormalizada(ruta).toLowerCase();
  return RUTAS_SOLO_MAC.some((p) => r === p || r.startsWith(p + "/"));
}

/** ¿A dónde va esta petición? "salud" | "red" | "migracion" | "migracion-js" | "solo-mac" | "web" | "local". */
function destino(url, cfg, red, ahora) {
  const ruta = rutaDe(url);
  if (ruta === RUTA_SALUD) return "salud";
  if (ruta === RUTA_RED) return "red";
  if (ruta === RUTA_MIGRACION) return "migracion";
  if (ruta === RUTA_MIGRACION_JS) return "migracion-js";
  if (esSoloMac(ruta)) return "solo-mac";
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

/**
 * La página que importa los datos de la versión anterior (APP1107B · T4). Mínima, sin recursos de
 * fuera y sin el código del OS; si algo falla, va a `/` igualmente (la app nunca se queda aquí).
 */
function paginaMigracion() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self' ipc: http://ipc.localhost">
<title>StarSeed OS</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0A0712; color: #ECE8F5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, sans-serif; }
  body { display: grid; place-items: center; }
  main { width: min(30rem, 88vw); text-align: center; padding: 2.4rem 2rem; border-radius: 1.6rem;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); }
  h1 { margin: 0 0 .5rem; font-size: 1.2rem; font-weight: 600; }
  p { margin: 0; line-height: 1.5; color: #A79FBF; font-size: .95rem; }
  .nota { margin-top: 1rem; font-size: .8rem; }
</style>
</head>
<body>
<main>
  <h1>StarSeed OS</h1>
  <p id="texto" role="status" aria-live="polite">Trayendo tus datos de la versión anterior…</p>
  <p class="nota">La sesión no se copia por seguridad: si te la pide, vuelve a iniciarla en esta app.</p>
</main>
<script src="${RUTA_MIGRACION_JS}" onerror="location.replace('/')"></script>
<script>
(function () {
  var irA = function (u) { location.replace(u); };
  setTimeout(function () { irA("/"); }, 120000);
  var M = window.StarseedMigracionOrigen;
  if (!M) return irA("/");
  var pintar = function (fase, texto) { var e = document.getElementById("texto"); if (e) e.textContent = texto; };
  M.invocador(window, 8000).then(function (inv) {
    return M.paginaImportar({
      invoke: inv, localStorage: window.localStorage, indexedDB: window.indexedDB, ir: irA, pintar: pintar,
      esperar: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    });
  }).catch(function () { irA("/"); });
})();
</script>
</body>
</html>
`;
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
      case "migracion": {
        const html = paginaMigracion();
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(html),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        return res.end(html);
      }
      case "migracion-js": {
        let js;
        try {
          js = fs.readFileSync(path.join(__dirname, ARCHIVO_MIGRACION_JS));
        } catch {
          return json(res, 404, { error: "sin-migracion", mensaje: "Este paquete no trae la migración." });
        }
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "content-length": js.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
        return res.end(js);
      }
      case "solo-mac":
        return json(res, 404, { error: "solo-mac", mensaje: "La consola de MetaGenesis vive en la Mac de desarrollo; desde la app se llega a ella por su túnel (/metagenesis)." });
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
  leerConfig, rutaDe, rutaNormalizada, esSoloMac, destino, paginaMigracion, esErrorDeRed, estadoRed, cabecerasLimpias, cabecerasHaciaWeb,
  adaptarCookie, cabecerasDeVuelta, cuerpoSalud, RUTA_SALUD, RUTA_RED, RUTA_MIGRACION, RUTA_MIGRACION_JS,
  RUTAS_SOLO_MAC, NOMBRE, LIMITE_CUERPO,
};

if (require.main === module) {
  principal().catch((e) => {
    console.error("[starseed-arranque] fallo al arrancar:", e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
