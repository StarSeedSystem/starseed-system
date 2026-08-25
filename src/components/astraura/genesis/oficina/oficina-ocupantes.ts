/**
 * oficina-ocupantes.ts — De `OcupanteOficina[]` a "dónde está cada uno" y
 * "cómo se anima según lo que está haciendo". Las dos derivaciones puras que
 * pide el encargo: ocupante→posición y actividad→animación.
 *
 * PORTADO DE HERMES3D (MIT, © 2026 Luke The Dev — ver LICENSE-hermes3d.md): la
 * idea de "cada agente vive en una sala y se le ve activo en ella", no su
 * implementación — Hermes3D anima sprites 2D con un ciclo de piernas
 * (`objects/agents.tsx` allí: `frame`, `walkSpeed`, `state: "walking"|...`)
 * porque sus agentes son personas en píxeles. Los nuestros son organismos
 * derivados de ADN sin piernas (`AvatarSer`) — así que "moverse" aquí es
 * GLICAR hacia el sitio nuevo (interpolación exponencial, ver
 * `VELOCIDAD_TRASLADO_OCUPANTE`), y "trabajar/hablar/pensar" es una capa de
 * animación propia (vaivén, balanceo, giro) que se SUMA al latido que
 * `AvatarSer` ya trae de fábrica — nunca lo sustituye.
 */

import { GOLDEN_ANGLE_DEG } from "@/lib/astraura/genesis-dna";
import type { ActividadOcupante, OcupanteOficina } from "@/lib/astraura/genesis-types";
import { FRACCION_RADIO_OCUPABLE, RADIO_OCUPANTE } from "./oficina-constantes";
import type { DisposicionOficina, ParametrosAnimacionOcupante, PosicionOficina } from "./oficina-tipos";

// ─────────────────────────────────────────────────────── Agrupar por sala

/**
 * Agrupa ocupantes por sala, ORDENADOS por `serId` dentro de cada grupo (para
 * que la sub-posición de cada uno sea estable sin importar en qué orden los
 * mande el backend). La clave `null` reúne tanto a quien no tiene sala
 * asignada como a quien apunta a una que ya no existe en `idsSalasValidas`
 * — una referencia colgante no es un error de render, es alguien en el
 * vestíbulo.
 */
export function agruparPorSala(
  ocupantes: readonly OcupanteOficina[],
  idsSalasValidas: ReadonlySet<string>,
): ReadonlyMap<string | null, readonly OcupanteOficina[]> {
  const grupos = new Map<string | null, OcupanteOficina[]>();
  for (const ocupante of ocupantes) {
    const clave = ocupante.salaId !== null && idsSalasValidas.has(ocupante.salaId) ? ocupante.salaId : null;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(ocupante);
    else grupos.set(clave, [ocupante]);
  }
  for (const grupo of grupos.values()) grupo.sort((a, b) => a.serId.localeCompare(b.serId));
  return grupos;
}

/** Recuento por sala a partir del agrupado — excluye el vestíbulo (`null`):
 * eso lo pide `disponerSalas` como número aparte (`ocupantesSinSala`). */
export function contarPorSala(agrupado: ReadonlyMap<string | null, readonly OcupanteOficina[]>): ReadonlyMap<string, number> {
  const conteo = new Map<string, number>();
  for (const [clave, grupo] of agrupado) {
    if (clave !== null) conteo.set(clave, grupo.length);
  }
  return conteo;
}

// ─────────────────────────────────────────────────────── Ocupante → posición

const GOLDEN_ANGLE_RAD = (GOLDEN_ANGLE_DEG * Math.PI) / 180;

/**
 * Reparte `total` puntos dentro de un círculo de radio `radioUtil` centrado
 * en `centro`, en espiral de ángulo áureo (filotaxis) — la misma razón que
 * `genesis-dna.ts` usa el ángulo áureo para repartir colores: es el reparto
 * que nunca agrupa ni repite, aquí aplicado a posiciones en vez de matices.
 * Determinista: mismo índice y mismo total, siempre el mismo punto.
 */
export function posicionEnPatron(centro: PosicionOficina, radioUtil: number, indice: number, total: number): PosicionOficina {
  const angulo = indice * GOLDEN_ANGLE_RAD;
  const r = radioUtil * Math.sqrt((indice + 0.5) / Math.max(1, total));
  return { x: centro.x + Math.cos(angulo) * r, y: centro.y + RADIO_OCUPANTE, z: centro.z + Math.sin(angulo) * r };
}

/**
 * Posición objetivo de UN ocupante dentro de su grupo (sala, o vestíbulo si
 * no tiene sala válida). `indiceEnGrupo`/`totalEnGrupo` vienen de recorrer el
 * grupo YA ORDENADO que devuelve `agruparPorSala` — así el índice es estable.
 */
export function posicionOcupante(
  ocupante: Pick<OcupanteOficina, "salaId">,
  indiceEnGrupo: number,
  totalEnGrupo: number,
  disposicion: DisposicionOficina,
): PosicionOficina {
  const sala = ocupante.salaId !== null ? disposicion.salas.get(ocupante.salaId) : undefined;
  if (sala) return posicionEnPatron(sala.centro, sala.radio * FRACCION_RADIO_OCUPABLE, indiceEnGrupo, totalEnGrupo);
  return posicionEnPatron(disposicion.centroVestibulo, disposicion.radioVestibulo * FRACCION_RADIO_OCUPABLE, indiceEnGrupo, totalEnGrupo);
}

// ─────────────────────────────────────────────────────── Actividad → animación

const QUIETO: ParametrosAnimacionOcupante = {
  amplitudBob: 0,
  frecuenciaBobHz: 0,
  oscilacionLateral: 0,
  velocidadGiroExtra: 0,
  escalaExtra: 0,
};

/**
 * Un parámetro por actividad, trazable a qué comunica cada una:
 *   pensando   → giro lento y continuo sobre su propio eje, casi sin vaivén
 *                (contemplativo; nada de prisa).
 *   hablando   → balanceo lateral (gesticular) + un pequeño pulso de escala
 *                que marca énfasis, vaivén más vivo que pensar.
 *   trabajando → vaivén vertical rítmico y constante (el "tecleo"), sin
 *                balanceo lateral — foco, no conversación.
 *   inactivo   → nada extra: solo el latido propio de `AvatarSer`, que ya
 *                dice "está vivo" sin necesitar decir "está haciendo algo".
 */
const PARAMETROS_POR_ACTIVIDAD: Record<ActividadOcupante, ParametrosAnimacionOcupante> = {
  inactivo: QUIETO,
  pensando: { amplitudBob: 0.03, frecuenciaBobHz: 0.15, oscilacionLateral: 0, velocidadGiroExtra: 0.12, escalaExtra: 0 },
  hablando: { amplitudBob: 0.05, frecuenciaBobHz: 0.6, oscilacionLateral: 0.18, velocidadGiroExtra: 0, escalaExtra: 0.04 },
  trabajando: { amplitudBob: 0.08, frecuenciaBobHz: 0.9, oscilacionLateral: 0, velocidadGiroExtra: 0, escalaExtra: 0.02 },
};

/**
 * Parámetros de animación de un ocupante. `datosReales` manda por encima de
 * todo: si es falso, CERO — ver oficina-honestidad.ts para el porqué. Esta
 * función no decide honestidad, solo la obedece; quien la llama siempre debe
 * pasar el `datosReales` real de `EstadoOficina`.
 */
export function parametrosActividad(actividad: ActividadOcupante, datosReales: boolean): ParametrosAnimacionOcupante {
  if (!datosReales) return QUIETO;
  return PARAMETROS_POR_ACTIVIDAD[actividad];
}

// ─────────────────────────────────────────────────────── Texto accesible

function humanizarActividad(actividad: ActividadOcupante): string {
  switch (actividad) {
    case "pensando":
      return "pensando";
    case "hablando":
      return "hablando";
    case "trabajando":
      return "trabajando";
    case "inactivo":
      return "sin actividad ahora mismo";
  }
}

/** `marca` puede llegar en epoch-segundos o epoch-milisegundos — mismo criterio
 * defensivo que `fmtTs`/`fmtAgo` en `astraura/s158/shared.tsx`: por encima de
 * 1e12 ya son milisegundos con certeza (eso son ~el año 33658 en segundos). */
function aMs(marca: number): number {
  return marca > 1e12 ? marca : marca * 1000;
}

/** "hace 3 min", "hace 2 h"... — nunca negativo aunque `desde` sea posterior a
 * `ahora` (reloj del backend desincronizado no debe imprimir "hace -4 s"). */
export function formatoTranscurrido(desde: number, ahora: number): string {
  const diffMs = Math.max(0, aMs(ahora) - aMs(desde));
  const s = Math.round(diffMs / 1000);
  if (s < 5) return "justo ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Frase completa para un ocupante — la usan tanto el `aria-label` de su
 * botón en la lista accesible como el tooltip flotante en la escena 3D, así
 * que las dos vías cuentan exactamente la misma historia. */
export function describirOcupante(ocupante: Pick<OcupanteOficina, "actividad" | "detalle" | "desde">, nombreSer: string, ahora: number): string {
  const detalle = ocupante.detalle ? `: ${ocupante.detalle}` : "";
  return `${nombreSer} — ${humanizarActividad(ocupante.actividad)}${detalle} · ${formatoTranscurrido(ocupante.desde, ahora)}`;
}
