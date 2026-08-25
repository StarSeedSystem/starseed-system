/**
 * oficina-salas.ts — De `SalaOficina[]` (el contrato, sin coordenadas) a un
 * plano de oficina real: dónde está cada sala, qué tamaño tiene y qué forma.
 *
 * PORTADO DE HERMES3D (MIT, © 2026 Luke The Dev — ver LICENSE-hermes3d.md): la
 * IDEA de un plano de salas navegable, no su trazado. Hermes3D dibuja un
 * edificio fijo, diseñado a mano archivo por archivo (`core/district.ts`,
 * `core/constants.ts` allí: gimnasio en tal X, sala de servidores en tal Y...).
 * Nuestro contrato no tiene esas coordenadas — `SalaOficina` es solo
 * id/nombre/proceso/actividad — así que el plano se DERIVA, determinista, de
 * lo que el backend mande: cuántas salas hay y cuánta gente tiene cada una
 * ahora mismo. Añadir o quitar una sala reordena el plano igual de bien la
 * próxima vez, sin un editor de muebles ni un fichero de coordenadas que
 * mantener a mano.
 *
 * Determinista de principio a fin (mismo motivo que `mundo-espacio-forma.ts`):
 * mismas salas y mismos recuentos de ocupantes → mismo plano, siempre. Nada de
 * `Math.random()` — el contorno de cada sala sale de `contornoEspacio` (mundo/)
 * sembrado con el hash de su id, y el color por defecto sale del mismo hash.
 */

import { fnv1a32 } from "@/lib/astraura/genesis-dna";
import { contornoEspacio } from "@/components/astraura/genesis/mundo";
import type { SalaOficina } from "@/lib/astraura/genesis-types";
import {
  ESPACIADO_SALA,
  MARGEN_VESTIBULO,
  RADIO_SALA_BASE,
  RADIO_SALA_MAXIMO,
  RADIO_SALA_POR_OCUPANTE,
  RADIO_VESTIBULO_BASE,
  RADIO_VESTIBULO_POR_OCUPANTE,
} from "./oficina-constantes";
import type { DisposicionOficina, SalaDispuesta } from "./oficina-tipos";

/** Saturación/luminosidad fijas para el color derivado — solo el matiz varía
 * por sala, igual que `derivarAdn` deja S/L constantes y reparte por matiz. */
const SATURACION_COLOR_SALA = "68%";
const LUMINOSIDAD_COLOR_SALA = "56%";

/** Matiz determinista 0..360 a partir del id de la sala — mismo hash (FNV-1a)
 * que el resto del sistema usa para "de este texto, un número estable". */
function matizDesdeId(id: string): number {
  return (fnv1a32(`sala#${id}`) / 4294967296) * 360;
}

/** Color efectivo de una sala: el propio si lo declaró, o uno derivado de su
 * id si no — nunca el mismo tono plano para todas las salas sin nombre. */
export function colorSala(sala: Pick<SalaOficina, "id" | "color">): string {
  if (sala.color) return sala.color;
  return `hsl(${matizDesdeId(sala.id).toFixed(1)} ${SATURACION_COLOR_SALA} ${LUMINOSIDAD_COLOR_SALA})`;
}

/** Radio de una sala según cuántos ocupantes tiene AHORA — crece con la raíz
 * cuadrada (como el área, no el diámetro) para que duplicar la gente no
 * duplique el tamaño visual, y con un techo para que una sala no crezca sin
 * límite si el backend le asigna a todo el mundo. */
export function radioSala(ocupantes: number): number {
  const crecimiento = Math.sqrt(Math.max(0, ocupantes)) * RADIO_SALA_POR_OCUPANTE;
  return Math.min(RADIO_SALA_MAXIMO, RADIO_SALA_BASE + crecimiento);
}

/**
 * Dispone TODAS las salas en una cuadrícula centrada en el origen, más un
 * "vestíbulo" fuera de la cuadrícula para ocupantes sin sala asignada (o con
 * una que ya no existe — una referencia colgante no debe romper el render).
 *
 * @param salas Las salas del contrato, en cualquier orden.
 * @param ocupantesPorSala Recuento real de ocupantes por id de sala (ya
 *   agrupado por quien llama — ver `agruparPorSala` en oficina-ocupantes.ts).
 * @param ocupantesSinSala Cuántos ocupantes esperan en el vestíbulo — solo
 *   dimensiona su radio, no cambia nada de las salas.
 */
export function disponerSalas(
  salas: readonly SalaOficina[],
  ocupantesPorSala: ReadonlyMap<string, number>,
  ocupantesSinSala = 0,
): DisposicionOficina {
  // Orden estable por id — nunca el orden de llegada del backend, que puede
  // cambiar entre peticiones sin que la disposición deba temblar por eso.
  const ordenadas = [...salas].sort((a, b) => a.id.localeCompare(b.id));
  const idsOrdenados = ordenadas.map((s) => s.id);

  const n = ordenadas.length;
  const columnas = Math.max(1, Math.ceil(Math.sqrt(n)));
  const filas = n === 0 ? 0 : Math.ceil(n / columnas);
  const anchoTotal = Math.max(0, columnas - 1) * ESPACIADO_SALA;
  const profundoTotal = Math.max(0, filas - 1) * ESPACIADO_SALA;

  const mapa = new Map<string, SalaDispuesta>();
  ordenadas.forEach((sala, indice) => {
    const columna = indice % columnas;
    const fila = Math.floor(indice / columnas);
    const ocupantes = ocupantesPorSala.get(sala.id) ?? 0;
    const radio = radioSala(ocupantes);
    mapa.set(sala.id, {
      id: sala.id,
      nombre: sala.nombre,
      procesoTipoId: sala.procesoTipoId ?? null,
      centro: { x: columna * ESPACIADO_SALA - anchoTotal / 2, y: 0, z: fila * ESPACIADO_SALA - profundoTotal / 2 },
      radio,
      contorno: contornoEspacio(fnv1a32(`sala#${sala.id}`), radio),
      color: colorSala(sala),
      actividad: Math.max(0, Math.min(1, sala.actividad)),
      ocupantes,
    });
  });

  // El vestíbulo vive fuera de la cuadrícula, centrado en X, más allá de la
  // última fila — usa el radio MÁXIMO posible de sala como margen de
  // seguridad (no hace falta saber el radio real de la última fila para
  // garantizar que el vestíbulo nunca se solapa con ninguna sala).
  const radioVestibulo = RADIO_VESTIBULO_BASE + Math.sqrt(Math.max(0, ocupantesSinSala)) * RADIO_VESTIBULO_POR_OCUPANTE;
  const zVestibulo = n === 0 ? 0 : profundoTotal / 2 + RADIO_SALA_MAXIMO + MARGEN_VESTIBULO + radioVestibulo;

  return {
    salas: mapa,
    idsOrdenados,
    centroVestibulo: { x: 0, y: 0, z: zVestibulo },
    radioVestibulo,
  };
}
