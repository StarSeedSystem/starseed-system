// Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): shared/mascot-bodies.ts, src/components/cursor-face-data.ts, src/components/mascot-motion.ts

/**
 * Mausbot · Cursor del Agente — Bus de acciones y permisos (puro, SSR-safe)
 * -----------------------------------------------------------------------
 * Anuncia la acción del agente para que el host anime el Mausbot hasta el
 * rectángulo objetivo. Comprueba permisos de la neurona antes de actuar.
 * No toca window/document ni lanza efectos secundarios.
 */

export type NivelBot = "nada" | "proponer" | "aplicar-bajo" | "aplicar";

export interface AccionAgente {
  tipo: "click" | "type" | "scroll" | "hover";
  /** Rectángulo del elemento objetivo en coordenadas de viewport (px). */
  rect: DOMRect | { x: number; y: number; width: number; height: number };
  /** Etiqueta legible para anunciar (p. ej. «Botón Publicar», «Campo búsqueda»). */
  etiqueta: string;
  /** Nivel solicitado para esta acción (por defecto: "proponer"). */
  nivel?: NivelBot;
  /** ID del dispositivo/neurona que intenta actuar. */
  deviceId: string;
  /** Marca de tiempo (ms) para ordenar en el bus. */
  ts: number;
  /** Si la acción es reversible (navegar, abrir, escribir en borrador…). */
  reversible?: boolean;
}

type Listener = (accion: AccionAgente) => void;
const listeners: Listener[] = [];

/**
 * Anuncia una acción del agente en el bus `starseed:mausbot-agente`.
 * El host del Mausbot escucha este evento para animar el cursor hasta `rect`.
 */
export function anunciarAccion(accion: Omit<AccionAgente, "ts">): void {
  const payload: AccionAgente = { ...accion, ts: Date.now() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("starseed:mausbot-agente", { detail: payload }));
  }
  // Notifica a listeners locales (tests, misma pestaña)
  for (const cb of listeners) cb(payload);
}

/**
 * Suscribe un callback al bus de acciones del agente.
 * Devuelve función de limpieza.
 */
export function onAccionAgente(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/**
 * Comprueba si el agente puede actuar en el dispositivo dado.
 * PURA: no hace red, no toca DOM, solo lee ajustes sincronizados.
 *
 * Reglas (según `architecture/mausbot-astraura.md` §5 y `src/lib/neurons/neurons.ts`):
 * - `false` si `permissionsFor(deviceId).agent` es `false`
 * - `false` si `settingsFor(deviceId).screenVoice` es `false`
 * - Nivel "proponer": siempre pregunta (devuelve { ok: true, requiereConfirmacion: true })
 * - Nivel "aplicar-bajo": solo actúa si `reversible === true`, si no pregunta
 * - Nivel "aplicar": actúa sin preguntar (solo si el usuario lo eligió explícitamente)
 * - Nivel "nada": nunca actúa
 */
export interface PuedeActuarResultado {
  ok: boolean;
  /** Motivo si no puede actuar (para mostrar al usuario). */
  motivo?: string;
  /** Si la acción requiere confirmación explícita del usuario. */
  requiereConfirmacion?: boolean;
}

// Importaciones perezosas para evitar ciclos y mantener el módulo puro en tests
let _permissionsFor: ((deviceId: string) => import("@/lib/neurons/neurons").NeuronPermissions) | null = null;
let _settingsFor: ((deviceId: string) => import("@/lib/neurons/neurons").NeuronSettings) | null = null;

function getPermissionsFor(deviceId: string) {
  if (!_permissionsFor) {
    // En tests se inyecta con `__setPermissionsForMock`
    if (typeof window !== "undefined") {
      const mod = require("@/lib/neurons/neurons");
      _permissionsFor = mod.permissionsFor;
    }
  }
  return _permissionsFor?.(deviceId) ?? { agent: true, compute: true, storage: true, sync: true, senses: true, wake: true };
}

function getSettingsFor(deviceId: string) {
  if (!_settingsFor) {
    if (typeof window !== "undefined") {
      const mod = require("@/lib/neurons/neurons");
      _settingsFor = mod.settingsFor;
    }
  }
  return _settingsFor?.(deviceId) ?? { screenVoice: true, fileRequests: true, auroraListening: true, role: "ambos" };
}

/** Sólo para tests: inyecta mocks de permissionsFor/settingsFor. */
export function __setPermissionsForMock(fn: (deviceId: string) => import("@/lib/neurons/neurons").NeuronPermissions): void {
  _permissionsFor = fn;
}
export function __setSettingsForMock(fn: (deviceId: string) => import("@/lib/neurons/neurons").NeuronSettings): void {
  _settingsFor = fn;
}
export function __resetMocks(): void {
  _permissionsFor = null;
  _settingsFor = null;
}

export function puedeActuar({ deviceId, nivel = "proponer", reversible = false }: { deviceId: string; nivel?: NivelBot; reversible?: boolean }): PuedeActuarResultado {
  const perms = getPermissionsFor(deviceId);
  const settings = getSettingsFor(deviceId);

  // Permiso base: la neurona debe permitir agente y screenVoice
  if (!perms.agent) {
    return { ok: false, motivo: "Esta neurona no permite que actúen agentes (permiso 'agent' desactivado)." };
  }
  if (!settings.screenVoice) {
    return { ok: false, motivo: "El control de pantalla por voz está desactivado en esta neurona (ajuste 'screenVoice')." };
  }

  switch (nivel) {
    case "nada":
      return { ok: false, motivo: "El Mausbot está en modo 'nada': no actúa, solo observa." };
    case "proponer":
      return { ok: true, requiereConfirmacion: true };
    case "aplicar-bajo":
      if (reversible) return { ok: true, requiereConfirmacion: false };
      return { ok: true, requiereConfirmacion: true, motivo: "Acción no reversible: requiere confirmación." };
    case "aplicar":
      return { ok: true, requiereConfirmacion: false };
    default:
      return { ok: false, motivo: `Nivel de actuación desconocido: ${nivel}` };
  }
}