/*
 * acceso-equipo — «acceso al equipo» visto desde la web (SEG1111U, 2026-11-11).
 * Contrato: architecture/permisos-y-control-del-dispositivo.md §4.8.
 *
 * Ejecutar programas en el aparato (la terminal `run_terminal`, abrir el instalador de Ollama) exige que la
 * persona haya dado «acceso al equipo» EN ESE APARATO con un diálogo nativo. La web no puede darlo ni
 * contestarlo: solo puede PEDIR que la app enseñe ese diálogo (`acceso_equipo_pedir`) y quitarlo. Rust
 * rechaza con errores que empiezan por `acceso:<código>`; aquí se reconocen para decir en palabras claras
 * qué falta y ofrecer el diálogo, en vez de enseñar un error.
 * Puro: sin Node, sin React. El puente se inyecta.
 */

import type { Resultado } from "./tipos";

export const COMANDO_ACCESO_ESTADO = "acceso_equipo_estado";
export const COMANDO_ACCESO_PEDIR = "acceso_equipo_pedir";
export const COMANDO_ACCESO_REVOCAR = "acceso_equipo_revocar";

/** Lo que devuelve Rust (`acceso_equipo::EstadoAcceso`). */
export interface EstadoAccesoEquipo {
  activo: boolean;
  desde_ms: number;
  disponible: boolean;
  motivo: string;
  registro_integro: boolean;
}

export type CodigoAcceso =
  | "no-aplica"
  | "ventana"
  | "origen"
  | "sin-concesion"
  | "sin-indicador"
  | "pendiente"
  | "espera"
  | "no-confirmado"
  | "orden";

/** Código de un rechazo de «acceso al equipo» (`acceso:<código> · …`), o null si el error es otro. */
export function codigoAcceso(motivo: string | null | undefined): CodigoAcceso | null {
  const m = /(?:^|\s)acceso:([a-z-]+?)(?:-\d+)?(?:\s·|$)/.exec(String(motivo ?? ""));
  if (!m) return null;
  const c = m[1];
  const conocidos: CodigoAcceso[] = ["no-aplica", "ventana", "origen", "sin-concesion", "sin-indicador", "pendiente", "espera", "no-confirmado", "orden"];
  return (conocidos as string[]).includes(c) ? (c as CodigoAcceso) : null;
}

/** Dónde vive el aviso en este sistema (para las frases). */
function sitioDelAviso(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Mac OS X|Macintosh/.test(ua) ? "la barra de menús" : "la bandeja del sistema";
}

/** Frase para una persona según el código. `que` = lo que se intentaba («abrir el instalador de Ollama»). */
export function fraseAcceso(codigo: CodigoAcceso, que: string): string {
  switch (codigo) {
    case "sin-concesion":
      return `Para ${que}, StarSeed OS necesita «acceso al equipo» en esta neurona. Se da una sola vez, en un diálogo del sistema; mientras esté dado verás «● Acceso al equipo» en ${sitioDelAviso()}, y desde ahí lo quitas cuando quieras.`;
    case "no-confirmado":
      return `No se hizo: no lo confirmaste en el diálogo del sistema.`;
    case "pendiente":
      return `Hay un diálogo de StarSeed esperando tu respuesta: contéstalo primero.`;
    case "espera":
      return `Dijiste que no hace un momento; podrás volver a intentarlo en unos segundos.`;
    case "sin-indicador":
      return `Este sistema no puede enseñar el aviso de «acceso al equipo» en ${sitioDelAviso()}, y sin un aviso visible StarSeed no lo concede. Puedes ${que} tú a mano.`;
    case "no-aplica":
      return `En esta app o en este sistema StarSeed no ejecuta programas. Puedes ${que} tú a mano.`;
    case "origen":
    case "ventana":
      return `Solo la ventana principal de StarSeed OS puede ${que}.`;
    case "orden":
      return `La orden está vacía o es demasiado larga.`;
  }
}

type Llamar = <T>(cmd: string, args?: Record<string, unknown>) => Promise<Resultado<T>>;

export function estadoAccesoEquipo(llamar: Llamar): Promise<Resultado<EstadoAccesoEquipo>> {
  return llamar<EstadoAccesoEquipo>(COMANDO_ACCESO_ESTADO);
}

/** Pide a la app que enseñe el diálogo nativo. `motivo` = la función que lo necesita (se enseña marcada como «lo dice la página»). */
export function pedirAccesoEquipo(llamar: Llamar, motivo: string): Promise<Resultado<EstadoAccesoEquipo>> {
  return llamar<EstadoAccesoEquipo>(COMANDO_ACCESO_PEDIR, { motivo });
}

export function quitarAccesoEquipo(llamar: Llamar): Promise<Resultado<EstadoAccesoEquipo>> {
  return llamar<EstadoAccesoEquipo>(COMANDO_ACCESO_REVOCAR);
}

/** Resultado de `conAccesoEquipo`: si falla por el acceso, trae el código y la frase. */
export type ResultadoConAcceso<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: string; acceso: CodigoAcceso | null };

/**
 * Hace `accion`; si Rust dice que falta «acceso al equipo», pide el diálogo nativo UNA vez y, si la persona lo
 * da, repite `accion` una sola vez. Nunca insiste: un «no» se respeta y se dice en palabras claras.
 */
export async function conAccesoEquipo<T>(
  llamar: Llamar,
  que: string,
  accion: () => Promise<Resultado<T>>,
): Promise<ResultadoConAcceso<T>> {
  const primero = await accion();
  if (primero.ok) return primero;
  const codigo = codigoAcceso(primero.motivo);
  if (codigo !== "sin-concesion") {
    return { ok: false, motivo: codigo ? fraseAcceso(codigo, que) : primero.motivo, acceso: codigo };
  }
  const pedido = await pedirAccesoEquipo(llamar, que);
  if (!pedido.ok || !pedido.valor.activo) {
    const c = pedido.ok ? "sin-concesion" : codigoAcceso(pedido.motivo) ?? "sin-concesion";
    const frase = c === "no-confirmado" ? fraseAcceso("sin-concesion", que) + " No lo diste ahora." : fraseAcceso(c, que);
    return { ok: false, motivo: frase, acceso: c === "no-confirmado" ? "sin-concesion" : c };
  }
  const segundo = await accion();
  if (segundo.ok) return segundo;
  const c2 = codigoAcceso(segundo.motivo);
  return { ok: false, motivo: c2 ? fraseAcceso(c2, que) : segundo.motivo, acceso: c2 };
}
