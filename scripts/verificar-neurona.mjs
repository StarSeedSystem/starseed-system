#!/usr/bin/env node
/**
 * scripts/verificar-neurona.mjs (Ola 260 · 2026-09-06 · tarea Q1c)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runner de la verificación inteligente de la neurona: hace los checks HTTP
 * del OS y del backend Astraura, aplica umbrales, compara con la corrida
 * anterior y deja el informe en JSON y Markdown. Toda la lógica de clasificar
 * vive en `verificar-neurona.lib.mjs` (pura y testeable); aquí solo hay I/O.
 *
 * Las pruebas opcionales de voz, oído y BitNet llegan en Q1d: hoy sus
 * funciones devuelven `{ estado: "omitido" }` y NO entran en la puntuación.
 *
 * Sin dependencias externas, ESM, Node ≥ 18. Jamás escribe claves ni rutas
 * absolutas de la casa del usuario: todo cuelga de `process.cwd()`.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ESTADO_OK,
  ESTADO_AVISO,
  ESTADO_FALLO,
  evaluarUmbrales,
  compararConAnterior,
  resumenMarkdown,
  puntuacion,
} from "./verificar-neurona.lib.mjs";

// Umbrales por defecto con las claves que entiende la lib (ver sus `reglas`).
// memoriaLibreMb: ≥800 ok, ≥400 aviso, menos fallo. swapUsadoMb: >4000 aviso.
// crashesDelta: distinto de 0 = fallo. duracionMs: >1500 aviso, >4000 fallo.
const UMBRELES_DEFECTO = {
  memoriaLibreMb: { aviso: 800, fallo: 400 },
  swapUsadoMb: { aviso: 4000, fallo: Number.MAX_SAFE_INTEGER },
  crashesDelta: 0,
  duracionMs: { aviso: 1500, fallo: 4000 },
};

/**
 * Parsea los argumentos de línea de comandos. `--umbral k=v` es repetible y
 * solo admite valores numéricos (los umbrales cualitativos se fijan aquí).
 * Las opciones de voz/oído/bitnet solo se registran: las pruebas son de Q1d.
 */
function parsearArgs(argv) {
  const opciones = {
    base: "http://localhost:9002",
    astraura: "http://127.0.0.1:8000",
    json: false,
    umbrales: {},
    voz: false,
    oido: null,
    esperado: null,
    bitnet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opciones.base = argv[++i] ?? opciones.base;
    else if (a === "--astraura") opciones.astraura = argv[++i] ?? opciones.astraura;
    else if (a === "--json") opciones.json = true;
    else if (a === "--voz") opciones.voz = true;
    else if (a === "--bitnet") opciones.bitnet = true;
    else if (a === "--oido") opciones.oido = argv[++i] ?? null;
    else if (a === "--esperado") opciones.esperado = argv[++i] ?? null;
    else if (a === "--umbral") {
      const par = argv[++i] ?? "";
      const eq = par.indexOf("=");
      if (eq > 0) {
        const clave = par.slice(0, eq).trim();
        const valor = Number(par.slice(eq + 1));
        if (clave && Number.isFinite(valor)) opciones.umbrales[clave] = valor;
      }
    }
  }
  return opciones;
}

/**
 * Petición HTTP que nunca lanza: devuelve siempre el mismo sobre
 * `{ ok, status, ms, json|null, texto|null, error|null }` para que cada
 * check decida su estado sin try/catch repartidos por el código.
 */
async function pedir(url, { metodo = "GET", cuerpo, timeoutMs = 8000 } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: cuerpo ? { "content-type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    const texto = await res.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      // No toda respuesta es JSON (la raíz devuelve HTML): texto basta.
    }
    return { ok: res.ok, status: res.status, ms, json, texto, error: null };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, json: null, texto: null, error: String(e?.message ?? e) };
  }
}

/** Construye el objeto check con la forma que espera la lib y el informe. */
function check(clave, estado, valor, motivo, ms = null) {
  return { clave, estado, valor, motivo, ms };
}

/** Número finito o null: los JSON de la neurona son opcionales por diseño. */
function numero(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Raíz del OS: es el termómetro de que el servidor existe. 200 o 307 en
 * menos de 1,5 s va bien; hasta 4 s es aviso; más o error es fallo. Si no
 * responde en absoluto, el programa saldrá con código 2 (ver `main`).
 */
async function checkRaiz(base) {
  const r = await pedir(`${base}/`);
  if (r.error) {
    // `sinRespuesta` marca el caso «no contestó nada»: fuerza salida 2.
    return { ...check("raiz", ESTADO_FALLO, r.error, "la raíz del OS no responde", r.ms), sinRespuesta: true };
  }
  if (r.status !== 200 && r.status !== 307) {
    return check("raiz", ESTADO_FALLO, r.status, `estado HTTP inesperado ${r.status}`, r.ms);
  }
  if (r.ms < 1500) return check("raiz", ESTADO_OK, r.status, `raíz respondió en ${r.ms} ms`, r.ms);
  if (r.ms < 4000) return check("raiz", ESTADO_AVISO, r.status, `raíz lenta (${r.ms} ms)`, r.ms);
  return check("raiz", ESTADO_FALLO, r.status, `raíz muy lenta (${r.ms} ms)`, r.ms);
}

/** Panel del Mando: estado general (debe traer `cuentas`). */
async function checkMandoEstado(base) {
  const r = await pedir(`${base}/api/mando/estado`);
  const bien = r.status === 200 && r.json && typeof r.json === "object" && "cuentas" in r.json;
  return bien
    ? check("mando_estado", ESTADO_OK, r.status, "estado del Mando con cuentas", r.ms)
    : check("mando_estado", ESTADO_FALLO, r.error ?? r.status, "el Mando no dio su estado", r.ms);
}

/** Ramificación del Mando: la lista de olas debe ser un array. */
async function checkMandoRamificacion(base) {
  const r = await pedir(`${base}/api/mando/ramificacion`);
  const bien = r.status === 200 && r.json && Array.isArray(r.json.olas);
  return bien
    ? check("mando_ramificacion", ESTADO_OK, r.status, "ramificación con olas", r.ms)
    : check("mando_ramificacion", ESTADO_FALLO, r.error ?? r.status, "la ramificación no respondió", r.ms);
}

/**
 * Salud de la neurona: debe traer `memoria`, `voz`, `bitnet`, `ollama` y
 * `avisos`. De este JSON salen además las medidas numéricas (ver `main`).
 */
async function checkMandoNeurona(base) {
  return checkMandoNeuronaDesde(await pedir(`${base}/api/mando/neurona`));
}

/** Clasifica la respuesta ya pedida de `/api/mando/neurona`. */
function checkMandoNeuronaDesde(r) {
  const j = r.json;
  const bien = r.status === 200 && j && typeof j === "object"
    && "memoria" in j && "voz" in j && "bitnet" in j && "ollama" in j && "avisos" in j;
  return bien
    ? check("mando_neurona", ESTADO_OK, r.status, "neurona con memoria, voz, bitnet, ollama y avisos", r.ms)
    : check("mando_neurona", ESTADO_FALLO, r.error ?? r.status, "la neurona no dio su salud completa", r.ms);
}

/** Daemon de voz: `/api/voz/salud` debe venir con `vivo === true`. */
async function checkVozSalud(base) {
  const r = await pedir(`${base}/api/voz/salud`);
  const bien = r.status === 200 && r.json && r.json.vivo === true;
  return bien
    ? check("voz_salud", ESTADO_OK, true, "daemon de voz vivo", r.ms)
    : check("voz_salud", ESTADO_FALLO, r.error ?? r.status, "daemon de voz no vivo", r.ms);
}

/** Voz local: `ready === true` ok; si está `despertando` solo es aviso. */
async function checkVozLocal(base) {
  const r = await pedir(`${base}/api/voz-local/status`);
  const j = r.json;
  if (r.status === 200 && j && j.ready === true) {
    return check("voz_local", ESTADO_OK, true, "voz local lista", r.ms);
  }
  if (r.status === 200 && j && j.despertando === true) {
    return check("voz_local", ESTADO_AVISO, "despertando", "la voz local aún está despertando", r.ms);
  }
  return check("voz_local", ESTADO_FALLO, r.error ?? r.status, "voz local no lista", r.ms);
}

/**
 * Router del backend Astraura: debe traer `motor_local` y `motor_dormido`.
 * Si no responde es AVISO, no fallo: el OS funciona aunque la nube/local
 * de Astraura esté apagada (está pensada para dormir).
 */
async function checkAstrauraRouter(astraura) {
  return checkRouterDesde(await pedir(`${astraura}/api/router/status`));
}

/** Clasifica la respuesta ya pedida del router de Astraura. */
function checkRouterDesde(r) {
  const j = r.json;
  const bien = r.status === 200 && j && "motor_local" in j && "motor_dormido" in j;
  if (bien) return check("astraura_router", ESTADO_OK, r.status, "router de Astraura con motores", r.ms);
  return check("astraura_router", ESTADO_AVISO, r.error ?? r.status, "router de Astraura sin respuesta", r.ms);
}

// ── Pruebas opcionales (Q1d). Hoy solo declaran la omisión y NO entran en
// el array de checks ni en la puntuación: van aparte en `informe.opcionales`.
async function pruebaVoz() {
  return { clave: "prueba_voz", estado: "omitido", valor: null, motivo: "pendiente de la tarea Q1d", ms: null };
}
async function pruebaOido(_wav, _esperado) {
  return { clave: "prueba_oido", estado: "omitido", valor: null, motivo: "pendiente de la tarea Q1d", ms: null };
}
async function pruebaBitnet() {
  return { clave: "prueba_bitnet", estado: "omitido", valor: null, motivo: "pendiente de la tarea Q1d", ms: null };
}

/** Commit corto del repo; tolerante: si no hay git, devuelve null. */
function commitActual() {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--short", "HEAD"], (err, stdout) => {
      resolve(err ? null : String(stdout).trim() || null);
    });
  });
}

/**
 * Commit con el que se construyó el `.next` actual, si el modo ligero lo
 * anotó. Sirve para detectar discrepancias entre código y build servido.
 */
async function leerBuildCommit() {
  try {
    const txt = await readFile(path.join(process.cwd(), ".next", "starseed-build-commit"), "utf8");
    return txt.trim() || null;
  } catch {
    return null; // sin build local anotado: no es un error
  }
}

/** Lee JSON tolerante: cualquier problema devuelve null. */
async function leerJson(ruta) {
  try {
    return JSON.parse(await readFile(ruta, "utf8"));
  } catch {
    return null;
  }
}

/**
 * De la respuesta de `/api/mando/neurona` saca las medidas numéricas con las
 * claves que la lib entiende (`memoriaLibreMb`, `swapUsadoMb`, `crashes24h`)
 * más `crashesDelta` contra la corrida anterior y la latencia de la raíz.
 */
function extraerMedidas(neurona, anterior, latenciaRaizMs) {
  const memoria = neurona?.memoria && typeof neurona.memoria === "object" ? neurona.memoria : {};
  const bitnetJ = neurona?.bitnet && typeof neurona.bitnet === "object" ? neurona.bitnet : {};
  const libre = numero(memoria.libreMb);
  const inactiva = numero(memoria.inactivaMb);
  // La memoria aprovechable de verdad es libre + inactiva (macOS la reusa).
  const memoriaLibreMb = libre !== null && inactiva !== null ? libre + inactiva : libre;
  const crashes24h = numero(neurona?.crashes24h ?? bitnetJ.crashes24h);
  const antes = numero(anterior?.medidas?.crashes24h);
  // Igual o menor vale: el delta se acota a 0 para que una bajada no «falle».
  const crashesDelta = crashes24h !== null && antes !== null ? Math.max(0, crashes24h - antes) : 0;
  return {
    memoriaLibreMb,
    swapUsadoMb: numero(memoria.swapMb),
    crashes24h,
    crashesDelta,
    duracionMs: numero(latenciaRaizMs),
    latenciaRaizMs: numero(latenciaRaizMs),
  };
}

/** Estado de BitNet como check: la lib no tiene regla para estados con texto. */
function checkBitnet(neurona, router) {
  const bruto = neurona?.bitnet;
  const estadoBitnet = typeof bruto === "string" ? bruto : bruto?.estado ?? null;
  const dormido = router?.json?.motor_dormido === true;
  if (estadoBitnet === "vivo" || estadoBitnet === "cargando") {
    return check("bitnet", ESTADO_OK, estadoBitnet, `BitNet ${estadoBitnet}`);
  }
  if (estadoBitnet === "apagado" && dormido) {
    return check("bitnet", ESTADO_AVISO, estadoBitnet, "BitNet apagado con el motor dormido (esperado en reposo)");
  }
  return check("bitnet", ESTADO_FALLO, estadoBitnet ?? "desconocido", "BitNet debería estar vivo y no lo está");
}

async function main() {
  const opciones = parsearArgs(process.argv.slice(2));
  const base = opciones.base.replace(/\/+$/, "");
  const astraura = opciones.astraura.replace(/\/+$/, "");
  const ahora = new Date();

  // Carpeta de informes, siempre relativa al cwd (nunca a la casa del usuario).
  const carpeta = path.join(process.cwd(), "starseed_memory_root", "verificaciones");
  await mkdir(carpeta, { recursive: true });

  // La corrida anterior alimenta la comparación y el delta de crashes.
  const anterior = await leerJson(path.join(carpeta, "ultimo.json"));

  // Checks HTTP en paralelo: son independientes y la latencia se mide por check.
  // La neurona y el router se piden una sola vez y se reutiliza su JSON para
  // las medidas y el estado de BitNet, sin gastar peticiones repetidas.
  const [raiz, mandoEstado, mandoRamificacion, rNeurona, vozSalud, vozLocal, rRouter] =
    await Promise.all([
      checkRaiz(base),
      checkMandoEstado(base),
      checkMandoRamificacion(base),
      pedir(`${base}/api/mando/neurona`),
      checkVozSalud(base),
      checkVozLocal(base),
      pedir(`${astraura}/api/router/status`),
    ]);
  const neuronaJson = rNeurona.json && typeof rNeurona.json === "object" ? rNeurona.json : null;
  const mandoNeurona = checkMandoNeuronaDesde(rNeurona);
  const astrauraRouter = checkRouterDesde(rRouter);

  const medidas = extraerMedidas(neuronaJson, anterior, raiz.ms);
  const umbrales = { ...UMBRELES_DEFECTO, ...opciones.umbrales };

  const checks = [raiz, mandoEstado, mandoRamificacion, mandoNeurona, vozSalud, vozLocal, astrauraRouter];
  checks.push(checkBitnet(neuronaJson, { json: rRouter.json }));
  // Umbrales numéricos evaluados por la lib pura.
  for (const r of evaluarUmbrales(medidas, umbrales)) {
    checks.push({ clave: r.clave, estado: r.estado, valor: r.valor, motivo: r.motivo, ms: null });
  }

  // Comparación con la corrida anterior (regresiones y mejoras).
  const medidasAnteriores = anterior?.medidas && typeof anterior.medidas === "object" ? anterior.medidas : {};
  const { regresiones, mejoras } = compararConAnterior(medidas, medidasAnteriores);
  // La lib también compara por checks: añadimos los pasos de ok→fallo.
  if (Array.isArray(anterior?.checks)) {
    const antesPorClave = new Map(anterior.checks.map((c) => [c?.clave, c?.estado]));
    for (const c of checks) {
      if (antesPorClave.get(c.clave) === ESTADO_OK && c.estado === ESTADO_FALLO) {
        regresiones.push({ clave: c.clave, antes: ESTADO_OK, ahora: ESTADO_FALLO, motivo: `el check «${c.clave}» pasó de ok a fallo` });
      }
    }
  }

  // Pruebas opcionales (Q1d): se registran aparte; no puntúan todavía.
  const opcionales = [];
  if (opciones.voz) opcionales.push(await pruebaVoz());
  if (opciones.oido !== null) opcionales.push(await pruebaOido(opciones.oido, opciones.esperado));
  if (opciones.bitnet) opcionales.push(await pruebaBitnet());

  const puntos = puntuacion({ checks, resumen: { regresiones } });
  const commit = await commitActual();
  const buildCommit = await leerBuildCommit();

  const informe = {
    t: ahora.toISOString(),
    fecha: ahora.toISOString(),
    commit,
    buildCommit,
    base,
    checks,
    medidas,
    umbrales,
    puntuacion: puntos.valor,
    regresiones,
    mejoras,
    opcionales,
    anterior: anterior ? { t: anterior.t ?? null, commit: anterior.commit ?? null } : null,
  };

  // Escritura de informes: histórico por minuto + último JSON y Markdown.
  const p2 = (n) => String(n).padStart(2, "0");
  const sello = `${ahora.getFullYear()}-${p2(ahora.getMonth() + 1)}-${p2(ahora.getDate())}-${p2(ahora.getHours())}${p2(ahora.getMinutes())}`;
  const md = resumenMarkdown({
    fecha: informe.t,
    base,
    checks,
    resumen: { puntuacion: puntos.valor, fallos: puntos.fallo, avisos: puntos.aviso, ok: puntos.ok, regresiones },
  });
  await writeFile(path.join(carpeta, `${sello}.json`), JSON.stringify(informe, null, 2), "utf8");
  await writeFile(path.join(carpeta, "ultimo.json"), JSON.stringify(informe, null, 2), "utf8");
  await writeFile(path.join(carpeta, "ultimo.md"), md, "utf8");

  if (opciones.json) {
    process.stdout.write(JSON.stringify(informe, null, 2) + "\n");
  } else {
    process.stdout.write(md + "\n");
    process.stdout.write(`\nPuntuación: ${puntos.valor}/100\n`);
    if (regresiones.length > 0) {
      process.stdout.write("Regresiones:\n");
      for (const r of regresiones) process.stdout.write(`  - ${r.motivo}\n`);
    }
  }

  // Códigos de salida: 2 = la raíz no respondió en absoluto; 1 = algún fallo.
  if (raiz.sinRespuesta === true) process.exitCode = 2;
  else if (checks.some((c) => c.estado === ESTADO_FALLO)) process.exitCode = 1;
  else process.exitCode = 0;
}

main().catch((e) => {
  // Ni el peor camino puede tirar la herramienta: se informa y se sale con 1.
  process.stderr.write(`verificar-neurona: error inesperado: ${e?.message ?? e}\n`);
  process.exitCode = 1;
});
