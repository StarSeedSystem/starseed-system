/**
 * Informe por neurona para Genesis › Actualizaciones (contrato §6).
 * ════════════════════════════════════════════════════════════════
 * Convierte hallazgos + decisiones + historial en lo que el panel pinta, por neurona:
 * qué hay nuevo, qué se aplicó, qué se pospuso y por qué, y qué no cabe (y dónde sí).
 * Honesto con lo que falta: si la neurona no tiene sondeo, se dice; nunca «al día» por defecto.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import type { ApunteHistorial } from "./aplicacion";
import type { DecisionMejora } from "./decision";
import type { Hallazgo } from "./hallazgos";
import { NOMBRE_MEDIO, type FamiliaSistema, type HuellaAparato } from "./tipos";

export interface FilaInforme {
  sistemaId: string;
  nombre: string;
  familia: FamiliaSistema;
  de: string | null;
  a: string | null;
  texto: string;
  /** Requisitos estimados por StarSeed (no del proyecto): el panel lo marca. */
  estimado?: boolean;
  cuando?: string;
  /** Neurona donde sí cabe. */
  mejorEn?: string;
}

export interface InformeNeurona {
  neuronaId: string;
  nombre: string;
  /** Cómo se midió el aparato (navegador, sondeo o ambos). */
  medida: HuellaAparato["medida"];
  /** Texto corto del aparato («macOS · 16 GB · Metal · servicio local, navegador»). */
  aparato: string;
  nuevas: FilaInforme[];
  aplicadas: FilaInforme[];
  pospuestas: FilaInforme[];
  noCaben: FilaInforme[];
  /** Sistemas instalados que están al día. */
  alDia: number;
  /** Fuentes sin versión (caídas, límite de GitHub…): se dicen, no se esconden. */
  sinDato: number;
}

const gb = (mb: number | null, cota: boolean): string => (mb === null ? "RAM sin medir" : `${cota ? "≥ " : ""}${Math.round((mb / 1024) * 10) / 10} GB`);

export function describirAparato(h: HuellaAparato): string {
  const partes: string[] = [];
  const sistemas: Record<string, string> = { macos: "macOS", linux: "Linux", windows: "Windows", android: "Android", ios: "iOS", ipados: "iPadOS" };
  partes.push(sistemas[h.sistema] ?? "Sistema sin medir");
  partes.push(gb(h.ramMb, h.ramEsCota));
  const gpu = h.aceleraciones.filter((a) => a !== "cpu" && a !== "wasm");
  partes.push(gpu.length ? gpu.map((a) => (a === "webgpu" ? "WebGPU" : a === "metal" ? "Metal" : a.toUpperCase())).join("/") : "sin GPU usable");
  partes.push(h.medios.map((m) => NOMBRE_MEDIO[m]).join(", "));
  return partes.join(" · ");
}

const fila = (h: Hallazgo, texto: string, extra: Partial<FilaInforme> = {}): FilaInforme => ({
  sistemaId: h.sistema.id,
  nombre: h.sistema.nombre,
  familia: h.sistema.familia,
  de: h.instalada,
  a: h.disponible,
  texto,
  ...(h.sistema.requisitosFuente === "estimado" ? { estimado: true } : {}),
  ...extra,
});

/** Construye el informe de UNA neurona. `decisiones` va en el mismo orden que `hallazgos`. */
export function construirInforme(
  huella: HuellaAparato,
  hallazgos: readonly Hallazgo[],
  decisiones: readonly DecisionMejora[],
  historial: readonly ApunteHistorial[] = [],
): InformeNeurona {
  const inf: InformeNeurona = {
    neuronaId: huella.neuronaId,
    nombre: huella.nombre || huella.neuronaId,
    medida: huella.medida,
    aparato: describirAparato(huella),
    nuevas: [],
    aplicadas: [],
    pospuestas: [],
    noCaben: [],
    alDia: 0,
    sinDato: 0,
  };
  hallazgos.forEach((h, i) => {
    const dec = decisiones[i];
    if (h.estado === "al-dia") inf.alDia++;
    else if (h.estado === "sin-dato") inf.sinDato++;
    else if (h.estado === "no-cabe")
      inf.noCaben.push(fila(h, h.encaje.carencias[0]?.texto ?? "No cabe en este aparato.", h.alternativa ? { mejorEn: h.alternativa.nombre ?? h.alternativa.neuronaId } : {}));
    else if (h.estado === "nueva-version" || h.estado === "instalable-nuevo") {
      if (dec?.accion === "posponer") inf.pospuestas.push(fila(h, dec.texto));
      else inf.nuevas.push(fila(h, dec?.texto ?? (h.estado === "nueva-version" ? "Hay versión nueva." : "Cabe aquí y mejora lo que usas.")));
    }
  });
  const nombres = new Map(hallazgos.map((h) => [h.sistema.id, h.sistema] as const));
  for (const ap of historial) {
    if (ap.neuronaId !== huella.neuronaId) continue;
    const s = nombres.get(ap.sistemaId);
    const base: FilaInforme = {
      sistemaId: ap.sistemaId,
      nombre: s?.nombre ?? ap.sistemaId,
      familia: s?.familia ?? "codigo",
      de: ap.de,
      a: ap.a,
      texto: ap.calidad ? `${ap.motivo} ${ap.calidad}`.trim() : ap.motivo,
      cuando: ap.cuando,
    };
    if (ap.accion === "aplicada" || ap.accion === "revertida") inf.aplicadas.push(ap.accion === "revertida" ? { ...base, texto: `Vuelta atrás: ${base.texto}` } : base);
  }
  inf.aplicadas.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
  return inf;
}

/** ¿Hay algo que enseñar en esta neurona? (para el estado vacío del panel). */
export function informeVacio(i: InformeNeurona): boolean {
  return !i.nuevas.length && !i.aplicadas.length && !i.pospuestas.length && !i.noCaben.length;
}
