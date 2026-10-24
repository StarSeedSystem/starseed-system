/* ============================================================
   STARSEED · Biblioteca · plan de archivo de las fuentes (ARC1020A)
   Módulo puro: decide qué enlaces de las fichas se archivan, en
   qué orden abstracta y cómo se resume la copia. Sin red ni disco.
   ArchiveBox es la memoria de lo enlazado, no el gestor de archivos.
   ============================================================ */
export type FichaFuente = { id: string; enlaces: readonly string[]; privada: boolean };
export type OpcionesArchivo = { archiveOrg: boolean; medios: boolean; git: boolean };
export type OrdenDeArchivo = { urls: string[]; opciones: OpcionesArchivo };
export type CopiaArchivada = {
  url?: string | null;
  guardadaEn?: string | null;
  formatos?: readonly string[] | null;
};
/** Tabla real de ArchiveBox 0.9.73 (A1): las cuatro opciones, apagadas. */
export const OPCIONES_ARCHIVEBOX_09 = {
  ARCHIVEDOTORG_ENABLED: false,
  YTDLP_ENABLED: false,
  PUBLIC_INDEX: false,
  PUBLIC_SNAPSHOTS: false,
} as const;
const PARAMETROS_BASURA = new Set(["fbclid", "gclid"]);
const HOSTS_CODIGO = ["github.com", "gitlab.com", "codeberg.org", "bitbucket.org", "gitea.com"] as const;
function esHostPrivado(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "[::1]" || h.endsWith(".local")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const a = Number(v4[1]); const b = Number(v4[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
/** Normaliza una URL archivable o devuelve null si no debe archivarse. */
export function normalizarUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const texto = raw.trim();
  if (!texto) return null;
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || esHostPrivado(url.hostname)) return null;
  url.hash = "";
  for (const clave of [...url.searchParams.keys()]) {
    const minuscula = clave.toLowerCase();
    if (minuscula.startsWith("utm_") || PARAMETROS_BASURA.has(minuscula)) {
      url.searchParams.delete(clave);
    }
  }
  return url.toString();
}

function unicasArchivables(urls: readonly string[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const raw of urls) {
    const url = normalizarUrl(raw);
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    salida.push(url);
  }
  return salida;
}

/** URLs de fichas públicas que aún no tienen copia; sin repetir. */
export function fuentesParaArchivar(
  fichas: readonly FichaFuente[],
  yaArchivadas: readonly string[] = [],
): string[] {
  const vistas = new Set(unicasArchivables(yaArchivadas));
  const salida: string[] = [];
  for (const ficha of fichas) {
    if (ficha.privada) continue;
    for (const enlace of ficha.enlaces) {
      const url = normalizarUrl(enlace);
      if (!url || vistas.has(url)) continue;
      vistas.add(url);
      salida.push(url);
    }
  }
  return salida;
}

function esHostDeCodigo(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return HOSTS_CODIGO.some((base) => h === base || h.endsWith(`.${base}`));
}

/** Orden abstracta para el servidor: sin archive.org, sin medios y git solo en código. */
export function ordenDeArchivo(urls: readonly string[]): OrdenDeArchivo {
  const limpias = unicasArchivables(urls);
  const git = limpias.some((url) => esHostDeCodigo(new URL(url).hostname));
  return { urls: limpias, opciones: { archiveOrg: false, medios: false, git } };
}

function fechaVerificada(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!m) return null;
  const fecha = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha ? fecha : null;
}

function listaFormatos(formatos: readonly string[] | null | undefined): string {
  const limpios = [...new Set((formatos ?? []).map((f) => f.trim()).filter(Boolean))];
  if (limpios.length === 0) return "sin formatos verificados";
  if (limpios.length === 1) return limpios[0];
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

/** Resumen para la ficha; si falta el dato, lo dice en vez de inventarlo. */
export function fichaDeCopia(instantanea: CopiaArchivada = {}): string {
  const fecha = fechaVerificada(instantanea.guardadaEn);
  const base = fecha ? `copia guardada el ${fecha}` : "copia guardada (fecha sin verificar)";
  return `${base} · ${listaFormatos(instantanea.formatos)}`;
}
