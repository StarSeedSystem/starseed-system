// (SEG1111T) Puente del anfitrión con la sesión NATIVA de «prestar ventana».
//
// Desde SEG1111T la app nativa solo deja ver y teclear en una ventana si la persona abrió una sesión
// de préstamo en ese aparato con un diálogo nativo (Rust: `prestamo_ventana_iniciar`). Este módulo:
// - pide esa sesión (`pedirPrestamo`): Rust enseña el diálogo y, con «Prestar», devuelve un token
//   opaco y las ventanas que la persona vio;
// - traduce las órdenes del anfitrión (`OrdenVentana`) a los comandos nativos con ese token;
// - reconoce los rechazos `prestamo:…` de Rust para que el anfitrión pare en vez de reintentar.
// La web no decide nada de la sesión: si Rust dice que no, es no.
import type { OrdenVentana, RespuestaVentana } from "./anfitrion";

/** Invocador de comandos de Tauri (`window.__TAURI__.core.invoke` o un doble en las pruebas). */
export type Invocar = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Ventana prestada tal como la devuelve Rust (`VentanaInfo`). */
export type VentanaNativa = { id: number; app_name: string; title: string };

/** Lo que devuelve `prestamo_ventana_iniciar` con el «Prestar» de la persona. */
export type SesionNativa = { token: string; ventanas: VentanaNativa[]; inactividad_ms: number; duracion_max_ms: number };

/** Códigos de rechazo de Rust (`prestamo_ventana_logica::Rechazo::codigo` y los de `ventana_remota.rs`). */
export type CodigoPrestamo =
  | "sin-sesion" | "token" | "origen" | "origen-no-permitido" | "ventana-ajena" | "caducada" | "parada"
  | "pendiente" | "espera" | "sin-ventanas" | "sin-indicador" | "entrada-segura" | "tapada" | "sin-foco" | "ventana-oculta";

/** Rechazos tras los que la sesión ya no sirve: el anfitrión debe parar (no reintentar). */
export const RECHAZOS_QUE_CIERRAN: ReadonlySet<CodigoPrestamo> = new Set<CodigoPrestamo>([
  "sin-sesion", "token", "origen", "origen-no-permitido", "caducada", "parada",
]);

/** Error con el código `prestamo:…` que mandó Rust (o que este módulo detectó antes de llamar). */
export class RechazoPrestamo extends Error {
  constructor(readonly codigo: CodigoPrestamo, mensaje: string) {
    super(mensaje);
    this.name = "RechazoPrestamo";
  }
}

/** Código `prestamo:<código>` al principio de un error de Rust, o `null`. */
export function codigoPrestamo(error: unknown): CodigoPrestamo | null {
  if (error instanceof RechazoPrestamo) return error.codigo;
  const texto = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const m = /^prestamo:([a-z-]+)/.exec(texto);
  return m ? (m[1] as CodigoPrestamo) : null;
}

/** ¿Este error quiere decir que la sesión de préstamo terminó o nunca existió? */
export function esRechazoQueCierra(error: unknown): boolean {
  const c = codigoPrestamo(error);
  return c !== null && RECHAZOS_QUE_CIERRAN.has(c);
}

function comoRechazo(error: unknown): unknown {
  const c = codigoPrestamo(error);
  if (c === null || error instanceof RechazoPrestamo) return error;
  return new RechazoPrestamo(c, typeof error === "string" ? error : (error as Error).message);
}

/**
 * Pide a la app nativa prestar ventanas de `apps` (o solo las `ventanas` indicadas) a `destino`.
 * Resuelve con la sesión si la persona pulsó «Prestar» en el diálogo nativo; si no, rechaza con
 * `RechazoPrestamo` (`espera`, `pendiente`, `sin-ventanas`, `origen-no-permitido`…).
 */
export async function pedirPrestamo(
  invocar: Invocar,
  pedido: { apps: string[]; destino: string; ventanas?: number[] },
): Promise<SesionNativa> {
  try {
    const r = (await invocar("prestamo_ventana_iniciar", { apps: pedido.apps, ventanas: pedido.ventanas ?? null, destino: pedido.destino })) as SesionNativa;
    if (!r || typeof r.token !== "string" || !Array.isArray(r.ventanas)) throw new Error("respuesta nativa sin sesión");
    return r;
  } catch (e) {
    throw comoRechazo(e);
  }
}

/** Deja de prestar (siempre se puede; no necesita token). */
export async function dejarDePrestar(invocar: Invocar): Promise<void> {
  await invocar("prestamo_ventana_parar");
}

/**
 * `capturar` para `crearAnfitrion`: manda cada orden a Rust con el token de la sesión nativa.
 * - `capturar_ventana` → PNG en base64 (`datos`) al ancho pedido.
 * - `entrada_ventana`: solo clic (ratón «pulsar» con x, y en coordenadas de pantalla) y texto (tecla
 *   imprimible). El resto de entradas no se manda: Rust no las admite.
 * Una ventana que no está en la sesión se rechaza aquí mismo (`ventana-ajena`) y Rust lo vuelve a
 * comprobar por su cuenta.
 */
export function crearCapturaNativa(invocar: Invocar, sesion: SesionNativa): (orden: OrdenVentana) => Promise<RespuestaVentana> {
  const prestadas = new Set(sesion.ventanas.map((v) => v.id));
  return async (orden) => {
    const id = Number(orden.ventana);
    if (!Number.isInteger(id) || !prestadas.has(id)) {
      throw new RechazoPrestamo("ventana-ajena", `prestamo:ventana-ajena · la ventana ${orden.ventana} no está prestada`);
    }
    try {
      if (orden.comando === "capturar_ventana") {
        const png = (await invocar("capturar_ventana", { token: sesion.token, id, anchoMax: orden.ancho })) as string;
        return { ancho: orden.ancho, alto: orden.alto, datos: png, bytes: typeof png === "string" ? png.length : 0 };
      }
      const e = orden.entrada;
      if (e.tipo === "raton" && e.accion === "pulsar" && typeof e.x === "number" && typeof e.y === "number") {
        await invocar("entrada_ventana", { token: sesion.token, id, tipo: "click", x: Math.round(e.x), y: Math.round(e.y), texto: null });
        return { aceptada: true };
      }
      if (e.tipo === "teclado" && e.accion === "pulsar" && typeof e.tecla === "string" && [...e.tecla].length === 1) {
        await invocar("entrada_ventana", { token: sesion.token, id, tipo: "texto", x: null, y: null, texto: e.tecla });
        return { aceptada: true };
      }
      return { aceptada: false };
    } catch (err) {
      throw comoRechazo(err);
    }
  };
}
