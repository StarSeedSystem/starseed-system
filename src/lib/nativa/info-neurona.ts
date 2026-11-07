/*
 * info-neurona — leer de la app nativa su versión y lo que sabe de sí misma (VER1107B, 2026-11-07).
 * Contrato: architecture/centro-versiones-1105.md §8.
 *
 * La causa del bug «Hay una versión nueva» → «Ya estás en la última versión»: `leerInstalada()` hacía
 * `import("@tauri-apps/api/app")`, que en la web no existe (no es dependencia) y que además no exporta
 * `app`; siempre fallaba y caía al `build` de /version.json (un id de build como «mvq6sg7z-kt91hk»), que
 * `compararVersiones` lee como 0: toda versión publicada parecía más nueva. Aquí se lee del objeto
 * GLOBAL de Tauri (`withGlobalTauri: true` en native/), en este orden, y solo vale una versión semver:
 *   1. `invoke("info_neurona")`   — apps con VER1107B: versión + sistema + aparato;
 *   2. `__TAURI__.app.getVersion()` — todas las apps (permiso `core:app:default`, también 0.4.x y 0.5.0);
 *   3. `invoke("plugin:app|version")` — lo mismo cuando el global no trae el módulo `app`.
 * Si nada responde con una versión de verdad: `null`, y entonces no se abre ninguna ventana.
 * Lo de Tauri se INYECTA (para probarlo sin la app). Nunca lanza.
 */

import { esVersionSemver } from "@/lib/version/os-release";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Lo mínimo de `window.__TAURI__` que se usa aquí. */
export interface TauriConApp {
  core?: { invoke?: Invoke };
  app?: { getVersion?: () => Promise<unknown>; getTauriVersion?: () => Promise<unknown> };
}

/** Espejo de `neurona_info::InfoNeurona` (native/src-tauri/src/neurona_info.rs), en snake_case. */
export interface InfoNeuronaNativa {
  app_version: string;
  app_nombre: string;
  identificador: string;
  /** "os" | "cafe" | "nexus" | "desconocido". */
  sistema: string;
  /** "macos" | "windows" | "linux" | "android" | "ios"… */
  plataforma: string;
  so_version: string | null;
  arquitectura: string;
  equipo: string | null;
  modelo: string | null;
  tauri_version: string;
  escritorio: boolean;
  actualizador: boolean;
}

/** Espejo de `neurona_info::BusquedaActualizacion`. */
export interface BusquedaActualizacion {
  actual: string;
  disponible: string | null;
  notas: string | null;
  fecha: string | null;
}

export const COMANDO_INFO = "info_neurona";
export const COMANDO_BUSCAR = "buscar_actualizacion";

export type FuenteVersion = "info_neurona" | "getVersion" | "plugin:app|version";

export interface VersionNativa {
  version: string;
  fuente: FuenteVersion;
  /** Lo que dijo `info_neurona` (null en apps anteriores a VER1107B). */
  info: InfoNeuronaNativa | null;
}

/** «v0.5.0 » → «0.5.0»; cualquier cosa que no sea semver → null. Pura. */
export function limpiarVersionNativa(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpia = v.trim().replace(/^v/i, "");
  return esVersionSemver(limpia) ? limpia : null;
}

function texto(x: unknown, max = 120): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

/** Valida lo que devuelve `info_neurona`. Sin una versión semver no vale nada. Pura. */
export function sanearInfoNativa(x: unknown): InfoNeuronaNativa | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const app_version = limpiarVersionNativa(o.app_version);
  if (!app_version) return null;
  return {
    app_version,
    app_nombre: texto(o.app_nombre) ?? "",
    identificador: texto(o.identificador) ?? "",
    sistema: texto(o.sistema, 20) ?? "desconocido",
    plataforma: texto(o.plataforma, 20) ?? "",
    so_version: texto(o.so_version, 60),
    arquitectura: texto(o.arquitectura, 30) ?? "",
    equipo: texto(o.equipo, 80),
    modelo: texto(o.modelo, 80),
    tauri_version: limpiarVersionNativa(o.tauri_version) ?? "",
    escritorio: o.escritorio === true,
    actualizador: o.actualizador === true,
  };
}

/** El `window.__TAURI__` de esta ventana (null fuera de la app nativa o en el servidor). */
export function tauriGlobal(): TauriConApp | null {
  if (typeof window === "undefined") return null;
  const t = (window as unknown as { __TAURI__?: TauriConApp }).__TAURI__;
  return t && typeof t === "object" ? t : null;
}

let infoCache: Promise<InfoNeuronaNativa | null> | null = null;

/** `info_neurona` (o null si la app es anterior o no responde). Con el global, se pide una vez. */
export async function leerInfoNativa(tauri: TauriConApp | null = tauriGlobal()): Promise<InfoNeuronaNativa | null> {
  const invoke = tauri?.core?.invoke;
  if (typeof invoke !== "function") return null;
  const pedir = async () => {
    try {
      return sanearInfoNativa(await invoke(COMANDO_INFO));
    } catch {
      return null; // app anterior a VER1107B («not allowed by ACL») o sin respuesta
    }
  };
  if (tauri !== tauriGlobal()) return pedir();
  // Solo se recuerda una respuesta buena: si falló, la próxima vez se vuelve a preguntar.
  infoCache ??= pedir().then((r) => {
    if (!r) infoCache = null;
    return r;
  });
  return infoCache;
}

/** Olvida lo leído (pruebas, o tras reiniciar para aplicar una versión). */
export function olvidarInfoNativa(): void {
  infoCache = null;
}

/**
 * La versión del binario nativo instalado, de la fuente más rica que responda. Nunca devuelve el
 * build de la web ni nada que no sea semver: si no se sabe, null.
 */
export async function leerVersionNativa(tauri: TauriConApp | null = tauriGlobal()): Promise<VersionNativa | null> {
  if (!tauri) return null;
  const info = await leerInfoNativa(tauri);
  if (info) return { version: info.app_version, fuente: "info_neurona", info };
  try {
    const getVersion = tauri.app?.getVersion;
    if (typeof getVersion === "function") {
      const v = limpiarVersionNativa(await getVersion());
      if (v) return { version: v, fuente: "getVersion", info: null };
    }
  } catch {
    /* sin permiso core:app o sin módulo app: se prueba el invoke directo */
  }
  try {
    const invoke = tauri.core?.invoke;
    if (typeof invoke === "function") {
      const v = limpiarVersionNativa(await invoke("plugin:app|version"));
      if (v) return { version: v, fuente: "plugin:app|version", info: null };
    }
  } catch {
    /* nada más que probar */
  }
  return null;
}

export type ResultadoBusqueda =
  | { estado: "ok"; busqueda: BusquedaActualizacion }
  /** La app es anterior a VER1107B: no tiene `buscar_actualizacion` (o no le dio permiso). */
  | { estado: "sin-comando"; motivo: string }
  | { estado: "error"; motivo: string };

/** ¿El error de Tauri dice que el comando no existe o no está permitido? Pura. */
export function esComandoAusente(motivo: string): boolean {
  return /not allowed|not found|unknown command|no est[aá] permitido|desconocid/i.test(String(motivo ?? ""));
}

function motivoDe(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return "La app nativa no respondió.";
}

/** Busca la versión nueva SIN instalarla (`buscar_actualizacion`). Nunca lanza. */
export async function buscarActualizacionNativa(tauri: TauriConApp | null = tauriGlobal()): Promise<ResultadoBusqueda> {
  const invoke = tauri?.core?.invoke;
  if (typeof invoke !== "function") return { estado: "error", motivo: "Solo en la app nativa de StarSeed OS." };
  try {
    const r = (await invoke(COMANDO_BUSCAR)) as Partial<BusquedaActualizacion> | null;
    const actual = limpiarVersionNativa(r?.actual);
    if (!r || !actual) return { estado: "error", motivo: "La app respondió sin su versión." };
    const disponible = limpiarVersionNativa(r.disponible);
    return {
      estado: "ok",
      busqueda: {
        actual,
        disponible,
        notas: disponible ? texto(r.notas, 4000) : null,
        fecha: disponible ? texto(r.fecha, 40) : null,
      },
    };
  } catch (e) {
    const motivo = motivoDe(e);
    return esComandoAusente(motivo) ? { estado: "sin-comando", motivo } : { estado: "error", motivo };
  }
}
