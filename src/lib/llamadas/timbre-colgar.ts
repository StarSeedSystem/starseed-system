/**
 * timbre-colgar — el «colgar» de quien llamó retira el timbre que aún suena aquí (TIM1115B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Un timbre sin contestar no tiene motor ni canal de llamada: el «colgar» que viaja por la señalización de las neuronas
 * (`llc.senal`, `canal-enlace-transporte.ts`) solo lo consume un canal abierto, así que nadie lo oía y el timbre vivía hasta su
 * plazo. Este oyente, único por aparato, escucha esa misma señalización y, si el «colgar» es de la sesión de un timbre que
 * suena (o de una que aún no llegó), la da por colgada: retira la tarjeta y su sonido, y un reenvío tardío del timbre no suena.
 * Solo por sesión: el «colgar» de una llamada vieja nunca toca una nueva.
 */
import { anotarLlamada } from "./voz-datos/diagnostico";
import { colgarTimbre, leerLlamadas, sesionColgada } from "./store";

export interface DepsColgarTimbre {
  alRecibir: (cb: (m: { cuerpo: unknown; origen: { tipo: string } }) => void) => () => void;
  anotar?: (detalle: string, neurona: string | null) => void;
}

const ORIGENES = new Set(["local", "nativo", "ble", "cuenta", "par"]);

export function vigilarColgarDeTimbres(deps: DepsColgarTimbre): () => void {
  const anotar = deps.anotar ?? ((d, n) => anotarLlamada("senal-recibida", n, d));
  return deps.alRecibir((m) => {
    try {
      if (!ORIGENES.has(m.origen.tipo)) return;
      const c = m.cuerpo as { t?: unknown; s?: unknown; dn?: unknown; senal?: { tipo?: unknown } | null } | null;
      if (!c || c.t !== "llc.senal" || c.senal?.tipo !== "colgar") return;
      if (typeof c.s !== "string" || !c.s || typeof c.dn !== "string") return;
      const e = leerLlamadas();
      if (e.activa?.sesionId === c.s) return; // la llamada ya está dentro: la lleva su motor
      const timbre = e.timbres.find((t) => t.sesionId === c.s);
      // Solo quien llamó puede colgar su timbre: si el timbre dice de qué neurona vino, tiene que ser esa.
      if (timbre?.neurona && timbre.neurona !== c.dn) return;
      if (!timbre && sesionColgada(c.s)) return;
      const habia = colgarTimbre(c.s);
      anotar(`colgar sin-motor sesion=${c.s.slice(0, 8)} ${habia ? "timbre-retirado" : "antes-del-timbre"}`, c.dn);
    } catch {
      /* un mensaje raro nunca tumba el oyente */
    }
  });
}

/** El oyente real (transporte universal), cargado perezosamente. Devuelve la baja. */
export async function vigilarColgarDeTimbresReal(): Promise<() => void> {
  const tu = await import("@/lib/malla/transporte-universal");
  const { CANAL_SENALIZACION } = await import("./canal-enlace-transporte");
  return vigilarColgarDeTimbres({
    alRecibir: (cb) => tu.alRecibirMensaje(CANAL_SENALIZACION, (m) => cb({ cuerpo: m.cuerpo, origen: { tipo: m.origen.tipo } })),
  });
}
