/**
 * Protomolécula · ALMACÉN DE VÍNCULOS. Persistencia local por molécula.
 * Patrón inyectable y try/catch como en almacen-moleculas.ts.
 * Prefijo: starseed.protomolecula.vinculos.v1:<moleculaId>
 */
import type { Vinculo, EstadoVinculo, claveFuente, procesar } from "./vinculos-control";
import type { FuenteControl } from "./vinculos-control";

/** Interfaz de almacenamiento inyectable (localStorage-like). */
export interface AlmacenLocal {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Prefijo para claves de vinculos por molécula. */
export const PREFIJO_VINCULOS = "starseed.protomolecula.vinculos.v1:";

/** Almacenamiento local de vinculos por molécula (inyectable). */
export function almacenNavegador(): AlmacenLocal | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Guarda los vinculos asociados a una molécula. */
export function guardarVinculos(
  a: AlmacenLocal,
  moleculaId: string,
  vinculos: Vinculo[]
): boolean {
  try {
    a.setItem(PREFIJO_VINCULOS + moleculaId, JSON.stringify(vinculos));
    return true;
  } catch {
    return false;
  }
}

/** Carga los vinculos asociados a una molécula. */
export function cargarVinculos(
  a: AlmacenLocal,
  moleculaId: string
): Vinculo[] | null {
  try {
    const crudo = a.getItem(PREFIJO_VINCULOS + moleculaId);
    if (crudo === null) return null;
    const parsed = JSON.parse(crudo);
    return Array.isArray(parsed) ? parsed.filter(
      v => v && typeof v === "object" && typeof v.id === "string" &&
           typeof v.objetivo === "object" && typeof v.objetivo.atomoId === "string" &&
           typeof v.objetivo.parametroId === "string" && typeof v.modo === "string" &&
           typeof v.activo === "boolean"
    ) as Vinculo[] : null;
  } catch {
    return null;
  }
}

/** Crea un enrutador MIDI que convierte mensajes a operaciones del controlador. */
export function crearEnrutador(
  vinculos: Vinculo[],
  parametroDe: (ref: { atomoId: string; parametroId: string }) => 
    { id: string; nombre: string; tipo: string; min?: number; max?: number; paso?: number; opciones?: string[] } | undefined,
  controlador: { mover: (op: any) => void },
  autor: { tipo: "persona" | "agente"; id: string },
  ahora: number,
  nuevoId: () => string
) {
  const estadosVinculo = new Map<string, EstadoVinculo>();
  for (const v of vinculos) estadosVinculo.set(v.id, { suave: null, ultimo: null, arriba: false });

  return {
    procesarMensaje: (datos) => {
      const { fuente, bruto } = datos;
      const clave = claveFuente(fuente);
      for (const v of vinculos) {
        if (claveFuente(v.fuente) === clave && v.activo) {
          const param = parametroDe(v.objetivo);
          if (!param) continue;
          const estadoPrev = estadosVinculo.get(v.id) ?? { suave: null, ultimo: null, arriba: false };
          const { operacion, estado } = procesar(v, param, estadoPrev, bruto, { autor, ahora, id: nuevoId() });
          estadosVinculo.set(v.id, estado);
          if (operacion) controlador.mover({ ...operacion, origen: "midi" });
        }
      }
    },
    limpiar: () => estadosVinculo.clear()
  };
}