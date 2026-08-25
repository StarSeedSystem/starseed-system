/**
 * mundo-tipos.ts — Tipos propios de `genesis/mundo/`.
 *
 * Los tipos del CONTRATO (Ser, Vinculo, Comunidad, Espacio, ObjetoEspacio,
 * NodoLinaje, RasgosAdn) viven en `genesis-types.ts` / `genesis-dna.ts` y NO
 * se redefinen aquí — solo se importan. Lo de aquí es vocabulario interno de
 * este módulo: qué forma tiene "el resultado de calcular dónde va cada cosa".
 */

import type { ReactNode } from "react";
import type { SerListado, Vinculo, Comunidad, Espacio, NodoLinaje } from "@/lib/astraura/genesis-types";

// ─────────────────────────────────────────────────────── Geometría del mundo

/**
 * Posición en el espacio físico del motor de fuerzas (unidades nativas, no
 * de escena — ver `aPosicionEscena` en mundo-constantes.ts para el paso a
 * unidades de render).
 */
export interface PosicionMundo {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Una comunidad o un espacio, ya dispuestos: dónde está su centro y qué
 * radio real ocupan sus miembros (no un tamaño inventado).
 */
export interface RegionDispuesta {
  readonly id: string;
  readonly centro: PosicionMundo;
  readonly radio: number;
  readonly miembros: readonly string[];
}

/**
 * Una región dispuesta (`RegionDispuesta`) enriquecida con lo que hace
 * falta para DIBUJARLA — nombre, color, y de qué tipo de entidad viene, que
 * decide su geometría: un espacio lleva `semilla` (contorno irregular vía
 * `contornoEspacio`, ver mundo-espacio-forma.ts); una comunidad no tiene
 * semilla en el contrato — a propósito se queda en un círculo simple, para
 * que el dibujo mismo comunique que son dos tipos de cosa distintos.
 */
export interface RegionVisible extends RegionDispuesta {
  readonly tipo: "comunidad" | "espacio";
  readonly nombre: string;
  readonly color: string | null;
  readonly semilla: number | null;
}

/**
 * Resultado íntegro de `calcularDisposicionMundo`: dónde va cada ser, y el
 * contorno de cada comunidad/espacio que los agrupa.
 */
export interface DisposicionMundo {
  readonly seres: ReadonlyMap<string, PosicionMundo>;
  readonly comunidades: ReadonlyMap<string, RegionDispuesta>;
  readonly espacios: ReadonlyMap<string, RegionDispuesta>;
  /** Pasos de física realmente ejecutados (0 con listas vacías). */
  readonly iteraciones: number;
}

/**
 * Una arista dibujable entre dos seres — vínculo real o rama de linaje; el
 * renderizador no necesita saber cuál de las dos es.
 */
export interface AristaVisible {
  readonly id: string;
  readonly origenId: string;
  readonly destinoId: string;
  /** 0..1 — grosor/opacidad visual. */
  readonly intensidad: number;
  /** Etiqueta libre para elegir color/estilo (p.ej. tipo de vínculo). */
  readonly tipo: string;
  readonly bidireccional: boolean;
}

// ────────────────────────────────────────────────────────────────── Linaje

/** Un nodo de linaje ya dispuesto en el árbol (fila = generación). */
export interface PosicionLinaje {
  readonly x: number;
  readonly y: number;
}

export interface DisposicionLinaje {
  readonly posiciones: ReadonlyMap<string, PosicionLinaje>;
  readonly raices: readonly string[];
  readonly aristas: readonly AristaVisible[];
  /** Generación máxima vista (para dimensionar la escena). */
  readonly generacionMaxima: number;
}

// ───────────────────────────────────────────────────────────── Selección

/** Qué ser está señalado ahora mismo, y por qué medio (para que el anuncio a
 * lector de pantalla y el resaltado 3D sepan si deben mover la cámara). */
export interface SeleccionMundo {
  readonly serId: string | null;
  readonly origen: "lista" | "escena" | "teclado" | "ninguno";
}

export type VistaMundo = "mundo" | "linaje";

// ───────────────────────────────────────────────────────────── Props públicas

export interface MundoSeresProps {
  seres: readonly SerListado[];
  vinculos: readonly Vinculo[];
  comunidades: readonly Comunidad[];
  espacios: readonly Espacio[];
  /** Linaje opcional: sin él, la vista "Linaje" simplemente no se ofrece. */
  linaje?: readonly NodoLinaje[];
  className?: string;
  /** Se avisa cada vez que cambia la selección (opcional; el mundo funciona
   * igual de bien sin que nadie escuche). */
  onSeleccionCambia?: (serId: string | null) => void;
  /** Nodo opcional para inyectar controles extra en la barra superior del
   * mundo (p.ej. un botón del componente contenedor). No lo usa el propio
   * MundoSeres más que para colocarlo. */
  controlesExtra?: ReactNode;
}
