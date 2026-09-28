/**
 * Aviso de novedad — pantalla de bloqueo y pantalla de inicio (Ola 384 · D2).
 * ============================================================================
 * El bloqueo y la pantalla inicial (Ola 381-382) solo se ofrecían al final del
 * rito de creación de perfil o al configurar una neurona nueva: las cuentas
 * que YA EXISTÍAN nunca los vieron. Este módulo es la DECISIÓN pura (sin
 * React ni `window`, probable en Node) de cuándo recordárselo, una sola vez
 * por dispositivo, y las marcas que la sostienen.
 *
 * Quien reúne los hechos (sesión, ruta, bloqueo de esta neurona, pantalla
 * inicial elegida o no, si hay un rito/modal en primer plano, antigüedad de
 * la cuenta) es el componente `aviso-novedad-arranque.tsx`; aquí solo vive la
 * regla, para poder probarla sin montar nada.
 */

export type RespuestaAvisoNovedad = "configurado" | "luego" | "no-mostrar";

export interface EstadoAvisoNovedad {
  respuesta: RespuestaAvisoNovedad;
  /** Epoch ms de la respuesta. */
  fecha: number;
}

/** Clave de localStorage (POR NEURONA, como el propio bloqueo). */
export const CLAVE_AVISO_NOVEDAD_ARRANQUE = "starseed.novedad.arranque.v1";

/** «Recordármelo más tarde»: cuánto se pospone. */
export const ESPERA_LUEGO_MS = 3 * 24 * 60 * 60 * 1000;

/** Una cuenta más joven que esto ya recibió el ofrecimiento en su propio rito. */
export const UMBRAL_CUENTA_NUEVA_MS = 10 * 60 * 1000;

/** Rutas propias de acceso o de una experiencia a pantalla completa: nunca se abre encima. */
export const RUTAS_EXCLUIDAS_AVISO = ["/login", "/mando", "/llamada", "/vivo"];

export function esRutaExcluidaAviso(ruta: string | null): boolean {
  return Boolean(ruta && RUTAS_EXCLUIDAS_AVISO.some((r) => ruta === r || ruta.startsWith(`${r}/`)));
}

function almacen(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function esRespuestaValida(v: unknown): v is RespuestaAvisoNovedad {
  return v === "configurado" || v === "luego" || v === "no-mostrar";
}

/** Lo que ya se respondió en ESTE dispositivo, o `null` si nunca se vio el aviso. */
export function leerEstadoAviso(): EstadoAvisoNovedad | null {
  try {
    const crudo = almacen()?.getItem(CLAVE_AVISO_NOVEDAD_ARRANQUE);
    if (!crudo) return null;
    const p = JSON.parse(crudo) as Partial<EstadoAvisoNovedad>;
    if (!esRespuestaValida(p?.respuesta) || typeof p?.fecha !== "number") return null;
    return { respuesta: p.respuesta, fecha: p.fecha };
  } catch {
    return null;
  }
}

/** Guarda la respuesta de esta visita. Nunca lanza. */
export function marcarAviso(respuesta: RespuestaAvisoNovedad, ahora = Date.now()): void {
  try {
    almacen()?.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, JSON.stringify({ respuesta, fecha: ahora } satisfies EstadoAvisoNovedad));
  } catch {
    /* modo privado estricto o cuota llena: el aviso podrá volver a aparecer, nunca rompe */
  }
}

export interface EntradaAvisoNovedad {
  /** Hay una cuenta con sesión iniciada (nunca invitados anónimos). */
  conSesion: boolean;
  ruta: string | null;
  /** Un rito (bienvenida, perfil inicial…) o cualquier modal/sheet sigue en primer plano. */
  ritualOModalActivo: boolean;
  /** El método de bloqueo de ESTA neurona es "ninguno". */
  sinBloqueoConfigurado: boolean;
  /** Nunca se eligió una pantalla inicial (ni para el perfil, ni para esta neurona). */
  pantallaInicialSinElegir: boolean;
  /** Antigüedad de la cuenta en ms, o `null` si no se pudo determinar. */
  cuentaCreadaHaceMs: number | null;
  /** Lo que ya se respondió en este dispositivo (o `null`, primera vez). */
  estadoPrevio: EstadoAvisoNovedad | null;
  ahora: number;
}

/** ¿Debe mostrarse el aviso de novedad ahora mismo? Regla pura, sin efectos. */
export function debeMostrarAviso(e: EntradaAvisoNovedad): boolean {
  if (!e.conSesion) return false;
  if (esRutaExcluidaAviso(e.ruta)) return false;
  if (e.ritualOModalActivo) return false;
  if (!e.sinBloqueoConfigurado) return false;
  if (!e.pantallaInicialSinElegir) return false;
  if (e.cuentaCreadaHaceMs !== null && e.cuentaCreadaHaceMs < UMBRAL_CUENTA_NUEVA_MS) return false;

  const previo = e.estadoPrevio;
  if (previo) {
    // «configurado» o «no-mostrar»: decisión definitiva, nunca se repite.
    if (previo.respuesta !== "luego") return false;
    if (e.ahora - previo.fecha < ESPERA_LUEGO_MS) return false;
  }
  return true;
}
