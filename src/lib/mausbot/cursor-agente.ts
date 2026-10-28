/**
 * Mausbot de Astraura · Interfaz del agente-cursor (MBT1027J).
 *
 * Bus `anunciarAccion({tipo, rect, etiqueta})` / `onAccionAgente(cb)` (evento `starseed:mausbot-agente`)
 * y `puedeActuar({deviceId, nivel, reversible})` PURA: `false` si `permissionsFor(deviceId).agent`
 * es false o `settingsFor(deviceId).screenVoice` es false (`src/lib/neurons/neurons.ts`;
 * hoy nadie lo comprueba), «proponer» siempre pregunta, «aplicar-bajo» solo lo reversible.
 *
 * Módulo puro, sin `node:*` (CLAUDE.md, trampa 11).
 */
import { permissionsFor, settingsFor } from "@/lib/neurons/neurons";
import type { NivelBot } from "@/lib/astraura-bots/permisos";
import type { MetaAccion } from "@/lib/astraura-bots/acciones";

/** Tipos de acción que anuncia el agente-cursor. */
export type TipoAccionAgente = "click" | "type" | "scroll" | "hover" | "select" | "navegar" | "otro";

/** Payload del evento `starseed:mausbot-agente`. */
export interface AccionAgentePayload {
  /** Tipo de acción que va a realizar el agente. */
  tipo: TipoAccionAgente;
  /** Rectángulo del elemento objetivo (para que el host anime el Mausbot hasta ahí). */
  rect: DOMRect | { x: number; y: number; width: number; height: number } | null;
  /** Etiqueta legible del elemento (para accesibilidad y depuración). */
  etiqueta: string;
  /** Marca de tiempo del anuncio. */
  timestamp: number;
}

/** Nombre del evento personalizado para el bus del Mausbot agente. */
export const EVENTO_AGENTE_MAUSBOT = "starseed:mausbot-agente";

/**
 * Anuncia una acción del agente-cursor en el bus.
 * El host (mausbot-host.tsx) escucha este evento y anima el Mausbot hasta `rect`.
 */
export function anunciarAccion(payload: {
  tipo: TipoAccionAgente;
  rect: DOMRect | { x: number; y: number; width: number; height: number } | null;
  etiqueta: string;
}): void {
  if (typeof window === "undefined") return;
  const detalle: AccionAgentePayload = {
    tipo: payload.tipo,
    rect: payload.rect,
    etiqueta: payload.etiqueta,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(EVENTO_AGENTE_MAUSBOT, { detail: detalle }));
}

/**
 * Suscribe un callback al evento de acciones del agente-cursor.
 * Devuelve una función para desuscribirse.
 */
export function onAccionAgente(cb: (payload: AccionAgentePayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const ce = e as CustomEvent<AccionAgentePayload>;
    if (ce.detail) cb(ce.detail);
  };
  window.addEventListener(EVENTO_AGENTE_MAUSBOT, handler);
  return () => window.removeEventListener(EVENTO_AGENTE_MAUSBOT, handler);
}

/** Parámetros para comprobar si el agente puede actuar. */
export interface PuedeActuarParams {
  /** ID de la neurona/dispositivo donde se intenta actuar. */
  deviceId: string;
  /** Nivel de confianza del bot (de `NivelBot`: "nada" | "proponer" | "aplicar-bajo" | "aplicar"). */
  nivel: NivelBot;
  /** Si la acción es reversible (se puede deshacer con una acción inversa). */
  reversible: boolean;
  /** Metadato opcional de la acción para comprobaciones de riesgo (p.ej. `meta.riesgo`). */
  meta?: Pick<MetaAccion, "riesgo">;
}

/** Resultado de la comprobación `puedeActuar`. */
export interface PuedeActuarResult {
  /** `true` si la acción puede ejecutarse (al menos como propuesta). */
  permitido: boolean;
  /** Nivel efectivo tras aplicar las reglas: "nada" bloquea, "proponer" pregunta, "aplicar-bajo" actúa si reversible. */
  nivelEfectivo: "nada" | "proponer" | "aplicar-bajo" | "aplicar";
  /** Motivo en español para mostrar al usuario o registrar. */
  motivo: string;
}

/**
 * Comprueba PURA si el agente Mausbot puede actuar en una neurona dada.
 *
 * Reglas (según `architecture/mausbot-astraura.md` §5 y `neurons.ts`):
 * 1. Si `permissionsFor(deviceId).agent` es `false` → bloqueado (`nada`).
 * 2. Si `settingsFor(deviceId).screenVoice` es `false` → bloqueado (`nada`).
 * 3. Nivel `"nada"` → bloqueado.
 * 4. Nivel `"proponer"` → siempre pregunta (devuelve `proponer`).
 * 5. Nivel `"aplicar-bajo"` → solo actúa si `reversible === true`; si no, pregunta.
 * 6. Nivel `"aplicar"` → actúa (sujeto a que la acción no sea de riesgo alto sin confirmación).
 */
export function puedeActuar(params: PuedeActuarParams): PuedeActuarResult {
  const { deviceId, nivel, reversible, meta } = params;

  // 1) Permiso de agente en la neurona
  const perms = permissionsFor(deviceId);
  if (!perms.agent) {
    return {
      permitido: false,
      nivelEfectivo: "nada",
      motivo: "Esta neurona no permite que los agentes actúen (permiso `agent` desactivado).",
    };
  }

  // 2) Ajuste de control de pantalla por voz
  const sets = settingsFor(deviceId);
  if (sets.screenVoice === false) {
    return {
      permitido: false,
      nivelEfectivo: "nada",
      motivo: "El control de pantalla por voz está desactivado en esta neurona (`screenVoice: false`).",
    };
  }

  // 3) Nivel explícito "nada"
  if (nivel === "nada") {
    return {
      permitido: false,
      nivelEfectivo: "nada",
      motivo: "El Mausbot está configurado para no actuar (nivel `nada`).",
    };
  }

  // 4) Nivel "proponer": siempre pregunta
  if (nivel === "proponer") {
    return {
      permitido: true,
      nivelEfectivo: "proponer",
      motivo: "El Mausbot propone la acción; confirma tú para aplicarla.",
    };
  }

  // 5) Nivel "aplicar-bajo": solo lo reversible
  if (nivel === "aplicar-bajo") {
    // Si la acción es de riesgo alto, aunque sea reversible, se pregunta
    if (meta?.riesgo === "alto") {
      return {
        permitido: true,
        nivelEfectivo: "proponer",
        motivo: "Es una acción de riesgo alto: el Mausbot la propone y tú decides.",
      };
    }
    if (reversible) {
      return {
        permitido: true,
        nivelEfectivo: "aplicar-bajo",
        motivo: "Acción reversible de riesgo bajo: el Mausbot la aplica y queda en el registro con su deshacer.",
      };
    }
    return {
      permitido: true,
      nivelEfectivo: "proponer",
      motivo: "El nivel `aplicar-bajo` solo actúa en lo reversible: esto se propone y tú confirmas.",
    };
  }

  // 6) Nivel "aplicar": actúa (pero riesgo alto sigue pidiendo confirmación en la capa de bots)
  if (nivel === "aplicar") {
    if (meta?.riesgo === "alto") {
      return {
        permitido: true,
        nivelEfectivo: "proponer",
        motivo: "Acción de riesgo alto: siempre se confirma aunque el nivel sea `aplicar`.",
      };
    }
    return {
      permitido: true,
      nivelEfectivo: "aplicar",
      motivo: "El Mausbot puede aplicar la acción directamente.",
    };
  }

  // Fallback defensivo (nivel desconocido → proponer)
  return {
    permitido: true,
    nivelEfectivo: "proponer",
    motivo: `Nivel desconocido «${String(nivel)}»: se propone por seguridad.`,
  };
}