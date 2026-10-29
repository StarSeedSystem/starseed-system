// Contenido vivo · interruptor de movimiento (Apagado · Encendido · Rayos X).
// - «apagado»: las piezas quedan en su fotograma final, quietas.
// - «encendido»: se mueven.
// - «rayos-x»: encima pinta en cada pieza su etiqueta `data-vivo="qué · cómo"` y,
//   si la tiene, `data-vivo-herramienta`, sin animarla de más.
//
// El modo puede venir en la URL (`?movimiento=rayos-x`); `prefers-reduced-motion`
// manda siempre (deja la página en «apagado», salvo Rayos X, que no anima) y cada
// cambio avisa con el evento «contenido-vivo:modo».

export type ModoMovimiento = "apagado" | "encendido" | "rayos-x";

export const NOMBRE_EVENTO = "contenido-vivo:modo";

const MODOS: readonly ModoMovimiento[] = ["apagado", "encendido", "rayos-x"];

function esModo(valor: unknown): valor is ModoMovimiento {
  return typeof valor === "string" && (MODOS as readonly string[]).includes(valor);
}

/** Modo pedido en la URL (`?movimiento=…`) o null si no hay uno válido. */
export function modoDesdeUrl(busqueda: string): ModoMovimiento | null {
  const crudo = new URLSearchParams(busqueda.replace(/^\?/, "")).get("movimiento");
  return esModo(crudo) ? crudo : null;
}

/** ¿Pide el sistema movimiento reducido? */
export function detectarMovimientoReducido(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** El modo que de verdad se aplica, respetando el movimiento reducido. */
export function modoEfectivo(modo: ModoMovimiento, reducirMovimiento: boolean): ModoMovimiento {
  if (!reducirMovimiento) return modo;
  return modo === "rayos-x" ? "rayos-x" : "apagado";
}

// La etiqueta de Rayos X se pinta en CSS porque depende del contenido de los
// atributos de cada pieza: «qué es · cómo se hizo».
const ESTILO_RAYOS_X =
  '[data-vivo-modo="rayos-x"] [data-vivo]::after {' +
  "content: attr(data-vivo); position: absolute; inset: 0 auto auto 0;" +
  "font: 600 12px/1.4 system-ui, sans-serif; background: #0e1b1e; color: #e6f2ef;" +
  "padding: 2px 10px; border-radius: 999px; pointer-events: none; z-index: 40;" +
  "}" +
  '[data-vivo-modo="rayos-x"] [data-vivo][data-vivo-herramienta]::after {' +
  'content: attr(data-vivo) " · " attr(data-vivo-herramienta); }';

/** Aplica el modo a la página: atributo, etiquetas de Rayos X y aviso por evento. */
export function aplicarModo(
  modo: ModoMovimiento,
  raiz: HTMLElement = document.documentElement,
): void {
  raiz.dataset.vivoModo = modo;
  if (modo === "rayos-x") asegurarRayosX();
  else document.getElementById("contenido-vivo-rayos-x")?.remove();
  raiz.dispatchEvent(new CustomEvent(NOMBRE_EVENTO, { detail: { modo }, bubbles: true }));
}

function asegurarRayosX(): void {
  if (document.getElementById("contenido-vivo-rayos-x")) return;
  const estilo = document.createElement("style");
  estilo.id = "contenido-vivo-rayos-x";
  estilo.textContent = ESTILO_RAYOS_X;
  document.head.appendChild(estilo);
}

export interface Interruptor {
  /** El modo que de verdad está aplicado ahora mismo. */
  modo(): ModoMovimiento;
  /** Cambia el modo a mano (botones Apagado · Encendido · Rayos X). */
  cambiar(pedido: ModoMovimiento): void;
  /** Retira lo que puso el Rayos X, si sigue ahí. */
  quitar(): void;
}

/** Lee la URL y el sistema, aplica el modo inicial y devuelve el interruptor. */
export function iniciarInterruptor(
  raiz: HTMLElement = document.documentElement,
): Interruptor {
  const pedido = modoDesdeUrl(window.location.search);
  const actual = { modo: modoEfectivo(pedido ?? "encendido", detectarMovimientoReducido()) };
  aplicarModo(actual.modo, raiz);
  return {
    modo: () => actual.modo,
    cambiar: (modoPedido) => {
      actual.modo = modoEfectivo(modoPedido, detectarMovimientoReducido());
      aplicarModo(actual.modo, raiz);
    },
    quitar: () => document.getElementById("contenido-vivo-rayos-x")?.remove(),
  };
}
