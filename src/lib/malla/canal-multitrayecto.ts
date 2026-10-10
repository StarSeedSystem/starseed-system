/**
 * canal-multitrayecto — un archivo por VARIOS enlaces abiertos a la vez (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Envuelve varios `CanalArchivos` (enlace local emparejado sin internet, canal de la malla de la
 * cuenta, vínculo entre cuentas) en UNO que el motor de archivos (`archivos-malla.ts`) usa sin
 * saberlo: los mensajes de control (oferta, fin, cancelar…) van por el enlace principal y los
 * TROZOS se reparten entre todos según la capacidad medida de cada uno (selector ponderado de
 * `eleccion-enlace.ts`), saltando en esa vuelta el que tenga su cola llena o falle.
 *
 * El receptor no necesita nada especial: guarda cada trozo por su índice venga por donde venga y
 * verifica el archivo entero con su SHA-256 al final (`archivos-malla` espera a tener todos los
 * trozos antes de verificar, porque por varios caminos el «fin» puede adelantarse a un trozo).
 *
 * Sin DOM ni red propios: se prueba con canales de mentira. Nunca lanza.
 */

import type { CanalArchivos } from "@/lib/network/archivos-malla";
import { crearSelectorPonderado, pesosPorCapacidad } from "@/lib/malla/eleccion-enlace";

export interface SubcanalArchivos {
  id: string;
  canal: CanalArchivos;
  /** Capacidad medida (kbps) para el peso del reparto; null = sin medir. */
  capacidadKbps?: number | null;
}

export interface CanalMultitrayecto extends CanalArchivos {
  /** Trozos enviados por cada enlace hasta ahora (lo que se enseña: «por dónde fue»). */
  reparto(): Record<string, number>;
  /** Ids de los enlaces que componen el canal, el principal primero. */
  enlaces(): string[];
}

/** Por encima de esto (bytes en cola) un enlace se salta en esa vuelta. 1 MiB, como el motor. */
export const UMBRAL_COLA_MULTI = 1_048_576;

const PREFIJO_TROZO = '{"t":"archivo.chunk"';

/** ¿Este texto es un trozo de archivo? (el motor lo serializa con `t` primero). */
export function esTrozo(texto: string): boolean {
  return typeof texto === "string" && texto.startsWith(PREFIJO_TROZO);
}

export function crearCanalMultitrayecto(subcanales: SubcanalArchivos[], opts: { umbralCola?: number } = {}): CanalMultitrayecto {
  const subs = subcanales.filter((s) => s && s.canal && typeof s.canal.enviar === "function");
  const umbral = opts.umbralCola ?? UMBRAL_COLA_MULTI;
  const selector = crearSelectorPonderado(pesosPorCapacidad(subs.map((s) => ({ id: s.id, capacidadKbps: s.capacidadKbps }))));
  const cuenta: Record<string, number> = {};
  for (const s of subs) cuenta[s.id] = 0;
  const porId = new Map(subs.map((s) => [s.id, s] as const));

  const cola = (s: SubcanalArchivos): number => {
    try {
      return s.canal.bufferedAmount?.() ?? 0;
    } catch {
      return 0;
    }
  };

  /** Envía un trozo por el siguiente enlace que pueda; prueba los demás si uno falla. */
  const enviarTrozo = (mandar: (s: SubcanalArchivos) => boolean): boolean => {
    const saltar = new Set<string>();
    for (const s of subs) if (cola(s) > umbral) saltar.add(s.id);
    if (saltar.size === subs.length) saltar.clear(); // todos llenos: el motor ya esperó; se intenta igual
    for (let i = 0; i < subs.length; i++) {
      const id = selector.siguiente(saltar);
      if (!id) break;
      const s = porId.get(id);
      let ok = false;
      try {
        ok = !!s && mandar(s);
      } catch {
        ok = false;
      }
      if (ok) {
        cuenta[id] = (cuenta[id] ?? 0) + 1;
        return true;
      }
      saltar.add(id);
    }
    return false;
  };

  /** Control: por el principal y, si falla, por el siguiente que funcione. */
  const enviarControl = (texto: string): boolean => {
    for (const s of subs) {
      try {
        if (s.canal.enviar(texto)) return true;
      } catch {
        /* siguiente */
      }
    }
    return false;
  };

  const todosBinario = subs.length > 0 && subs.every((s) => typeof s.canal.enviarBinario === "function");

  const canal: CanalMultitrayecto = {
    enviar(texto: string): boolean {
      if (!subs.length) return false;
      if (esTrozo(texto)) return enviarTrozo((s) => s.canal.enviar(texto));
      return enviarControl(texto);
    },
    // Solo si TODOS lo admiten: el modo binario se negocia una vez para toda la transferencia.
    ...(todosBinario
      ? {
          enviarBinario(buf: ArrayBuffer): boolean {
            return enviarTrozo((s) => !!s.canal.enviarBinario?.(buf));
          },
        }
      : {}),
    // El motor espera mientras esto supere su umbral: espera solo si TODOS los enlaces van llenos.
    bufferedAmount(): number {
      if (!subs.length) return 0;
      return Math.min(...subs.map(cola));
    },
    alMensaje(cb) {
      const bajas = subs.map((s) => {
        try {
          return s.canal.alMensaje(cb);
        } catch {
          return () => undefined;
        }
      });
      return () => {
        for (const b of bajas) {
          try {
            b();
          } catch {
            /* noop */
          }
        }
      };
    },
    reparto: () => ({ ...cuenta }),
    enlaces: () => subs.map((s) => s.id),
  };
  return canal;
}
