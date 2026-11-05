import type { SistemaNativo } from "./os-release";
import { PREFIJOS_SISTEMA } from "./os-release";

export type SO = "macos" | "windows" | "linux" | "android" | "ios";

export interface ArchivoVersion {
  nombre: string;
  tamaño: number;
  url: string;
}

export interface ArchivosPorSO {
  macos?: ArchivoVersion[];
  windows?: ArchivoVersion[];
  linux?: ArchivoVersion[];
  android?: ArchivoVersion[];
  ios?: ArchivoVersion[];
}

export interface VersionPublicada {
  version: string;
  fecha: string;
  notas: string;
  url: string;
  archivos: Record<SistemaNativo, ArchivosPorSO>;
}

function clasificarSO(nombre: string): SO | null {
  const n = nombre.toLowerCase();
  if (/\.apk$/i.test(n)) return "android";
  if (/\.ipa$/i.test(n)) return "ios";
  if (/\.dmg$/i.test(n)) return "macos";
  if (/\.msi$/i.test(n) || /\.exe$/i.test(n)) return "windows";
  if (/\.appimage$/i.test(n) || /\.deb$/i.test(n) || /\.rpm$/i.test(n)) return "linux";
  return null;
}

function sistemaDeAsset(nombre: string): SistemaNativo | null {
  const n = nombre.toLowerCase();
  for (const [sistema, pref] of Object.entries(PREFIJOS_SISTEMA) as [SistemaNativo, { escritorio: string; apk: string } ][]) {
    const esc = pref.escritorio.toLowerCase();
    const apk = pref.apk.toLowerCase();
    if (n.startsWith(esc.toLowerCase()) || n.includes(esc.toLowerCase()) || n.startsWith(apk.toLowerCase()) || n.includes(apk.toLowerCase())) {
      return sistema;
    }
  }
  return null;
}

function esAssetInstalable(nombre: string): boolean {
  const n = nombre.toLowerCase();
  if (/\.(sig|sha256|blockmap|yml|json|txt)$/i.test(n)) return false;
  return !!clasificarSO(nombre);
}

export function desdeReleases(json: unknown): VersionPublicada[] {
  if (!Array.isArray(json)) return [];
  const releases = json as any[];
  const filtradas = releases.filter(r => r && typeof r === "object" && r.draft !== true && r.prerelease !== true);
  const versiones: VersionPublicada[] = filtradas.map(r => {
    const version = typeof r.tag_name === "string" ? r.tag_name : "";
    const fecha = typeof r.published_at === "string" ? r.published_at : "";
    const notas = typeof r.body === "string" ? r.body : (typeof r.name === "string" ? r.name : "");
    const url = typeof r.html_url === "string" ? r.html_url : "";
    const archivosInicial: Record<SistemaNativo, ArchivosPorSO> = {
      os: {},
      nexus: {},
      cafe: {},
    };
    const assets = Array.isArray(r.assets) ? r.assets : [];
    for (const a of assets) {
      if (!a || typeof a !== "object") continue;
      const nombre = typeof a.name === "string" ? a.name : "";
      const urlAsset = typeof a.browser_download_url === "string" ? a.browser_download_url : "";
      const tamaño = typeof a.size === "number" ? a.size : 0;
      if (!nombre || !urlAsset) continue;
      if (!esAssetInstalable(nombre)) continue;
      const sistema = sistemaDeAsset(nombre);
      if (!sistema) continue;
      const so = clasificarSO(nombre);
      if (!so) continue;
      const archivo: ArchivoVersion = { nombre, tamaño, url: urlAsset };
      const bucket = archivosInicial[sistema][so] ?? [];
      archivosInicial[sistema][so] = [...bucket, archivo];
    }
    return { version, fecha, notas, url, archivos: archivosInicial };
  });
  versiones.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return versiones;
}
