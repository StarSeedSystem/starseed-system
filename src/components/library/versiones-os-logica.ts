// StarSeed OS · Biblioteca — Lógica pura de VersionesOS (Ola 1105H, tarea VER1105H).
// Funciones puras exportadas para testabilidad (entrada → salida, sin red, sin disco).

import { VersionPublicada, ReleasePorSistema, ArchivoPorSO } from "@/lib/version/versiones-publicadas";

export interface ArchivoPlano {
  nombre: string;
  bytes: number;
  href: string;
  sistema: string;
}

export interface VersionInfoProcesada {
  version: string;
  fecha: string;
  notas: string;
  url: string;
  archivos: ArchivoPlano[];
}

export function formatearFechaISO(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const MESES = [
      "ene", "feb", "mar", "abr", "may", "jun",
      "jul", "ago", "sep", "oct", "nov", "dic",
    ];
    return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  } catch {
    return iso;
  }
}

export function bytesAFormato(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return (bytes / 1_000_000_000).toFixed(1) + " GB";
  }
  if (bytes >= 1_000_000) {
    return (bytes / 1_000_000).toFixed(1) + " MB";
  }
  if (bytes >= 1_000) {
    return (bytes / 1_000).toFixed(1) + " KB";
  }
  return bytes + " B";
}

export function aplanarArchivosPorSO(archivos: ReleasePorSistema): ArchivoPlano[] {
  const resultado: ArchivoPlano[] = [];
  const sistemas: { key: keyof ReleasePorSistema; label: string }[] = [
    { key: "macos", label: "macOS" },
    { key: "windows", label: "Windows" },
    { key: "linux", label: "Linux" },
    { key: "android", label: "Android" },
    { key: "ios", label: "iOS" },
  ];
  for (const { key, label } of sistemas) {
    for (const archivo of archivos[key]) {
      resultado.push({ ...archivo, sistema: label });
    }
  }
  return resultado;
}

export function procesarVersion(version: VersionPublicada): VersionInfoProcesada {
  return {
    version: version.version,
    fecha: version.fecha,
    notas: version.notas,
    url: version.url,
    archivos: aplanarArchivosPorSO(version.archivos.os),
  };
}