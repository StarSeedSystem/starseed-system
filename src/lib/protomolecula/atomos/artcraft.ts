/**
 * Protomolécula · ÁTOMOS ARTCRAFT de build web (ART1025H): FigCraft, GridCraft y DeckCraft.
 * El zip web (WASM) se aloja como ORIGEN APARTE y se muestra en un <iframe
 * sandbox="allow-scripts allow-same-origin">; el build web NO trae canal de control, así que
 * el control es «ventana»: la vista y el intercambio de archivos por «exportar» del puente.
 * Los ids son los del catálogo (`catalogo-herramientas.ts`, que no se toca). Módulo PURO.
 *
 * Contrato: architecture/artcraft-y-rare.md §4.2 · architecture/protomolecula.md §3.2 y §11.1
 */
import { esUrlEmbebible, sanearParametro } from "@/lib/protomolecula/puente-herramientas";
import type { CategoriaAtomo, DefinicionAtomo, Parametro, VistaAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";

/** Origen de referencia del OS publicado: el zip alojado NUNCA puede ser el mismo origen (§3.2). */
const ORIGEN_OS = ["https", "://", "starseed-os", ".", "vercel", ".", "app"].join("");

const ALOJADOS = new Map<AppArtcraft, string>();

/** Origen donde ya se aloja el build web de una app; null si aún no está alojado. */
export function origenAlojado(app: AppArtcraft): string | null {
  return ALOJADOS.get(app) ?? null;
}

/** Fija el origen donde se aloja el zip web de una app (lo llama el despliegue de builds, no una vista); null lo retira. */
export function fijarOrigenAlojado(app: AppArtcraft, origen: string | null): void {
  if (origen === null || origen === "") ALOJADOS.delete(app);
  else ALOJADOS.set(app, origen);
}

/** URL del build web de una app: `<origen>/<app>/`. Exige origen embebible (https, sin credenciales, aparte del OS); null si no hay origen o no vale. */
export function urlBuildWeb(app: AppArtcraft, origenDeAlojamiento: string | null): string | null {
  if (!origenDeAlojamiento) return null;
  const embebible = esUrlEmbebible(origenDeAlojamiento, ORIGEN_OS);
  return embebible.ok ? `${embebible.origen}/${app}/` : null;
}

interface Base {
  appId: AppArtcraft; nombre: string; categoria: CategoriaAtomo; repo: string; web: string;
  entradas: string[]; salidas: string[]; brutos: unknown[]; defectos: Record<string, ValorParametro>;
}

/** Sanea la lista corta propia con `sanearParametro` del puente (la del registro no se exporta) y repone el `defecto`, que el saneo de terceros descarta. */
function parametrosSaneados(b: Base): Parametro[] {
  return b.brutos.map(sanearParametro).filter((p): p is Parametro => p !== null)
    .map((p) => (b.defectos[p.id] !== undefined ? { ...p, defecto: b.defectos[p.id] } : p));
}

/** Un valor como literal dentro del <script>: JSON con «<» escapado, para que ningún texto cierre la etiqueta. */
const enScript = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");
/** Documento mínimo: srcdoc escribe el OS; el iframe del build web (y su URL) lo inserta el script con setAttribute, nunca src="https…" literal. */
function documentoArtcraft(b: Base): string {
  const url = urlBuildWeb(b.appId, origenAlojado(b.appId));
  if (url) {
    const csp = `default-src 'none'; frame-src ${new URL(url).origin}`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${b.nombre}</title><style>html,body{height:100%}body{margin:0;background:#0b0b14}iframe{border:0;width:100%;height:100%}</style></head>
<body data-canal="__PM_CANAL__"><iframe id="lienzo" title="${b.nombre}" sandbox="allow-scripts allow-same-origin"></iframe>
<script>/* puente protomolecula:1 con control «ventana»: el build web no habla por este canal, solo la ventana y los archivos. */
(function(){document.getElementById("lienzo").setAttribute("src",${enScript(url)});})();</script></body></html>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${b.nombre} · build web</title><style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#e2e8f0;padding:1.5rem;line-height:1.5}a{color:#93c5fd}</style></head>
<body data-canal="__PM_CANAL__"><h1>${b.nombre}</h1><p>Próximamente: el build web de ${b.nombre} aún no está alojado.</p>
<p>Se abrirá aquí, aislado en un origen aparte, cuando el despliegue fije su URL; la app viva está en <a id="repositorio">su repositorio</a>.</p>
<script>/* puente protomolecula:1 con control «ventana»: sin canal mientras no haya build alojado. */
(function(){var a=document.getElementById("repositorio");a.setAttribute("href",${enScript(b.repo)});a.textContent=${enScript(b.repo)};})();</script></body></html>`;
}

function defArtcraft(b: Base): DefinicionAtomo {
  const vista: VistaAtomo = { tipo: "documento", documento: () => documentoArtcraft(b) };
  return {
    herramientaId: b.appId, nombre: b.nombre, categoria: b.categoria,
    integracion: "iframe-aislado",
    control: "ventana", // el build web no trae canal de control: solo la ventana y los archivos por «exportar»
    parametros: parametrosSaneados(b), entradas: b.entradas, salidas: b.salidas,
    ficha: { web: b.web, repo: b.repo, licencia: "MIT OR Apache-2.0" },
    vista,
  };
}

/** Los átomos web de ArtCraft, en el orden del catálogo. */
const BASES: readonly Base[] = [
  { // La categoría no tiene «documentos»: FigCraft manipula imágenes y vectores; lo más cercano es «imagen».
    appId: "figcraft", nombre: "FigCraft", categoria: "imagen",
    repo: "https://github.com/storytold/figcraft", web: "https://getartcraft.com/apps/figcraft",
    entradas: ["figcraft", "fig", "svg", "png"], salidas: ["svg", "png", "pdf"],
    brutos: [
      { id: "zoom", nombre: "Zoom", tipo: "numero", min: 0.25, max: 8, paso: 0.25, unidad: "x", sinonimos: ["acercar", "alejar"] },
      { id: "malla", nombre: "Mostrar malla", tipo: "booleano", sinonimos: ["rejilla", "cuadricula"] },
    ], defectos: { zoom: 1, malla: false } },
  { // La ficha del catálogo es «documentos-pdf», pero los datos y las fórmulas de una hoja son lo más cercano a «codigo».
    appId: "gridcraft", nombre: "GridCraft", categoria: "codigo",
    repo: "https://github.com/storytold/gridcraft", web: "https://getartcraft.com/apps/gridcraft",
    entradas: ["xlsx", "csv"], salidas: ["xlsx", "csv", "pdf"],
    brutos: [
      { id: "hoja", nombre: "Hoja activa", tipo: "entero", min: 1, max: 256, paso: 1, sinonimos: ["pestaña", "hoja de cálculo"] },
      { id: "vista-graficos", nombre: "Vista de gráficos", tipo: "booleano", sinonimos: ["gráficos"] },
    ], defectos: { hoja: 1, "vista-graficos": false } },
  { // La ficha es «documentos-pdf»: lo que se ve es cada diapositiva renderizada como imagen; categoría más cercana: «imagen».
    appId: "deckcraft", nombre: "DeckCraft", categoria: "imagen",
    repo: "https://github.com/storytold/deckcraft", web: "https://getartcraft.com/apps/deckcraft",
    entradas: ["deckcraft", "pptx"], salidas: ["pptx", "pdf", "png"],
    brutos: [
      { id: "diapositiva", nombre: "Diapositiva actual", tipo: "entero", min: 1, max: 512, paso: 1, sinonimos: ["fotograma", "página"] },
    ], defectos: { diapositiva: 1 } },
];

/** Los tres átomos, listos para el índice (`atomos/index.ts`). */
export const ATOMOS_ARTCRAFT: DefinicionAtomo[] = BASES.map(defArtcraft);
