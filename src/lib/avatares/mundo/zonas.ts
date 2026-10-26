/**
 * Zonas del escenario colocadas en el plano (Ola 1025U · U1).
 *
 * Reutiliza `disponerSalas` de la oficina de Genesis, portada de Hermes3D (MIT, © 2026 Luke The Dev,
 * github.com/iamlukethedev/Hermes3D; atribución en `components/astraura/genesis/oficina/LICENSE-hermes3d.md`):
 * las zonas son «salas» que se colocan en cuadrícula y crecen con la gente que tienen. Aquí no se copia
 * nada: se importa. La regla de honestidad de la oficina también manda: sin habitantes reales no hay
 * actividad que mostrar (`actividadVisible`).
 */
import { disponerSalas } from "@/components/astraura/genesis/oficina/oficina-salas";
import { actividadVisible } from "@/components/astraura/genesis/oficina/oficina-honestidad";
import type { SalaOficina } from "@/lib/astraura/genesis-types";
import type { ZonaEscenario } from "./escenarios";
import { RADIO_MUNDO, type HabitanteMundo, type OcupacionMundo, type ZonaSim } from "./simulacion";

export interface ZonaDispuesta {
  id: string;
  nombre: string;
  afinidad: OcupacionMundo | null;
  centro: { x: number; z: number };
  radio: number;
  color: string;
  /** Contorno irregular relativo al centro (plano X/Z). */
  contorno: ReadonlyArray<readonly [number, number]>;
  ocupantes: number;
  /** 0..1 ya filtrado por honestidad: 0 si no hay habitantes reales. */
  actividad: number;
}

export interface DisposicionZonas {
  zonas: ZonaDispuesta[];
  /** Radio que abarca todas las zonas desde el centro (para encuadrar la cámara y dimensionar el suelo). */
  extension: number;
}

/** Cuántos habitantes hay en cada zona ahora mismo. */
export function ocupantesPorZona(habitantes: readonly HabitanteMundo[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of habitantes) {
    if (h.zonaId) m.set(h.zonaId, (m.get(h.zonaId) ?? 0) + 1);
  }
  return m;
}

export function disponerZonas(zonas: readonly ZonaEscenario[], ocupantes: ReadonlyMap<string, number>): DisposicionZonas {
  const total = [...ocupantes.values()].reduce((a, b) => a + b, 0);
  const salas: SalaOficina[] = zonas.map((z) => ({
    id: z.id,
    nombre: z.nombre,
    procesoTipoId: null,
    actividad: total > 0 ? (ocupantes.get(z.id) ?? 0) / total : 0,
    color: null,
  }));
  const disposicion = disponerSalas(salas, ocupantes);
  const afinidadPorId = new Map(zonas.map((z) => [z.id, z.afinidad] as const));
  const dispuestas: ZonaDispuesta[] = disposicion.idsOrdenados.flatMap((id) => {
    const s = disposicion.salas.get(id);
    if (!s) return [];
    return [{
      id: s.id,
      nombre: s.nombre,
      afinidad: afinidadPorId.get(s.id) ?? null,
      centro: { x: s.centro.x, z: s.centro.z },
      radio: s.radio,
      color: s.color,
      contorno: s.contorno,
      ocupantes: s.ocupantes,
      actividad: actividadVisible(s.actividad, total > 0),
    }];
  });
  const extension = dispuestas.reduce((m, z) => Math.max(m, Math.hypot(z.centro.x, z.centro.z) + z.radio), 0);
  return { zonas: dispuestas, extension };
}

/** Lo que necesita la simulación de cada zona. */
export function zonasParaSimulacion(d: DisposicionZonas): ZonaSim[] {
  return d.zonas.map((z) => ({ id: z.id, centro: z.centro, radio: z.radio, afinidad: z.afinidad }));
}

/** Radio del suelo habitable: nunca menos que el de siempre, y siempre más que las zonas. */
export function radioDelSuelo(d: DisposicionZonas): number {
  return Math.max(RADIO_MUNDO, Math.ceil(d.extension + 6));
}

/* ───────────────────────────── Del plano a la escena 3D ───────────────────────────── */

/** Altura del suelo en la escena. */
export const SUELO_Y = -1.05;
/** A qué altura sobre el suelo queda el centro de la tarjeta de un avatar. */
export const ALTURA_AVATAR = 1.1;

/** Posición de un habitante en la escena: sobre el suelo, nunca por debajo ni flotando lejos de él. */
export function posicionEnEscena(p: readonly [number, number, number]): [number, number, number] {
  return [p[0], SUELO_Y + ALTURA_AVATAR + Math.max(0, p[1]), p[2]];
}
