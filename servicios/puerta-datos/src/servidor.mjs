// Servidor HTTP de la puerta (solo 127.0.0.1; el TLS lo pone Caddy). Rutas en
// architecture/puerta-datos-a1.md §4.2. Reglas: JSON y nada más, cuerpo ≤ 64 KB, CORS solo para
// los orígenes del OS y sin cookies, un cubo de peticiones por identidad, registros sin fichas
// ni IPs, errores con texto legible.

import { createServer } from "node:http";
import { ErrorValidacion } from "./bus.mjs";
import { pareceFicha } from "./fichas.mjs";
import { pareceJwt } from "./jwt.mjs";

const CUERPO_MAX = 64 * 1024;
const CABECERAS_BASE = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cache-control": "no-store",
};

class ErrorHttp extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/** Cubo de fichas por identidad: `porMin` por minuto con ráfaga igual. */
export function crearLimitador({ ahora = () => Date.now() } = {}) {
  const cubos = new Map();
  return function permitir(clave, porMin) {
    const t = ahora();
    const c = cubos.get(clave) ?? { fichas: porMin, t };
    c.fichas = Math.min(porMin, c.fichas + ((t - c.t) / 60_000) * porMin);
    c.t = t;
    if (c.fichas < 1) {
      cubos.set(clave, c);
      return false;
    }
    c.fichas -= 1;
    cubos.set(clave, c);
    if (cubos.size > 20_000) cubos.delete(cubos.keys().next().value);
    return true;
  };
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let total = 0;
    let excedido = false;
    req.on("data", (t) => {
      if (excedido) return; // se drena sin guardar; la respuesta 413 cierra la conexión
      total += t.length;
      if (total > CUERPO_MAX) {
        excedido = true;
        trozos.length = 0;
        rechazar(new ErrorHttp(413, "cuerpo de más de 64 KB"));
        return;
      }
      trozos.push(t);
    });
    req.on("end", () => {
      if (excedido) return;
      if (total === 0) return resolver({});
      try {
        const v = JSON.parse(Buffer.concat(trozos).toString("utf8"));
        resolver(v && typeof v === "object" ? v : {});
      } catch {
        rechazar(new ErrorHttp(400, "JSON no válido"));
      }
    });
    req.on("error", () => rechazar(new ErrorHttp(400, "cuerpo interrumpido")));
  });
}

/**
 * @param {object} c componentes: config, verificador, fichero, bus, arriendo, presencia, malla,
 *   cache, replica, metricas, esMetagenesis, estadoCaddy, ahora, registrar
 */
export function crearManejador(c) {
  const ahora = c.ahora ?? (() => Date.now());
  const permitir = crearLimitador({ ahora });
  const arranque = ahora();
  const origenes = new Set(c.config.origenes);
  const registrar = c.registrar ?? (() => {});

  async function identidad(req) {
    const h = String(req.headers.authorization || "");
    const m = /^Bearer\s+(\S+)$/i.exec(h);
    if (!m) return { tipo: "nadie" };
    const t = m[1];
    if (pareceFicha(t)) {
      const f = c.fichero.comprobar(t);
      if (!f) throw new ErrorHttp(401, "ficha no válida o revocada");
      return { tipo: "ficha", nombre: f.nombre, ambitos: f.ambitos };
    }
    if (pareceJwt(t)) {
      const v = await c.verificador.verificar(t);
      if (!v.ok) throw new ErrorHttp(v.codigo, v.motivo);
      return { tipo: "cuenta", cuenta: v.cuenta, jwt: t };
    }
    throw new ErrorHttp(401, "credencial no reconocida");
  }

  const exigir = {
    ambito(id, a) {
      if (id.tipo === "ficha" && (id.ambitos.includes(a) || id.ambitos.includes("admin"))) return;
      throw new ErrorHttp(id.tipo === "nadie" ? 401 : 403, `hace falta una ficha con el ámbito «${a}»`);
    },
    cuenta(id) {
      if (id.tipo !== "cuenta") throw new ErrorHttp(401, "hace falta la sesión de una cuenta");
    },
    cuentaOAmbito(id, a) {
      if (id.tipo === "cuenta") return;
      exigir.ambito(id, a);
    },
    async miembroOAmbito(id, a) {
      if (id.tipo === "cuenta") {
        if (await c.esMetagenesis(id.cuenta, id.jwt)) return;
        throw new ErrorHttp(403, "solo miembros de MetaGenesis");
      }
      exigir.ambito(id, a);
    },
  };

  /** [método, patrón, manejador(ctx) → objeto] */
  const rutas = [
    ["GET", /^\/salud$/, async () => {
      const r = c.replica.estado();
      return {
        ok: true,
        version: c.config.version,
        arriba_s: Math.round((ahora() - arranque) / 1000),
        almacen: "ok",
        jwks: c.verificador.estado().ok ? "ok" : "sin-claves",
        caddy: c.estadoCaddy?.()?.ok ? "ok" : "pendiente",
        replica: { activa: r.activa, pendientes: r.pendientes, hoy: r.hoy, sin_migracion: r.sin_migracion },
        hora: new Date(ahora()).toISOString(),
      };
    }],
    ["GET", /^\/v1\/yo$/, async ({ id }) => {
      if (id.tipo === "cuenta") return { tipo: "cuenta", cuenta: id.cuenta, es_metagenesis: await c.esMetagenesis(id.cuenta, id.jwt) };
      if (id.tipo === "ficha") return { tipo: "ficha", nombre: id.nombre, ambitos: id.ambitos };
      throw new ErrorHttp(401, "sin credencial");
    }],
    ["POST", /^\/v1\/bus\/eventos$/, async ({ id, cuerpo }) => {
      exigir.cuentaOAmbito(id, "bus");
      const origen = id.tipo === "cuenta" ? `cuenta:${id.cuenta.replace(/-/g, "").slice(0, 10)}` : `ficha:${id.nombre}`;
      const lista = Array.isArray(cuerpo.eventos) ? cuerpo.eventos.slice(0, 50) : [cuerpo];
      const ids = lista.map((e) => c.bus.publicar(e, origen));
      c.metricas.servida("bus", ids.length);
      return { ids, id: ids[ids.length - 1] };
    }],
    ["GET", /^\/v1\/bus\/eventos$/, async ({ id, q, senal }) => {
      exigir.cuentaOAmbito(id, "bus");
      const filtro = {
        desde: Number(q.get("desde") || 0),
        tipos: (q.get("tipos") || "").split(",").filter(Boolean),
        excluir: (q.get("excluir") || "").split(",").filter(Boolean),
        limite: Number(q.get("limite") || 200),
        horas: Number(q.get("horas") || 0),
      };
      const r = await c.bus.leerEsperando(filtro, Number(q.get("esperar") || 0), senal);
      c.metricas.servida("bus");
      return r;
    }],
    ["POST", /^\/v1\/latidos$/, async ({ id, cuerpo }) => {
      exigir.ambito(id, "latidos");
      const lista = Array.isArray(cuerpo.latidos) ? cuerpo.latidos.slice(0, 50) : [cuerpo];
      for (const l of lista) c.malla.latir(l.clase, l.id, l.datos ?? null, id.nombre);
      c.metricas.servida("latidos", lista.length);
      return { ok: true, n: lista.length };
    }],
    ["GET", /^\/v1\/latidos$/, async ({ id, q }) => {
      await exigir.miembroOAmbito(id, "latidos");
      c.metricas.servida("latidos");
      return { latidos: c.malla.latidos(q.get("clase") || null, Number(q.get("vivos_s") || 3600) * 1000) };
    }],
    ["POST", /^\/v1\/neuronas\/latido$/, async ({ id, cuerpo }) => {
      exigir.cuenta(id);
      const r = c.presencia.latirNeurona(id.cuenta, cuerpo);
      c.metricas.servida("neuronas");
      return r;
    }],
    ["GET", /^\/v1\/neuronas$/, async ({ id }) => {
      exigir.cuenta(id);
      c.metricas.servida("neuronas");
      return { neuronas: c.presencia.neuronasDe(id.cuenta) };
    }],
    ["POST", /^\/v1\/presencia$/, async ({ id, cuerpo }) => {
      exigir.cuenta(id);
      c.metricas.servida("presencia");
      return c.presencia.marcarPresencia(id.cuenta, { visible: typeof cuerpo.visible === "boolean" ? cuerpo.visible : undefined });
    }],
    ["GET", /^\/v1\/presencia$/, async ({ id, q }) => {
      exigir.cuenta(id);
      c.metricas.servida("presencia");
      return { presencia: c.presencia.presenciaDe(id.cuenta, (q.get("cuentas") || "").split(",")) };
    }],
    ["POST", /^\/v1\/metagenesis\/latir$/, async ({ cuerpo }) => {
      const r = c.arriendo.latir(cuerpo);
      c.metricas.servida("metagenesis");
      return r;
    }],
    ["POST", /^\/v1\/metagenesis\/ceder$/, async ({ cuerpo }) => ({ ok: c.arriendo.ceder(cuerpo) })],
    ["POST", /^\/v1\/metagenesis\/baja$/, async ({ cuerpo }) => ({ ok: c.arriendo.baja(cuerpo) })],
    ["POST", /^\/v1\/metagenesis\/foto$/, async ({ cuerpo }) => {
      c.metricas.servida("metagenesis");
      return { ok: c.arriendo.foto(cuerpo) };
    }],
    ["POST", /^\/v1\/metagenesis\/orden-resultado$/, async ({ cuerpo }) => ({ ok: c.arriendo.resultadoOrden(cuerpo) })],
    ["GET", /^\/v1\/metagenesis\/arriendo$/, async ({ id }) => {
      await exigir.miembroOAmbito(id, "metagenesis");
      c.metricas.servida("metagenesis");
      return { arriendo: c.arriendo.leerArriendo(), nodos: c.arriendo.nodosVivos(900_000), ordenes: c.arriendo.ordenesRecientes(20) };
    }],
    ["POST", /^\/v1\/metagenesis\/ordenes$/, async ({ id, cuerpo }) => {
      exigir.cuenta(id);
      if (!(await c.esMetagenesis(id.cuenta, id.jwt))) throw new ErrorHttp(403, "solo miembros de MetaGenesis");
      c.metricas.servida("metagenesis");
      return { id: c.arriendo.crearOrden(id.cuenta, cuerpo) };
    }],
    ["POST", /^\/v1\/admin\/nodos$/, async ({ id, cuerpo }) => {
      exigir.ambito(id, "admin");
      if (cuerpo.revocar) return { ok: c.arriendo.revocar(String(cuerpo.nodo || "")) };
      return { ok: c.arriendo.registrar(cuerpo.nodo, cuerpo.medio, cuerpo.huella) };
    }],
    ["POST", /^\/v1\/malla\/nodos$/, async ({ id, cuerpo }) => {
      exigir.ambito(id, "malla");
      const nodo = c.malla.registrarNodo(cuerpo.nodo ?? cuerpo, id.nombre);
      c.metricas.servida("malla");
      return { ok: true, node_id: nodo.node_id, updated_at: nodo.updated_at };
    }],
    ["GET", /^\/v1\/malla\/nodos$/, async ({ id, q }) => {
      exigir.ambito(id, "malla");
      c.metricas.servida("malla");
      return { nodos: c.malla.nodosVivos(Number(q.get("vivos_s") || 900) * 1000) };
    }],
    ["PUT", /^\/v1\/astraura\/estado\/([a-z_]+)$/, async ({ id, cuerpo, m }) => {
      exigir.ambito(id, "astraura");
      c.metricas.servida("astraura");
      return c.malla.ponerEstado(m[1], cuerpo.data ?? cuerpo.datos, id.nombre);
    }],
    ["GET", /^\/v1\/astraura\/estado\/([a-z_]+)$/, async ({ id, m }) => {
      if (id.tipo !== "ficha" || !(id.ambitos.includes("astraura") || id.ambitos.includes("malla") || id.ambitos.includes("admin"))) {
        throw new ErrorHttp(id.tipo === "nadie" ? 401 : 403, "hace falta una ficha de Astraura o de la malla");
      }
      c.metricas.servida("astraura");
      const e = c.malla.leerEstado(m[1]);
      if (!e) throw new ErrorHttp(404, "sin estado publicado");
      return e;
    }],
    ["PUT", /^\/v1\/freno$/, async ({ id, cuerpo }) => {
      exigir.ambito(id, "freno");
      return c.malla.ponerFreno(cuerpo);
    }],
    ["GET", /^\/v1\/freno$/, async () => {
      const empujado = c.malla.leerFreno();
      if (empujado) {
        c.metricas.servida("freno");
        return { freno: empujado, fuente: "vigia" };
      }
      const r = await c.cache.leer("freno");
      if (!r.ok) throw new ErrorHttp(r.codigo ?? 502, r.error ?? "sin freno");
      if (r.desde_cache) c.metricas.servida("freno");
      return { freno: Array.isArray(r.datos) ? r.datos[0] ?? null : r.datos, fuente: "supabase", obsoleto: Boolean(r.obsoleto) };
    }],
    ["GET", /^\/v1\/cache\/([a-z_]+)$/, async ({ id, m }) => {
      const r = await c.cache.leer(m[1], { jwt: id.tipo === "cuenta" ? id.jwt : null });
      if (!r.ok) throw new ErrorHttp(r.codigo ?? 502, r.error ?? "fallo");
      if (r.desde_cache) c.metricas.servida("cache");
      return { datos: r.datos, obsoleto: Boolean(r.obsoleto) };
    }],
    ["GET", /^\/v1\/metricas$/, async ({ id }) => {
      await exigir.miembroOAmbito(id, "metricas");
      return {
        hoy: c.metricas.delDia(),
        historial: c.metricas.historial(14),
        replica: c.replica.estado(),
        presencia: c.presencia.resumen(),
        cache: c.cache.estado(),
        jwks: c.verificador.estado(),
        bus: { esperando: c.bus.esperandoAhora() },
        caddy: c.estadoCaddy?.() ?? null,
      };
    }],
  ];

  function cabecerasCors(origen) {
    if (!origen || !origenes.has(origen)) return {};
    return {
      "access-control-allow-origin": origen,
      vary: "Origin",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
      "access-control-max-age": "600",
    };
  }

  return async function manejar(req, res) {
    const inicio = ahora();
    const origen = req.headers.origin ? String(req.headers.origin) : "";
    const cors = cabecerasCors(origen);
    const responder = (codigo, cuerpo) => {
      if (res.headersSent) return;
      res.writeHead(codigo, { ...CABECERAS_BASE, ...cors, ...(codigo === 413 ? { connection: "close" } : {}) });
      res.end(JSON.stringify(cuerpo));
    };
    let ruta = "?";
    try {
      const url = new URL(req.url || "/", "http://puerta.local");
      ruta = url.pathname;
      if (origen && !origenes.has(origen)) throw new ErrorHttp(403, "origen no admitido");
      if (req.method === "OPTIONS") {
        res.writeHead(204, { ...CABECERAS_BASE, ...cors });
        res.end();
        return;
      }
      const encontrada = rutas.find(([m, p]) => m === req.method && p.test(url.pathname));
      if (!encontrada) {
        const otroMetodo = rutas.some(([, p]) => p.test(url.pathname));
        throw new ErrorHttp(otroMetodo ? 405 : 404, otroMetodo ? "método no admitido" : "ruta desconocida");
      }
      if (req.method !== "GET" && !String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
        throw new ErrorHttp(415, "solo JSON");
      }
      const id = await identidad(req);
      const clave = id.tipo === "cuenta" ? `c:${id.cuenta}` : id.tipo === "ficha" ? `f:${id.nombre}` : `ip:${String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim()}`;
      const porMin = id.tipo === "ficha" ? 600 : id.tipo === "cuenta" ? 120 : 60;
      if (!permitir(clave, porMin)) throw new ErrorHttp(429, "demasiadas peticiones; vuelve en un minuto");
      const cuerpo = req.method === "GET" ? {} : await leerCuerpo(req);
      const ac = new AbortController();
      res.on("close", () => ac.abort());
      const m = encontrada[1].exec(url.pathname);
      const salida = await encontrada[2]({ id, cuerpo, q: url.searchParams, m, senal: ac.signal });
      responder(200, salida);
      registrar({ ruta, codigo: 200, ms: ahora() - inicio });
    } catch (e) {
      const codigo = e instanceof ErrorHttp || e instanceof ErrorValidacion ? e.codigo : 500;
      const mensaje = codigo === 500 ? "error interno de la puerta" : e.message;
      if (codigo === 500) registrar({ ruta, codigo, ms: ahora() - inicio, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      else registrar({ ruta, codigo, ms: ahora() - inicio });
      responder(codigo, { error: mensaje });
    }
  };
}

export function crearServidor(componentes) {
  const servidor = createServer(crearManejador(componentes));
  servidor.headersTimeout = 30_000;
  servidor.requestTimeout = 40_000;
  servidor.keepAliveTimeout = 30_000;
  return servidor;
}
