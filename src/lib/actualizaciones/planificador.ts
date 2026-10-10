/**
 * Planificador inteligente: canaria, prueba de humo, propagación y vuelta atrás (contrato §5).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   1. Se elige UNA neurona canaria (la marcada por la persona o la más usada que esté en línea).
 *   2. La versión se aplica primero ahí y pasa la prueba de humo (la página carga, los servicios
 *      responden).
 *   3. Si pasa, se propaga a las demás según la política de cada capa y el momento de cada una;
 *      si falla, se vuelve a la versión anterior y se avisa.
 *   4. Cada neurona descarga de la malla si otra de la cuenta ya tiene el paquete (P2P primero:
 *      menos datos y funciona sin internet); si no, del servidor.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza. La ejecución real vive en
 * `aplicadores.ts` (navegador) y la coordinación entre neuronas viaja por la presencia.
 */

import { capasPendientes, type CapaPendiente, type VersionesPorCapa } from "./capas";
import { compararVersiones, type CapaActualizacion, type ManifiestoVersion } from "./manifiesto";
import { puedeAplicarAhora, type ContextoMomento, type MotivoEspera } from "./momento";
import { decidirPolitica, type PoliticaSistema } from "./politica";

/* ── Canaria ──────────────────────────────────────────────────────────────── */

export interface NeuronaCandidata {
  id: string;
  online: boolean;
  /** Uso reciente medido (p. ej. minutos abiertos en la última semana). */
  usoReciente: number;
  elegida?: boolean;
}

/** La canaria: la marcada si está en línea; si no, la más usada en línea; empate → id menor. */
export function elegirCanaria(ns: readonly NeuronaCandidata[]): string | null {
  const vivas = ns.filter((n) => n.online && n.id);
  if (!vivas.length) return null;
  const marcada = vivas.find((n) => n.elegida);
  if (marcada) return marcada.id;
  return [...vivas].sort((a, b) => (b.usoReciente || 0) - (a.usoReciente || 0) || a.id.localeCompare(b.id))[0].id;
}

/* ── Prueba de humo ───────────────────────────────────────────────────────── */

export interface ResultadoHumo {
  paginaCarga: boolean;
  /** Servicio → responde. Solo los que la versión toca o la neurona tiene. */
  servicios: Record<string, boolean>;
}

export function evaluarHumo(r: ResultadoHumo): { ok: boolean; fallos: string[] } {
  const fallos: string[] = [];
  if (!r.paginaCarga) fallos.push("La página del OS no carga.");
  for (const [s, ok] of Object.entries(r.servicios ?? {})) if (!ok) fallos.push(`El servicio «${s}» no responde.`);
  return { ok: fallos.length === 0, fallos };
}

/* ── Estado del despliegue ────────────────────────────────────────────────── */

export type EstadoDespliegue = "pendiente" | "canaria" | "propagando" | "hecho" | "revirtiendo" | "revertido";

export type EventoDespliegue =
  | { tipo: "aplicada-en-canaria" }
  | { tipo: "humo"; ok: boolean }
  | { tipo: "propagada" }
  | { tipo: "revertida" };

/** Máquina de estados del despliegue. Un evento que no toca en ese estado lo deja igual. */
export function siguienteEstado(e: EstadoDespliegue, ev: EventoDespliegue): EstadoDespliegue {
  if (e === "pendiente" && ev.tipo === "aplicada-en-canaria") return "canaria";
  if (e === "canaria" && ev.tipo === "humo") return ev.ok ? "propagando" : "revirtiendo";
  if (e === "propagando" && ev.tipo === "propagada") return "hecho";
  if (e === "revirtiendo" && ev.tipo === "revertida") return "revertido";
  return e;
}

export const TEXTO_ESTADO: Record<EstadoDespliegue, string> = {
  pendiente: "Pendiente",
  canaria: "Probando en la neurona canaria",
  propagando: "Propagando a las demás neuronas",
  hecho: "Aplicada en todas",
  revirtiendo: "Volviendo a la versión anterior",
  revertido: "Vuelta atrás hecha",
};

/** A qué versión volver si el humo falla: la anterior declarada, nunca una inventada. */
export function versionDeVueltaAtras(m: Pick<ManifiestoVersion, "anterior" | "version">): string | null {
  if (!m.anterior) return null;
  return compararVersiones(m.anterior, m.version) < 0 ? m.anterior : null;
}

/* ── Plan por neurona ─────────────────────────────────────────────────────── */

export interface NeuronaPlan {
  id: string;
  nombre: string;
  online: boolean;
  versiones: VersionesPorCapa;
  momento: ContextoMomento;
  horaLocal: number;
}

export type AccionCapa =
  | { tipo: "aplicar"; fuente: "malla" | "servidor"; pendiente: CapaPendiente }
  | { tipo: "avisar"; pendiente: CapaPendiente }
  | { tipo: "esperar"; pendiente: CapaPendiente; motivo: MotivoEspera | "ventana" | "canaria" | "sin-conexion"; texto: string };

export interface PlanNeurona {
  neuronaId: string;
  nombre: string;
  esCanaria: boolean;
  acciones: AccionCapa[];
}

/** ¿Alguna OTRA neurona en línea ya tiene esta capa en esta versión? Entonces se pide por la malla. */
function hayPar(capa: CapaActualizacion, version: string, yo: string, todas: readonly NeuronaPlan[]): boolean {
  return todas.some((n) => n.id !== yo && n.online && !!n.versiones[capa] && compararVersiones(n.versiones[capa] as string, version) >= 0);
}

/**
 * El plan completo de una versión para las neuronas de una cuenta o entidad. Mientras el estado
 * sea «pendiente» o «canaria», solo la canaria aplica; el resto espera a que pase el humo.
 */
export function planificar(
  m: ManifiestoVersion,
  neuronas: readonly NeuronaPlan[],
  politica: PoliticaSistema,
  estado: EstadoDespliegue,
  canariaId: string | null,
): PlanNeurona[] {
  return neuronas.map((n) => {
    const esCanaria = n.id === canariaId;
    const pendientes = capasPendientes(m, n.versiones);
    const acciones: AccionCapa[] = pendientes.map((p) => {
      if (estado === "revirtiendo" || estado === "revertido")
        return { tipo: "esperar", pendiente: p, motivo: "canaria", texto: "La versión falló en la canaria y se retiró." };
      if (!esCanaria && (estado === "pendiente" || estado === "canaria"))
        return { tipo: "esperar", pendiente: p, motivo: "canaria", texto: "Esperando a que la neurona canaria la pruebe." };
      if (!n.online) return { tipo: "esperar", pendiente: p, motivo: "sin-conexion", texto: "La neurona no está en línea." };
      const d = decidirPolitica(politica[p.capa], { ahoraH: n.horaLocal, esNeuronaElegida: esCanaria });
      if (d === "avisar") return { tipo: "avisar", pendiente: p };
      if (d === "esperar") return { tipo: "esperar", pendiente: p, motivo: "ventana", texto: "Fuera de su ventana programada." };
      const fuente = hayPar(p.capa, m.version, n.id, neuronas) ? "malla" : "servidor";
      const mom = puedeAplicarAhora(n.momento, fuente === "malla" ? 0 : m.tamanoBytes, p.capa);
      if (!mom.ok) return { tipo: "esperar", pendiente: p, motivo: mom.motivo, texto: mom.texto };
      return { tipo: "aplicar", fuente, pendiente: p };
    });
    return { neuronaId: n.id, nombre: n.nombre, esCanaria, acciones };
  });
}
