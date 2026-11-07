/*
 * guarda.cjs — la guarda del servidor local de la app nativa (SEG1107A · T11, 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md (§3 y §11.11).
 *
 * El servidor local escucha en 127.0.0.1:47610–47619. Cualquier web abierta en un navegador de la
 * misma máquina puede MANDARLE peticiones (un POST «simple», un <img>, un <form>…) aunque no pueda
 * leer la respuesta, y un dominio que resuelva a 127.0.0.1 (DNS rebinding) podría incluso leerla.
 * Sin red, /api/* va al Next local y varias rutas se abren sin sesión a «esta máquina» (voz,
 * recursos de IA, conocimiento…). Esta guarda decide, ANTES de repartir, si una petición pasa:
 *
 *   1. Host exacto `127.0.0.1:<puerto>` o `localhost:<puerto>`; si no → 421 (cierra el rebinding).
 *   2. /api/*, todo método que no sea GET/HEAD y todo «upgrade» (WebSocket) piden las tres cosas:
 *        · Origin, si viene, = el origen local exacto (`http://<host>`); «null» u otro → 403.
 *        · Sec-Fetch-Site, si viene, `same-origin` o `none`; `cross-site`, `same-site` u otro → 403.
 *        · La cookie `starseed_pase` = el pase de ESTE arranque de la app. Lo genera Rust al abrir
 *          la app, se lo da al envoltorio por su entrada estándar y lleva la ventana a
 *          `/__starseed/entrar?t=<pase>`, que pone la cookie (HttpOnly; SameSite=Strict). Ninguna
 *          web ni ningún otro programa lo conoce. Sin cookie o con otra → 403 con un JSON claro.
 *   3. GET/HEAD fuera de /api (páginas, /_next/static, public, /__starseed/salud…) pasan, salvo
 *      que vengan de OTRO sitio y no sean la navegación de la pestaña entera: un <script>, <img>,
 *      fetch o <iframe> de otra web → 403. Un enlace o la vuelta de un inicio de sesión (OAuth →
 *      /auth/callback) siguen funcionando: la página llega, y sin el pase no puede hacer nada.
 *   4. /__starseed/entrar?t=<pase>&a=<ruta>: con el pase bueno pone la cookie y redirige (303) a
 *      la ruta, siempre del mismo origen; con otro → 403 y nada más.
 *
 * Lógica PURA: ni red, ni reloj, ni disco, ni registros (el pase no se escribe en ninguna parte).
 * Pruebas: native/servidor-local/__tests__/guarda.test.cjs (`node --test`).
 */
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

/** Cookie que demuestra que la petición viene de la ventana de la app (de este arranque). */
const NOMBRE_COOKIE = "starseed_pase";
/** Entrada de la ventana: pone la cookie y redirige. */
const RUTA_ENTRAR = "/__starseed/entrar";
/** Cabecera con la que el envoltorio habla con el Next interno (y nadie más). */
const CABECERA_INTERNA = "x-starseed-interna";
/** Cabecera de las respuestas de la guarda: dice qué regla rechazó (sin datos de la petición). */
const CABECERA_GUARDA = "x-starseed-guarda";
const METODOS_SEGUROS = new Set(["GET", "HEAD"]);
/** El pase: hex en minúsculas, de 128 a 512 bits (Rust genera 256). */
const FORMA_PASE = /^[0-9a-f]{32,128}$/;
const MAX_DESTINO = 2048;

const MENSAJES = {
  "url-no-valida": "La petición no tiene una ruta válida para este servidor.",
  "host-ajeno":
    "Este servidor solo atiende a 127.0.0.1 o localhost con su puerto: el nombre pedido no es el suyo (protección contra DNS rebinding).",
  "metodo-no-permitido": "Este método no está permitido aquí.",
  "origen-ajeno":
    "La petición viene de otra web: el servidor local de StarSeed OS solo atiende a la ventana de la app.",
  "sitio-ajeno":
    "La petición viene de otro sitio: el servidor local de StarSeed OS solo atiende a la ventana de la app.",
  "recurso-ajeno": "Otra web no puede cargar recursos del servidor local de StarSeed OS.",
  "marco-ajeno": "Otra web no puede enmarcar el servidor local de StarSeed OS.",
  "sin-pase":
    "Falta el pase de la app: el servidor local solo atiende a la ventana de StarSeed OS. Si lo ves dentro de la app, ciérrala y vuelve a abrirla.",
  "pase-malo":
    "El pase no es el de este arranque de la app. Si lo ves dentro de la app, ciérrala y vuelve a abrirla.",
  "sin-pase-configurado":
    "El servidor local no recibió el pase de la app, así que no atiende /api ni cambios. Cierra la app y vuelve a abrirla.",
};

// ───────────────────────────── Piezas ─────────────────────────────

function paseValido(pase) {
  return typeof pase === "string" && FORMA_PASE.test(pase);
}

/** La línea que la app manda por la entrada estándar: `pase:<hex>`. Devuelve el pase o null. */
function lineaPase(linea) {
  const m = /^pase:([0-9a-f]{32,128})\r?$/.exec(String(linea || ""));
  return m ? m[1] : null;
}

/** Una cabecera como texto (Node junta las repetidas en una lista o con «, »). */
function cabecera(h, nombre) {
  const v = h ? h[nombre] : undefined;
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "string" ? v : undefined;
}

/** Comparación en tiempo constante (para el pase y el testigo interno). */
function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hostValido(host, puerto) {
  if (typeof host !== "string" || !Number.isInteger(puerto)) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${puerto}` || h === `localhost:${puerto}`;
}

/**
 * La ruta para DECIDIR: sin consulta, con %xx decodificado (hasta 3 veces, byte a byte: aunque
 * haya secuencias inválidas), `\` → `/`, sin `//`, sin `.`/`..`, sin barra final y en minúsculas.
 * Es más estricta que la que entiende Next: si duda, la trata como /api (pide el pase).
 */
function rutaParaDecidir(url) {
  let r = String(url || "/");
  const i = r.search(/[?#]/);
  if (i !== -1) r = r.slice(0, i);
  for (let n = 0; n < 3 && /%[0-9a-f]{2}/i.test(r); n++) {
    r = r.replace(/%([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  r = path.posix.normalize("/" + r.replace(/\\/g, "/").replace(/\/+/g, "/"));
  if (r.length > 1) r = r.replace(/\/+$/, "");
  return r.toLowerCase();
}

function esApi(ruta) {
  return ruta === "/api" || ruta.startsWith("/api/");
}

/**
 * De dónde viene la petición según el navegador. `origen`: "propio" | "ajeno" | "sin";
 * `sitio` (Sec-Fetch-Site): "propio" (same-origin) | "ninguno" (none: la persona o la app) |
 * "ajeno" (cross-site, same-site o cualquier otro valor) | "sin" (navegador viejo o un programa).
 */
function procedencia(h, origenPropio) {
  const o = cabecera(h, "origin");
  const s = cabecera(h, "sec-fetch-site");
  let origen = "sin";
  if (o !== undefined) origen = o.trim().toLowerCase() === origenPropio ? "propio" : "ajeno";
  let sitio = "sin";
  if (s !== undefined) {
    const v = s.trim().toLowerCase();
    sitio = v === "same-origin" ? "propio" : v === "none" ? "ninguno" : "ajeno";
  }
  return {
    origen,
    sitio,
    modo: (cabecera(h, "sec-fetch-mode") || "").trim().toLowerCase(),
    destino: (cabecera(h, "sec-fetch-dest") || "").trim().toLowerCase(),
  };
}

function leerCookies(cab) {
  const out = [];
  if (typeof cab !== "string") return out;
  for (const trozo of cab.split(";")) {
    const i = trozo.indexOf("=");
    if (i === -1) continue;
    out.push([trozo.slice(0, i).trim(), trozo.slice(i + 1).trim()]);
  }
  return out;
}

/**
 * "valido" | "malo" | "falta". Vale si ALGUNA cookie `starseed_pase` casa: otro servidor de
 * 127.0.0.1 (las cookies no distinguen puertos) podría poner una suya con otra ruta y eso no debe
 * dejar a la app sin servicio.
 */
function estadoPase(cab, pase) {
  const valores = leerCookies(cab)
    .filter(([n]) => n === NOMBRE_COOKIE)
    .map(([, v]) => v);
  if (!valores.length) return "falta";
  return paseValido(pase) && valores.some((v) => iguales(v, pase)) ? "valido" : "malo";
}

function si(motivo) {
  return { pasa: true, motivo };
}

function no(codigo, motivo) {
  return { pasa: false, codigo, motivo, mensaje: MENSAJES[motivo] || motivo };
}

// ───────────────────────────── Decisión ─────────────────────────────

/**
 * ¿Pasa esta petición? `pet`: { metodo, url (la de la línea de petición), cabeceras (las de Node,
 * en minúsculas), actualizar (true si es un «upgrade») }. `cfg`: { puerto, pase }.
 * Devuelve { pasa: true, motivo } o { pasa: false, codigo, motivo, mensaje }.
 */
function decidir(pet, cfg) {
  const metodo = String((pet && pet.metodo) || "GET").toUpperCase();
  const url = String((pet && pet.url) || "");
  const h = (pet && pet.cabeceras) || {};
  const actualizar = Boolean(pet && pet.actualizar);
  // Solo la forma «/ruta» (ni `http://otro/…` de proxy, ni `*`).
  if (!url.startsWith("/")) return no(400, "url-no-valida");
  const host = cabecera(h, "host");
  if (!hostValido(host, cfg && cfg.puerto)) return no(421, "host-ajeno");

  const origenPropio = "http://" + host.toLowerCase();
  const ruta = rutaParaDecidir(url);
  const p = procedencia(h, origenPropio);

  // La entrada: solo GET; el pase se comprueba al atenderla (`entrar`).
  if (ruta === RUTA_ENTRAR) return metodo === "GET" && !actualizar ? si("entrar") : no(405, "metodo-no-permitido");

  if (actualizar || !METODOS_SEGUROS.has(metodo) || esApi(ruta)) {
    if (p.origen === "ajeno") return no(403, "origen-ajeno");
    if (p.sitio === "ajeno") return no(403, "sitio-ajeno");
    if (!paseValido(cfg && cfg.pase)) return no(403, "sin-pase-configurado");
    const c = estadoPase(cabecera(h, "cookie"), cfg.pase);
    if (c !== "valido") return no(403, c === "falta" ? "sin-pase" : "pase-malo");
    return si(actualizar ? "conexion-propia" : esApi(ruta) ? "api-propia" : "cambio-propio");
  }

  // GET/HEAD fuera de /api.
  if (p.origen === "ajeno" || p.sitio === "ajeno") {
    if (p.modo === "navigate" && (p.destino === "document" || p.destino === "")) return si("navegacion-de-fuera");
    return no(403, p.modo === "navigate" ? "marco-ajeno" : "recurso-ajeno");
  }
  return si("pagina-o-recurso");
}

/** La respuesta de un rechazo: JSON claro, sin caché y sin nada de la petición (ni cookies). */
function respuestaRechazo(d) {
  const cuerpo = JSON.stringify({ error: "puerta-local", motivo: d.motivo, mensaje: d.mensaje });
  return {
    codigo: d.codigo,
    cabeceras: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(cuerpo)),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      [CABECERA_GUARDA]: d.motivo,
    },
    cuerpo,
  };
}

// ───────────────────────────── Entrada de la ventana ─────────────────────────────

/** A dónde ir tras entrar: una ruta del MISMO origen (nunca `//otro`, `/\otro`, ni la propia entrada). */
function destinoSeguro(a) {
  if (typeof a !== "string" || !a || a.length > MAX_DESTINO) return "/";
  if (a[0] !== "/" || a[1] === "/" || a[1] === "\\") return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(a)) return "/";
  let u;
  try {
    u = new URL(a, "http://127.0.0.1");
  } catch {
    return "/";
  }
  if (u.origin !== "http://127.0.0.1") return "/";
  if (rutaParaDecidir(u.pathname) === RUTA_ENTRAR) return "/";
  return u.pathname + u.search + u.hash;
}

function cookiePase(pase) {
  return `${NOMBRE_COOKIE}=${pase}; Path=/; HttpOnly; SameSite=Strict`;
}

/**
 * Atiende `/__starseed/entrar?t=<pase>&a=<ruta>`. Con el pase bueno: 303 a la ruta con la cookie.
 * Si no, el mismo rechazo que `decidir` (403). Nunca devuelve el pase en el cuerpo.
 */
function entrar(url, cfg) {
  if (!paseValido(cfg && cfg.pase)) return no(403, "sin-pase-configurado");
  let q;
  try {
    q = new URL(String(url || ""), "http://127.0.0.1").searchParams;
  } catch {
    return no(400, "url-no-valida");
  }
  const t = q.get("t") || "";
  if (!t) return no(403, "sin-pase");
  if (!iguales(t, cfg.pase)) return no(403, "pase-malo");
  return {
    pasa: true,
    motivo: "entrar",
    codigo: 303,
    cabeceras: {
      location: destinoSeguro(q.get("a")),
      "set-cookie": cookiePase(cfg.pase),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-length": "0",
    },
  };
}

// ───────────────────────────── Cabeceras ─────────────────────────────

/**
 * Respuestas hacia el navegador sin CORS abierto: fuera `Access-Control-Allow-Private-Network`
 * siempre (así Chrome no deja que una web pública hable con 127.0.0.1) y todas las
 * `Access-Control-*` salvo que `Allow-Origin` sea exactamente el origen local.
 */
function cabecerasCorsSeguras(h, origenPropio) {
  const out = { ...(h || {}) };
  const acao = out["access-control-allow-origin"];
  const propio = typeof acao === "string" && acao.trim().toLowerCase() === String(origenPropio || "").toLowerCase();
  for (const k of Object.keys(out)) {
    const n = k.toLowerCase();
    if (n === "access-control-allow-private-network") delete out[k];
    else if (!propio && n.startsWith("access-control-")) delete out[k];
  }
  return out;
}

/** Quita una cookie de la cabecera `Cookie` (el pase nunca sale hacia la web publicada). */
function quitarCookie(cab, nombre = NOMBRE_COOKIE) {
  if (typeof cab !== "string") return cab;
  const resto = cab
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const i = s.indexOf("=");
      return (i === -1 ? s : s.slice(0, i)).trim() !== nombre;
    });
  return resto.length ? resto.join("; ") : undefined;
}

/**
 * ¿Puede pasar esta petición al Next INTERNO (127.0.0.1:<puerto al azar>)? Solo si trae el testigo
 * del envoltorio, o la cookie del pase (Next se llama a sí mismo por ese puerto al redirigir tras
 * una server action, reenviando las cookies de la petición original).
 */
function permiteInterna(h, testigo, pase) {
  const t = cabecera(h, CABECERA_INTERNA);
  if (typeof testigo === "string" && testigo.length >= 32 && typeof t === "string" && iguales(t, testigo)) return true;
  return paseValido(pase) && estadoPase(cabecera(h, "cookie"), pase) === "valido";
}

module.exports = {
  NOMBRE_COOKIE,
  RUTA_ENTRAR,
  CABECERA_INTERNA,
  CABECERA_GUARDA,
  MENSAJES,
  paseValido,
  lineaPase,
  hostValido,
  rutaParaDecidir,
  esApi,
  procedencia,
  leerCookies,
  estadoPase,
  decidir,
  respuestaRechazo,
  destinoSeguro,
  cookiePase,
  entrar,
  cabecerasCorsSeguras,
  quitarCookie,
  permiteInterna,
};
