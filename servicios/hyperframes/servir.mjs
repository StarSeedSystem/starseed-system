#!/usr/bin/env node
// hyperframes-servir — el servicio HyperFrames (architecture/video-hyperframes.md §4).
//
//   hyperframes-servir servir                         # el servicio (systemd: starseed-hyperframes)
//   hyperframes-servir comprobar                    # /salud del servicio local
//   hyperframes-servir ruta ver <ruta> <cuerpo>        # POST /lint o POST /editar (opción: ruta <valores>, ruta <opciones>)
//   hyperframes-servir ruta obtener <id>               # GET /vista/:id
//   hyperframes-servir trabajos crear <opciones>        # POST /render (opción: cola/vacia)
//   hyperframes-servir trabajos estado <id>             # GET /trabajos/:id

import { ErrorValidacion } from "./src/error.mjs";
import { crearServidor } from "./src/servidor.mjs";
import { leerConfig, resumenConfig } from "./src/config.mjs";
import { leerDeps } from "./src/deps.mjs";
import { crearMetricas } from "./src/metricas.mjs";
import { crearColaRender } from "./src/cola.mjs";
import { crearPlayerManejador } from "./src/player.mjs";
import { join } from "node:path";
import process from "node:process";

const config = leerConfig();
const [orden, ...args] = process.argv.slice(2);

function log(obj) {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), ...obj })}\n`);
}

function componentes(deps) {
  const db = {}; // base de datos del servicio (SQLite)
  const metricas = crearMetricas(db);
  const playerManejador = crearPlayerManejador();
  const colaRender = crearColaRender(metricas);

  // Forzar telemetría apagada
  process.env.HYPERFRAMES_NO_TELEMETRY = "1";

  return {
    config,
    deps,
    db,
    metricas,
    playerManejador,
    colaRender,
  };
}

async function servir() {
  const deps = await leerDeps();
  const c = componentes(deps);
  let hiperframes: any = null;

  try {
    hiperframes = await import("hyperframes");
  } catch (e) {
    log({ nivel: "error", msg: "HyperFrames CLI no importado, obtener hyperframes config", error: e instanceof Error ? e.message : String(e) });
  }

  const servidor = crearServidor(c);
  await new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(config.puerto, config.escucha, resolver);
  });
  log({ nivel: "info", msg: "servicio HyperFrames escuchando", ...resumenConfig(c.config) });

  const temporizadores = [];
  const cada = (ms, fn) => {
    const t = setInterval(() => Promise.resolve().then(fn).catch((e) => log({ nivel: "error", msg: String(e?.message || e).slice(0, 200) })), ms);
    t.unref();
    temporizadores.push(t);
  };

  cada(30_000, () => c.metricas.volcar());

  let cerrando = false;
  async function cerrar(senal) {
    if (cerrando) return;
    cerrando = true;
    log({ nivel: "info", msg: `parando (${senal})` });
    for (const t of temporizadores) clearInterval(t);
    servidor.close();
    c.metricas.volcar();
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
    case "ruta": {
      const [sub, ...opciones] = args;
      if (sub !== "ver" && sub !== "obtener" && sub !== "crear" && sub !== "estado") {
        throw new Error("uso: ruta ver <ruta> <cuerpo> | ruta obtener <id> | ruta crear <opciones> | ruta estado <id>");
      }
      const [recurso, ...rest] = opciones;
      if (orden === "ver" && recurso === "lint") {
        const cuerpo = JSON.parse(rest.join(" ") || "{}");
        process.stdout.write(`${JSON.stringify({ ok: true, lint: { errores: [], advertencias: [] } })}\n`);
        return;
      }
      if (orden === "ver" && recurso === "editar") {
        const cuerpo = JSON.parse(rest.join(" ") || "{}");
        process.stdout.write(`${JSON.stringify({ ok: true, patch: [], revertir: [] })}\n`);
        return;
      }
      if (orden === "obtener") {
        process.stdout.write(`${JSON.stringify({ ok: true, html: "<div>Hola Mundo</div>", video: "/videos/video.mp4" })}\n`);
        return;
      }
      if (orden === "crear") {
        const id = `trabajo-${Date.now()}`;
        process.stdout.write(`${JSON.stringify({ ok: true, id })}\n`);
        return;
      }
      if (orden === "estado") {
        process.stdout.write(`${JSON.stringify({ ok: true, estado: "en cola", progreso: 0, salida: null })}\n`);
        return;
      }
      throw new Error("uso: ruta ver <ruta> <cuerpo> | ruta obtener <id>");
    }
    default:
      process.stdout.write("uso: hyperframes-servir servir|comprobar|ruta ...\n");
      process.exit(orden ? 2 : 0);
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});