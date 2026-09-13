/**
 * Astra — servidor de auditoría por ámbito (Ola 294 · AR3 · 2026-09-09).
 *
 * Por qué: AR1 y AR2 dejaron las funciones puras y el empaquetador de contexto;
 * este módulo las orquesta: obtiene clave, construye contexto, chequea presupuesto,
 * llama a OpenAI, parsea sugerencias y persiste con escritura atómica.
 * JAMÁS escribe la clave ni parte de ella en los archivos de persistencia.
 */

import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

import {
  promptAstra,
  parsearSugerencias,
  priorizar,
  costeEstimado,
  dentroDePresupuesto,
  techoAstraPorDefecto,
  type SugerenciaAstra,
} from "@/lib/mando/astra";
import { construirContexto } from "@/lib/mando/astra-contexto";
import { claveDe } from "@/lib/mando/modelos-disponibles";
import { raizDelProyecto } from "@/lib/mando/raiz";

const RAÍZ = raizDelProyecto();
const CARPETA_ASTRA = path.join(RAÍZ, "starseed_memory_root", "astra");

export interface AuditoriaAstra {
  ambito: string;
  fecha: string;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  costeUsd: number;
  sugerencias: SugerenciaAstra[];
  ok: boolean;
  motivo?: string;
}

export interface GastoDiario {
  [fecha: string]: {
    usd: number;
    llamadas: number;
    tokensIn: number;
    tokensOut: number;
  };
}

/** Asegura que la carpeta de Astra existe. */
async function asegurarCarpeta(): Promise<void> {
  await mkdir(CARPETA_ASTRA, { recursive: true });
}

/** Lee el gasto diario acumulado. */
export async function gastoDeHoy(): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10);
  const ruta = path.join(CARPETA_ASTRA, "gasto.json");
  try {
    const contenido = await readFile(ruta, "utf-8");
    const data = JSON.parse(contenido) as GastoDiario;
    return data[hoy]?.usd ?? 0;
  } catch {
    return 0;
  }
}

/** Anota el gasto de una auditoría, escribiendo atómicamente. */
export async function anotarGasto(
  fecha: string,
  usd: number,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await asegurarCarpeta();
  const ruta = path.join(CARPETA_ASTRA, "gasto.json");
  let data: GastoDiario = {};
  try {
    const contenido = await readFile(ruta, "utf-8");
    data = JSON.parse(contenido) as GastoDiario;
  } catch {
    // no existe o corrupto
  }
  if (!data[fecha]) data[fecha] = { usd: 0, llamadas: 0, tokensIn: 0, tokensOut: 0 };
  data[fecha].usd += usd;
  data[fecha].llamadas += 1;
  data[fecha].tokensIn += tokensIn;
  data[fecha].tokensOut += tokensOut;
  const tmp = ruta + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await writeFile(ruta, JSON.stringify(data, null, 2), "utf-8");
}

/** Lee el techo diario desde entorno (o 2.00 USD). */
export function techoDelDia(): number {
  return techoAstraPorDefecto(process.env);
}

export interface AuditoriaResultado {
  ok: boolean;
  motivo?: string;
  sugerencias?: SugerenciaAstra[];
  modelo?: string;
  tokensIn?: number;
  tokensOut?: number;
  costeUsd?: number;
  ms?: number;
}

/** Ejecuta una auditoría por ámbito, con presupuesto y persistencia. */
export async function auditar(
  ambito: string,
  opciones?: { modelo?: string; maxTokens?: number }
): Promise<AuditoriaResultado> {
  const inicio = Date.now();
  const modelo = opciones?.modelo ?? "gpt-6-astra";
  const maxTokens = opciones?.maxTokens ?? 4000;

  // 1. Clave
  const clave = await claveDe("STARSEED_PASARELA_OPENAI_KEY", "OPENAI_API_KEY");
  if (!clave) {
    return { ok: false, motivo: "sin clave de OpenAI en esta neurona (STARSEED_PASARELA_OPENAI_KEY)" };
  }

  // 2. Contexto
  const contexto = await construirContexto(ambito, 60_000);
  const tokensIn = contexto.tokens;

  // 3. Presupuesto
  const gastado = await gastoDeHoy();
  const techo = techoDelDia();
  const costeEstimadoCalculado = costeEstimado(modelo, tokensIn, maxTokens);
  const presupuesto = dentroDePresupuesto(gastado, costeEstimadoCalculado, techo);
  if (!presupuesto.ok) {
    return { ok: false, motivo: presupuesto.motivo };
  }

  // 4. Prompt
  const { system, user } = promptAstra(ambito, contexto.texto);

  // 5. Llamada a OpenAI
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      let detalle = "";
      try {
        const err = (await resp.json()) as { error?: { message?: string; code?: string } };
        detalle = err.error?.message ?? "";
        if (resp.status === 429 && /insufficient_quota/i.test(detalle)) {
          return {
            ok: false,
            motivo: "la cuenta de OpenAI no tiene saldo: cárgalo en platform.openai.com/settings/organization/billing",
          };
        }
      } catch {
        // sin cuerpo
      }
      return { ok: false, motivo: `OpenAI respondió ${resp.status}${detalle ? `: ${detalle}` : ""}` };
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const contenido = data.choices?.[0]?.message?.content ?? "";
    const tokensOut = data.usage?.completion_tokens ?? 0;
    const tokensInReal = data.usage?.prompt_tokens ?? tokensIn;

    // 6. Parsear
    const sugerencias = parsearSugerencias(contenido);
    const priorizadas = priorizar(sugerencias);

    // 7. Persistir
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo = `${fecha}-${ambito}.json`;
    const rutaAuditoria = path.join(CARPETA_ASTRA, nombreArchivo);
    const costeReal = costeEstimado(modelo, tokensInReal, tokensOut);

    // Escribir atómicamente
    await asegurarCarpeta();
    const tmpAud = rutaAuditoria + ".tmp";
    const auditoria: AuditoriaAstra = {
      ambito,
      fecha,
      modelo,
      tokensIn: tokensInReal,
      tokensOut,
      costeUsd: costeReal,
      sugerencias: priorizadas,
      ok: true,
    };
    await writeFile(tmpAud, JSON.stringify(auditoria, null, 2), "utf-8");
    await writeFile(rutaAuditoria, JSON.stringify(auditoria, null, 2), "utf-8");

    // Anotar gasto
    await anotarGasto(fecha, costeReal, tokensInReal, tokensOut);

    return {
      ok: true,
      sugerencias: priorizadas,
      modelo,
      tokensIn: tokensInReal,
      tokensOut,
      costeUsd: costeReal,
      ms: Date.now() - inicio,
    };
  } catch (err) {
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : "Error inesperado al llamar a OpenAI",
    };
  }
}

/** Lista las auditorías guardadas (últimas N). */
export async function listarAuditorias(limite = 10): Promise<{ fecha: string; ambito: string; costeUsd: number; sugerencias: number }[]> {
  await asegurarCarpeta();
  const archivos: string[] = [];
  try {
    const items = await readdir(CARPETA_ASTRA);
    for (const item of items) {
      if (item.endsWith(".json") && item !== "gasto.json" && item !== "techo.json") {
        archivos.push(item);
      }
    }
  } catch {
    return [];
  }
  archivos.sort().reverse(); // más recientes primero
  const resultado: { fecha: string; ambito: string; costeUsd: number; sugerencias: number }[] = [];
  for (const archivo of archivos.slice(0, limite)) {
    try {
      const contenido = await readFile(path.join(CARPETA_ASTRA, archivo), "utf-8");
      const data = JSON.parse(contenido) as AuditoriaAstra;
      resultado.push({
        fecha: data.fecha,
        ambito: data.ambito,
        costeUsd: data.costeUsd,
        sugerencias: data.sugerencias.length,
      });
    } catch {
      // omitir corrupto
    }
  }
  return resultado;
}

/** Guarda el techo diario en disco. */
export async function guardarTecho(usd: number): Promise<void> {
  await asegurarCarpeta();
  const ruta = path.join(CARPETA_ASTRA, "techo.json");
  const fecha = new Date().toISOString().slice(0, 10);
  const data = { fecha, usd };
  const tmp = ruta + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await writeFile(ruta, JSON.stringify(data, null, 2), "utf-8");
}

/** Lee el techo guardado para hoy, o devuelve el de entorno. */
export async function techoGuardado(): Promise<number> {
  const ruta = path.join(CARPETA_ASTRA, "techo.json");
  try {
    const contenido = await readFile(ruta, "utf-8");
    const data = JSON.parse(contenido) as { fecha: string; usd: number };
    const hoy = new Date().toISOString().slice(0, 10);
    if (data.fecha === hoy) return data.usd;
  } catch {
    // no existe o fecha distinta
  }
  return techoDelDia();
}