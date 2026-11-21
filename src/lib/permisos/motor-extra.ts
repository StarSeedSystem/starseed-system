"use client";

import {
  type EstadoPermiso,
  type PermisoDispositivo,
  type ResultadoPermiso,
  EVENTO_PERMISO,
  normalizarEstado,
  type EntornoPermisos,
} from "./tipos";
import { estadoPermiso } from "./motor";

const hayWin = typeof window !== "undefined";
const QUERY_NAME: Partial<Record<PermisoDispositivo, string>> = { microfono: "microphone", camara: "camera", ubicacion: "geolocation", notificaciones: "notifications" };

export function suscribirPermiso(permiso: PermisoDispositivo, cb: (estado: EstadoPermiso) => void): () => void {
  if (!hayWin) return () => {};
  let vivo = true, offChange: (() => void) | null = null;
  const onEvento = (e: Event) => { const det = (e as CustomEvent<ResultadoPermiso>).detail; if (det?.permiso === permiso) void estadoPermiso(permiso).then(s => { if (vivo) cb(normalizarEstado(s)); }); };
  window.addEventListener(EVENTO_PERMISO, onEvento);
  const name = QUERY_NAME[permiso];
  const perms = (navigator as any).permissions;
  if (name && perms?.query) perms.query({ name: name as PermissionName }).then((st: PermissionStatus) => { if (!vivo) return; const h = () => cb(normalizarEstado((st.state as any) ?? "prompt")); st.addEventListener?.("change", h); offChange = () => st.removeEventListener?.("change", h); }).catch(() => {});
  return () => { vivo = false; window.removeEventListener(EVENTO_PERMISO, onEvento); offChange?.(); };
}

export function entornoPermisos(): EntornoPermisos {
  if (typeof navigator === "undefined") return { visor: null, origenSeguro: true, navegador: "otro", so: "otro" };
  const ua = navigator.userAgent;
  let visor: string | null = null;
  if (/ Claude\//.test(ua)) visor = "el visor integrado de Claude";
  else if (/ Electron\//.test(ua)) visor = "esta app embebida (Electron)";
  else if (/Tauri\//i.test(ua) || (hayWin && "__TAURI__" in window)) visor = "la app de escritorio StarSeed";
  const so = /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Mac/i.test(ua) ? "macos" : /Win/i.test(ua) ? "windows" : /Linux/i.test(ua) ? "linux" : "otro";
  const navegador = /Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : /Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "otro";
  return { visor, origenSeguro: hayWin ? window.isSecureContext !== false : true, navegador, so };
}

export const NOMBRE_PERMISO: Record<PermisoDispositivo, string> = { microfono: "Micrófono", camara: "Cámara", ubicacion: "Ubicación", notificaciones: "Notificaciones", almacenamiento: "Almacenamiento persistente", movimiento: "Movimiento", archivos: "Archivos (carpetas)" };

export function ayudaPermiso(permiso: PermisoDispositivo, estado: "granted" | "denied" | "prompt" | "unsupported"): string {
  const ent = entornoPermisos(); const nombre = NOMBRE_PERMISO[permiso];
  if (ent.visor) return `${ent.visor} no muestra diálogos de permiso del sistema: pulsa «Abrir en tu navegador» y concédelo allí (tu cuenta y su configuración se sincronizan solas).`;
  if (!ent.origenSeguro && (permiso === "microfono" || permiso === "camara")) return "Estás en un origen NO seguro (http://). El navegador solo expone micrófono/cámara en HTTPS o en localhost: abre el OS en https://… o en http://localhost.";
  if (estado === "denied") {
    const base = ent.navegador === "safari" ? `Safari ▸ Ajustes ▸ Sitios web ▸ ${nombre} → «Permitir» para este sitio, y recarga.` : ent.navegador === "firefox" ? `Pulsa el icono de permisos junto al candado → quita el bloqueo de ${nombre.toLowerCase()} y recarga.` : `Pulsa el icono a la izquierda de la dirección → «Configuración del sitio» → ${nombre} → «Permitir», y recarga.`;
    const esSensor = permiso === "microfono" || permiso === "camara" || permiso === "ubicacion";
    const sistema = !esSensor ? "" : ent.so === "macos" ? ` Si sigue igual, el SISTEMA bloquea a tu navegador: Ajustes del Sistema ▸ Privacidad y seguridad ▸ ${nombre} → activa tu navegador.` : ent.so === "windows" ? ` Si sigue igual: Configuración ▸ Privacidad y seguridad ▸ ${nombre} → permite el acceso a las apps de escritorio.` : (ent.so === "android" || ent.so === "ios") ? ` Si sigue igual: Ajustes del sistema ▸ Apps ▸ tu navegador ▸ Permisos → ${nombre}.` : "";
    return `El navegador tiene BLOQUEADO ${nombre.toLowerCase()} para este sitio y ya no pregunta. ${base}${sistema}`;
  }
  if (estado === "prompt") return "Al pulsar «Permitir», el navegador te lo preguntará: acepta en su diálogo.";
  if (estado === "unsupported") return permiso === "archivos" ? "Este navegador no soporta conectar carpetas (File System Access): usa Chrome/Edge, o adjunta con «subir carpeta» donde aplique." : "No disponible o no consultable en este navegador/medio.";
  return "";
}

export async function pedirPermisosEnSecuencia(permisos: PermisoDispositivo[]): Promise<ResultadoPermiso[]> {
  const out: ResultadoPermiso[] = [];
  for (const p of permisos) { const { requestDevicePermission } = await import("./motor"); out.push(await requestDevicePermission(p)); }
  return out;
}

export function abrirEnNavegadorSistema(): void { try { window.open(window.location.href, "_blank", "noopener,noreferrer"); } catch {} }

export const SENSE_PERMISSION: Record<string, PermisoDispositivo> = { escucha: "microfono", vision: "camara" };
export const TOOL_PERMISSION: Record<string, PermisoDispositivo> = { files: "archivos", ubicacion: "ubicacion", location: "ubicacion", sensors: "movimiento", notifications: "notificaciones" };