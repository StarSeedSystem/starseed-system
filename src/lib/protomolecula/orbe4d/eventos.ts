/**
 * Orbe 4D de la Protomolécula · EVENTOS y ZONA DE APAGADO (lógica PURA: sin React, sin three.js, sin `node:*`).
 *
 * Cualquier parte del OS le habla a la orbe con un evento de ventana, sin importarla (no se acopla a su
 * motor): el taller 3D cuando genera (carga → transformación hacia el modelo), la Protomolécula cuando
 * crea, Astraura cuando piensa o le pide una forma. Contrato:
 *
 *   window.dispatchEvent(new CustomEvent("starseed:protomolecula-orbe-estado", { detail, cancelable: true }))
 *     detail = { estado: "cargando", progreso?: 0..1, etiqueta? }
 *            | { estado: "creando" } | { estado: "pensando" } | { estado: "listo" }
 *            | { estado: "forma", forma: IdForma | null }        (null = vuelve a su secuencia)
 *            | { estado: "estilo", estilo: "sobria" | "expresiva" | "experimental" }
 *            | { estado: "transformar", modelo: URL | Blob | Float32Array, titulo? }
 *   La orbe llama a `preventDefault()` cuando lo atiende (así quien avisa sabe si alguien lo vio).
 *
 * La zona de apagado es SUYA (no la de Astraura, que está arriba al centro): el borde izquierdo, el lado
 * de la creación en la Trinidad (Horizon), que es también donde se vuelve a encender.
 */
import { ESTILOS_VALIDOS, estiloValido, type Estilo, type IdForma } from "./coreografia";

export const PROTO_ORB_ESTADO_EVENT = "starseed:protomolecula-orbe-estado";
/** Mismo nombre que exporta `orbe-bus.ts` cuando llegue PMO1020A; aquí para no depender de esa tarea. */
export const PROTO_ORB_CERRAR_EVENT = "starseed:protomolecula-cerrar";
export const PROTO_ORB_ESTILO_KEY = "starseed.protomolecula.orbe.estilo.v1";

export type DetalleEstadoOrbe =
  | { estado: "cargando"; progreso?: number; etiqueta?: string }
  | { estado: "creando" }
  | { estado: "pensando" }
  | { estado: "listo" }
  | { estado: "forma"; forma: IdForma | null }
  | { estado: "estilo"; estilo: Estilo }
  | { estado: "transformar"; modelo: string | Blob | Float32Array; titulo?: string };

const ESTADOS = new Set(["cargando", "creando", "pensando", "listo", "forma", "estilo", "transformar"]);

/** Valida lo que llega por el evento (puede venir de cualquier parte): nada raro pasa al motor. */
export function leerDetalle(x: unknown): DetalleEstadoOrbe | null {
  if (!x || typeof x !== "object") return null;
  const d = x as Record<string, unknown>;
  if (typeof d.estado !== "string" || !ESTADOS.has(d.estado)) return null;
  switch (d.estado) {
    case "cargando": {
      const p = typeof d.progreso === "number" && Number.isFinite(d.progreso) ? Math.min(1, Math.max(0, d.progreso)) : undefined;
      return { estado: "cargando", progreso: p, etiqueta: typeof d.etiqueta === "string" ? d.etiqueta.slice(0, 80) : undefined };
    }
    case "forma":
      return { estado: "forma", forma: typeof d.forma === "string" && FORMAS_ELEGIBLES.includes(d.forma as IdForma) ? (d.forma as IdForma) : null };
    case "estilo":
      return (ESTILOS_VALIDOS as readonly string[]).includes(String(d.estilo)) ? { estado: "estilo", estilo: d.estilo as Estilo } : null;
    case "transformar": {
      const m = d.modelo;
      const valido = typeof m === "string" ? /^(blob:|https?:|data:model\/gltf|\/)/.test(m) : (typeof Blob !== "undefined" && m instanceof Blob) || m instanceof Float32Array;
      return valido ? { estado: "transformar", modelo: m as string | Blob | Float32Array, titulo: typeof d.titulo === "string" ? d.titulo.slice(0, 80) : undefined } : null;
    }
    default:
      return { estado: d.estado as "creando" | "pensando" | "listo" };
  }
}

/** Las formas que se pueden fijar a mano (la semilla y el modelo las pone la propia orbe). */
export const FORMAS_ELEGIBLES: IdForma[] = ["merkaba", "jitterbug", "teseracto", "dodecaedro", "matriz", "icosaedro"];

/** Avisa a la orbe. Devuelve `true` si una orbe lo atendió. Seguro sin `window`. */
export function avisarOrbe(detalle: DetalleEstadoOrbe): boolean {
  try {
    if (typeof window === "undefined") return false;
    return !window.dispatchEvent(new CustomEvent(PROTO_ORB_ESTADO_EVENT, { detail: detalle, cancelable: true }));
  } catch {
    return false;
  }
}

export interface Rect { x: number; y: number; ancho: number; alto: number }

/** Zona propia para soltar la orbe y apagarla: franja del borde izquierdo, centrada en vertical. */
export function zonaApagado(ancho: number, alto: number): Rect {
  const movil = ancho < 640;
  const h = Math.min(alto - 32, movil ? 200 : 260);
  return { x: 0, y: Math.round((alto - h) / 2), ancho: movil ? 96 : 120, alto: h };
}

export function dentroDeZona(x: number, y: number, z: Rect): boolean {
  return x >= z.x && x <= z.x + z.ancho && y >= z.y && y <= z.y + z.alto;
}

export interface AlmacenSimple { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function leerEstilo(almacen: AlmacenSimple | null | undefined): Estilo {
  try {
    return estiloValido(almacen?.getItem(PROTO_ORB_ESTILO_KEY));
  } catch {
    return estiloValido(null);
  }
}

export function guardarEstilo(almacen: AlmacenSimple | null | undefined, e: Estilo): void {
  try {
    almacen?.setItem(PROTO_ORB_ESTILO_KEY, e);
  } catch {
    /* defensivo */
  }
}

/** Fases del habla de Astraura (`aurora:speak`) → pulso de voz 0..1 para la orbe. */
export function nivelDeVoz(fase: unknown): number {
  if (fase === "start") return 0.8;
  if (fase === "boundary" || fase === "word") return 0.6;
  if (fase && typeof fase === "object" && typeof (fase as { level?: unknown }).level === "number") {
    return Math.min(1, Math.max(0, (fase as { level: number }).level));
  }
  return 0;
}
