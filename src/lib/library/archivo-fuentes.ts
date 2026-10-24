/* ============================================================
   STARSEED · Biblioteca · Plan de archivo de las fuentes (ARC1020A)
   Módulo puro: normaliza enlaces de fichas y compone la orden que
   el servidor ArchiveBox traduce a su versión. Sin red ni disco.
   ============================================================ */

export interface FichaFuente { id: string; enlaces: readonly string[]; privada: boolean }
export interface FuenteParaArchivar { url: string; fichaId: string }
export interface OrdenDeArchivo { urls: string[]; opciones: { archiveOrg: false; medios: false; git: boolean } }
export interface InstantaneaCopia { guardadaEl?: string; titulo?: string; formatos?: readonly string[]; fallidos?: readonly string[] }
export interface ResumenCopia { texto: string; formatos: string[]; aviso?: string }

/** Nombres reales de las opciones en ArchiveBox 0.9.73 (A1): no se inventan otras. */
export const VARIABLES_ARCHIVEBOX_09 = {
  archiveOrg: "ARCHIVEDOTORG_ENABLED",
  medios: "YTDLP_ENABLED",
  indicePublico: "PUBLIC_INDEX",
  instantaneasPublicas: "PUBLIC_SNAPSHOTS",
} as const;

export type VariableArchiveBox09 = (typeof VARIABLES_ARCHIVEBOX_09)[keyof typeof VARIABLES_ARCHIVEBOX_09];

const HOSTS_CODIGO = ["github.com", "gitlab.com", "codeberg.org", "bitbucket.org", "git.sr.ht"];

const FORMATOS_LEGIBLES: Record<string, string> = {
  html: "HTML original", wget: "HTML original", singlefile: "SingleFile", pdf: "PDF",
  screenshot: "captura", warc: "WARC", dom: "texto del artículo", media: "medios",
  subtitles: "subtítulos", git: "clon git", title: "metadatos", favicon: "favicon", headers: "cabeceras",
};
function esParametroRuido(clave: string): boolean {
  const k = clave.toLowerCase();
  return k.startsWith("utm_") || k === "fbclid" || k === "gclid";
}
function esIpv4Privada(host: string): boolean {
  const partes = host.split(".");
  if (partes.length !== 4 || !partes.every((p) => /^\d{1,3}$/.test(p))) return false;
  const a = Number(partes[0]);
  const b = Number(partes[1]);
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}
/** ¿Es un host local o de red privada que nunca debe salir a archivar? */
export function esDireccionPrivada(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.endsWith(".local")) return true;
  return esIpv4Privada(h);
}
/** Normaliza una URL (host en minúsculas, sin ruido ni fragmento) o null si no es http(s) pública. */
export function normalizarUrl(raw: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (esDireccionPrivada(url.hostname)) return null;
  for (const clave of [...url.searchParams.keys()]) {
    if (esParametroRuido(clave)) url.searchParams.delete(clave);
  }
  url.hash = "";
  return url.toString();
}
function esHostDeCodigo(host: string): boolean {
  const h = host.trim().toLowerCase();
  return HOSTS_CODIGO.some((base) => h === base || h.endsWith(`.${base}`));
}
/** Enlaces públicos y normalizados de las fichas, sin las privadas ni las ya archivadas. */
export function fuentesParaArchivar(
  fichas: readonly FichaFuente[],
  yaArchivadas: readonly string[] = [],
): FuenteParaArchivar[] {
  const vistas = new Set<string>();
  for (const previa of yaArchivadas) {
    const normal = normalizarUrl(previa);
    if (normal) vistas.add(normal);
  }
  const salida: FuenteParaArchivar[] = [];
  for (const ficha of fichas) {
    if (!ficha || ficha.privada) continue;
    for (const enlace of ficha.enlaces ?? []) {
      const url = normalizarUrl(enlace);
      if (!url || vistas.has(url)) continue;
      vistas.add(url);
      salida.push({ url, fichaId: ficha.id });
    }
  }
  return salida;
}
/** Orden abstracta: archive.org y medios apagados; git solo si hay hosts de código. */
export function ordenDeArchivo(urls: readonly string[]): OrdenDeArchivo {
  const vistas = new Set<string>();
  const limpias: string[] = [];
  let git = false;
  for (const raw of urls) {
    const url = normalizarUrl(raw);
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    limpias.push(url);
    if (esHostDeCodigo(new URL(url).hostname)) git = true;
  }
  return { urls: limpias, opciones: { archiveOrg: false, medios: false, git } };
}
/** Resume para la ficha una instantánea ya descargada del servidor. */
export function fichaDeCopia(instantanea: InstantaneaCopia): ResumenCopia {
  const formatos = (instantanea.formatos ?? [])
    .filter((f) => typeof f === "string" && f.trim() !== "")
    .map((f) => FORMATOS_LEGIBLES[f.trim().toLowerCase()] ?? f.trim());
  const fallidos = (instantanea.fallidos ?? []).filter((f) => typeof f === "string" && f.trim() !== "");
  const cuando = instantanea.guardadaEl?.trim();
  let texto = cuando ? `copia guardada el ${cuando}` : "copia guardada (sin fecha confirmada)";
  texto += formatos.length > 0 ? ` · ${formatos.join(", ")}` : " · sin formatos confirmados";
  if (fallidos.length > 0) return { texto, formatos, aviso: `no se pudo guardar: ${fallidos.join(", ")}` };
  return { texto, formatos };
}
