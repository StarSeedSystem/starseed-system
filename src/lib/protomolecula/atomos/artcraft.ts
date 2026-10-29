/**
 * Protomolécula · Átomos web de ArtCraft (ART1025H): FigCraft, GridCraft y DeckCraft.
 * Contrato: architecture/artcraft-y-rare.md §4.2 y §4.5; protomolecula.md §11.1 y §3.2.
 * El build web de cada app no trae canal de control: se incrusta en un iframe aislado,
 * desde un ORIGEN APARTE, y el OS solo controla la ventana y los archivos exportados.
 */
import type { CategoriaAtomo, DefinicionAtomo, Parametro } from "../registro-atomos";
import { esUrlEmbebible, sanearParametro } from "../puente-herramientas";

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
export const APPS_ARTCRAFT: readonly AppArtcraft[] = ["figcraft", "gridcraft", "deckcraft"];

interface FichaArtcraft {
  nombre: string; categoria: CategoriaAtomo; repo: string; web: string;
  parametros: Record<string, unknown>[]; entradas: string[]; salidas: string[];
}

const APPS: Record<AppArtcraft, FichaArtcraft> = {
  // No existe la categoría «documentos»: una pieza de FigCraft es imagen vectorial y mapa de bits.
  figcraft: {
    nombre: "FigCraft", categoria: "imagen", repo: "https://github.com/storytold/figcraft", web: "https://getartcraft.com/apps/figcraft",
    parametros: [
      { id: "zoom", nombre: "Zoom", tipo: "numero", min: 25, max: 400, paso: 5, unidad: "%", defecto: 100, sinonimos: ["acercar", "alejar", "escala de vista"] },
      { id: "capa-activa", nombre: "Capa activa", tipo: "entero", min: 1, max: 200, paso: 1, defecto: 1, sinonimos: ["capa", "nivel"] },
    ],
    entradas: ["fig", "svg", "pdf", "png", "jpeg", "webp"], salidas: ["figcraft", "fig", "svg", "pdf", "png", "jpeg", "webp"],
  },
  // La hoja y sus fórmulas son datos y código: la categoría más cercana es «codigo».
  gridcraft: {
    nombre: "GridCraft", categoria: "codigo", repo: "https://github.com/storytold/gridcraft", web: "https://getartcraft.com/apps/gridcraft",
    parametros: [
      { id: "hoja-activa", nombre: "Hoja activa", tipo: "entero", min: 1, max: 200, paso: 1, defecto: 1, sinonimos: ["hoja", "pestaña", "worksheet"] },
      { id: "fila-activa", nombre: "Fila activa", tipo: "entero", min: 1, max: 1048576, paso: 1, defecto: 1, sinonimos: ["fila", "renglón"] },
    ],
    entradas: ["xlsx", "xlsm", "xls", "xlsb", "ods", "csv", "tsv", "txt"],
    salidas: ["xlsx", "xlsm", "csv", "tsv", "txt", "pdf", "html"],
  },
  // No existe «documentos»: DeckCraft se ve como diapositivas y su PDF sale como imagen.
  deckcraft: {
    nombre: "DeckCraft", categoria: "imagen", repo: "https://github.com/storytold/deckcraft", web: "https://getartcraft.com/apps/deckcraft",
    parametros: [
      { id: "diapositiva-actual", nombre: "Diapositiva actual", tipo: "entero", min: 1, max: 999, paso: 1, defecto: 1, sinonimos: ["diapositiva", "slide", "página"] },
      { id: "zoom", nombre: "Zoom", tipo: "numero", min: 25, max: 400, paso: 5, unidad: "%", defecto: 100, sinonimos: ["acercar", "alejar"] },
    ],
    entradas: ["deckcraft", "pptx", "potx", "ppsx", "thmx", "png", "jpeg", "gif", "webp"],
    salidas: ["deckcraft", "pptx", "pdf", "png", "jpeg", "gif"],
  },
};

/** Un valor como literal dentro del <script>: JSON con «<» escapado, para que ningún texto cierre la etiqueta. */
const enScript = (valor: unknown): string => JSON.stringify(valor).replace(/</g, "\\u003c");
const escapar = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Construye la URL del build web alojado. NUNCA se escribe a mano; exige `esUrlEmbebible`. */
export function urlBuildWeb(app: AppArtcraft, origenAlojado: string | null | undefined, origenOS = ""): string | null {
  if (!origenAlojado || !APPS_ARTCRAFT.includes(app)) return null;
  const url = `${origenAlojado.trim().replace(/\/+$/, "")}/${app}-web/index.html`;
  return esUrlEmbebible(url, origenOS).ok ? url : null;
}

export function documentoArtcraft(app: AppArtcraft, origenAlojado: string | null | undefined = null): string {
  return "";
}

export function crearAtomoArtcraft(app: AppArtcraft, origenAlojado: string | null | undefined = null): DefinicionAtomo {
  const ficha = APPS[app];
  return {
    herramientaId: app,
    nombre: ficha.nombre,
    categoria: ficha.categoria,
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: ficha.parametros.map((p) => sanearParametro(p)).filter((p): p is Parametro => p !== null),
    entradas: ficha.entradas,
    salidas: ficha.salidas,
    ficha: { web: ficha.web, repo: ficha.repo, licencia: "MIT OR Apache-2.0" },
    vista: { tipo: "documento", documento: () => documentoArtcraft(app, origenAlojado) },
  };
}

/** Hasta que la tarea de alojamiento fije el origen, el OS no sirve el zip: la vista lo dice sin iframe. */
export const ORIGEN_WEB_ARTCRAFT: string | null = null;
export const ATOMOS_ARTCRAFT: DefinicionAtomo[] = [
  crearAtomoArtcraft("figcraft", ORIGEN_WEB_ARTCRAFT),
  crearAtomoArtcraft("gridcraft", ORIGEN_WEB_ARTCRAFT),
  crearAtomoArtcraft("deckcraft", ORIGEN_WEB_ARTCRAFT),
];
