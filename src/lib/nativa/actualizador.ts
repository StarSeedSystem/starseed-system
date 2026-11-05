/**
 * Actualizador nativo — lógica pura para actualización del escritorio (Tauri).
 * El updater de Tauri descarga e instala sin tocar datos de usuario.
 * Módulo puro: sin `node:*`, sin `window`, sin React.
 */

import { esVersionMasNueva } from "@/lib/version/os-release";

export interface ResultadoComprobacion {
  ok: true;
  versionActual: string;
  versionNueva: string;
  notas: string;
  puedeActualizar: boolean;
}

export interface ResultadoActualizacion {
  ok: boolean;
  mensaje: string;
  requiereReinicio: boolean;
}

export type EstadoUpdater =
  | { fase: "desconocido" }
  | { fase: "al-día"; version: string }
  | { fase: "buscando"; version: string }
  | { fase: "descargando"; version: string; progreso: number }
  | { fase: "instalando"; version: string }
  | { fase: "lista"; version: string }
  | { fase: "error"; version: string; error: string };

export function estadoUpdaterInicial(): EstadoUpdater {
  return { fase: "desconocido" };
}

export function normalizarEstadoUpdater(raw: unknown): EstadoUpdater {
  if (!raw || typeof raw !== "object") return { fase: "desconocido" };
  const r = raw as Record<string, unknown>;
  const fase = typeof r.fase === "string" ? r.fase : "";
  const version = typeof r.version === "string" ? r.version : "";

  if (fase === "al-día") return { fase: "al-día", version };
  if (fase === "buscando") return { fase: "buscando", version };
  if (fase === "descargando") {
    const descargado = typeof r.descargado === "number" ? r.descargado : 0;
    const total = typeof r.total === "number" && r.total! > 0 ? r.total! : 1;
    const progreso = Math.round((descargado / total) * 100);
    return { fase: "descargando", version, progreso };
  }
  if (fase === "instalando") return { fase: "instalando", version };
  if (fase === "lista") return { fase: "lista", version };
  if (fase === "error") {
    const error = typeof r.mensaje === "string" ? r.mensaje : "Error desconocido";
    return { fase: "error", version, error };
  }
  return { fase: "desconocido" };
}

export function calcularProgreso(estado: EstadoUpdater): number | null {
  return estado.fase === "descargando" ? estado.progreso : null;
}

export function textoEstado(estado: EstadoUpdater): string {
  switch (estado.fase) {
    case "desconocido": return "";
    case "al-día": return "Ya estás en la última versión.";
    case "buscando": return "Buscando actualización...";
    case "descargando": return `Descargando ${estado.progreso}%...`;
    case "instalando": return "Instalando actualización...";
    case "lista": return "Actualización lista: reinicia para aplicarla.";
    case "error": return estado.error || "Error al comprobar actualización.";
  }
}

export function puedeMostrarToast(estado: EstadoUpdater): boolean {
  return estado.fase !== "desconocido" && estado.fase !== "al-día";
}

export function necesitaReinicio(estado: EstadoUpdater): boolean {
  return estado.fase === "lista";
}

export function compararVersionesInstaladas(actual: string, disponible: string): boolean {
  return esVersionMasNueva(disponible, actual);
}

export function formatearNotasVersion(notas: string): string {
  return notas.trim();
}

export function crearResultadoComprobacion(
  actual: string,
  nueva: string,
  notas: string,
): ResultadoComprobacion {
  return {
    ok: true,
    versionActual: actual,
    versionNueva: nueva,
    notas,
    puedeActualizar: compararVersionesInstaladas(actual, nueva),
  };
}

export function crearResultadoActualizacion(
  ok: boolean,
  mensaje: string,
  requiereReinicio = false,
): ResultadoActualizacion {
  return { ok, mensaje, requiereReinicio };
}

export function verificarActualizacion(estadoActual: string, estadoNuevo: string): ResultadoComprobacion {
  return crearResultadoComprobacion(estadoActual, estadoNuevo, `Versión ${estadoNuevo} disponible.`);
}