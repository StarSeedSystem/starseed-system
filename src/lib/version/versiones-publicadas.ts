import { PREFIJOS_SISTEMA, nativeInstallerAssets, SistemaNativo } from "./os-release";

export type SO = "macos" | "windows" | "linux" | "android" | "ios";

export interface ArchivoVersion {
  nombre: string;
  tamanio: number;
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

type GithubAsset = { name: string; size?: number; browser_download_url?: string };
type GithubRelease = {
  tag_name?: string;
  name?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  body?: string;
  html_url?: string;
  assets?: GithubAsset[];
};

function inicializarArchivos(): ArchivosPorSO {
  return { macos: [], windows: [], linux: [], android: [], ios: [] };
}

function agregarArchivo(archivos: ArchivosPorSO, os: SO, asset: ArchivoVersion) {
  const lista = archivos[os] ?? [];
  archivos[os] = [...lista, asset];
}

export function desdeReleases(json: unknown): VersionPublicada[] {
  if (!Array.isArray(json)) return [];

  const releases = json as GithubRelease[];
  const filtradas = releases.filter(r => !r.draft && !r.prerelease && typeof r.tag_name === "string");

  const versiones: VersionPublicada[] = filtradas.map(r => {
    const tag = r.tag_name!;
    const version = tag.replace(/^v/i, "");
    const fecha = r.published_at ?? "";
    const notas = r.body ?? "";
    const url = r.html_url ?? "";

    const archivosPorSistema: Record<SistemaNativo, ArchivosPorSO> = {
      os: inicializarArchivos(),
      nexus: inicializarArchivos(),
      cafe: inicializarArchivos(),
    } as Record<SistemaNativo, ArchivosPorSO>;

    (Object.keys(PREFIJOS_SISTEMA) as SistemaNativo[]).forEach(sistema => {
      const esperado = nativeInstallerAssets(version, tag, sistema);
      const mapa = new Map<string, GithubAsset>();
      (r.assets ?? []).forEach(a => mapa.set(a.name, a));

      const archivos = inicializarArchivos();
      esperado.forEach(a => {
        const asset = mapa.get(a.filename);
        if (asset && asset.browser_download_url) {
          const archivo: ArchivoVersion = {
            nombre: asset.name,
            tamanio: asset.size ?? 0,
            url: asset.browser_download_url,
          };
          agregarArchivo(archivos, a.os as SO, archivo);
        }
      });

      // iOS: intentar encontrar .ipa del sistema si existe
      const prefix = PREFIJOS_SISTEMA[sistema].escritorio;
      (r.assets ?? []).forEach(a => {
        if (a.name.startsWith(`${prefix}_${version}`) && a.name.endsWith(".ipa") && a.browser_download_url) {
          agregarArchivo(archivos, "ios", {
            nombre: a.name,
            tamanio: a.size ?? 0,
            url: a.browser_download_url,
          });
        }
      });

      archivosPorSistema[sistema] = archivos;
    });

    return { version, fecha, notas, url, archivos: archivosPorSistema };
  });

  versiones.sort((a, b) => {
    const ta = Date.parse(a.fecha);
    const tb = Date.parse(b.fecha);
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });

  return versiones;
}
