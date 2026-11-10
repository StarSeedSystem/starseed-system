/**
 * puerta/roles — los papeles no son fijos (PTA1110B · 2026-11-10).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3 «Cualquier sentido».
 *
 * Una neurona está en uno de tres papeles, y cambia sola:
 *  · «puerta»  : tiene salida propia y la comparte según sus ajustes;
 *  · «usuaria» : no tiene salida propia pero ve al menos una puerta que puede usar;
 *  · «sola»    : ni lo uno ni lo otro.
 *
 * Reglas contra el parpadeo y los bucles (puro, con reloj inyectado):
 *  · Recuperar la salida propia cuenta ya (se deja la ruta ajena y se empieza a compartir).
 *  · Perderla no cuenta hasta que el papel «puerta» lleva `permanenciaMs` (por defecto 6 s): una salida que sube y baja
 *    no hace que las vecinas cambien de ruta cada pocos segundos.
 *  · Una neurona en papel «usuaria» NO se anuncia como puerta de internet (no tiene salida propia), así que nunca hay
 *    «A por B mientras B por A»; el `via` del anuncio y de la apertura cierra los demás casos (ver tunel.ts).
 */

export type RolMalla = "puerta" | "usuaria" | "sola";
export type CambioRol = "a-puerta" | "a-usuaria" | "a-sola";

export interface EntradaRol {
  /** Salida PROPIA (medida por Node, nunca por el proxy de la malla). */
  conInternet: boolean;
  /** Hay alguna puerta que esta neurona puede usar (ámbitos y carriles permitidos). */
  hayPuertas: boolean;
}

export interface SalidaRol {
  rol: RolMalla;
  /** Solo cuando el papel acaba de cambiar. */
  cambio: CambioRol | null;
  /** Papel anterior cuando hubo cambio. */
  antes: RolMalla | null;
}

export class DecisorRol {
  private rol: RolMalla | null = null;
  private desde = 0;

  constructor(private readonly permanenciaMs = 6000) {}

  observar(e: EntradaRol, ahora: number): SalidaRol {
    let nuevo: RolMalla;
    if (e.conInternet) nuevo = "puerta";
    else if (this.rol === "puerta" && ahora - this.desde < this.permanenciaMs) nuevo = "puerta"; // aguanta: puede ser un parpadeo
    else nuevo = e.hayPuertas ? "usuaria" : "sola";
    if (nuevo === this.rol) return { rol: nuevo, cambio: null, antes: null };
    const antes = this.rol;
    this.rol = nuevo;
    this.desde = ahora;
    if (antes === null) return { rol: nuevo, cambio: null, antes: null };
    return { rol: nuevo, cambio: nuevo === "puerta" ? "a-puerta" : nuevo === "usuaria" ? "a-usuaria" : "a-sola", antes };
  }

  actual(): RolMalla | null {
    return this.rol;
  }
}

/** Texto para la interfaz y el registro. */
export function textoCambioRol(c: CambioRol, antes: RolMalla | null): string {
  if (c === "a-puerta") return antes === "usuaria" ? "Esta neurona recuperó su internet: deja de usar la puerta y empieza a compartir" : "Esta neurona tiene internet y puede compartirlo";
  if (c === "a-usuaria") return "Esta neurona perdió su internet: pasa a usar la puerta de otra neurona";
  return "Esta neurona se quedó sin internet y sin puertas";
}

/** «Maggaboard · Bluetooth directo» o, con saltos, «Maggaboard → MaggaBook · Wi‑Fi directo · 2 saltos» (de la puerta hacia mí). */
export function textoCadena(p: { nombre: string; enlace: string; saltos: number; vecino?: string }): string {
  if (p.saltos <= 0) return `${p.nombre} · ${p.enlace}`;
  const medio = p.saltos > 1 ? ["…"] : [];
  const cadena = [p.nombre, ...medio, ...(p.vecino ? [p.vecino] : [])].join(" → ");
  return `${cadena} · ${p.enlace} · ${p.saltos} ${p.saltos === 1 ? "salto" : "saltos"}`;
}
