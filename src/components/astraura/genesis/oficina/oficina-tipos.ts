/**
 * oficina-tipos.ts — Tipos propios de `genesis/oficina/`.
 *
 * Los tipos del CONTRATO (`SalaOficina`, `OcupanteOficina`, `ActividadOcupante`,
 * `EstadoOficina`, `SerListado`) viven en `genesis-types.ts` y NO se redefinen
 * aquí — solo se importan. Lo de aquí es vocabulario interno: qué forma tiene
 * "dónde va cada sala" y "cómo se anima cada ocupante", análogo a como
 * `mundo-tipos.ts` separa el contrato de la geometría derivada de él.
 */

import type { ReactNode } from "react";
import type { ActividadOcupante, EstadoOficina, SerListado } from "@/lib/astraura/genesis-types";

/** Posición en el plano de la oficina (unidades de escena, no del contrato). */
export interface PosicionOficina {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Una sala ya dispuesta en el plano: centro, tamaño y contorno reales, listos
 * para dibujar tanto en la escena 3D como en el respaldo 2D. */
export interface SalaDispuesta {
  readonly id: string;
  readonly nombre: string;
  readonly procesoTipoId: string | null;
  /** Siempre en el suelo (y=0): las salas son el plano, no flotan. */
  readonly centro: PosicionOficina;
  readonly radio: number;
  /** Contorno irregular relativo al centro, plano X/Z — mismo espíritu que
   * `contornoEspacio` de `genesis/mundo/` (parcela con carácter, no un círculo
   * perfecto), reutilizado tal cual para que el mismo vocabulario visual de
   * "un lugar con forma propia" valga en el mundo y en la oficina. */
  readonly contorno: ReadonlyArray<readonly [number, number]>;
  /** Ya resuelto: el color propio de la sala, o uno derivado de su id si no
   * declaró ninguno — nunca un valor por defecto plano igual para todas. */
  readonly color: string;
  /** 0..1 tal cual lo manda el contrato — SIN filtrar por honestidad todavía;
   * quien pinte la escena decide si mostrarlo o no según `datosReales` (ver
   * `actividadVisible` en oficina-honestidad.ts). Guardarlo crudo aquí evita
   * que `disponerSalas` (que no sabe nada de honestidad) tenga que decidir. */
  readonly actividad: number;
  /** Cuántos ocupantes tiene asignados ahora mismo — ya contado, para que el
   * render no tenga que volver a agrupar `ocupantes` por sala. */
  readonly ocupantes: number;
}

/** Resultado íntegro de disponer el plano de la oficina. */
export interface DisposicionOficina {
  readonly salas: ReadonlyMap<string, SalaDispuesta>;
  /** Orden estable (por id) — la lista accesible y el ciclado por teclado
   * ("sala siguiente/anterior") recorren SIEMPRE este orden, nunca el orden
   * de llegada del backend (que puede cambiar entre peticiones sin que eso
   * signifique nada). */
  readonly idsOrdenados: readonly string[];
  /** Dónde esperan los ocupantes sin sala asignada (o con una que ya no
   * existe) — un lugar neutro, nunca un `null` que rompa el render. */
  readonly centroVestibulo: PosicionOficina;
  readonly radioVestibulo: number;
}

/** Cómo se anima el CUERPO de un ocupante más allá del latido propio de
 * `AvatarSer` (eso ya lo hace el propio avatar; esto es la capa de ACTIVIDAD:
 * qué hace visible que alguien está pensando, hablando o trabajando). Todo en
 * 0 cuando `datosReales` es falso — ver `oficina-honestidad.ts`. */
export interface ParametrosAnimacionOcupante {
  /** Amplitud del vaivén vertical, en unidades de mundo. */
  readonly amplitudBob: number;
  /** Frecuencia del vaivén, en Hz. */
  readonly frecuenciaBobHz: number;
  /** Amplitud del balanceo lateral (inclinación en el eje Z), en radianes —
   * la señal de "está gesticulando/hablando". */
  readonly oscilacionLateral: number;
  /** Rotación extra sobre Y, en rad/s — la señal de "está pensando", un giro
   * lento y continuo sobre su propio eje. */
  readonly velocidadGiroExtra: number;
  /** Pulso de escala adicional (0 = ninguno) sobre el 1.0 base. */
  readonly escalaExtra: number;
}

/** Un ocupante, ya resuelto contra `seres` y con su posición objetivo — lo que
 * la escena (3D o 2D) necesita para dibujarlo sin volver a buscar nada. */
export interface OcupanteResuelto {
  readonly serId: string;
  readonly ser: SerListado | null;
  readonly salaId: string | null;
  readonly actividad: ActividadOcupante;
  readonly detalle: string | null;
  readonly desde: number;
  readonly objetivo: PosicionOficina;
  readonly animacion: ParametrosAnimacionOcupante;
}

// ─────────────────────────────────────────────────────────── Props públicas

export interface OficinaSeresProps {
  estado: EstadoOficina;
  seres: readonly SerListado[];
  className?: string;
  /** Se avisa cada vez que cambia el ocupante seleccionado (opcional). */
  onSeleccionCambia?: (serId: string | null) => void;
  /** Nodo opcional para inyectar controles extra en la barra superior. */
  controlesExtra?: ReactNode;
}
