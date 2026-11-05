import { esAppNativa } from "./puente";
import { type Resultado } from "./tipos";
import { esVersionMasNueva } from "@/lib/version/os-release";

export type FaseActualizacion = "buscando" | "descargando" | "instalando" | "lista" | "error" | "al-dia";

export interface EstadoActualizacion {
  fase: FaseActualizacion;
  versionActual?: string | null;
  versionNueva?: string | null;
  descargado?: number | null;
  total?: number | null;
  progreso?: number | null;
  mensaje?: string | null;
}

export interface InformacionVersion {
  version: string;
  etiqueta: string;
  urlDescarga: string;
  tamanoBytes?: number;
  notas?: string;
}

export const EVENTO_ACTUALIZACION = "starseed://actualizacion";

export function estadoPorDefecto(): EstadoActualizacion {
  return { fase: "al-dia", versionActual: null, versionNueva: null, descargado: null, total: null, progreso: null, mensaje: null };
}

export function normalizarEstado(raw: unknown): EstadoActualizacion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fase = typeof r.fase === "string" ? r.fase : "";
  if (!["buscando", "descargando", "instalando", "lista", "error", "al-dia"].includes(fase)) return null;
  return {
    fase: fase as FaseActualizacion,
    versionActual: typeof r.version === "string" ? r.version : null,
    versionNueva: typeof r.nueva_version === "string" ? r.nueva_version : null,
    descargado: typeof r.descargado === "number" ? r.descargado : null,
    total: typeof r.total === "number" ? r.total : null,
    mensaje: typeof r.mensaje === "string" ? r.mensaje : null,
  };
}

export function calcularProgreso(estado: EstadoActualizacion): number | null {
  const { descargado, total } = estado;
  if (typeof descargado !== "number" || typeof total !== "number" || total <= 0) return null;
  const pct = Math.round((descargado / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

export interface OpcionesCheck {
  versionActual?: string | null;
  versionRemota?: string | null;
}

export function necesitaActualizacion(opts: OpcionesCheck): boolean {
  if (!opts.versionRemota) return false;
  if (!opts.versionActual) return true;
  return esVersionMasNueva(opts.versionRemota, opts.versionActual);
}

export interface ResultadoCheck {
  ok: boolean;
  estado: EstadoActualizacion;
  error?: string;
  versionNueva?: string;
}

export function resultadoCheck(
  versionActual: string | null,
  versionNueva: string | null | undefined,
  mensaje?: string,
): ResultadoCheck {
  if (!versionNueva) {
    return {
      ok: true,
      estado: { fase: "al-dia", versionActual, versionNueva: null, mensaje: mensaje ?? "Ya estás en la última versión." },
    };
  }
  return {
    ok: true,
    estado: {
      fase: "lista",
      versionActual,
      versionNueva: versionNueva ?? null,
      mensaje: `Actualización disponible: ${versionNueva}.`,
    },
    versionNueva,
  };
}

export function estadoAlDescargar(estado: EstadoActualizacion, descargado: number, total?: number): EstadoActualizacion {
  return {
    ...estado,
    fase: "descargando",
    descargado,
    total: total ?? estado.total,
  };
}

export function estadoAlInstalar(estado: EstadoActualizacion, total?: number): EstadoActualizacion {
  return {
    ...estado,
    fase: "instalando",
    descargado: null,
    total: total ?? estado.total,
  };
}

export function estadoAlError(estado: EstadoActualizacion, error: string): EstadoActualizacion {
  return {
    ...estado,
    fase: "error",
    mensaje: error,
  };
}

export function estadoALista(estado: EstadoActualizacion): EstadoActualizacion {
  return {
    ...estado,
    fase: "lista",
    descargado: null,
    total: null,
  };
}

export interface ComprobarActualizacionResult {
  ok: boolean;
  estado?: EstadoActualizacion;
  versionNueva?: string | null;
  urlDescarga?: string;
  error?: string;
}

export function comprobarActualizacion(
  versionActual: string | null,
  versionRemota: string | null | undefined,
  urlBase: string,
): ComprobarActualizacionResult {
  if (!versionRemota) {
    return { ok: true, versionNueva: null, error: "No se pudo obtener la versión remota." };
  }
  if (!necesitaActualizacion({ versionActual, versionRemota: String(versionRemota) })) {
    return { ok: true, versionNueva: null };
  }
  const etiqueta = `v${versionRemota}`;
  const urlDescarga = `${urlBase}/download/${etiqueta}`;
  return { ok: true, versionNueva: versionRemota, urlDescarga };
}

export interface DescargarInstalarResult {
  ok: boolean;
  mensaje: string;
  reiniciar?: boolean;
  progreso?: number;
}

export interface DescargarInstalarPuro {
  (url: string, tamanoBytes: number): DescargarInstalarResult;
}

export function descargarInstalarPuro(
  url: string,
  tamanoBytes: number,
  progresoActual: number = 0,
): DescargarInstalarResult {
  const progreso = Math.min(100, Math.round((progresoActual / tamanoBytes) * 100));
  return { ok: progreso >= 100, mensaje: progreso >= 100 ? "Lista para reiniciar" : "Descargando...", progreso };
}

export interface ReiniciarParametros {
  razon?: string;
}

export function reiniciarParametrosValidos(p: unknown): p is ReiniciarParametros {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.razon === "string" || typeof o === "object";
}

export function esPlataformaSoportada(platform: string): boolean {
  return ["darwin", "windows", "linux"].includes(platform.toLowerCase());
}

export function medirPlataforma(): string {
  if (typeof navigator === "undefined") return "node";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("linux")) return "linux";
  return "desconocida";
}

export interface InformeActualizacion {
  esActualizacion: boolean;
  versionActual: string | null;
  versionNueva: string | null;
  plataforma: string;
  aplicable: boolean;
}

export function informeActualizacion(
  versionActual: string | null,
  versionRemota: string | null | undefined,
  plataforma: string,
): InformeActualizacion {
  return {
    esActualizacion: necesitaActualizacion({ versionActual, versionRemota: versionRemota ?? undefined }),
    versionActual,
    versionNueva: versionRemota ?? null,
    plataforma,
    aplicable: esPlataformaSoportada(plataforma),
  };
}

export interface ObraActualizacion {
  ok: true;
  version: string;
  enlace: string;
}

export interface ObraActualizacionError {
  ok: false;
  motivo: string;
}

export type ObraResultado = ObraActualizacion | ObraActualizacionError;

export function crearObraActualizacion(version: string, urlBase: string): ObraResultado {
  const etiqueta = version.startsWith("v") ? version : `v${version}`;
  const enlace = `${urlBase}/download/${etiqueta}`;
  return { ok: true, version, enlace };
}

export function esResultado<T>(r: Resultado<T>): r is { ok: true; valor: T } {
  return r.ok === true;
}

export function mensajeDeError(r: Resultado<unknown>): string {
  return r.ok ? "Éxito" : r.motivo;
}

export const NATIVE_UPDATER = {
  check: "check_update",
  descargarInstalar: "download_and_install",
  reiniciar: "reiniciar_para_actualizar",
  estado: "estado_actualizacion",
  dispositivoInfo: "device_info",
  EVENTO: EVENTO_ACTUALIZACION,
} as const;

export interface EventoActualizacionPayload {
  fase: FaseActualizacion;
  version?: string | null;
  descargado?: number | null;
  total?: number | null;
  mensaje?: string | null;
  pendiente_reinicio?: boolean;
}

export function esEventoValido(raw: unknown): raw is EventoActualizacionPayload {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as Record<string, unknown>;
  const fase = typeof p.fase === "string" ? p.fase : "";
  return ["buscando", "descargando", "instalando", "lista", "error", "al-dia"].includes(fase);
}