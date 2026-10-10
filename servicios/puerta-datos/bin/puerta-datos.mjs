#!/usr/bin/env node
// puerta-datos — la puerta de datos del A1 (architecture/puerta-datos-a1.md).
//
//   puerta-datos.mjs servir                         # el servicio (systemd: starseed-puerta-datos)
//   puerta-datos.mjs comprobar                      # /salud del servicio local
//   puerta-datos.mjs ficha nueva <nombre> <ámbitos> [--imprimir]   # sin --imprimir solo enseña la huella
//   puerta-datos.mjs ficha revocar <nombre>
//   puerta-datos.mjs fichas                         # nombres y ámbitos (nunca fichas ni huellas)
//   puerta-datos.mjs nodo registrar <nodo> <medio> <huella-sha256>
//   puerta-datos.mjs vaciar                         # una pasada de réplica ahora (antes de parar)
//   puerta-datos.mjs metricas                       # ahorro de hoy, en JSON

import { abrirAlmacen, podar } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { asegurarRutaCaddy } from "../src/caddy.mjs";
import { leerConfig, resumenConfig } from "../src/config.mjs";
import { crearFichero, huella, nuevaFicha, revocarFicha } from "../src/fichas.mjs";
import { crearVerificador } from "../src/jwt.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearServidor } from "../src/servidor.mjs";
import { crearCacheMetagenesis, crearSupabase } from "../src/supabase.mjs";
import { join } from "node:path";

const config = leerConfig();
const [orden, ...args] = process.argv.slice(2);

function log(obj) {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...obj })}\n`);
}

function componentes() {
  const db = abrirAlmacen(join(config.dirDatos, "puerta.db"));
  const metricas = crearMetricas(db);
  const malla = crearMalla(db);
  const frenoActivo = () => Boolean(malla.leerFreno()?.activo);
  const supabase = crearSupabase({ url: config.supabaseUrl, anon: config.supabaseAnon, metricas });
  const verificador = crearVerificador({ supabaseUrl: config.supabaseUrl, alPedir: () => metricas.aSupabase("jwks") });
  return {
    db,
    config,
    metricas,
    malla,
    supabase,
    verificador,
    fichero: crearFichero(config.archivoFichas),
    bus: crearBus(db),
    arriendo: crearArriendo(db),
    presencia: crearPresencia(db),
    cache: crearCache(supabase, { frenoActivo }),
    replica: crearReplica(db, supabase, { llave: config.llaveReplica, topeDia: config.replicaDia, frenoActivo }),
    esMetagenesis: crearCacheMetagenesis(supabase),
  };
}

async function servir() {
  const c = componentes();
  let caddy = { ok: false, accion: "pendiente" };
  c.estadoCaddy = () => caddy;
  c.registrar = (r) => {
    if (r.codigo >= 500 || r.error) log({ nivel: "error", ...r });
  };
  const servidor = crearServidor(c);
  await new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(c.config.puerto, c.config.escucha, resolver);
  });
  log({ nivel: "info", msg: "puerta de datos escuchando", ...resumenConfig(c.config) });
  c.verificador.cargar().catch(() => {});

  const temporizadores = [];
  const cada = (ms, fn) => {
    const t = setInterval(() => Promise.resolve().then(fn).catch((e) => log({ nivel: "error", msg: String(e?.message || e).slice(0, 200) })), ms);
    t.unref();
    temporizadores.push(t);
  };
  async function reconciliar() {
    if (!c.config.reconciliarCaddy) return;
    const antes = caddy.ok;
    caddy = await asegurarRutaCaddy({ admin: c.config.caddyAdmin, host: c.config.hostPublico, puerto: c.config.puerto });
    if (caddy.accion === "anadida" || antes !== caddy.ok) log({ nivel: "info", msg: "caddy", accion: caddy.accion, ok: caddy.ok, detalle: caddy.detalle });
  }
  await reconciliar();
  cada(10 * 60_000, reconciliar);
  cada(30_000, () => c.metricas.volcar());
  cada(c.config.replicaCadaMs, async () => {
    const r = await c.replica.pasada();
    if (r.hecho || (r.motivo && !/nada que replicar|esperando|sin llave/.test(r.motivo))) log({ nivel: "info", msg: "réplica", ...r });
  });
  cada(3_600_000, () => podar(c.db));

  let cerrando = false;
  async function cerrar(senal) {
    if (cerrando) return;
    cerrando = true;
    log({ nivel: "info", msg: `parando (${senal})` });
    for (const t of temporizadores) clearInterval(t);
    servidor.close();
    c.metricas.volcar();
    try {
      await Promise.race([c.replica.pasada({ forzar: true }), new Promise((r) => setTimeout(r, 8_000))]);
    } catch {
      /* lo pendiente sigue en la base para la próxima vez */
    }
    c.db.close();
    process.exit(0);
  }
  process.on("SIGTERM", () => cerrar("SIGTERM"));
  process.on("SIGINT", () => cerrar("SIGINT"));
}

async function comprobar() {
  try {
    const r = await fetch(`http://127.0.0.1:${config.puerto}/salud`, { signal: AbortSignal.timeout(5_000) });
    const j = await r.json();
    process.stdout.write(`${JSON.stringify(j)}\n`);
    process.exit(r.ok && j.ok ? 0 : 1);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: e instanceof Error ? e.name : "red" })}\n`);
    process.exit(1);
  }
}

async function main() {
  switch (orden) {
    case "servir":
      return servir();
    case "comprobar":
      return comprobar();
    case "ficha": {
      const [sub, nombre, ambitos] = args;
      if (sub === "nueva") {
        const ficha = nuevaFicha(config.archivoFichas, nombre, String(ambitos || "").split(",").filter(Boolean));
        if (args.includes("--imprimir")) process.stdout.write(`${ficha}\n`);
        else process.stdout.write(`ficha «${nombre}» creada · huella ${huella(ficha).slice(0, 12)}… (la ficha no se enseña: usa --imprimir solo para guardarla sin mirarla)\n`);
        return;
      }
      if (sub === "revocar") {
        process.stdout.write(revocarFicha(config.archivoFichas, nombre) ? `ficha «${nombre}» revocada\n` : `no hay ficha «${nombre}»\n`);
        return;
      }
      throw new Error("uso: ficha nueva <nombre> <ámbitos> | ficha revocar <nombre>");
    }
    case "fichas":
      process.stdout.write(`${JSON.stringify(crearFichero(config.archivoFichas).resumen(), null, 1)}\n`);
      return;
    case "nodo": {
      const [sub, nodo, medio, h] = args;
      if (sub !== "registrar") throw new Error("uso: nodo registrar <nodo> <medio> <huella>");
      const c = componentes();
      c.arriendo.registrar(nodo, medio, h);
      process.stdout.write(`nodo «${nodo}» registrado (${medio})\n`);
      c.db.close();
      return;
    }
    case "vaciar": {
      const c = componentes();
      const r = await c.replica.pasada({ forzar: true });
      process.stdout.write(`${JSON.stringify(r)}\n`);
      c.metricas.volcar();
      c.db.close();
      return;
    }
    case "metricas": {
      const c = componentes();
      // La réplica VIVA (lotes de hoy, esperas) la cuenta el servicio en /salud; aquí, lo que guarda la base.
      process.stdout.write(`${JSON.stringify({
        hoy: c.metricas.delDia(),
        historial: c.metricas.historial(14),
        pendientes: c.replica.pendientes(),
        presencia: c.presencia.resumen(),
      })}\n`);
      c.db.close();
      return;
    }
    default:
      process.stdout.write("uso: puerta-datos.mjs servir|comprobar|ficha|fichas|nodo|vaciar|metricas\n");
      process.exit(orden ? 2 : 0);
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
