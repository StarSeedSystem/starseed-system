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
 *
 * Persistencia entre medios (2026-09-29): la respuesta («configurado», «luego»,
 * «no volver a mostrar») era una clave local, así que cada medio (localhost,
 * Vercel, la PWA, la app Tauri) la volvía a mostrar como novedad. Ahora la respuesta
 * también viaja con la CUENTA (`avisos-cuenta`, id `AVISO_NOVEDAD_ARRANQUE`): una
 * novedad se anuncia una vez por cuenta, no una vez por medio. La marca local antigua se
 * respeta y se copia (`copiarAvisoLocalACuenta`). Lo que sigue siendo por dispositivo es
 * el HECHO de tener bloqueo o pantalla inicial en esta neurona (lo comprueba el componente).
 */

import { estadoAviso, marcarAviso as marcarAvisoCuenta } from "@/lib/sync/avisos-cuenta";

export type RespuestaAvisoNovedad = "configurado" | "luego" | "no-mostrar";

export interface EstadoAvisoNovedad {
  respuesta: RespuestaAvisoNovedad;
  /** Epoch ms de la respuesta. */
  fecha: number;
}

/** Clave de localStorage (POR NEURONA, como el propio bloqueo). */
export const CLAVE_AVISO_NOVEDAD_ARRANQUE = "starseed.novedad.arranque.v1";

/** Id del aviso en la cuenta (`avisos-cuenta`). */
export const AVISO_NOVEDAD_ARRANQUE = "novedad.arranque.bloqueo-inicio";

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

/** Lo que consta en ESTE medio (marca local histórica), o `null`. */
function leerEstadoLocal(): EstadoAvisoNovedad | null {
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

/**
 * Lo que consta en la CUENTA (cualquier medio). «hecho» ↔ configurado, «visto» ↔ no volver a
 * mostrar, «luego» ↔ más tarde (su fecha es la de la marca).
 */
function leerEstadoCuenta(): EstadoAvisoNovedad | null {
  try {
    const r = estadoAviso(AVISO_NOVEDAD_ARRANQUE);
    if (r.estado === "hecho") return { respuesta: "configurado", fecha: r.ts };
    if (r.estado === "visto") return { respuesta: "no-mostrar", fecha: r.ts };
    if (r.estado === "luego") return { respuesta: "luego", fecha: r.ts };
    return null;
  } catch {
    return null;
  }
}

/** Definitivo gana a «luego»; entre iguales, la respuesta más reciente. */
function combinar(a: EstadoAvisoNovedad | null, b: EstadoAvisoNovedad | null): EstadoAvisoNovedad | null {
  if (!a) return b;
  if (!b) return a;
  const defA = a.respuesta !== "luego";
  const defB = b.respuesta !== "luego";
  if (defA !== defB) return defA ? a : b;
  return a.fecha >= b.fecha ? a : b;
}

/** Lo que ya se respondió (en este medio o en cualquier otro de la cuenta), o `null` si nunca se vio el aviso. */
export function leerEstadoAviso(): EstadoAvisoNovedad | null {
  return combinar(leerEstadoLocal(), leerEstadoCuenta());
}

/** Escribe una respuesta en la cuenta (idempotente: repetirla no cambia nada). */
function escribirEnCuenta(respuesta: RespuestaAvisoNovedad, fecha: number): void {
  try {
    if (respuesta === "configurado") marcarAvisoCuenta(AVISO_NOVEDAD_ARRANQUE, "hecho", { ahora: fecha });
    else if (respuesta === "no-mostrar") marcarAvisoCuenta(AVISO_NOVEDAD_ARRANQUE, "visto", { ahora: fecha });
    else marcarAvisoCuenta(AVISO_NOVEDAD_ARRANQUE, "luego", { ahora: fecha, hastaMs: fecha + ESPERA_LUEGO_MS });
  } catch {
    /* la cuenta es un extra: el medio ya tiene su marca */
  }
}

/** Guarda la respuesta de esta visita, en este medio y en la cuenta. Nunca lanza. */
export function marcarAviso(respuesta: RespuestaAvisoNovedad, ahora = Date.now()): void {
  try {
    almacen()?.setItem(CLAVE_AVISO_NOVEDAD_ARRANQUE, JSON.stringify({ respuesta, fecha: ahora } satisfies EstadoAvisoNovedad));
  } catch {
    /* modo privado estricto o cuota llena: el aviso podrá volver a aparecer, nunca rompe */
  }
  escribirEnCuenta(respuesta, ahora);
}

/**
 * Si este medio ya respondió pero la cuenta no lo sabe (o sabe menos), se lo cuenta para que los
 * demás medios lo hereden. Idempotente; nunca lanza.
 */
export function copiarAvisoLocalACuenta(): void {
  try {
    const local = leerEstadoLocal();
    if (!local) return;
    const cuenta = leerEstadoCuenta();
    if (combinar(local, cuenta) !== local) return; // la cuenta ya sabe algo igual o más definitivo
    const distinta = !cuenta || cuenta.respuesta !== local.respuesta || cuenta.fecha < local.fecha;
    if (distinta) escribirEnCuenta(local.respuesta, local.fecha);
  } catch {
    /* extra */
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
