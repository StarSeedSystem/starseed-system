/**
 * StarSeed OS — CAMR · PLANIFICADOR MULTITRAYECTO COMUNITARIO (Ola 1005C · CAMR1005C).
 * ============================================================================
 * §3 del contrato CAMR: `planificar(paquete, clase, enlaces, metricas, cuotas)`
 * devuelve la lista ordenada de rutas candidatas.
 *   · control-critico → largo alcance y alta resiliencia, dos caminos si existen;
 *   · masivo → mayor capacidad, troceado, nunca por LoRa salvo `forzar`;
 *   · tiempo-real → menor latencia estable;
 *   · mensajes → mejor equilibrio (métrica híbrida).
 * Equidad: cupos de tiempo de aire por nodo, con prioridad a emergencias
 * (control-critico salta el cupo agotado). Respeta `permiteCifrado` (§5) y el
 * troceado por MTU al cruzar tecnologías.
 *
 * Módulo PURO y determinista. Nunca lanza.
 */

import { puntuacionHibrida, type EstadoResiliencia } from "./metrica";
import { permiteCifrado } from "./regulacion";
import type { ClaseTrafico, EnlaceFisico, Medicion } from "./tipos";

/** Paquete a enrutar (la clase va aparte para que gobierne la política). */
export interface PaquetePlan {
  /** Tamaño en bytes. */
  bytes: number;
  /** ¿El contenido va cifrado? Si sí, jamás por bandas de radioaficionado. */
  cifrado: boolean;
}

/** Métricas recientes y resiliencia histórica, indexadas por id de enlace. */
export interface MetricasPlan {
  medicion: Record<string, Medicion>;
  resiliencia?: Record<string, EstadoResiliencia>;
}

/**
 * Cupos de tiempo de aire por nodo (ms en la ventana), en bandas compartidas.
 * Las emergencias (control-critico) tienen prioridad y no se descartan.
 */
export interface CuotasPlan {
  cupoMs: Record<string, number>;
  consumidoMs: Record<string, number>;
}

/** Opciones de la política. */
export interface OpcionesPlan {
  /** Autoriza el tráfico masivo por LoRa/RNS (petición expresa del usuario). */
  forzarLoraMasivo?: boolean;
}

/** Ruta candidata: enlace elegido y fragmentos ya calculados por MTU. */
export interface RutaPlan {
  enlaceId: string;
  tecnologia: EnlaceFisico["tecnologia"];
  /** Capacidad nominal del enlace (kbps), para ordenar el masivo. */
  capacidadKbps: number;
  /** Fragmentos necesarios: ceil(bytes / mtu). */
  fragmentos: number;
  puntuacion: number;
  motivo: string;
}

/* Tecnologías de largo alcance (control-critico) y de alta capacidad (masivo). */
export const LARGO_ALCANCE = new Set<EnlaceFisico["tecnologia"]>(["rns", "meshtastic"]);
export const ALTA_CAPACIDAD = new Set<EnlaceFisico["tecnologia"]>([
  "80211s",
  "batman",
  "babel",
  "yggdrasil",
]);

/** Marca opcional de enlace de alta capacidad que no es de malla IP. */
export const ES_SIMULADO: EnlaceFisico["tecnologia"] = "simulado";

const VACIA: EstadoResiliencia = { ema: 0.7, n: 0 };

/**
 * planificar — elige rutas para `paquete` según su clase, las métricas y la
 * equidad comunitaria. Devuelve la lista ORDENADA de rutas (vacía si ninguna
 * sirve). En control-critico incluye la redundante como segunda entrada.
 */
export function planificar(
  paquete: PaquetePlan,
  clase: ClaseTrafico,
  enlaces: EnlaceFisico[],
  metricas: MetricasPlan,
  cuotas: CuotasPlan,
  opts: OpcionesPlan = {},
): RutaPlan[] {
  const candidatos = enlaces.filter((e) => sirve(e, paquete, clase, cuotas, opts));
  const conNota = candidatos.map((e) => ruta(e, paquete, clase, metricas));
  const ordenada = ordenaPorClase(conNota, clase, metricas);

  if (clase === "control-critico") {
    // Redundancia: el primario por largo alcance y resiliencia; si existe,
    // un segundo camino distinto (preferida otra tecnología).
    if (ordenada.length <= 1) return ordenada;
    const primaria = ordenada[0];
    const redundante =
      ordenada.find((r) => r.tecnologia !== primaria.tecnologia) ?? ordenada[1];
    return [
      { ...primaria, motivo: `${primaria.motivo}; camino primario` },
      { ...redundante, motivo: `${redundante.motivo}; camino redundante` },
    ];
  }
  return ordenada;
}

/** Filtros duros: estado, cifrado permitido y cupo de tiempo de aire. */
function sirve(
  e: EnlaceFisico,
  paquete: PaquetePlan,
  clase: ClaseTrafico,
  cuotas: CuotasPlan,
  opts: OpcionesPlan,
): boolean {
  if (e.estado === "caido" || e.estado === "desconectado") return false;
  if (paquete.cifrado && !(e.cifradoPermitido && permiteCifrado(e.banda))) return false;
  if (clase === "masivo" && LARGO_ALCANCE.has(e.tecnologia) && !opts.forzarLoraMasivo) {
    return false;
  }
  const emergencia = clase === "control-critico";
  if (!emergencia && cuotaAgotada(e.id, cuotas)) return false;
  return true;
}

/** ¿El nodo ya gastó su cupo de tiempo de aire en la banda compartida? */
export function cuotaAgotada(nodoId: string, cuotas: CuotasPlan): boolean {
  const cupo = cuotas.cupoMs[nodoId];
  if (cupo === undefined) return false;
  return (cuotas.consumidoMs[nodoId] ?? 0) >= cupo;
}

function ruta(
  e: EnlaceFisico,
  paquete: PaquetePlan,
  clase: ClaseTrafico,
  metricas: MetricasPlan,
): RutaPlan {
  const m = metricas.medicion[e.id];
  const res = metricas.resiliencia?.[e.id] ?? VACIA;
  const puntuacion = m
    ? puntuacionHibrida(m, e.capacidadKbps, clase, res)
    : res.ema;
  return {
    enlaceId: e.id,
    tecnologia: e.tecnologia,
    capacidadKbps: e.capacidadKbps,
    fragmentos: fragmentosPorMtu(paquete.bytes, e.mtu),
    puntuacion,
    motivo: motivo(e, clase, m),
  };
}

/** Ordenación por política de clase. */
function ordenaPorClase(
  rutas: RutaPlan[],
  clase: ClaseTrafico,
  metricas: MetricasPlan,
): RutaPlan[] {
  const copia = [...rutas];
  if (clase === "tiempo-real") {
    return copia.sort(
      (a, b) => latenciaDe(a, metricas) - latenciaDe(b, metricas) || b.puntuacion - a.puntuacion,
    );
  }
  if (clase === "masivo") {
    return copia.sort(
      (a, b) => b.capacidadKbps - a.capacidadKbps || b.puntuacion - a.puntuacion,
    );
  }
  // control-critico y mensajes: métrica híbrida (sus pesos ya favorecen
  // resiliencia o equilibrio, respectivamente).
  return copia.sort((a, b) => b.puntuacion - a.puntuacion);
}

/** Troceado por MTU (fragmentación/reensamblado en la capa CAMR). */
export function fragmentosPorMtu(bytes: number, mtu: number): number {
  if (bytes <= 0) return 0;
  const utiles = Math.max(1, mtu);
  return Math.ceil(bytes / utiles);
}

function latenciaDe(r: RutaPlan, metricas: MetricasPlan): number {
  return metricas.medicion[r.enlaceId]?.latenciaMs ?? Number.POSITIVE_INFINITY;
}

function motivo(e: EnlaceFisico, clase: ClaseTrafico, m: Medicion | undefined): string {
  const partes = [`${e.tecnologia}/${e.banda}`];
  if (clase === "control-critico") partes.push("largo alcance y resiliencia");
  if (clase === "masivo") partes.push("alta capacidad y troceado");
  if (clase === "tiempo-real" && m?.latenciaMs !== null && m?.latenciaMs !== undefined) {
    partes.push(`latencia ${m.latenciaMs} ms`);
  }
  if (e.estado === "degradado") partes.push("enlace degradado");
  return partes.join(" · ");
}
