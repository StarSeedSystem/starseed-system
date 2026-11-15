/**
 * fuente-posicion — UNA sola manera de saber dónde está el aparato, igual en todas las apps (UBI1114K).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * En la app nativa (macOS: CoreLocation · Android: LocationManager) la posición llega por los comandos
 * `ubicacion_*` de Rust, que piden el permiso en el aviso del PROPIO sistema. En un navegador normal se usa
 * `navigator.geolocation`. La forma que ve el resto del código es la misma (`getCurrentPosition`,
 * `watchPosition`, `clearWatch`), así que el mapa no distingue de dónde viene la medida.
 *
 *  · Nada se redondea: precisión (`accuracy`) y hora de la medida (`timestamp`) pasan tal cual.
 *  · Nada se pide solo: el aviso del sistema solo sale en `getCurrentPosition` (siempre es la respuesta a un
 *    botón de la persona). `watchPosition` nunca pregunta: si falta el permiso, lo dice.
 *  · Cuando falla, el error dice CUÁL de las dos cosas es —«no diste permiso» o «el aparato no pudo darla»— y,
 *    en la app nativa, cómo cambiarlo en los ajustes de ESE sistema.
 * El puente de Tauri se inyecta para probarlo sin la app. Sin React ni `node:*`.
 */

import { crearPuente, type PuenteNativo, type TauriMinimo } from "@/lib/nativa/puente";

export type CodigoUbicacion = "denegado" | "restringido" | "sin-preguntar" | "servicios-apagados" | "sin-fijar" | "no-disponible" | "tiempo";
export type PermisoNativo = "concedido" | "aproximado" | "sin-preguntar" | "denegado" | "restringido" | "no-disponible";

/** Espejo de `ubicacion_logica::Fix` (native/src-tauri/src/ubicacion_logica.rs). */
export interface FixNativo {
  lat: number;
  lon: number;
  precision_m?: number | null;
  altitud_m?: number | null;
  precision_altitud_m?: number | null;
  rumbo?: number | null;
  velocidad_ms?: number | null;
  t_ms: number;
  fuente?: string;
}

export interface RespuestaFixNativa {
  ok: boolean;
  fix?: FixNativo | null;
  error?: { codigo: CodigoUbicacion; motivo: string } | null;
}

export interface EstadoNativo {
  version: number;
  plataforma: string;
  disponible: boolean;
  permiso: PermisoNativo;
  servicios: boolean | null;
  vigilando: boolean;
  donde_cambiarlo: string;
}

/** Lo que lee el mapa de una medida (mismos nombres que `GeolocationPosition`). */
export interface PosicionMedida {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  /** Hora de la MEDIDA (epoch ms). */
  timestamp: number;
  /** De dónde viene: «corelocation», «gps», «network», «navegador»… */
  fuente: string;
}

export interface ErrorPosicion {
  /** Como `GeolocationPositionError.code`: 1 permiso · 2 posición no disponible · 3 tiempo. */
  code: 1 | 2 | 3;
  /** Texto para la persona. */
  message: string;
  codigo: CodigoUbicacion;
  nativo: boolean;
}

export interface OpcionesPosicion {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface FuenteGeolocalizacion {
  origen: "nativa" | "navegador";
  getCurrentPosition(ok: (p: PosicionMedida) => void, err?: (e: ErrorPosicion) => void, opciones?: OpcionesPosicion): void;
  watchPosition(ok: (p: PosicionMedida) => void, err?: (e: ErrorPosicion) => void, opciones?: OpcionesPosicion): number;
  clearWatch(id: number): void;
}

export type PermisoVista = "concedido" | "denegado" | "por-pedir" | "desconocido";

type PuenteMin = Pick<PuenteNativo, "disponible" | "llamar">;

export const CMD_ESTADO = "ubicacion_estado";
export const CMD_AHORA = "ubicacion_ahora";
export const CMD_VIGILAR = "ubicacion_vigilar";
export const CMD_PARAR = "ubicacion_parar";
export const CMD_ULTIMA = "ubicacion_ultima";

/** Cada cuánto se lee lo último medido mientras se vigila (la app mide a ~1 s). */
export const SONDEO_VIGILANCIA_MS = 1000;
/** Cuánto sin ninguna medida antes de avisar (una vez) de que el aparato no la consigue. */
export const AVISO_SIN_MEDIDA_MS = 30_000;

// ─────────────────────────────── Puras ───────────────────────────────

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Una medida nativa → la forma del mapa. null si las coordenadas no valen (nunca se enseña un punto inventado). */
export function posicionDeFix(f: FixNativo | null | undefined): PosicionMedida | null {
  if (!f || typeof f !== "object") return null;
  const lat = num(f.lat);
  const lon = num(f.lon);
  const t = num(f.t_ms);
  if (lat === null || lon === null || t === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      // Sin precisión informada, NO se inventa una: el mapa decide qué dibuja (ver `MiPosicion.accuracy`).
      accuracy: num(f.precision_m),
      altitude: num(f.altitud_m),
      altitudeAccuracy: num(f.precision_altitud_m),
      heading: num(f.rumbo),
      speed: num(f.velocidad_ms),
    },
    timestamp: t,
    fuente: typeof f.fuente === "string" && f.fuente ? f.fuente : "nativa",
  };
}

const CODIGOS: CodigoUbicacion[] = ["denegado", "restringido", "sin-preguntar", "servicios-apagados", "sin-fijar", "no-disponible", "tiempo"];

/** El error de una respuesta nativa. Un código desconocido NO se disfraza de otro: «no disponible». */
export function errorDeRespuesta(r: RespuestaFixNativa | null | undefined, textoSiFalta = "La app nativa no respondió."): ErrorPosicion {
  const cod = r?.error?.codigo;
  const codigo: CodigoUbicacion = cod && CODIGOS.includes(cod) ? cod : "no-disponible";
  const message = (typeof r?.error?.motivo === "string" && r.error.motivo.trim()) || textoSiFalta;
  const code: 1 | 2 | 3 = codigo === "denegado" || codigo === "restringido" || codigo === "sin-preguntar" ? 1 : codigo === "tiempo" ? 3 : 2;
  return { code, message, codigo, nativo: true };
}

/** Los errores del navegador, con el texto que distingue «no diste permiso» de «el aparato no pudo». */
export function errorDeNavegador(e: { code?: number; message?: string } | null | undefined): ErrorPosicion {
  const code = e?.code === 1 || e?.code === 3 ? e.code : 2;
  if (code === 1) {
    return {
      code: 1,
      codigo: "denegado",
      nativo: false,
      message: "No diste permiso de ubicación a esta página en el navegador. Para cambiarlo: el icono de candado o de ajustes junto a la dirección › Permisos del sitio › Ubicación; y que tu sistema deje al navegador usar la ubicación.",
    };
  }
  if (code === 3) {
    return { code: 3, codigo: "tiempo", nativo: false, message: "Tienes el permiso, pero el aparato tardó demasiado en fijar su posición. Prueba junto a una ventana o con el Wi-Fi encendido." };
  }
  return {
    code: 2,
    codigo: "sin-fijar",
    nativo: false,
    message: "Tienes el permiso, pero el aparato no pudo dar su posición (sin GPS ni redes conocidas a la vista, o la ubicación del sistema está apagada).",
  };
}

/** El motivo tal como va dentro de «No se pudo obtener la ubicación de este aparato: …». Pura. */
export function motivoParaAviso(e: ErrorPosicion | string): string {
  const t = (typeof e === "string" ? e : e.message).trim().replace(/\.$/, "");
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : "motivo desconocido";
}

export function permisoVistaDeNativo(p: PermisoNativo | undefined): PermisoVista {
  switch (p) {
    case "concedido":
    case "aproximado":
      return "concedido";
    case "denegado":
    case "restringido":
      return "denegado";
    case "sin-preguntar":
      return "por-pedir";
    default:
      return "desconocido";
  }
}

/** ¿Este error acaba la vigilancia? (el permiso o el aparato; «sin fijar» puede arreglarse solo). */
export function esFatal(c: CodigoUbicacion): boolean {
  return c !== "sin-fijar" && c !== "tiempo";
}

// ─────────────────────────────── Fuente nativa ───────────────────────────────

export function crearFuenteNativa(puente: PuenteMin, ahora: () => number = Date.now): FuenteGeolocalizacion {
  let siguiente = 1;
  const vigilancias = new Map<number, { parado: boolean; timer: ReturnType<typeof setTimeout> | null }>();

  async function una(pedir: boolean): Promise<{ pos: PosicionMedida } | { err: ErrorPosicion }> {
    const r = await puente.llamar<RespuestaFixNativa>(CMD_AHORA, { pedir });
    if (!r.ok) return { err: { code: 2, codigo: "no-disponible", nativo: true, message: r.motivo } };
    const pos = r.valor?.ok ? posicionDeFix(r.valor.fix) : null;
    return pos ? { pos } : { err: errorDeRespuesta(r.valor) };
  }

  return {
    origen: "nativa",
    getCurrentPosition(ok, err) {
      // Siempre es la respuesta a un botón de la persona: aquí sí puede salir el aviso del sistema.
      void una(true).then((x) => ("pos" in x ? ok(x.pos) : err?.(x.err)));
    },
    watchPosition(ok, err) {
      const id = siguiente++;
      const v: { parado: boolean; timer: ReturnType<typeof setTimeout> | null } = { parado: false, timer: null };
      vigilancias.set(id, v);
      let ultimaT = 0;
      let avisadoSinMedida = false;
      const desde = ahora();
      const vuelta = async () => {
        if (v.parado) return;
        const r = await puente.llamar<RespuestaFixNativa>(CMD_ULTIMA);
        if (v.parado) return;
        if (!r.ok) {
          err?.({ code: 2, codigo: "no-disponible", nativo: true, message: r.motivo });
          return alto(id);
        }
        const pos = r.valor?.ok ? posicionDeFix(r.valor.fix) : null;
        if (pos) {
          // Solo lo NUEVO: la misma medida no se repite al mapa.
          if (pos.timestamp !== ultimaT) {
            ultimaT = pos.timestamp;
            ok(pos);
          }
        } else {
          const e = errorDeRespuesta(r.valor);
          if (esFatal(e.codigo)) {
            err?.(e);
            return alto(id);
          }
          if (!avisadoSinMedida && ultimaT === 0 && ahora() - desde >= AVISO_SIN_MEDIDA_MS) {
            avisadoSinMedida = true;
            err?.(e);
          }
        }
        v.timer = setTimeout(() => void vuelta(), SONDEO_VIGILANCIA_MS);
      };
      // Primero se le dice a la app que vigile (no pregunta nada), luego se lee lo que mida.
      void puente.llamar(CMD_VIGILAR).then(() => void vuelta());
      return id;
    },
    clearWatch(id) {
      alto(id);
    },
  };

  function alto(id: number) {
    const v = vigilancias.get(id);
    if (!v) return;
    v.parado = true;
    if (v.timer) clearTimeout(v.timer);
    vigilancias.delete(id);
    // Sin más vigilancias, la app deja de medir (batería).
    if (vigilancias.size === 0) void puente.llamar(CMD_PARAR);
  }
}

// ─────────────────────────────── Fuente del navegador ───────────────────────────────

type GeoNav = {
  getCurrentPosition(ok: (p: GeolocationPosition) => void, err?: (e: GeolocationPositionError) => void, o?: OpcionesPosicion): void;
  watchPosition(ok: (p: GeolocationPosition) => void, err?: (e: GeolocationPositionError) => void, o?: OpcionesPosicion): number;
  clearWatch(id: number): void;
};

function deNavegador(p: GeolocationPosition): PosicionMedida {
  const c = p.coords;
  return {
    coords: {
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude ?? null,
      altitudeAccuracy: c.altitudeAccuracy ?? null,
      heading: c.heading ?? null,
      speed: c.speed ?? null,
    },
    timestamp: p.timestamp,
    fuente: "navegador",
  };
}

export function crearFuenteNavegador(geo: GeoNav): FuenteGeolocalizacion {
  return {
    origen: "navegador",
    getCurrentPosition: (ok, err, o) => geo.getCurrentPosition((p) => ok(deNavegador(p)), (e) => err?.(errorDeNavegador(e)), o),
    watchPosition: (ok, err, o) => geo.watchPosition((p) => ok(deNavegador(p)), (e) => err?.(errorDeNavegador(e)), o),
    clearWatch: (id) => geo.clearWatch(id),
  };
}

// ─────────────────────────────── La que se usa ───────────────────────────────

function puenteActual(): PuenteMin {
  if (typeof window === "undefined") return crearPuente(null);
  return crearPuente((window as unknown as { __TAURI__?: TauriMinimo }).__TAURI__);
}

/** El estado nativo, o null si no hay app nativa o esta app no trae la ubicación (APK/instalación anterior). Nunca lanza. */
export async function estadoNativo(puente: PuenteMin = puenteActual()): Promise<EstadoNativo | null> {
  if (!puente.disponible) return null;
  const r = await puente.llamar<EstadoNativo>(CMD_ESTADO);
  if (!r.ok || !r.valor || typeof r.valor !== "object" || r.valor.disponible !== true) return null;
  return r.valor;
}

let nativaConfirmada: boolean | null = null;
let nativaUnica: FuenteGeolocalizacion | null = null;

/**
 * La fuente de posición de este aparato, o null si no hay ninguna. En la app nativa con ubicación nativa:
 * la nativa; si no (navegador, Windows, Linux, APK anterior): `navigator.geolocation`. La decisión nativa se
 * comprueba una vez de forma asíncrona; mientras tanto, y si falla, se usa la del navegador.
 */
export function fuenteGeolocalizacion(puenteInyectado?: PuenteMin): FuenteGeolocalizacion | null {
  const puente = puenteInyectado ?? puenteActual();
  const nav = typeof navigator !== "undefined" && navigator.geolocation ? crearFuenteNavegador(navigator.geolocation as unknown as GeoNav) : null;
  if (!puente.disponible) return nav;
  if (nativaConfirmada === false) return nav;
  // La misma fuente nativa en cada llamada: así `clearWatch` encuentra la vigilancia que abrió `watchPosition`.
  const nativa = puenteInyectado ? crearFuenteNativa(puente) : (nativaUnica ??= crearFuenteNativa(puente));
  if (nativaConfirmada === true) return nativa;
  // Sin confirmar aún: se confirma en segundo plano y esta llamada ya usa la nativa; si resulta que la app no
  // la trae, sus errores («no disponible») hacen que el llamador caiga al navegador por `conRespaldo`.
  void estadoNativo(puente).then((e) => { nativaConfirmada = e !== null; });
  return conRespaldo(nativa, nav, puente);
}

/** Nativa con respaldo: si la app dice «no disponible» antes de dar nada, se repite con el navegador. */
export function conRespaldo(nativa: FuenteGeolocalizacion, nav: FuenteGeolocalizacion | null, _puente?: PuenteMin): FuenteGeolocalizacion {
  if (!nav) return nativa;
  return {
    origen: "nativa",
    getCurrentPosition(ok, err, o) {
      nativa.getCurrentPosition(ok, (e) => (e.codigo === "no-disponible" ? nav.getCurrentPosition(ok, err, o) : err?.(e)), o);
    },
    watchPosition(ok, err, o) {
      let actual: { fuente: FuenteGeolocalizacion; id: number } | null = null;
      let parado = false;
      const id = nativa.watchPosition(ok, (e) => {
        if (parado) return;
        if (e.codigo === "no-disponible") {
          actual = { fuente: nav, id: nav.watchPosition(ok, err, o) };
        } else err?.(e);
      }, o);
      actual = { fuente: nativa, id };
      const mio = ++conteo;
      respaldos.set(mio, () => {
        parado = true;
        const a = actual;
        if (a) a.fuente.clearWatch(a.id);
      });
      return mio;
    },
    clearWatch(id) {
      const f = respaldos.get(id);
      respaldos.delete(id);
      f?.();
    },
  };
}
let conteo = 1_000_000;
const respaldos = new Map<number, () => void>();

/** Solo para pruebas. */
export function olvidarConfirmacionNativa(): void {
  nativaConfirmada = null;
  nativaUnica = null;
}

// ─────────────────────────────── Permiso para pintar ───────────────────────────────

/**
 * Observa el permiso de ubicación. En la app nativa lo lee de `ubicacion_estado` (al abrir, cada 3 s y al volver
 * a la ventana: la persona lo cambia en los ajustes del sistema); en un navegador, de `navigator.permissions`.
 * Devuelve cómo dejar de observar. Nunca pregunta nada.
 */
export function observarPermisoUbicacion(alCambiar: (p: PermisoVista) => void, puente: PuenteMin = puenteActual()): () => void {
  let vivo = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let st: PermissionStatus | null = null;
  const leerNav = () => {
    if (vivo && st) alCambiar(st.state === "granted" ? "concedido" : st.state === "denied" ? "denegado" : "por-pedir");
  };
  void (async () => {
    const nat = await estadoNativo(puente);
    if (!vivo) return;
    if (nat) {
      const leer = async () => {
        const e = await estadoNativo(puente);
        if (vivo && e) alCambiar(permisoVistaDeNativo(e.permiso));
      };
      alCambiar(permisoVistaDeNativo(nat.permiso));
      timer = setInterval(() => void leer(), 3000);
      return;
    }
    try {
      st = (await navigator.permissions?.query({ name: "geolocation" as PermissionName })) ?? null;
      if (!st || !vivo) return;
      leerNav();
      st.addEventListener("change", leerNav);
    } catch { /* sin API de permisos: desconocido */ }
  })();
  return () => {
    vivo = false;
    if (timer) clearInterval(timer);
    try { st?.removeEventListener("change", leerNav); } catch { /* */ }
  };
}
