/**
 * Bots/dots de Astraura · el BUCLE observar → entender → proponer → actuar (BOT1011).
 * Contrato: architecture/astraura-bots.md §5.
 *
 * Máquina de estados PURA (sin React, red ni reloj: `at` entra en cada evento). No decide
 * permisos —eso es `permisos.ts`— ni valida —eso es `acciones.ts`—: recibe sus veredictos y
 * garantiza el orden. Promesas que cumple siempre:
 *   · ningún sentido se enciende sin un `Decision` permitido, y el indicador está visible
 *     mientras quede uno encendido;
 *   · nada se aplica sin pasar por «proponer», y lo que pide confirmación ESPERA a una persona;
 *   · cada paso queda en el registro, y lo aplicado guarda su deshacer;
 *   · «pausar» apaga todos los sentidos y suelta lo pendiente (salida siempre).
 */
import { deshacer as calcularDeshacer, type AccionBot, type Previo, type ResultadoDeshacer, type TipoAccion } from "./acciones";
import type { Decision } from "./permisos";
import type { Sentido } from "./tipos";

export type FaseBucle = "reposo" | "observando" | "esperando" | "actuando" | "hecho" | "rechazado";

export type TipoRegistro =
  | "sentido-on" | "sentido-off" | "sentido-denegado" | "propuesta" | "confirmada" | "rechazada"
  | "aplicada" | "fallo" | "deshecha" | "pausa";

export interface EntradaRegistro {
  at: number;
  botId: string;
  /** Cuenta de la persona que confirmó/rechazó, o «bot». */
  quien: string;
  tipo: TipoRegistro;
  sentido?: Sentido;
  accion?: TipoAccion;
  motivo: string;
  deshacer?: ResultadoDeshacer;
}

export interface EstadoBucle {
  botId: string;
  fase: FaseBucle;
  sentidosActivos: Sentido[];
  pendiente?: { accion: AccionBot; decision: Decision };
  ultimaAplicada?: { accion: AccionBot; deshacer: ResultadoDeshacer };
  registro: EntradaRegistro[];
}

export type EventoBucle =
  | { tipo: "observar"; sentido: Sentido; decision: Decision; at: number }
  | { tipo: "soltar"; sentido: Sentido; at: number }
  | { tipo: "proponer"; accion: AccionBot; decision: Decision; at: number }
  | { tipo: "confirmar"; quien: string; at: number }
  | { tipo: "rechazar"; quien: string; at: number }
  | { tipo: "aplicada"; previo: Previo; at: number }
  | { tipo: "fallo"; motivo: string; at: number }
  | { tipo: "deshacer"; quien: string; at: number }
  | { tipo: "pausar"; quien: string; at: number };

export const MAX_REGISTRO = 500;

export function bucleInicial(botId: string): EstadoBucle {
  return { botId, fase: "reposo", sentidosActivos: [], registro: [] };
}

/** El indicador visible es obligatorio mientras haya un sentido encendido. */
export const indicadorVisible = (e: EstadoBucle): boolean => e.sentidosActivos.length > 0;

function anotar(e: EstadoBucle, r: Omit<EntradaRegistro, "botId">): EntradaRegistro[] {
  const registro = [...e.registro, { ...r, botId: e.botId }];
  return registro.length > MAX_REGISTRO ? registro.slice(registro.length - MAX_REGISTRO) : registro;
}

const reposoO = (e: EstadoBucle, sentidos: Sentido[]): FaseBucle => (sentidos.length ? "observando" : "reposo");

/** Transición. Un evento fuera de lugar no rompe nada: se ignora y el estado sigue igual. */
export function avanzar(e: EstadoBucle, ev: EventoBucle): EstadoBucle {
  switch (ev.tipo) {
    case "observar": {
      if (!ev.decision.permitido) {
        return { ...e, registro: anotar(e, { at: ev.at, quien: "bot", tipo: "sentido-denegado", sentido: ev.sentido, motivo: ev.decision.motivo }) };
      }
      const sentidos = e.sentidosActivos.includes(ev.sentido) ? e.sentidosActivos : [...e.sentidosActivos, ev.sentido];
      const fase = e.fase === "reposo" || e.fase === "hecho" || e.fase === "rechazado" ? "observando" : e.fase;
      return { ...e, fase, sentidosActivos: sentidos, registro: anotar(e, { at: ev.at, quien: "bot", tipo: "sentido-on", sentido: ev.sentido, motivo: ev.decision.motivo }) };
    }
    case "soltar": {
      if (!e.sentidosActivos.includes(ev.sentido)) return e;
      const sentidos = e.sentidosActivos.filter((s) => s !== ev.sentido);
      const fase = e.fase === "observando" ? reposoO(e, sentidos) : e.fase;
      return { ...e, fase, sentidosActivos: sentidos, registro: anotar(e, { at: ev.at, quien: "bot", tipo: "sentido-off", sentido: ev.sentido, motivo: "Sentido apagado." }) };
    }
    case "proponer": {
      if (e.pendiente) return e; // una propuesta a la vez: la anterior espera respuesta
      const base = { at: ev.at, quien: "bot", accion: ev.accion.tipo, motivo: ev.decision.motivo };
      const registro = anotar(e, { ...base, tipo: "propuesta" });
      if (ev.decision.permitido) return { ...e, fase: "actuando", pendiente: { accion: ev.accion, decision: ev.decision }, registro };
      const espera = ["confirmacion", "votacion", "consentimiento", "expreso"].includes(ev.decision.requiere);
      if (espera) return { ...e, fase: "esperando", pendiente: { accion: ev.accion, decision: ev.decision }, registro };
      return { ...e, fase: "rechazado", registro: anotar({ ...e, registro }, { ...base, tipo: "rechazada" }) };
    }
    case "confirmar": {
      if (e.fase !== "esperando" || !e.pendiente) return e;
      return { ...e, fase: "actuando", registro: anotar(e, { at: ev.at, quien: ev.quien, tipo: "confirmada", accion: e.pendiente.accion.tipo, motivo: "Confirmada por una persona." }) };
    }
    case "rechazar": {
      if (!e.pendiente || (e.fase !== "esperando" && e.fase !== "actuando")) return e;
      const registro = anotar(e, { at: ev.at, quien: ev.quien, tipo: "rechazada", accion: e.pendiente.accion.tipo, motivo: "Rechazada." });
      return { ...e, fase: "rechazado", pendiente: undefined, registro };
    }
    case "aplicada": {
      if (e.fase !== "actuando" || !e.pendiente) return e;
      const { accion } = e.pendiente;
      const d = calcularDeshacer(accion, ev.previo);
      const registro = anotar(e, { at: ev.at, quien: "bot", tipo: "aplicada", accion: accion.tipo, motivo: "Aplicada.", deshacer: d });
      return { ...e, fase: "hecho", pendiente: undefined, ultimaAplicada: { accion, deshacer: d }, registro };
    }
    case "fallo": {
      if (e.fase !== "actuando") return e;
      const registro = anotar(e, { at: ev.at, quien: "bot", tipo: "fallo", accion: e.pendiente?.accion.tipo, motivo: ev.motivo });
      return { ...e, fase: reposoO(e, e.sentidosActivos), pendiente: undefined, registro };
    }
    case "deshacer": {
      if (!e.ultimaAplicada) return e;
      const registro = anotar(e, { at: ev.at, quien: ev.quien, tipo: "deshecha", accion: e.ultimaAplicada.accion.tipo, motivo: "Deshecha por una persona.", deshacer: e.ultimaAplicada.deshacer });
      return { ...e, ultimaAplicada: undefined, fase: reposoO(e, e.sentidosActivos), registro };
    }
    case "pausar": {
      const registro = anotar(e, { at: ev.at, quien: ev.quien, tipo: "pausa", motivo: "Pausa: sentidos apagados y propuesta soltada." });
      return { ...e, fase: "reposo", sentidosActivos: [], pendiente: undefined, registro };
    }
  }
}
