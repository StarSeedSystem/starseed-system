/**
 * Protomolécula · Átomos web de FigCraft, GridCraft y DeckCraft (Ola 1025C).
 * Integración `iframe-aislado` y control «ventana»: el build web (WASM) NO trae canal de
 * control, así que el OS solo controla la ventana y recibe archivos por `exportar`.
 * Contrato: architecture/artcraft-y-rare.md §4.2 y §4.5; protomolecula.md §11.1 y §3.2.
 */
import type { CategoriaAtomo, DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import { esUrlEmbebible, sanearParametro } from "@/lib/protomolecula/puente-herramientas";

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";
/** Origen publicado del OS: el build web alojado debe ser un origen APARTE (§3.2). */
const ORIGEN_OS = "https://starseed-os.vercel.app";

interface FichaApp { nombre: string; categoria: CategoriaAtomo; repo: string; web: string; entradas: string[]; salidas: string[]; parametros: unknown[] }

const APPS: Record<AppArtcraft, FichaApp> = {
  figcraft: {
    nombre: "FigCraft", categoria: "imagen", // no hay «documentos»: FigCraft produce piezas gráficas
    repo: "https://github.com/storytold/figcraft", web: "https://getartcraft.com/apps/figcraft",
    entradas: ["svg", "pdf", "png", "fig"], salidas: ["svg", "pdf", "png", "fig"],
    parametros: [
      { id: "zoom", nombre: "Zoom", tipo: "numero", min: 10, max: 400, paso: 10, unidad: "%", defecto: 100, sinonimos: ["acercar", "escala"] },
      { id: "pagina", nombre: "Página", tipo: "entero", min: 1, max: 999, paso: 1, defecto: 1, sinonimos: ["hoja", "marco"] },
    ],
  },
  gridcraft: {
    nombre: "GridCraft", categoria: "codigo", // no hay «documentos»: la hoja es estructura editable, lo más cercano a «codigo»
    repo: "https://github.com/storytold/gridcraft", web: "https://getartcraft.com/apps/gridcraft",
    entradas: ["xlsx", "ods", "csv"], salidas: ["xlsx", "csv", "pdf"],
    parametros: [
      { id: "hoja", nombre: "Hoja activa", tipo: "entero", min: 1, max: 999, paso: 1, defecto: 1, sinonimos: ["pestaña", "hoja activa"] },
      { id: "recalcular", nombre: "Recalcular", tipo: "booleano", defecto: false, sinonimos: ["actualizar", "recalculo"] },
    ],
  },
  deckcraft: {
    nombre: "DeckCraft", categoria: "imagen", // no hay «documentos»: el mazo se ve y se exporta como pieza visual
    repo: "https://github.com/storytold/deckcraft", web: "https://getartcraft.com/apps/deckcraft",
    entradas: ["pptx", "png", "jpeg"], salidas: ["pptx", "pdf", "png"],
    parametros: [
      { id: "diapositiva", nombre: "Diapositiva actual", tipo: "entero", min: 1, max: 999, paso: 1, defecto: 1, sinonimos: ["slide", "lámina"] },
      { id: "notas", nombre: "Ver notas", tipo: "booleano", defecto: false, sinonimos: ["notas del orador"] },
    ],
  },
};

/** Parámetros saneados por la misma puerta que lo que declara un tercero; ninguno ejecuta código. */
function parametrosDe(app: AppArtcraft): Parametro[] {
  return APPS[app].parametros.map(sanearParametro).filter((p): p is Parametro => p !== null);
}

/**
 * URL del build web alojado. NUNCA se escribe a mano: se deriva del origen alojado y pasa
 * por `esUrlEmbebible` (solo https, sin credenciales y distinto del origen del OS).
 * Devuelve null si el OS aún no aloja el zip.
 */
export function urlBuildWeb(app: AppArtcraft, origenAlojado: string | null): string | null {
  if (!origenAlojado) return null;
  const base = origenAlojado.replace(/\/+$/, "");
  const url = `${base}/artcraft/${app}/`;
  return esUrlEmbebible(url, ORIGEN_OS).ok ? url : null;
}

const atributo = (t: string): string => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Vista mínima: iframe aislado al build alojado, o «próximamente» con enlace al repositorio. */
export function documentoArtcraft(app: AppArtcraft, origenAlojado: string | null): string {
  const f = APPS[app];
  const url = urlBuildWeb(app, origenAlojado);
  const origen = url ? new URL(url).origin : null;
  const marco = url
    ? `<iframe id="app" title="${atributo(f.nombre)}" src="${atributo(url)}" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe>`
    : `<p role="status">Próximamente: el build web de ${f.nombre} aún no está alojado.</p>\n<p><a id="repo" href="#" data-repo="${atributo(f.repo)}" target="_blank" rel="noopener noreferrer">Repositorio de ${f.nombre}</a></p>`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src ${origen ?? "'none'"};">
<title>${f.nombre}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0b0b14;color:#e2e8f0}iframe{display:block;width:100%;height:100vh;border:0}p{padding:1.5rem;line-height:1.6}a{color:#7dd3fc}</style>
</head>
<body>
${marco}
<script>
(function(){
  var CANAL="__PM_CANAL__", marco=document.getElementById("app"), repo=document.getElementById("repo");
  if(repo&&repo.dataset.repo){ repo.href=repo.dataset.repo; } // el enlace real no queda escrito en el HTML
  function decir(m){ parent.postMessage(Object.assign({ protomolecula:1, canal:CANAL }, m), "*"); }
  window.addEventListener("message", function(e){ var m=e.data; if(marco&&e.source===marco.contentWindow&&m&&m.protomolecula===1&&(m.tipo==="exportar"||m.tipo==="listo"||m.tipo==="error")) decir(m); });
})();
</script>
</body>
</html>`;
}

function definir(app: AppArtcraft): DefinicionAtomo {
  const f = APPS[app];
  return {
    herramientaId: app,
    nombre: f.nombre,
    categoria: f.categoria,
    integracion: "iframe-aislado",
    control: "ventana", // el build web no trae canal: solo la ventana y los archivos por `exportar`
    parametros: parametrosDe(app),
    entradas: f.entradas,
    salidas: f.salidas,
    ficha: { web: f.web, repo: f.repo, licencia: "MIT OR Apache-2.0" },
    vista: { tipo: "documento", documento: () => documentoArtcraft(app, null) },
  };
}

export const ATOMOS_ARTCRAFT: DefinicionAtomo[] = [definir("figcraft"), definir("gridcraft"), definir("deckcraft")];
