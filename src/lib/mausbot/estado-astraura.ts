/**
 * Estado vivo del Mausbot de Astraura: traduce los medios de Astraura — la voz de
 * la orbe cuántica y las acciones de sus bots y agentes — a un `EstadoMausbot`.
 * Contrato: `architecture/mausbot-astraura.md` §3 (tabla orbe → expresión) y §6
 * (orbe, bots). El que ejecuta la acción de un bot o agente publica aquí su aviso
 * con `emitirAccionAgente`; el Mausbot lo escucha con `suscribirEstadoMausbot`.
 * Módulo puro (sin `node:*`): lo importa el host de cliente y lo prueban los tests.
 */
import { estadoDesdeOrbe, type EstadoMausbot } from "@/lib/mausbot/expresiones";
import { onQuantumOrbState } from "@/lib/aurora/quantum-orb-bus";

export type { EstadoMausbot };

/** Cuánto dura el «proud» al acabar una acción. */
export const ORGULLO_MS = 1500;
/** Sin ninguna señal durante 2 min, el Mausbot se adormece. */
export const ADORMECER_MS = 120000;
/** Sin ninguna señal durante 10 min, el Mausbot duerme. */
export const DORMIR_MS = 600000;

/** Fase de una acción de un bot o agente de Astraura sobre el OS. */
export type FaseAccion = "empezar" | "acabar";
/** Aviso de una acción: qué hace el bot o agente y en qué fase va. */
export interface AvisoAccion {
  /** Nombre corto de la acción, p. ej. «clic», «escribir», «navegar». */
  accion: string;
  fase: FaseAccion;
}
type EscuchaAccion = (aviso: AvisoAccion) => void;
const oyentesDeAccion = new Set<EscuchaAccion>();

/** Publica el aviso de la acción que un bot o agente de Astraura está ejecutando. */
export function emitirAccionAgente(aviso: AvisoAccion): void {
  for (const cb of Array.from(oyentesDeAccion)) {
    try {
      cb(aviso);
    } catch {
      /* un oyente roto nunca tira el aviso al resto */
    }
  }
}

/** Escucha los avisos de acción; devuelve la función para desuscribirse. */
export function onAccionAgente(cb: EscuchaAccion): () => void {
  oyentesDeAccion.add(cb);
  return () => {
    oyentesDeAccion.delete(cb);
  };
}

/** Acción → estado (contrato §3): «working» durante la acción y «proud» al acabar. */
export function estadoPorAccion(aviso: AvisoAccion): EstadoMausbot {
  return aviso.fase === "acabar" ? "proud" : "working";
}

/**
 * Suscripción única al estado del Mausbot. Escucha la orbe cuántica de voz
 * (`onQuantumOrbState` → `estadoDesdeOrbe`) y las acciones de agentes
 * (`onAccionAgente`: «working» durante la acción y «proud» 1,5 s al acabar.
 * Sin ninguna señal 2 min entra «drowsy»; 10 min, «sleeping». Devuelve la
 * función para desuscribirse (cancela orgullo, adormecer y dormir).
 */
export function suscribirEstadoMausbot(cb: (estado: EstadoMausbot) => void): () => void {
  let orgullo: ReturnType<typeof setTimeout> | null = null;
  let adormecer: ReturnType<typeof setTimeout> | null = null;
  let dormir: ReturnType<typeof setTimeout> | null = null;
  const fijar = (estado: EstadoMausbot): void => cb(estado);
  /** Cualquier señal cuenta como actividad: reencolar 2 min y 10 min. */
  const reencolar = (): void => {
    if (adormecer) clearTimeout(adormecer);
    if (dormir) clearTimeout(dormir);
    adormecer = setTimeout(() => { adormecer = null; fijar("drowsy"); }, ADORMECER_MS);
    dormir = setTimeout(() => { dormir = null; fijar("sleeping"); }, DORMIR_MS);
  };
  const quitarOrbe = onQuantumOrbState((voz) => {
    soltarOrgullo();
    fijar(estadoDesdeOrbe(voz));
    reencolar();
  });
  const quitarAccion = onAccionAgente((aviso) => {
    if (aviso.fase === "acabar") {
      soltarOrgullo();
      orgullo = setTimeout(() => { orgullo = null; fijar("idle"); }, ORGULLO_MS);
    } else {
      soltarOrgullo();
    }
    fijar(estadoPorAccion(aviso));
    reencolar();
  });
  /** Cancela el orgullo pendiente (llega otra señal o se desuscribe). */
  function soltarOrgullo(): void {
    if (orgullo) clearTimeout(orgullo);
    orgullo = null;
  }
  reencolar();
  return () => {
    quitarOrbe();
    quitarAccion();
    soltarOrgullo();
    if (adormecer) clearTimeout(adormecer);
    if (dormir) clearTimeout(dormir);
  };
}
