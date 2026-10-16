/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTUALIZACIONES POR NEURONA — versión nueva del OS, quién la aplica.
 * ---------------------------------------------------------------------------
 * Cada dispositivo del usuario (una neurona) decide CÓMO se entera de que hay
 * una versión nueva del OS y si la aplica sola o avisa primero. El OS es una
 * PWA con service worker `/sw.js`: la "actualización" real es «hay una versión
 * nueva en el servidor → recargar con el SW nuevo».
 *
 * Módulo PURO (SSR-safe): nada de `window` al importarse; los accesos viven
 * dentro de las funciones y van protegidos con try/catch (igual que el resto
 * de `src/lib`). Nunca lanza: el modo privado del navegador no debe romper
 * nada por no poder guardar una preferencia.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Cómo se entera una neurona de una versión nueva del OS. */
export type ModoActualizacion = "automatica" | "manual" | "inteligente";

/** Preferencia de actualización persistida para UNA neurona. */
export interface PreferenciaNeurona {
  neuronaId: string;
  modo: ModoActualizacion;
  ultimaComprobacion: number | null;
  versionVista: string | null;
  /** Anulaciones por área (clave: nombre del área, valor: modo de actualización). */
  porArea?: Record<string, ModoActualizacion>;
}

/** Por defecto manual: nadie se lleva una recarga por sorpresa mientras trabaja. */
export const MODO_POR_DEFECTO: ModoActualizacion = "manual";

/** Clave de localStorage (una entrada por neurona) que viaja con la cuenta. */
export const CLAVE_PREFERENCIAS = "starseed.neurona.actualizaciones.v1";

function almacen(): Storage | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

function leerTodas(): Record<string, PreferenciaNeurona> {
  const store = almacen();
  if (!store) return {};
  try {
    const raw = store.getItem(CLAVE_PREFERENCIAS);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p !== "object") return {};
    const out: Record<string, PreferenciaNeurona> = {};
    for (const k of Object.keys(p)) {
      const v = (p as Record<string, unknown>)[k];
      if (v && typeof v === "object") {
        // Ensure we preserve all properties, including porArea
        out[k] = v as PreferenciaNeurona;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Lee la preferencia de una neurona; sin nada guardado, devuelve el modo por defecto. Nunca lanza. */
export function leerPreferencia(neuronaId: string): PreferenciaNeurona {
  const todas = leerTodas();
  const p = todas[neuronaId];
  if (!p) {
    return {
      neuronaId,
      modo: MODO_POR_DEFECTO,
      ultimaComprobacion: null,
      versionVista: null,
    };
  }
  const modo: ModoActualizacion = p.modo === "automatica" ? "automatica" : "manual";
  return {
    neuronaId: p.neuronaId,
    modo,
    ultimaComprobacion: typeof p.ultimaComprobacion === "number" ? p.ultimaComprobacion : null,
    versionVista: typeof p.versionVista === "string" ? p.versionVista : null,
    porArea: p.porArea,
  };
}

/** Persiste la preferencia de una neurona. Nunca lanza (modo privado del navegador). */
export function guardarPreferencia(p: PreferenciaNeurona): void {
  const store = almacen();
  if (!store || !p || !p.neuronaId) return;
  try {
    const todas = leerTodas();
    todas[p.neuronaId] = {
      neuronaId: p.neuronaId,
      modo: p.modo,
      ultimaComprobacion: p.ultimaComprobacion,
      versionVista: p.versionVista,
      porArea: p.porArea,
    };
    store.setItem(CLAVE_PREFERENCIAS, JSON.stringify(todas));
  } catch { /* modo privado / sin cuota: degradación silenciosa */ }
}

/**
 * Compara dos versiones AAAA.MM.DD POR FECHA (no alfabéticamente) y devuelve
 * true solo si la del servidor es posterior. Ante cualquier cadena que no se
 * parsee correctamente devuelve false: nunca se avisa de una actualización
 * inventada.
 */
function fechaDeVersion(v: string): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})[./\-](\d{2})[./\-](\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return a * 10_000 + mes * 100 + dia;
}

export function hayVersionNueva(versionInstalada: string, versionServidor: string): boolean {
  const inst = fechaDeVersion(versionInstalada);
  const serv = fechaDeVersion(versionServidor);
  if (inst === null || serv === null) return false;
  return serv > inst;
}

/**
 * Decide qué hacer cuando se conoce la versión del servidor:
 *   · automática y versión nueva → "aplicar"
 *   · manual y versión nueva → "avisar"
 *   · misma versión o ya vista → "nada"
 */
export function decidirAccion(
  pref: PreferenciaNeurona,
  versionServidor: string,
): "aplicar" | "avisar" | "nada" {
  if (!pref.versionVista || !hayVersionNueva(pref.versionVista, versionServidor)) {
    return "nada";
  }
  if (pref.modo === "automatica") return "aplicar";
  return "avisar";
}

/**
 * Decide qué hacer con una actualización de modelo en modo inteligente.
 * - modo: el modo de actualización para esta área (o neurona).
 * - enReposo: si la neurona está en reposo (sin conversación, sin turno pesado).
 * - cargando: si el dispositivo portátil está cargando (opcional, solo relevante para portátiles).
 * - cabe: si la actualización cabe en los recursos de la neurona.
 * - mejora: si la actualización representa una mejora medible.
 * Devuelve 'instalar' si se debe instalar automáticamente, 'avisar' si se debe avisar al usuario,
 * o 'nada' si no se debe hacer nada.
 */
export function decidirAccionModelo({
  modo,
  enReposo,
  cargando,
  cabe,
  mejora,
}: {
  modo: ModoActualizacion;
  enReposo: boolean;
  cargando?: boolean;
  cabe: boolean;
  mejora: boolean;
}): "instalar" | "avisar" | "nada" {
  if (modo !== "inteligente") {
    // For non-intelligent modes, we don't auto-install; let the existing logic handle it.
    return "nada";
  }

  // For intelligent mode:
  // If cargando is provided (not undefined), we treat the device as portable.
  // For portable devices, we only require that it is charging (cargando === true).
  // For stationary devices (cargando is undefined), we require enReposo, cabe, and mejora.
  if (typeof cargando !== "undefined") {
    // Portable device: install only if charging; if there is an improvement but not charging, avisar so user can manually install.
    if (cargando) {
      return "instalar";
    }
    return mejora ? "avisar" : "nada";
  } else {
    // Stationary device: install only if at rest, fits, and is an improvement.
    if (enReposo && cabe && mejora) {
      return "instalar";
    }
    // If there is an improvement but conditions not met, avisar so user can manually install.
    return mejora ? "avisar" : "nada";
  }
}