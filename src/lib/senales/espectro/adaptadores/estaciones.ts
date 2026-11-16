/**
 * estaciones — las estaciones publicadas como SEÑALES del espectro (MRI5 · MAP1116B).
 * Una estación es una señal DECLARADA: lo que su dueño publicó, no algo que este
 * aparato midió. Por eso `origen: "declarada"` y todo lo medido va a null (fuerza,
 * calidad, ancho, zona y hora): no se inventa ningún número.
 *
 * Las filas son las que la persona YA puede leer (`listarEstaciones`, en
 * `src/lib/estaciones/datos.ts`, que respeta la RLS de `os_estaciones`): este módulo
 * no lee de la base de datos, recibe las filas.
 *
 * CAPAS: `publica` si la estación está en el directorio público; `privada` si es del
 * propio dueño o de una de sus entidades; y nada si es la privada de otra persona
 * (la RLS no la da, y si llega, se descarta).
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import { leerEnlaceSesion } from "@/lib/estaciones/transmision-parametrica";
import type { Estacion } from "@/lib/estaciones/tipos";
import { normalizarSenal } from "../validadores";
import type { CapaRed, SenalEspectro, SinFuente } from "../tipos";

/** Quién mira: con qué cuenta y en qué entidades. */
export interface ContextoEstaciones {
  /** Id de la cuenta en sesión. Null = sin sesión. */
  usuarioId: string | null;
  /** Entidades (grupos) donde la persona es miembro activo (`entidad_ref` de la estación). */
  entidades: readonly string[];
}

/** La fila de `os_estaciones` que hace falta (el resto de la fila se ignora). */
export type FilaEstacion = Pick<Estacion, "id" | "owner_id" | "entidad_ref" | "tipo" | "enlace" | "visibilidad">;

/** Las señales, y si no pudo haberlas, el porqué. */
export type ResultadoAdaptador = { senales: SenalEspectro[]; sinFuente: SinFuente | null };

/** De dónde salen las filas (lo pone quien cablea: `listarEstaciones` + `usuarioEnSesion`). */
export interface FuenteEstaciones {
  usuarioId(): Promise<string | null>;
  listar(): Promise<FilaEstacion[]>;
}

export const MOTIVO_SIN_SESION = "sin sesión: no se puede saber qué estaciones son tuyas ni de tus grupos";
export const MOTIVO_ERROR_LECTURA = "no se pudieron leer las estaciones";

function sinFuente(motivo: string): ResultadoAdaptador {
  return { senales: [], sinFuente: { medio: "estacion", motivo } };
}

/** La CAPA de una estación, o null si no se enseña (la privada de otra persona). */
export function capaDeEstacion(fila: FilaEstacion, ctx: ContextoEstaciones): CapaRed | null {
  if (fila.visibilidad === "publica") return "publica";
  if (fila.visibilidad !== "grupo") return null;
  if (fila.owner_id === ctx.usuarioId) return "privada";
  return fila.entidad_ref && ctx.entidades.includes(fila.entidad_ref) ? "privada" : null;
}

/**
 * La frecuencia que DECLARA la estación, en kHz. Solo la declaran las sesiones en vivo de
 * Omnifrecuencias (la entonación que publicó su dueño). Si no declara ninguna: null.
 */
export function frecuenciaDeclaradaKhz(fila: FilaEstacion): number | null {
  const params = leerEnlaceSesion(fila.enlace ?? "")?.ficha?.params;
  if (!params || params.tipo !== "omnifrecuencias") return null;
  const hz = params.entonacion.osciladores[0]?.f;
  if (typeof hz !== "number" || !Number.isFinite(hz) || hz <= 0) return null;
  return hz / 1000;
}

/** La señal de una estación, o null si no se enseña. Siempre válida según el modelo. */
export function senalDeEstacion(fila: FilaEstacion, ctx: ContextoEstaciones): SenalEspectro | null {
  const capa = capaDeEstacion(fila, ctx);
  if (!capa) return null;
  return normalizarSenal({
    id: `estacion:${fila.id}`,
    medio: "estacion",
    // La banda es el TIPO que declara la estación (audio, video, mixto…): no ocupa una banda de radio.
    banda: (fila.tipo || "estacion").slice(0, 32),
    frecuenciaKhz: frecuenciaDeclaradaKhz(fila),
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: null,
    origen: "declarada",
    capa,
    fuente: "estación publicada por su dueño",
    medidoEn: null,
    zona: null,
    vinculo: { tipo: "estacion", id: fila.id },
    compatibles: [],
  });
}

/** Las señales de las estaciones que la persona puede ver. */
export function senalesDeEstaciones(filas: readonly FilaEstacion[], ctx: ContextoEstaciones): ResultadoAdaptador {
  if (!ctx.usuarioId) return sinFuente(MOTIVO_SIN_SESION);
  const senales: SenalEspectro[] = [];
  for (const fila of filas) {
    const s = senalDeEstacion(fila, ctx);
    if (s) senales.push(s);
  }
  return { senales, sinFuente: null };
}

/**
 * Igual, pero leyendo las filas por la fuente que le pasan: sin sesión o error de lectura →
 * `sinFuente` con el motivo (nunca lanza).
 */
export async function adaptarEstaciones(fuente: FuenteEstaciones, entidades: readonly string[] = []): Promise<ResultadoAdaptador> {
  try {
    const usuarioId = await fuente.usuarioId();
    if (!usuarioId) return sinFuente(MOTIVO_SIN_SESION);
    const filas = await fuente.listar();
    return senalesDeEstaciones(filas, { usuarioId, entidades });
  } catch {
    return sinFuente(MOTIVO_ERROR_LECTURA);
  }
}
