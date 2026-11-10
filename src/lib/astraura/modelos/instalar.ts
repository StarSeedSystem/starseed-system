// Instalación de un modelo recomendado (MOD1110A). REGLA DE ALEX: siempre preguntar antes de descargar,
// enseñando el tamaño. `ejecutarInstalacion` se niega a hacer nada sin `confirmado: true`.
// Honestidad: la descarga habla con el servidor de Ollama de ESTA máquina (127.0.0.1:11434). El
// navegador integrado puede bloquear ese puerto (ya pasó con el 8000, ver via-158-local.ts); si falla,
// se devuelve el comando exacto para pegarlo en una terminal. Las capas 1.58-bit/Needle NO se instalan
// aquí: las descarga el instalador de capas existente (con SHA-256).

import { encajar } from "./recomendar";
import { requisitosDe } from "./catalogo";
import type { PerfilNeurona } from "./perfil-neurona";
import type { ModeloLocal } from "./tipos";

export const BASE_OLLAMA = "http://127.0.0.1:11434";

export interface PlanInstalacion {
  modelo: ModeloLocal;
  /** Pregunta que se enseña ANTES de descargar, con el tamaño. */
  pregunta: string;
  descargaGb: number;
  discoNecesarioGb: number;
  /** Comando equivalente para una terminal (solo modelos de Ollama). */
  comando: string | null;
  /** Si no se puede instalar aquí, el porqué en una frase; null si se puede. */
  bloqueo: string | null;
  /** Instala por el instalador de capas, no por Ollama. */
  porCapas: boolean;
  /** El bloqueo es solo que falta Ollama y esta neurona puede instalarlo: la pantalla ofrece «Instalar Ollama» (MOD1110B). */
  faltaOllama: boolean;
}

const gb = (n: number) => `${n.toFixed(1).replace(".", ",")} GB`;

export function planInstalar(m: ModeloLocal, p: PerfilNeurona, instalado = false): PlanInstalacion {
  const rq = requisitosDe(m);
  const e = encajar(m, p, instalado);
  const porCapas = m.tipo !== "estandar";
  let bloqueo: string | null = null;
  if (e.motivo === "sin-runtime") {
    bloqueo = m.runtimes.includes("ollama")
      ? p.puedeInstalarOllama ? "Necesita Ollama, que esta neurona aún no tiene: instálalo con «Instalar Ollama» (te pregunto antes y te enseño el tamaño)." : "Esta neurona no puede ejecutar modelos de Ollama."
      : "Esta neurona no tiene el motor que necesita este modelo.";
  } else if (e.motivo === "solo-apple") bloqueo = "Es una versión solo para Apple silicon.";
  else if (e.veredicto === "no-cabe") bloqueo = "No cabe en la memoria de esta neurona.";
  else if (e.veredicto === "falta-disco") bloqueo = `Faltan ${gb(e.liberarGb ?? 0)} de disco: libera ese espacio y vuelve.`;
  const aviso = m.clase === "abliterated"
    ? ` Es una variante sin filtros publicada por la comunidad (${m.publicador ?? "tercero"}), no por el editor del modelo; nadie midió su calidad.`
    : "";
  return {
    modelo: m,
    pregunta: `¿Descargar «${m.etiqueta}»? Ocupa ${gb(m.descargaGb)} de descarga y necesita ${gb(rq.discoGb)} libres.${aviso} No se descarga nada hasta que aceptes.`,
    descargaGb: m.descargaGb,
    discoNecesarioGb: rq.discoGb,
    comando: m.runtimes.includes("ollama") ? `ollama pull ${m.id}` : null,
    bloqueo,
    porCapas,
    faltaOllama: e.motivo === "sin-runtime" && m.runtimes.includes("ollama") && p.puedeInstalarOllama,
  };
}

export type Traer = (url: string, init?: { method?: string; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; body?: ReadableStream<Uint8Array> | null; json?: () => Promise<unknown> }>;

export interface ResultadoInstalacion {
  ok: boolean;
  mensaje: string;
  comando: string | null;
  /** true = nunca se llegó a pedir nada al servidor (no había confirmación o estaba bloqueado). */
  sinHacerNada: boolean;
}

/** Descarga con Ollama. Sin `confirmado` o con bloqueo NO toca la red. Progreso 0–100 en `onProgreso`. */
export async function ejecutarInstalacion(
  plan: PlanInstalacion,
  opciones: { confirmado: boolean; traer: Traer; onProgreso?: (pct: number, estado: string) => void; base?: string },
): Promise<ResultadoInstalacion> {
  if (!opciones.confirmado) return { ok: false, mensaje: "Falta tu confirmación: no se descarga nada sin preguntar.", comando: plan.comando, sinHacerNada: true };
  if (plan.bloqueo) return { ok: false, mensaje: plan.bloqueo, comando: plan.comando, sinHacerNada: true };
  if (plan.porCapas || !plan.comando) return { ok: false, mensaje: "Esta capa se instala desde el instalador de capas de Astraura.", comando: null, sinHacerNada: true };
  const base = (opciones.base ?? BASE_OLLAMA).replace(/\/+$/, "");
  try {
    const r = await opciones.traer(`${base}/api/pull`, { method: "POST", body: JSON.stringify({ model: plan.modelo.id, stream: true }) });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let resto = "";
    let ultimo = "";
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split("\n");
      resto = lineas.pop() ?? "";
      for (const l of lineas) {
        if (!l.trim()) continue;
        let o: { status?: string; total?: number; completed?: number; error?: string };
        try { o = JSON.parse(l); } catch { continue; }
        if (o.error) throw new Error(o.error);
        ultimo = o.status ?? ultimo;
        const pct = o.total && o.completed ? Math.min(100, Math.round((o.completed / o.total) * 100)) : 0;
        opciones.onProgreso?.(pct, ultimo);
      }
    }
    return { ok: ultimo === "success", mensaje: ultimo === "success" ? `«${plan.modelo.etiqueta}» está descargado.` : `La descarga terminó sin confirmar (${ultimo || "sin estado"}). Revisa con: ${plan.comando}`, comando: plan.comando, sinHacerNada: false };
  } catch (e) {
    const causa = e instanceof Error ? e.message : "sin respuesta";
    return {
      ok: false,
      mensaje: `No pude hablar con Ollama (${causa}). Ejecuta en una terminal: ${plan.comando}`,
      comando: plan.comando,
      sinHacerNada: false,
    };
  }
}

/** Etiquetas ya descargadas en el Ollama de esta máquina (mejor esfuerzo: vacío si no responde). */
export async function listarInstaladosOllama(traer: Traer, base: string = BASE_OLLAMA): Promise<string[]> {
  try {
    const r = await traer(`${base.replace(/\/+$/, "")}/api/tags`);
    if (!r.ok || !r.json) return [];
    const j = (await r.json()) as { models?: Array<{ name?: unknown }> };
    return (j.models ?? []).map((x) => (typeof x.name === "string" ? x.name : "")).filter(Boolean).map((n) => n.replace(/:latest$/, ""));
  } catch {
    return [];
  }
}
