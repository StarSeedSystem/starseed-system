export type SistemaNativo = "os" | "nexus" | "cafe";

export interface ArchivoPorSO {
  nombre: string;
  bytes: number;
  href: string;
}

export interface ReleasePorSistema {
  macos: ArchivoPorSO[];
  windows: ArchivoPorSO[];
  linux: ArchivoPorSO[];
  android: ArchivoPorSO[];
  ios: ArchivoPorSO[];
}

export interface VersionPublicada {
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

interface AssetRaw {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseApi {
  tag_name: string;
  published_at: string;
  html_url: string;
  body: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: AssetRaw[];
}

function parsearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().split("T")[0];
}

function tipoVersion(nombre: string): SistemaNativo | null {
  const mayus = nombre.toUpperCase();
  if (mayus.includes("STARSEED.OS") || nombre.includes("StarSeed-os-")) return "os";
  if (mayus.includes("STARSEED.NEXUS") || nombre.includes("StarSeed-nexus-")) return "nexus";
  if (mayus.includes("STARSEED.CAFE") || nombre.includes("StarSeed.cafe-")) return "cafe";
  return null;
}

const RE_OS_MACOS = /^StarSeed\.(?:OS|Nexus|Cafe)_[\d.]+_universal\.dmg$/i;
const RE_OS_WINDOWS_EXE = /^StarSeed\.(?:OS|Nexus|Cafe)_[\d.]+_x64-setup\.exe$/i;
const RE_OS_WINDOWS_MSI = /^StarSeed\.(?:OS|Nexus|Cafe)_[\d.]+_x64_en-US\.msi$/i;
const RE_OS_LINUX_APPIMAGE = /^StarSeed\.(?:OS|Nexus|Cafe)_[\d.]+_amd64\.AppImage$/i;
const RE_OS_LINUX_DEB = /^StarSeed\.(?:OS|Nexus|Cafe)_[\d.]+_amd64\.deb$/i;
const RE_OS_LINUX_RPM = /^StarSeed\.(?:OS|Cafe)-(?:[\d.]+)-1\.x86_64\.rpm$/i;
const RE_OS_ANDROID = /^StarSeed-(?:os|nexus|cafe)-[\d.]+\.apk$/i;
const RE_OS_IOS = /\.ipa$/i;

interface ArchivoProcesado {
  nombre: string;
  bytes: number;
  href: string;
  sistema: SistemaNativo;
}

function procesarAsset(a: AssetRaw): ArchivoProcesado | null {
  if (!a.name || !a.browser_download_url) return null;
  const sistema = tipoVersion(a.name);
  if (!sistema) return null;
  if (a.size == null || a.size <= 0) return null;
  return { nombre: a.name, bytes: a.size, href: a.browser_download_url, sistema };
}

function agruparPorSO(archivos: ArchivoProcesado[], sistema: SistemaNativo): ReleasePorSistema {
  const result: ReleasePorSistema = { macos: [], windows: [], linux: [], android: [], ios: [] };
  const filtrados = archivos.filter((a) => a.sistema === sistema);

  for (const a of filtrados) {
    if (RE_OS_MACOS.test(a.nombre)) result.macos.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_WINDOWS_EXE.test(a.nombre)) result.windows.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_WINDOWS_MSI.test(a.nombre)) result.windows.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_LINUX_APPIMAGE.test(a.nombre)) result.linux.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_LINUX_DEB.test(a.nombre)) result.linux.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_LINUX_RPM.test(a.nombre)) result.linux.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_ANDROID.test(a.nombre)) result.android.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
    else if (RE_OS_IOS.test(a.nombre)) result.ios.push({ nombre: a.nombre, bytes: a.bytes, href: a.href });
  }

  result.macos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  result.windows.sort((a, b) => a.nombre.localeCompare(b.nombre));
  result.linux.sort((a, b) => a.nombre.localeCompare(b.nombre));
  result.android.sort((a, b) => a.nombre.localeCompare(b.nombre));
  result.ios.sort((a, b) => a.nombre.localeCompare(b.nombre));

  return result;
}

export function desdeReleases(json: ReleaseApi[]): VersionPublicada[] {
  if (!Array.isArray(json)) return [];

  const validas = json
    .filter((r) => !r.draft && !r.prerelease && r.assets && r.tag_name && r.published_at && r.html_url)
    .map((r) => ({ r, ts: parsearFecha(r.published_at) }))
    .sort((a, b) => b.ts.localeCompare(a.ts));

  const resultado: VersionPublicada[] = [];

  for (const { r } of validas) {
    const archivos = r.assets.map(procesarAsset).filter((a): a is ArchivoProcesado => a !== null);

    const archivosOS = agruparPorSO(archivos, "os");
    const archivosNexus = agruparPorSO(archivos, "nexus");
    const archivosCafe = agruparPorSO(archivos, "cafe");

    const release: VersionPublicada = {
      version: r.tag_name,
      fecha: parsearFecha(r.published_at),
      notas: r.body || "",
      url: r.html_url,
      archivos: { os: archivosOS },
    };

    if (archivosNexus.macos.length > 0 || archivosNexus.android.length > 0) {
      release.archivos.nexus = archivosNexus;
    }
    if (archivosCafe.macos.length > 0 || archivosCafe.android.length > 0) {
      release.archivos.cafe = archivosCafe;
    }

    resultado.push(release);
  }

  return resultado;
}

export { tipoVersion };