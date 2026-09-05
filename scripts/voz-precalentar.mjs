#!/usr/bin/env node
/**
 * voz-precalentar.mjs — Precalienta la caché del daemon de voz local de Astraura
 * (OmniVoice, 127.0.0.1:4500 con pool en 4444) con las narraciones FIJAS del OS:
 * el rito de bienvenida (STEP_NARRATION) y la guía de la red (say de cada paso),
 * más la frase de muestra de la orbe. La síntesis 1.58-bit puede ir a ~9× tiempo
 * real: si el WAV ya está cacheado (el daemon cachea por hash de los campos del
 * POST /tts), en el rito suena al instante.
 *
 * CÓMO EJECUTARLO (en la Mac, con el daemon `native/astraura-voice` activo):
 *
 *     node scripts/voz-precalentar.mjs                  # todo: rito + guía + muestra
 *     node scripts/voz-precalentar.mjs --simular        # solo lista las frases, no llama al daemon
 *     node scripts/voz-precalentar.mjs --solo-rito      # solo las narraciones del rito
 *     node scripts/voz-precalentar.mjs --solo-guia      # solo los «say» de la guía de la red
 *
 * ⚠️ Tarda VARIOS MINUTOS (cada frase son decenas de segundos en un M1 de 8 GB).
 *    Cógelo como ritual: lánzalo, deja la Mac y vuelve. Las frases ya
 *    cacheadas se las salta el daemon devolviéndolas al instante.
 *
 * Variables de entorno (opcionales):
 *   VOZ_DAEMON_URL    base del daemon (defecto http://127.0.0.1:4444)
 *   VOZ_SPEED         velocidad (defecto 1)
 *   VOZ_PERSONALITY   personalidad/timbre activo (defecto "fem-aurora")
 *   VOZ_INSTRUCT      instrucción de estilo (defecto "female, young adult, moderate pitch")
 *
 * Sin dependencias: Node 22 (fetch nativo), ESM puro. No toca claves ni secretos.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WIZARD = path.join(RAIZ, "src/components/onboarding/onboarding-wizard.tsx");
const GUIA = path.join(RAIZ, "src/components/onboarding/aurora-guide.tsx");

/** Frase de muestra de la orbe (la que suena al probar el timbre). */
const MUESTRA_ORBE = "Hola, soy Aurora. Así sueno ahora mismo: esta es mi voz en este equipo.";

const DAEMON = process.env.VOZ_DAEMON_URL || "http://127.0.0.1:4444";
const SPEED = Number(process.env.VOZ_SPEED || 1);
const PERSONALITY = process.env.VOZ_PERSONALITY || "fem-aurora";
const INSTRUCT = process.env.VOZ_INSTRUCT || "female, young adult, moderate pitch";

/* ── Extracción de textos fijos (regex sencilla: NO importar TSX) ── */

/** Desescapa un literal de cadena JS simple ("..." ) ya capturado. */
function desescapar(s) {
  return s.replace(/\\(["'\\nrt])/g, (_, c) =>
    c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c === "\\" ? "\\" : c === '"' ? '"' : "'");
}

/** Extrae los textos del Record `STEP_NARRATION` del asistente del rito. */
async function textosRito() {
  const src = await readFile(WIZARD, "utf8");
  const bloque = src.match(/STEP_NARRATION[^}]*}/s);
  if (!bloque) return [];
  const textos = [];
  const re = /\b\d+:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(bloque[0]))) textos.push(desescapar(m[1]));
  return textos;
}

/** Extrae los campos `say:` de cada paso de la guía, más la intro (INTRO_SAY). */
async function textosGuia() {
  const src = await readFile(GUIA, "utf8");
  const textos = [];
  const re = /say:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src))) textos.push(desescapar(m[1]));
  const intro = src.match(/INTRO_SAY\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/);
  if (intro) textos.unshift(desescapar(intro[1]));
  return textos;
}

/* ── Partición en frases: MISMO criterio que `partirEnFrases` de
      src/lib/aurora/motor-local.ts (puntuación fuerte, cortas se pegan a la
      siguiente para no encolar migajas). Mantener sincronizado con ella. ── */
function partirEnFrases(texto) {
  const bruto = texto.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out = [];
  for (const f of bruto) {
    if (out.length && f.length < 18) out[out.length - 1] += ` ${f}`;
    else out.push(f);
  }
  return out.length ? out : [texto];
}

/* ── Comunicación con el daemon ── */

async function esperarListo() {
  process.stdout.write("Pidiendo al daemon que cargue el modelo (/warm)…\n");
  try {
    await fetch(`${DAEMON}/warm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "Spanish" }),
    });
  } catch {
    /* si ni siquiera responde, el sondeo siguiente lo dirá */
  }
  // Esperar hasta 60 s a que /status reporte `ready: true` (sondeo cada 2 s).
  const inicio = Date.now();
  while (Date.now() - inicio < 60_000) {
    try {
      const r = await fetch(`${DAEMON}/status`);
      const j = await r.json();
      if (j && j.ready === true) {
        process.stdout.write(`Daemon listo${j.model ? ` (modelo ${j.model}${j.quant ? "/" + j.quant : ""})` : ""}.\n`);
        return true;
      }
    } catch {
      /* daemon ausente o aún arrancando: reintentar */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Una síntesis a la vez (el daemon tiene cola de 8 y las serializa; en paralelo
 * solo conseguiríamos saturarlo). Timeout 200 s como en sintetizarAhora; un 503
 * (cola llena) se reintenta UNA vez.
 */
async function sintetizar(texto) {
  const cuerpo = JSON.stringify({ text: texto, lang: "Spanish", speed: SPEED, personality: PERSONALITY, instruct: INSTRUCT });
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 200_000);
      try {
        const r = await fetch(`${DAEMON}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: cuerpo,
          signal: ctrl.signal,
        });
        if (r.status === 503 && intento < 2) {
          await new Promise((res) => setTimeout(res, 4000));
          continue; // cola llena: esperar y reintentar una vez
        }
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        const buf = await r.arrayBuffer();
        return { ok: true, bytes: buf.byteLength };
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      if (e && e.name === "AbortError") return { ok: false, error: "timeout (200 s)" };
      return { ok: false, error: (e && e.message) || "fallo de red" };
    }
  }
  return { ok: false, error: "HTTP 503 (persistente)" };
}

/* ── Programa principal ── */

async function main() {
  const args = new Set(process.argv.slice(2));
  const simular = args.has("--simular");
  const soloRito = args.has("--solo-rito");
  const soloGuia = args.has("--solo-guia");

  /** @type {{ origen: string; texto: string }[]} */
  const piezas = [];
  if (!soloGuia) for (const t of await textosRito()) piezas.push({ origen: "rito", texto: t });
  if (!soloRito) {
    for (const t of await textosGuia()) piezas.push({ origen: "guía", texto: t });
    piezas.push({ origen: "orbe", texto: MUESTRA_ORBE });
  }

  // Sin duplicados: si un texto aparece dos veces (guía y rito), se sintetiza una.
  const frases = [];
  const vistas = new Set();
  for (const p of piezas) {
    for (const f of partirEnFrases(p.texto)) {
      const clave = f.trim();
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      frases.push({ origen: p.origen, texto: clave });
    }
  }

  process.stdout.write(`Textos: rito y guía leídos del código. Frases a precalentar: ${frases.length}.\n`);
  if (simular) {
    frases.forEach((f, i) => process.stdout.write(`  ${String(i + 1).padStart(3)} [${f.origen}] ${f.texto}\n`));
    process.stdout.write("Modo --simular: no se ha llamado al daemon.\n");
    return;
  }

  if (!(await esperarListo())) {
    process.stderr.write(`El daemon no quedó listo en 60 s (${DAEMON}). ¿Está activo? Aborto sin sintetizar.\n`);
    process.exitCode = 1;
    return;
  }

  const t0 = Date.now();
  let hechas = 0;
  let fallos = 0;
  for (let i = 0; i < frases.length; i++) {
    const f = frases[i];
    const t = Date.now();
    const r = await sintetizar(f.texto);
    const seg = ((Date.now() - t) / 1000).toFixed(1);
    if (r.ok) {
      hechas++;
      process.stdout.write(`${String(i + 1).padStart(3)}/${frases.length} · ${seg} s · ${(r.bytes / 1024).toFixed(0)} KiB · [${f.origen}] ${f.texto.slice(0, 60)}${f.texto.length > 60 ? "…" : ""}\n`);
    } else {
      fallos++;
      process.stdout.write(`${String(i + 1).padStart(3)}/${frases.length} · ${seg} s · ERROR ${r.error} · [${f.origen}] ${f.texto.slice(0, 60)}…\n`);
    }
  }

  const total = ((Date.now() - t0) / 1000).toFixed(0);
  process.stdout.write(`\nResumen: ${hechas} frases cacheadas, ${fallos} fallos, ${total} s en total.\n`);
  if (fallos > 0) process.exitCode = 2;
}

main().catch((e) => {
  process.stderr.write(`Fallo inesperado: ${(e && e.message) || e}\n`);
  process.exitCode = 1;
});
