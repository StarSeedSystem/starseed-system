import { VersionPublicada, ArchivoPorSO, ReleasePorSistema } from "./versiones-publicadas";
import { permisosDe, ConfigSO, SistemaOperativo } from "./permisos-por-so";
import { compararVersiones, esVersionMasNueva } from "./os-release";

export interface VersionTransformada {
  version: string;
  fecha: string;
  notas: string;
  url: string;
  archivos: {
    os: ReleasePorSistema;
    nexus?: ReleasePorSistema;
    cafe?: ReleasePorSistema;
  };
}

export interface ApiVersionesResponse {
  versiones: VersionPublicada[];
  generadoEn: string;
  aviso?: string;
}

export function extraerVersionMasReciente(
  response: ApiVersionesResponse,
): VersionTransformada | null {
  if (!response?.versiones?.length) return null;
  return response.versiones[0] as VersionTransformada;
}

export function hayActualizacionDisponible(
  versionInstalada: string,
  versionDisponible: string,
): boolean {
  return esVersionMasNueva(versionDisponible, versionInstalada);
}

export function obtenerSistemasConArchivos(
  archivos: ReleasePorSistema,
): Array<{ sistema: SistemaOperativo; archivos: ArchivoPorSO[] }> {
  const sistemas: SistemaOperativo[] = ["macos", "windows", "linux", "android", "ios"];
  return sistemas
    .map((sistema) => ({ sistema, archivos: archivos[sistema] }))
    .filter(({ archivos }) => archivos.length > 0);
}

export function obtenerRequisitosYPermisos(
  sistemas: SistemaOperativo[],
): Array<{ sistema: SistemaOperativo; config: ConfigSO }> {
  return sistemas.map((sistema) => ({
    sistema,
    config: permisosDe(sistema),
  }));
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

export const ETIQUETAS_SISTEMA: Record<SistemaOperativo, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  web: "Web (PWA)",
};

export const ICONOS_SISTEMA: Record<SistemaOperativo, string> = {
  macos: "🍎",
  windows: "🪟",
  linux: "🐧",
  android: "🤖",
  ios: "📱",
  web: "🌐",
};