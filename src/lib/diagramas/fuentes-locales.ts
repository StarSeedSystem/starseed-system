// Fuentes locales para los diagramas de Astraura (contrato architecture/diagramas.md §4-D).
// El HTML de la skill diagram-design (MIT, vendor/habilidades/diagram-design/) carga su
// tipografía de Google Fonts; todo diagrama del OS se muestra en un iframe sandbox sin red,
// así que cada petición de fuente a terceros se sustituye por @font-face con data URL de las
// fuentes que el OS ya sirve (catálogo de src/lib/themes/google-fonts.ts, recibido inyectado)
// o por una pila de sistema equivalente si el OS no la tiene. Módulo PURO, sin `any`.

export type CategoriaFuente = "sans" | "serif" | "display" | "mono" | "handwriting";

export interface FuenteDisponible {
  /** Familia tal como la pide el HTML (p. ej. «Geist»); se compara sin mayúsculas */
  family: string;
  /** Categoría del catálogo del OS; elige la pila de sistema equivalente */
  categoria: CategoriaFuente;
  /** Data URL del archivo que el OS ya sirve; ausente → cara con pila de sistema */
  dataUrl?: string;
  /** Formato para @font-face; «woff2» por defecto */
  formato?: string;
  /** Pesos que cubre el archivo, como en el catálogo: «400;500;600» o «400-700» */
  pesos?: string;
}

const HOST_TERCEROS = /fonts\.googleapis\.com|fonts\.gstatic\.com/i;
const RE_URL_GOOGLE = /https?:\/\/fonts\.googleapis\.com\/[^\s"'<>()]+/gi;
const RE_LINK = /<link\b[^>]*>/gi;
const RE_IMPORT = /@import\s*(?:url\(\s*(['"])(.*?)\1\s*\)|(['"])(.*?)\3)\s*;/gi;
const RE_URL_TERCEROS_CSS = /url\(\s*(['"])?https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^'")\s]*\1?\s*\)/gi;

/** Sustituto local por categoría: nombres de fuentes instaladas en cada sistema. */
const PILA_SISTEMA: Record<CategoriaFuente, string> = {
  sans: "local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial')",
  display: "local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial')",
  serif: "local('Georgia'), local('Times New Roman'), local('Droid Serif'), local('Noto Serif')",
  mono: "local('Menlo'), local('Consolas'), local('Roboto Mono'), local('DejaVu Sans Mono')",
  handwriting: "local('Segoe Script'), local('Bradley Hand'), local('Comic Sans MS')",
};

function decodificar(nombre: string): string {
  try { return decodeURIComponent(nombre); } catch { return nombre; }
}

function familiasDeUrl(url: string): string[] {
  const consulta = url.replace(/&amp;/gi, "&").split("?")[1] ?? "";
  return consulta.split("&").filter((p) => p.startsWith("family=")).map((p) =>
    decodificar(p.slice(7).split(":")[0].replace(/\+/g, " ")).trim()
  ).filter(Boolean);
}

/** Familias de Google Fonts que el HTML pide: en orden, desduplicadas sin mayúsculas. */
export function familiasPedidas(html: string): string[] {
  const vistas = new Set<string>();
  const pedidas: string[] = [];
  for (const co of html.matchAll(RE_URL_GOOGLE)) {
    for (const familia of familiasDeUrl(co[0])) {
      const clave = familia.toLowerCase();
      if (!vistas.has(clave)) { vistas.add(clave); pedidas.push(familia); }
    }
  }
  return pedidas;
}

/** Categoría a ojo por el nombre: lo pedido por la skill y no servido por el OS. */
function categoriaDeNombre(nombre: string): CategoriaFuente {
  if (/serif/i.test(nombre)) return "serif";
  if (/mono/i.test(nombre)) return "mono";
  return "sans";
}

/** Una cara @font-face en una línea: legible y fácil de verificar. */
function cara(nombre: string, declaraciones: string): string {
  return `@font-face { font-family: '${nombre}'; ${declaraciones} font-display: swap; }`;
}

/** Caras con data URL de las fuentes que el OS ya serve, una por peso pedido. */
function carasConDataUrl(nombre: string, fuente: FuenteDisponible): string {
  const origen = `src: url('${fuente.dataUrl}') format('${fuente.formato || "woff2"}');`;
  const pesos = (fuente.pesos || "").split(";").map((p) => p.trim()).filter(Boolean);
  if (pesos.length === 0) return cara(nombre, origen);
  return pesos
    .map((p) =>
      cara(nombre, `${origen} font-weight: ${p.includes("-") ? p.split("-").join(" ") : p};`)
    )
    .join("\n  ");
}

/** Cara alias: la familia pedida resuelve a fuentes instaladas del sistema. */
function caraDeSistema(nombre: string, categoria: CategoriaFuente): string {
  return cara(nombre, `src: ${PILA_SISTEMA[categoria]};`);
}

/** Cambia <link> y @import a fonts.googleapis.com por @font-face con data URL de las fuentes
 * que el OS ya sirve (inyectadas) o por una cara de sistema equivalente; neutraliza cualquier
 * src de fonts.gstatic ya presente: nunca deja una petición de fuente a terceros. */
export function sustituirFuentes(html: string, fuentesDisponibles: FuenteDisponible[]): string {
  const servidas = new Map<string, FuenteDisponible>();
  fuentesDisponibles.forEach((f) => servidas.set(f.family.trim().toLowerCase(), f));
  let salida = html.replace(RE_LINK, (etiqueta) =>
    HOST_TERCEROS.test(etiqueta) ? "" : etiqueta
  );
  salida = salida.replace(
    RE_IMPORT,
    (declaracion: string | undefined, _c1: string, u1: string, _c2: string, u2: string) =>
      HOST_TERCEROS.test(u1 || u2 || "") ? "" : declaracion || ""
  );
  salida = salida.replace(RE_URL_TERCEROS_CSS, "url(data:,)");
  const reglas: string[] = familiasPedidas(html).map((nombre) => {
    const fuente = servidas.get(nombre.toLowerCase());
    if (fuente && fuente.dataUrl) return carasConDataUrl(nombre, fuente);
    return caraDeSistema(nombre, fuente?.categoria || categoriaDeNombre(nombre));
  });
  if (reglas.length === 0) return salida;
  const bloque = `<style data-fuentes="locales">\n  ${reglas.join("\n  ")}\n</style>`;
  salida = salida.includes("</head>")
    ? salida.replace(/<\/head>/i, () => `${bloque}\n</head>`)
    : `${bloque}\n${salida}`;
  return salida;
}

