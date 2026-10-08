/**
 * StarSeed OS — CAMR · PLANIFICADOR MULTITRAYECTO COMUNITARIO.
 * ============================================================================
 * Ola 1005C · CAMR1005C · §3 del contrato: clase de tráfico → enlaces.
 *   · control-critico: largo alcance y alta resiliencia, DOS caminos si existen
 *     (redundancia), y prioridad de emergencia sobre los cupos de aire.
 *   · masivo: mayor capacidad, troceado por MTU; NUNCA LoRa/RNS salvo `forzar`.
 *   · tiempo-real: menor latencia estable.
 *   · mensajes: mejor equilibrio.
 * Cumple §5: `cifradoPermitido` veta las bandas de radioaficionado al tráfico
 * cifrado, y los cupos de tiempo de aire reparten la equidad comunitaria
 * (bandas compartidas); el ciclo de trabajo lo vigila `regulacion.ts`.
 *
 * Módulo PURO y determinista. Nunca lanza.
 */

import { puntuacionHibrida } from "./metrica";
import type { EstadoResiliencia } from "./metrica";
import type { ClaseTrafico, EnlaceFisico, Medicion } from "./tipos";

/** Paquete a enrutar (el contenido en sí lo gestiona la capa de envío). */
export interface PaquetePlanificar {
  /** Tamaño total del paquete (bytes). */
  bytes: number;
  /** ¿El contenido va cifrado? Vetaría bandas de radioaficionado (§5). */
  cifrado: boolean;
  /** Petición expresa de usar LoRa/RNS para masivo (caso excepcional). */
  forzar?: boolean;
}

/** Métricas vivas por enlace (id de enlace → medición + histórico). */
export type MetricasPlan = Record<
  string,
  { medicion: Medicion; resiliencia: EstadoResiliencia }
>;

/** Cupos de tiempo de aire disponibles (ms) por enlace en bandas compartidas. */
export type CuotasAire = Record<string, number>;

/** Una ruta elegida por el planificador. */
export interface RutaPlanificada {
  enlaceId: string;
  /** true si es el camino redundante de control-critico. */
  redundante: boolean;
  /** Fragmentos por MTU del enlace (reensamblado en la capa CAMR, §1). */
  fragmentos: number;
  /** Puntuación híbrida 0..1 del enlace para esa clase. */
  puntuacion: number;
  /** Por qué (transparencia radical para el panel, §6). */
  motivo: string;
}

/* ── Utilidades puras ─────────────────────────────────────────────────────── */

/** Fragmentos necesarios para cruzar un enlace de `mtu` bytes. */
export function fragmentosPorMtu(bytes: number, mtu: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  if (!Number.isFinite(mtu) || mtu <= 0) return 1;
  return Math.ceil(bytes / mtu);
}

/** Tiempo de aire estimado de un envío (ms): bits ÷ kbps, más 10 % de margen. */
export function estimaAireMs(bytes: number, capacidadKbps: number): number {
  if (capacidadKbps <= 0 || bytes <= 0) return 0;
  return (bytes * 8 * 1.1) / capacidadKbps;
}

/** Tecnologías de largo alcance y baja capacidad (LoRa/RNS/Meshtastic). */
const LARGO_ALCANCE: ReadonlySet<string> = new Set(["rns", "meshtastic"]);

interface Candidato {
  enlace: EnlaceFisico;
  puntuacion: number;
}

/** true si el enlace puede portar `paquete` ahora (estado, cifrado, cuota). */
export function admisible(
  enlace: EnlaceFisico,
  paquete: PaquetePlanificar,
  clase: ClaseTrafico,
  cuotas: CuotasAire,
): boolean {
  if (enlace.estado === "caido" || enlace.estado === "desconectado") return false;
  if (paquete.cifrado && !enlace.cifradoPermitido) return false;
  if (clase === "masivo" && LARGO_ALCANCE.has(enlace.tecnologia) && !paquete.forzar) {
    return false;
  }
  // Equidad comunitaria: sin cupo de aire no se emite… salvo emergencias.
  const cupo = cuotas[enlace.id];
  if (cupo !== undefined && clase !== "control-critico") {
    if (estimaAireMs(paquete.bytes, enlace.capacidadKbps) > cupo) return false;
  }
  return true;
}

/**
 * planificar — decide la(s) ruta(s) de un paquete según su clase (§3).
 * Devuelve [] si ningún enlace es admisible (caída total o ley que lo veta).
 */
export function planificar(
  paquete: PaquetePlanificar,
  clase: ClaseTrafico,
  enlaces: EnlaceFisico[],
  metricas: MetricasPlan,
  cuotas: CuotasAire,
): RutaPlanificada[] {
  const candidatos: Candidato[] = [];
  for (const enlace of enlaces) {
    if (!admisible(enlace, paquete, clase, cuotas)) continue;
    const m = metricas[enlace.id];
    if (!m) continue;
    // §3: control-critico va por enlaces de LARGO ALCANCE y alta resiliencia;
    // bonus que los antepone a cualquier IP mesh si existe al menos uno sano.
    const bonus =
      clase === "control-critico" && LARGO_ALCANCE.has(enlace.tecnologia) ? 0.25 : 0;
    candidatos.push({
      enlace,
      puntuacion:
        puntuacionHibrida(m.medicion, enlace.capacidadKbps, clase, m.resiliencia) + bonus,
    });
  }
  if (candidatos.length === 0) return [];
  // Empate → desempate por mayor capacidad y luego por id (determinista).
  candidatos.sort(
    (a, b) =>
      b.puntuacion - a.puntuacion ||
      b.enlace.capacidadKbps - a.enlace.capacidadKbps ||
      a.enlace.id.localeCompare(b.enlace.id),
  );

  const motivos: Record<ClaseTrafico, string> = {
    "control-critico": "largo alcance y alta resiliencia, con redundancia",
    mensajes: "mejor equilibrio de latencia, ancho de banda y resiliencia",
    "tiempo-real": "menor latencia estable",
    masivo: "mayor capacidad disponible, troceado por MTU",
  };
  const ruta = (c: Candidato, redundante: boolean): RutaPlanificada => ({
    enlaceId: c.enlace.id,
    redundante,
    fragmentos: fragmentosPorMtu(paquete.bytes, c.enlace.mtu),
    puntuacion: c.puntuacion,
    motivo: motivos[clase],
  });

  if (clase === "control-critico") {
    const out = [ruta(candidatos[0], false)];
    if (candidatos.length > 1) {
      // Redundancia con diversidad: mejor un camino de otra tecnología.
      const segundo =
        candidatos.slice(1).find((c) => c.enlace.tecnologia !== candidatos[0].enlace.tecnologia) ??
        candidatos[1];
      out.push(ruta(segundo, true));
    }
    return out;
  }
  return [ruta(candidatos[0], false)];
}

/** Consume cupo de aire tras emitir. Devuelve un registro NUEVO (inmutable). */
export function consumeCuota(cuotas: CuotasAire, enlaceId: string, ms: number): CuotasAire {
  const actual = cuotas[enlaceId];
  if (actual === undefined) return cuotas;
  return { ...cuotas, [enlaceId]: Math.max(0, actual - Math.max(0, ms)) };
}
