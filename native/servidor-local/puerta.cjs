/**
 * puerta.cjs — el lado de Node de la «puerta de internet» de la malla (PTA1108A · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3.
 *
 * La página (que habla con la malla: Bluetooth, Wi‑Fi directo, LAN…) no puede abrir sockets TCP ni hacer TLS crudo;
 * Node sí. Este módulo ofrece a la página «tuberías» de bytes por HTTP local (siempre POST y siempre tras la guarda
 * del pase de `guarda.cjs`):
 *
 *   · SALIDA (esta neurona es la puerta): `tcp` abre un socket a host:puerto —tras resolver el DNS y rechazar toda
 *     dirección privada— y la página lee (`leer`, espera larga) y escribe (`escribir`) sus bytes.
 *   · ENTRADA (esta neurona pide salida): el proxy HTTP de 127.0.0.1 (CONNECT y HTTP simple) y `fetch` crean una
 *     tubería por petición; la página la ve en `pendientes`, abre el túnel por la malla y avisa en `abierto`.
 *     El TLS va de punta a punta entre el navegador (o Node, en `fetch`) y el sitio: la puerta solo ve bytes cifrados.
 *
 * Sin dependencias. Apagable con STARSEED_PUERTA=0. El proxy solo atiende mientras la página lo activa (`modo`).
 */
"use strict";

const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const tls = require("node:tls");
const { Duplex } = require("node:stream");

const PREFIJO = "/__starseed/puerta/";
const MAX_TUBERIAS = 64;
const TROZO_LECTURA = 64 * 1024;
const ESPERA_LARGA_MS = 20_000;
const PLAZO_ABRIR_MS = 12_000;
const INACTIVA_MS = 5 * 60_000;
const MAX_CUERPO_ESCRIBIR = 1024 * 1024;
const MAX_CUERPO_FETCH = 8 * 1024 * 1024;

/** ¿Es una IP que una puerta nunca debe tocar? (loopback, privada, enlace local, CGNAT, multicast, mapeadas…) */
function ipInterna(ip) {
  const s = String(ip || "").toLowerCase();
  let v4 = null;
  if (net.isIPv4(s)) v4 = s;
  else if (net.isIPv6(s)) {
    if (s === "::" || s === "::1") return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) v4 = m[1];
    else if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true; // mapeada en hex: se rechaza sin más
    else return /^(fc|fd)/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^2001:db8/.test(s) || /^64:ff9b/.test(s);
  } else return true;
  const [a, b] = v4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && v4.startsWith("192.0.0.")) || a >= 224;
}

// PTA1108C · Capas concedidas: lo único privado que se puede abrir. La página calcula la concesión con la política;
// aquí se vuelve a comprobar contra la dirección YA RESUELTA (DNS rebinding) y se conecta a esa misma IP, sin volver a resolver.
function v4De(ip) {
  const s = String(ip || "").toLowerCase();
  if (net.isIPv4(s)) return s;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  return m ? m[1] : null;
}
function aNumero(v4) {
  const o = v4.split(".").map(Number);
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}
function enCidr(ip, cidr) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(cidr || ""));
  const v4 = v4De(ip);
  if (!m || !v4 || !net.isIPv4(m[1])) return false;
  const bits = Number(m[2]);
  if (bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((aNumero(v4) & mask) >>> 0) === ((aNumero(m[1]) & mask) >>> 0);
}
// Rangos que una concesión puede cubrir: nunca públicos, enlace local (169.254/16: metadatos de la nube) ni multicast.
const RANGOS_CONCEDIBLES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "127.0.0.0/8"];
const concedible = (ip) => RANGOS_CONCEDIBLES.some((r) => enCidr(ip, r));

/** Subredes IPv4 privadas de las interfaces de esta máquina (para la capa «LAN» y para nombres locales). */
function subredesLocales(interfaces) {
  const out = [];
  const tabla = typeof interfaces === "function" ? interfaces() : interfaces || os.networkInterfaces();
  for (const lista of Object.values(tabla || {})) {
    for (const i of lista || []) {
      if (i.family !== "IPv4" && i.family !== 4) continue;
      if (i.internal || !i.netmask || !concedible(i.address)) continue;
      const bits = i.netmask.split(".").reduce((n, x) => n + Number(x).toString(2).replace(/0/g, "").length, 0);
      if (bits >= 8) out.push(`${i.address}/${bits}`);
    }
  }
  return out;
}

/** ¿Esta dirección interna está dentro de la concesión? Solo IPv4 y solo rangos concedibles. */
function dentroDeConcesion(ip, c, subredes) {
  const v4 = v4De(ip);
  if (!c || !v4 || !concedible(v4)) return false;
  const rangos = [...(c.cidrs || [])];
  if (c.subredes) rangos.push(...subredes());
  return rangos.some((r) => enCidr(v4, r));
}

/**
 * Resuelve y valida un destino. Devuelve { ip, familia } o lanza Error(motivo).
 * `concedido`: null (solo públicas) o { hosts, cidrs, puertos, subredes }. (`true` queda solo como atajo de pruebas internas.)
 */
async function resolverSeguro(host, concedido, lookup, subredes) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || /[\s/@\\?#]/.test(h)) throw new Error("destino-no-valido");
  const libre = concedido === true;
  const c = concedido && typeof concedido === "object" ? concedido : null;
  const nombreConcedido = !!c && (net.isIP(h) || (c.hosts || []).map((x) => String(x).toLowerCase()).includes(h));
  if (!libre && (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) && !nombreConcedido) throw new Error("destino-interno");
  let direcciones;
  if (net.isIP(h)) direcciones = [{ address: h, family: net.isIPv6(h) ? 6 : 4 }];
  else {
    try {
      direcciones = await (lookup || dns.promises.lookup)(h, { all: true, verbatim: true });
    } catch {
      throw new Error("no-resuelve");
    }
  }
  if (!direcciones || !direcciones.length) throw new Error("no-resuelve");
  // Si CUALQUIERA de las direcciones es interna y no está en la concesión se rechaza todo (DNS que mezcla públicas y privadas,
  // o un nombre público que de pronto resuelve a 127.0.0.1 / 169.254.169.254 / otra máquina de la LAN).
  if (!libre) {
    for (const d of direcciones) {
      if (!ipInterna(d.address)) continue;
      if (!(nombreConcedido && dentroDeConcesion(d.address, c, subredes || subredesLocales))) throw new Error("destino-interno");
    }
  }
  return { ip: direcciones[0].address, familia: direcciones[0].family, todas: direcciones.map((d) => d.address) };
}

/** Sanea la concesión que llega de la página: listas cortas de texto/números, nada más. */
function concesionLimpia(x) {
  if (!x || typeof x !== "object") return null;
  const lista = (v, max, f) => (Array.isArray(v) ? v.filter(f).slice(0, max) : []);
  return {
    hosts: lista(x.hosts, 16, (h) => typeof h === "string" && h.length <= 253).map((h) => h.toLowerCase()),
    cidrs: lista(x.cidrs, 8, (c) => typeof c === "string" && /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(c)),
    puertos: lista(x.puertos, 8, (p) => Number.isInteger(p) && p > 0 && p < 65536),
    subredes: x.subredes === true,
  };
}

function crearPuertaLocal(opts) {
  const o = opts || {};
  const log = o.log || (() => {});
  const lookup = o.lookup;
  const conectar = o.conectar || ((puerto, ip, alListo) => net.connect({ host: ip, port: puerto }, alListo));
  const tlsOpciones = o.tlsOpciones || {};
  /** @type {Map<string, any>} */
  const tuberias = new Map();
  const pendientes = []; // tuberías de ENTRADA por abrir
  let esperaPendientes = null;
  let seq = 0;
  let servidorProxy = null;
  let puertoProxy = 0;
  let activo = false;
  let hayPagina = 0; // última vez (ms) que la página preguntó por `pendientes`

  const nuevoId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  /* ── Tuberías ── */
  function crearTuberia(rol, host, puerto) {
    if (tuberias.size >= MAX_TUBERIAS) throw new Error("ocupada");
    const t = {
      id: nuevoId(), rol, host, puerto, aPagina: [], espera: null, cerrada: false, motivo: "", ultimo: Date.now(),
      escribir: null, destruir: null, abierta: rol === "salida", alAbrir: null,
    };
    tuberias.set(t.id, t);
    return t;
  }
  function empujar(t, buf, cb) {
    t.aPagina.push({ buf, cb });
    t.ultimo = Date.now();
    if (t.espera) {
      const e = t.espera;
      t.espera = null;
      e();
    }
  }
  function cerrarTuberia(t, motivo) {
    if (t.cerrada) return;
    t.cerrada = true;
    t.motivo = motivo || "fin";
    if (t.alAbrir) t.alAbrir({ ok: false, m: t.motivo });
    try {
      t.destruir && t.destruir();
    } catch {}
    if (t.espera) {
      const e = t.espera;
      t.espera = null;
      e();
    }
    // Se borra cuando la página ya leyó el cierre o tras un rato.
    setTimeout(() => tuberias.delete(t.id), 30_000).unref();
  }
  function tomar(t) {
    const partes = [];
    let n = 0;
    while (t.aPagina.length && n < TROZO_LECTURA) {
      const e = t.aPagina[0];
      const sobra = TROZO_LECTURA - n;
      if (e.buf.length > sobra) {
        partes.push(e.buf.subarray(0, sobra));
        e.buf = e.buf.subarray(sobra);
        n += sobra;
        break;
      }
      partes.push(e.buf);
      n += e.buf.length;
      t.aPagina.shift();
      if (e.cb) e.cb();
    }
    return Buffer.concat(partes);
  }

  /** SALIDA: socket TCP real, tras validar el destino. */
  async function abrirSalida(host, puerto, concedido) {
    // La política de puertos es de la página (ajustes); aquí solo se exige un puerto válido (y 443 por defecto en `fetch`).
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error("puerto-no-permitido");
    // PTA1108C: lo privado exige una concesión CON ese puerto; nunca un puerto cualquiera.
    if (concedido && typeof concedido === "object" && !(Array.isArray(concedido.puertos) && concedido.puertos.includes(puerto))) throw new Error("puerto-no-permitido");
    const { ip, todas } = await resolverSeguro(host, concedido, lookup, o.subredes);
    const t = crearTuberia("salida", host, puerto);
    await new Promise((res, rej) => {
      let s = null;
      s = conectar(puerto, ip, () => {
        // Segunda comprobación con la dirección REAL del socket: debe ser una de las ya validadas.
        const r = s && s.remoteAddress;
        if (r && !todas.includes(r) && !todas.includes(String(r).replace(/^::ffff:/, ""))) {
          cerrarTuberia(t, "socket:destino");
          return rej(new Error("destino-interno"));
        }
        res();
      });
      t.escribir = (b) => new Promise((r) => (s.write(b) ? r() : s.once("drain", r)));
      t.destruir = () => s.destroy();
      s.setNoDelay && s.setNoDelay(true);
      s.setTimeout && s.setTimeout(INACTIVA_MS, () => cerrarTuberia(t, "inactivo"));
      s.on("data", (b) => {
        empujar(t, b);
        // Contrapresión: si la página no lee, se pausa el socket.
        if (t.aPagina.length > 32 && s.pause) {
          s.pause();
          t.reanudar = () => s.resume();
        }
      });
      s.on("error", (e) => {
        cerrarTuberia(t, "socket:" + String((e && e.code) || "error").slice(0, 24));
        rej(new Error("no-conecta"));
      });
      s.on("close", () => cerrarTuberia(t, "fin"));
    }).catch((e) => {
      tuberias.delete(t.id);
      throw e;
    });
    return t;
  }

  /** ENTRADA: un Duplex que la página rellena/vacía a través de la malla. */
  function abrirEntrada(host, puerto) {
    const t = crearTuberia("entrada", host, puerto);
    const dup = new Duplex({
      write(chunk, _e, cb) {
        empujar(t, Buffer.from(chunk), () => cb());
      },
      read() {},
      destroy(err, cb) {
        cerrarTuberia(t, err ? "error" : "fin");
        cb(err);
      },
    });
    t.escribir = async (b) => {
      dup.push(b);
    };
    t.destruir = () => dup.destroy();
    t.alCerrarCliente = () => dup.push(null);
    const abierto = new Promise((res) => {
      t.alAbrir = res;
      setTimeout(() => res({ ok: false, m: "sin-respuesta" }), PLAZO_ABRIR_MS).unref();
    });
    pendientes.push({ id: t.id, host, port: puerto });
    if (esperaPendientes) {
      const e = esperaPendientes;
      esperaPendientes = null;
      e();
    }
    return { t, dup, abierto: abierto.then((r) => (r.ok ? r : (cerrarTuberia(t, r.m), r))) };
  }

  /* ── Proxy HTTP en 127.0.0.1 (CONNECT y HTTP simple) ── */
  function arrancarProxy() {
    if (servidorProxy) return Promise.resolve(puertoProxy);
    return new Promise((res, rej) => {
      const srv = http.createServer((req, resp) => {
        if (!activo || !hayPaginaViva()) {
          resp.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
          return resp.end("Sin salida por la malla ahora mismo.");
        }
        let u;
        try {
          u = new URL(req.url);
        } catch {
          resp.writeHead(400);
          return resp.end();
        }
        if (u.protocol !== "http:") {
          resp.writeHead(501);
          return resp.end("Solo CONNECT para https.");
        }
        const puerto = Number(u.port || 80);
        const { t, dup, abierto } = abrirEntrada(u.hostname, puerto);
        const cab = { ...req.headers };
        delete cab["proxy-connection"];
        delete cab["proxy-authorization"];
        abierto.then((r) => {
          if (!r.ok) {
            resp.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
            return resp.end("La puerta no pudo abrir el túnel: " + r.m);
          }
          const pet = http.request({ createConnection: () => dup, method: req.method, path: u.pathname + u.search, headers: cab }, (rr) => {
            resp.writeHead(rr.statusCode || 502, rr.headers);
            rr.pipe(resp);
          });
          pet.on("error", () => {
            if (!resp.headersSent) resp.writeHead(502);
            resp.end();
            cerrarTuberia(t, "error");
          });
          req.pipe(pet);
        });
      });
      srv.on("connect", (req, socket, cabeza) => {
        socket.on("error", () => socket.destroy());
        const m = /^([^:]+|\[[^\]]+\]):(\d{1,5})$/.exec(String(req.url || ""));
        if (!activo || !hayPaginaViva() || !m) {
          socket.end("HTTP/1.1 " + (m ? "503" : "400") + " Sin salida\r\nconnection: close\r\n\r\n");
          return;
        }
        const { t, dup, abierto } = abrirEntrada(m[1].replace(/^\[|\]$/g, ""), Number(m[2]));
        abierto.then((r) => {
          if (!r.ok) return socket.end("HTTP/1.1 502 Puerta\r\nconnection: close\r\nx-puerta-motivo: " + String(r.m).replace(/[^\w:-]/g, "").slice(0, 40) + "\r\n\r\n");
          socket.write("HTTP/1.1 200 Conectado\r\n\r\n");
          if (cabeza && cabeza.length) dup.write(cabeza);
          socket.pipe(dup);
          dup.pipe(socket);
          socket.on("close", () => cerrarTuberia(t, "fin"));
          dup.on("close", () => socket.destroy());
        });
      });
      srv.on("error", rej);
      srv.listen(0, "127.0.0.1", () => {
        servidorProxy = srv;
        puertoProxy = srv.address().port;
        res(puertoProxy);
      });
    });
  }
  function pararProxy() {
    if (servidorProxy) {
      try {
        servidorProxy.close();
        servidorProxy.closeAllConnections && servidorProxy.closeAllConnections();
      } catch {}
    }
    servidorProxy = null;
    puertoProxy = 0;
  }
  const hayPaginaViva = () => Date.now() - hayPagina < ESPERA_LARGA_MS + 8_000;

  /* ── fetch con TLS de punta a punta ── */
  const SALTAR = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding", "keep-alive", "upgrade", "te", "trailer", "cookie", "proxy-authorization", "origin", "referer", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"]);
  async function hacerFetch(req, resp, cuerpo) {
    let p;
    try {
      p = JSON.parse(decodeURIComponent(String(req.headers["x-puerta-peticion"] || "")));
    } catch {
      return json(resp, 400, { error: "peticion-no-valida" });
    }
    let u;
    try {
      u = new URL(p.url);
    } catch {
      return json(resp, 400, { error: "url-no-valida" });
    }
    // PTA1108C: un puerto distinto de 443 solo si la página lo pide por una capa (la puerta de la malla lo vuelve a comprobar).
    const puertoFetch = Number(u.port || 443);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443" && !o.permitirPuertoFetch && !(p.capa === true && Number.isInteger(puertoFetch) && puertoFetch > 0 && puertoFetch < 65536))) return json(resp, 400, { error: "url-no-valida" });
    const metodo = String(p.metodo || "GET").toUpperCase();
    if (!/^[A-Z]{3,7}$/.test(metodo)) return json(resp, 400, { error: "metodo-no-valido" });
    if (!activo || !hayPaginaViva()) return json(resp, 503, { error: "sin-pagina" });
    const cab = { host: u.host, "accept-encoding": "identity", connection: "close" };
    for (const [k, v] of Array.isArray(p.cabeceras) ? p.cabeceras : []) {
      const kk = String(k).toLowerCase();
      if (!SALTAR.has(kk) && /^[a-z0-9-]{1,64}$/.test(kk)) cab[kk] = String(v).slice(0, 4096);
    }
    if (cuerpo && cuerpo.length) cab["content-length"] = String(cuerpo.length);
    let e;
    try {
      e = abrirEntrada(u.hostname, Number(u.port || 443));
    } catch (x) {
      return json(resp, 503, { error: String(x.message) });
    }
    const r = await e.abierto;
    if (!r.ok) return json(resp, 502, { error: r.m });
    const sock = tls.connect({ ...tlsOpciones, socket: e.dup, servername: net.isIP(u.hostname) ? undefined : u.hostname });
    sock.on("error", () => cerrarTuberia(e.t, "tls"));
    const pet = https.request({ createConnection: () => sock, method: metodo, path: u.pathname + u.search, headers: cab }, (rr) => {
      const cabs = [];
      for (const [k, v] of Object.entries(rr.headers)) if (!["content-encoding", "transfer-encoding", "connection", "keep-alive"].includes(k)) cabs.push([k, Array.isArray(v) ? v.join(", ") : String(v)]);
      resp.writeHead(200, {
        "x-puerta-respuesta": encodeURIComponent(JSON.stringify({ status: rr.statusCode, statusText: rr.statusMessage || "", cabeceras: cabs })),
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      let n = 0;
      rr.on("data", (b) => {
        n += b.length;
        if (n > MAX_CUERPO_FETCH * 8) {
          rr.destroy();
          resp.destroy();
          return;
        }
        resp.write(b);
      });
      rr.on("end", () => {
        resp.end();
        cerrarTuberia(e.t, "fin");
      });
      rr.on("error", () => resp.destroy());
    });
    pet.setTimeout(30_000, () => pet.destroy(new Error("plazo")));
    pet.on("error", () => {
      if (!resp.headersSent) json(resp, 502, { error: "tls-o-red" });
      else resp.destroy();
      cerrarTuberia(e.t, "error");
    });
    pet.end(cuerpo && cuerpo.length ? cuerpo : undefined);
  }

  /* ── HTTP hacia la página ── */
  function json(resp, codigo, cuerpo) {
    const s = JSON.stringify(cuerpo);
    resp.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(s), "cache-control": "no-store", "x-content-type-options": "nosniff" });
    resp.end(s);
  }
  function leerCuerpo(req, tope) {
    return new Promise((res, rej) => {
      const partes = [];
      let n = 0;
      req.on("data", (b) => {
        n += b.length;
        if (n > tope) {
          rej(new Error("cuerpo-grande"));
          req.destroy();
          return;
        }
        partes.push(b);
      });
      req.on("end", () => res(Buffer.concat(partes)));
      req.on("error", rej);
    });
  }

  async function manejar(req, resp) {
    const u = new URL(req.url, "http://x");
    const accion = u.pathname.slice(PREFIJO.length);
    if (req.method !== "POST") return json(resp, 405, { error: "solo-post" });
    try {
      if (accion === "modo") {
        const c = JSON.parse((await leerCuerpo(req, 4096)).toString("utf8") || "{}");
        activo = c.activo === true;
        if (activo) {
          if (c.proxy !== false) await arrancarProxy();
        } else {
          pararProxy();
          for (const t of tuberias.values()) if (t.rol === "entrada") cerrarTuberia(t, "modo-apagado");
        }
        return json(resp, 200, { activo, proxy: puertoProxy || null });
      }
      if (accion === "estado") return json(resp, 200, { activo, proxy: puertoProxy || null, tuberias: tuberias.size, pagina: hayPaginaViva(), subredes: subredesLocales(o.interfaces).slice(0, 8) /* PTA1108C */ });
      if (accion === "tcp") {
        const c = JSON.parse((await leerCuerpo(req, 4096)).toString("utf8") || "{}");
        try {
          // PTA1108C: `permitirPrivadas` ya no existe; solo una concesión explícita de la política de la página.
          const t = await abrirSalida(String(c.host || ""), Number(c.port), concesionLimpia(c.concedido));
          return json(resp, 200, { id: t.id });
        } catch (e) {
          return json(resp, 200, { error: /^[a-z-]{3,30}$/.test(String(e.message)) ? e.message : "no-conecta" });
        }
      }
      if (accion === "pendientes") {
        hayPagina = Date.now();
        if (!pendientes.length) {
          await new Promise((r) => {
            esperaPendientes = r;
            setTimeout(r, ESPERA_LARGA_MS).unref();
          });
          esperaPendientes = null;
          hayPagina = Date.now();
        }
        return json(resp, 200, { tuberias: pendientes.splice(0, 16) });
      }
      if (accion === "fetch") {
        const cuerpo = await leerCuerpo(req, MAX_CUERPO_FETCH);
        return await hacerFetch(req, resp, cuerpo);
      }
      const t = tuberias.get(u.searchParams.get("id") || "");
      if (!t) return json(resp, 404, { error: "no-existe" });
      t.ultimo = Date.now();
      if (accion === "abierto") {
        const c = JSON.parse((await leerCuerpo(req, 1024)).toString("utf8") || "{}");
        if (t.alAbrir) t.alAbrir(c.ok === true ? { ok: true } : { ok: false, m: String(c.m || "rechazada").slice(0, 40) });
        t.alAbrir = null;
        t.abierta = c.ok === true;
        return json(resp, 200, { ok: true });
      }
      if (accion === "leer") {
        if (!t.aPagina.length && !t.cerrada) {
          await new Promise((r) => {
            t.espera = r;
            setTimeout(r, ESPERA_LARGA_MS).unref();
          });
          t.espera = null;
        }
        const b = tomar(t);
        if (t.reanudar && t.aPagina.length < 8) {
          t.reanudar();
          t.reanudar = null;
        }
        const cab = { "content-type": "application/octet-stream", "content-length": b.length, "cache-control": "no-store", "x-content-type-options": "nosniff" };
        if (t.cerrada && !t.aPagina.length) cab["x-puerta-cierre"] = encodeURIComponent(t.motivo || "fin");
        resp.writeHead(b.length || cab["x-puerta-cierre"] ? 200 : 204, cab);
        return resp.end(b);
      }
      if (accion === "escribir") {
        const b = await leerCuerpo(req, MAX_CUERPO_ESCRIBIR);
        if (t.cerrada || !t.escribir) return json(resp, 410, { error: "cerrada" });
        await t.escribir(b);
        return json(resp, 200, { ok: true });
      }
      if (accion === "cerrar") {
        if (t.alCerrarCliente) t.alCerrarCliente();
        cerrarTuberia(t, "fin");
        return json(resp, 200, { ok: true });
      }
      return json(resp, 404, { error: "accion" });
    } catch (e) {
      if (!resp.headersSent) json(resp, 400, { error: String((e && e.message) || "error").slice(0, 60) });
      else resp.destroy();
    }
  }

  /* ── PTA1108B · HTTPS de la propia app por la malla (las /api/* relativas hacia la web publicada) ── */
  /** ¿Hay salida por la malla ahora? (modo encendido y la página escuchando para abrir túneles). */
  const disponibleMalla = () => activo && hayPaginaViva();
  /**
   * Un `https.Agent` cuyas conexiones son túneles de la malla: TLS de punta a punta en Node (la puerta solo ve bytes
   * cifrados). Sin reutilización de sockets: cada petición, un túnel. Si el túnel no se abre, el error lleva
   * `starseedNoEnviado` (no salió ni un byte de la petición) y `starseedRed` (cuenta como fallo de red).
   */
  function agenteMalla() {
    const agente = new https.Agent({ keepAlive: false, maxSockets: 16 });
    agente.createConnection = (opciones, cb) => {
      const host = String(opciones.host || opciones.hostname || "");
      const puerto = Number(opciones.port) || 443;
      const fallar = (motivo) => {
        const e = new Error("puerta: " + motivo);
        e.code = "ENETUNREACH";
        e.starseedRed = true;
        e.starseedNoEnviado = true;
        cb(e);
      };
      if (!disponibleMalla()) return fallar("sin-salida");
      // PTA1108C + PTA1108B: este agente solo sirve a la web publicada (pública). Nunca lleva una concesión de capas, así que
      // cualquier destino interno (IP privada, localhost, .local, .internal) se corta aquí, sin abrir túnel. Lo demás lo
      // vuelve a comprobar la puerta al resolver (DNS rebinding) con `resolverSeguro(host, null)`: ningún camino lo salta.
      const h = host.toLowerCase().replace(/\.$/, "");
      if (!o.agenteDestinoLibre /* solo pruebas */ && (!h || (net.isIP(h) && ipInterna(h)) || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal"))) {
        return fallar("destino-interno");
      }
      let e;
      try {
        e = abrirEntrada(host, puerto);
      } catch (x) {
        return fallar(String((x && x.message) || "error").slice(0, 40));
      }
      e.abierto.then((r) => {
        if (!r.ok) return fallar(String(r.m || "rechazada").slice(0, 40));
        const sock = tls.connect({ ...tlsOpciones, socket: e.dup, servername: net.isIP(host) ? undefined : opciones.servername || host });
        sock.on("error", () => cerrarTuberia(e.t, "tls"));
        sock.on("close", () => cerrarTuberia(e.t, "fin"));
        cb(null, sock);
      });
    };
    return agente;
  }

  // Barrido de tuberías sin movimiento.
  const barrido = setInterval(() => {
    const ahora = Date.now();
    for (const t of tuberias.values()) if (!t.cerrada && ahora - t.ultimo > INACTIVA_MS) cerrarTuberia(t, "inactivo");
  }, 30_000);
  barrido.unref();

  return {
    manejar,
    parar() {
      clearInterval(barrido);
      activo = false;
      pararProxy();
      for (const t of tuberias.values()) cerrarTuberia(t, "parada");
    },
    estado: () => ({ activo, proxy: puertoProxy || null, tuberias: tuberias.size }),
    disponibleMalla, // PTA1108B
    agenteMalla, // PTA1108B
    _interno: { abrirSalida, abrirEntrada, tuberias, pendientes, activar: (v) => { activo = v; hayPagina = Date.now(); }, arrancarProxy, agenteMalla },
  };
}

function habilitada(env) {
  return !(env && String(env.STARSEED_PUERTA) === "0");
}

module.exports = { PREFIJO, ipInterna, resolverSeguro, dentroDeConcesion, subredesLocales, concesionLimpia, crearPuertaLocal, habilitada };
