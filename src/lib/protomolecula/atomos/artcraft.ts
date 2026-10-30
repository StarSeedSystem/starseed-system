/**
 * Protomolécula · átomos web de ArtCraft (FigCraft, GridCraft y DeckCraft).
 *
 * Son el build web estático (WASM) de cada app, alojado como ORIGEN APARTE. No hay canal
 * de control: el grado es «ventana» y lo único que cruza el puente son los archivos que la
 * app exporta (`exportar`). Contrato: architecture/artcraft-y-rare.md §4.2 y §4.5;
 * architecture/protomolecula.md §11.1 (átomos propios) y §3.2 (iframe aislado).
 */
import type { DefinicionAtomo, Parametro } from "@/lib/protomolecula/registro-atomos";
import { esUrlEmbebible, sanearParametro } from "@/lib/protomolecula/puente-herramientas";

export type AppArtCraft = "figcraft" | "gridcraft" | "deckcraft";

type FichaApp = { nombre: string; categoria: DefinicionAtomo["categoria"]; repo: string; web: string; parametros: Parametro[] };

const APPS: Record<AppArtCraft, FichaApp> = {
  // El registro no tiene categoría «documentos»: FigCraft y DeckCraft son imagen; GridCraft, codigo.
  figcraft: { nombre: "FigCraft", categoria: "imagen", repo: "https://github.com/storytold/figcraft", web: "https://getartcraft.com/apps/figcraft", parametros: [{ id: "zoom", nombre: "Zoom", tipo: "numero", min: 10, max: 400, paso: 1, unidad: "%", sinonimos: ["acercar", "aumento"] }] },
  gridcraft: { nombre: "GridCraft", categoria: "codigo", repo: "https://github.com/storytold/gridcraft", web: "https://getartcraft.com/apps/gridcraft", parametros: [{ id: "hoja-activa", nombre: "Hoja activa", tipo: "entero", min: 1, max: 999, paso: 1, sinonimos: ["hoja", "pestaña"] }] },
  deckcraft: { nombre: "DeckCraft", categoria: "imagen", repo: "https://github.com/storytold/deckcraft", web: "https://getartcraft.com/apps/deckcraft", parametros: [{ id: "diapositiva-actual", nombre: "Diapositiva actual", tipo: "entero", min: 1, max: 999, paso: 1, sinonimos: ["diapositiva", "slide"] }] },
};

/** Lo que declara cada átomo pasa por el mismo saneo que lo que declara un tercero. */
const parametrosSeguros = (brutos: Parametro[]): Parametro[] => brutos.map((p) => { const s = sanearParametro(p); return s && { ...p, ...s }; }).filter((p): p is Parametro => p !== null);

const FORMATOS: Record<AppArtCraft, { entradas: string[]; salidas: string[] }> = {
  figcraft: { entradas: ["svg", "png", "pdf", "fig"], salidas: ["svg", "png", "pdf", "fig"] },
  gridcraft: { entradas: ["xlsx", "csv", "ods"], salidas: ["xlsx", "csv", "pdf"] },
  deckcraft: { entradas: ["pptx", "pdf", "png"], salidas: ["pptx", "pdf", "png", "gif"] },
};

/**
 * URL del build web alojado como origen aparte. No se escribe a mano: se deriva de
 * `origenAlojado` y `esUrlEmbebible` la valida. Sin origen (el OS aún no aloja el zip),
 * con un esquema que no es https, con credenciales o en el mismo origen que el OS: null.
 */
export function urlBuildWeb(app: AppArtCraft, origenAlojado: string | null | undefined, origenOS = ""): string | null {
  if (!origenAlojado) return null;
  let base: URL;
  try {
    base = new URL(origenAlojado);
  } catch {
    return null;
  }
  let url: string;
  try {
    url = new URL(`/artcraft/${app}/index.html`, base).toString();
  } catch {
    return null;
  }
  return esUrlEmbebible(url, origenOS).ok ? url : null;
}

const escapar = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Un valor dentro del <script>: JSON con «<» escapado, para que ningún texto pueda cerrar la etiqueta. */
const enScript = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");

export function documentoArtcraft(app: AppArtCraft, origenAlojado: string | null | undefined, origenOS = ""): string {
  const ficha = APPS[app];
  const url = urlBuildWeb(app, origenAlojado, origenOS);
  const origen = url ? new URL(url).origin : "";
  const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src ${url ? origen : "'none'"}; base-uri 'none'; form-action 'none'`;
  const repo = ficha.repo.replace(/^https:\/\//, "//");
  const cuerpo = url
    ? `<iframe id="marco" src="${escapar(url)}" title="${escapar(ficha.nombre)}" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" loading="lazy"></iframe>`
    : `<p class="aviso">Próximamente: el build web de ${escapar(ficha.nombre)} aún no está alojado. Mientras tanto, puedes <a href="${escapar(repo)}" rel="noopener noreferrer">ver su repositorio (${escapar(ficha.repo)})</a>.</p>`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(ficha.nombre)}</title>
<style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column;background:#0b0b14;color:#e2e8f0;font-family:system-ui,sans-serif;line-height:1.5}main{display:flex;flex-direction:column;flex:1;min-height:0;padding:1rem;gap:.75rem}h1{margin:0;font-size:1rem;font-weight:600;letter-spacing:.02em;color:#7dd3fc}.aviso{margin:0;color:#cbd5e1}iframe{flex:1;width:100%;min-height:0;border:0;border-radius:.5rem;background:#111827}a{color:#7dd3fc;cursor:pointer}</style>
</head>
<body>
<main>
<h1>${escapar(ficha.nombre)}</h1>
${cuerpo}
</main>
<script>
(function(){
  var CANAL = "__PM_CANAL__";
  var PARAMETROS = ${enScript(parametrosSeguros(ficha.parametros))};
  function decir(m){ try{ parent.postMessage(Object.assign({ protomolecula:1, canal:CANAL }, m), "*"); }catch(e){} }
  var marco = document.getElementById("marco");
  if(marco){
    window.addEventListener("message", function(e){
      if(e.source !== marco.contentWindow) return;
      var d = e.data;
      if(!d || typeof d !== "object" || d.tipo !== "exportar" || typeof d.formato !== "string" || !d.formato) return;
      decir({ tipo: "exportar", formato: d.formato, datos: d.datos });
    }, false);
    marco.addEventListener("load", function(){ decir({ tipo: "listo" }); });
  }
  decir({ tipo: "hola", nombre: ${enScript(ficha.nombre)}, parametros: PARAMETROS });
})();
</script>
</body>
</html>`;
}

export function crearAtomosArtcraft(origenAlojado: string | null = null, origenOS = ""): DefinicionAtomo[] {
  return (Object.keys(APPS) as AppArtCraft[]).map((app) => ({
    herramientaId: app,
    nombre: APPS[app].nombre,
    categoria: APPS[app].categoria,
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: parametrosSeguros(APPS[app].parametros),
    entradas: FORMATOS[app].entradas,
    salidas: FORMATOS[app].salidas,
    ficha: { web: APPS[app].web, repo: APPS[app].repo, licencia: "MIT OR Apache-2.0" },
    vista: { tipo: "documento", documento: () => documentoArtcraft(app, origenAlojado, origenOS) },
  }));
}

/** Los tres átomos de serie. Sin origen alojado enseñan «próximamente» y el enlace a su repositorio. */
export const ATOMOS_ARTCRAFT: DefinicionAtomo[] = crearAtomosArtcraft();
