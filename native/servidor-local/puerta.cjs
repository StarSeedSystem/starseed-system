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

/** Resuelve y valida un destino. Devuelve { ip, familia } o lanza Error(motivo). */
async function resolverSeguro(host, permitirPrivadas, lookup) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || /[\s/@\\?#]/.test(h)) throw new Error("destino-no-valido");
  if (!permitirPrivadas && (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal"))) throw new Error("destino-interno");
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
  // Si CUALQUIERA de las direcciones es interna se rechaza todo (contra DNS que mezcla públicas y privadas).
  if (!permitirPrivadas && direcciones.some((d) => ipInterna(d.address))) throw new Error("destino-interno");
  return { ip: direcciones[0].address, familia: direcciones[0].family };
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
  async function abrirSalida(host, puerto, permitirPrivadas) {
    // La política de puertos es de la página (ajustes); aquí solo se exige un puerto válido (y 443 por defecto en `fetch`).
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new Error("puerto-no-permitido");
    const { ip } = await resolverSeguro(host, !!permitirPrivadas, lookup);
    const t = crearTuberia("salida", host, puerto);
    await new Promise((res, rej) => {
      const s = conectar(puerto, ip, () => res());
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
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443" && !o.permitirPuertoFetch)) return json(resp, 400, { error: "url-no-valida" });
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
      if (accion === "estado") return json(resp, 200, { activo, proxy: puertoProxy || null, tuberias: tuberias.size, pagina: hayPaginaViva() });
      if (accion === "tcp") {
        const c = JSON.parse((await leerCuerpo(req, 4096)).toString("utf8") || "{}");
        try {
          const t = await abrirSalida(String(c.host || ""), Number(c.port), c.permitirPrivadas === true);
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
    _interno: { abrirSalida, abrirEntrada, tuberias, pendientes, activar: (v) => { activo = v; hayPagina = Date.now(); }, arrancarProxy },
  };
}

function habilitada(env) {
  return !(env && String(env.STARSEED_PUERTA) === "0");
}

module.exports = { PREFIJO, ipInterna, resolverSeguro, crearPuertaLocal, habilitada };
