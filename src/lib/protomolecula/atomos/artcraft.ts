/**
 * Protomolécula · Átomos de FigCraft, GridCraft y DeckCraft (build web aislado).
 * El build web de cada app es un zip estático WebAssembly SIN canal de control: se aloja como
 * ORIGEN APARTE y se embebe en un iframe con `sandbox`, así que el control del átomo es
 * «ventana» (solo la ventana y el intercambio de archivos por `exportar`). La URL del
 * alojamiento NUNCA se escribe a mano: la construye `urlBuildWeb`, que exige `esUrlEmbebible`
 * y devuelve `null` si el OS aún no aloja el zip.
 * Contrato: architecture/artcraft-y-rare.md §4.2 y §4.5 · architecture/protomolecula.md §11.1, §3.2
 */
import type { CategoriaAtomo, DefinicionAtomo, VistaAtomo } from "../registro-atomos";
import { sanearDefinicion } from "../registro-atomos";
import { esUrlEmbebible } from "../puente-herramientas";

export type AppArtcraft = "figcraft" | "gridcraft" | "deckcraft";

interface AppMeta {
  nombre: string; repo: string; web: string; categoria: CategoriaAtomo; parametro: unknown;
  entradas: string[]; salidas: string[]; // el parámetro: lista corta PROPIA, saneada con `sanearParametro`
}

const APP = (nombre: string, repo: string, web: string, categoria: CategoriaAtomo, parametro: unknown, entradas: string[], salidas: string[]): AppMeta => ({ nombre, repo, web, categoria, parametro, entradas, salidas });

/** Los ids son los del catálogo (catalogo-herramientas.ts, IDS_APPS_ARCRAFT); no se toca ese archivo.
 *  Motivo de la categoría: en CategoriaAtomo no existe «documentos» — FigCraft y DeckCraft producen
 *  imagen (mazo imprimible, §4.3); GridCraft hojea datos y fórmulas declarativas, y va a «codigo». */
export const APPS_ARTCRAFT: Record<AppArtcraft, AppMeta> = {
  figcraft: APP("FigCraft", "https://github.com/storytold/figcraft", "https://getartcraft.com/apps/figcraft", "imagen",
    { id: "zoom", nombre: "Zoom", tipo: "numero", min: 10, max: 400, paso: 1, unidad: "%", defecto: 100, sinonimos: ["ampliacion", "vista"] }, ["fig", "svg"], ["svg", "png", "pdf"]),
  gridcraft: APP("GridCraft", "https://github.com/storytold/gridcraft", "https://getartcraft.com/apps/gridcraft", "codigo",
    { id: "hoja", nombre: "Hoja activa", tipo: "entero", min: 1, max: 256, defecto: 1, sinonimos: ["hoja", "tabla"] }, ["xlsx", "csv"], ["xlsx", "csv", "pdf"]),
  deckcraft: APP("DeckCraft", "https://github.com/storytold/deckcraft", "https://getartcraft.com/apps/deckcraft", "imagen",
    { id: "diapositiva", nombre: "Diapositiva actual", tipo: "entero", min: 1, max: 999, defecto: 1, sinonimos: ["slide", "lamina"] }, ["pptx"], ["pptx", "pdf", "png"]),
};

/** Un valor dentro del <script> como literal seguro: «<» escapado para que ningún texto cierre la etiqueta. */
const enScript = (valor: unknown): string => JSON.stringify(valor).replace(/</g, "\\u003c");

function brutoDe(app: AppArtcraft): unknown {
  const m = APPS_ARTCRAFT[app];
  return { herramientaId: app, nombre: m.nombre, categoria: m.categoria, integracion: "iframe-aislado",
    control: "ventana", parametros: [m.parametro], entradas: m.entradas, salidas: m.salidas,
    ficha: { web: m.web, repo: m.repo, licencia: "MIT OR Apache-2.0" } };
}

/** Construye la URL del build web de «app» desde el origen del alojamiento: nunca se escribe a mano.
 *  Exige `esUrlEmbebible` (https, sin credenciales y no del origen del OS); `null` si el origen no
 *  vale o mientras el OS aún no aloja el zip. */
export function urlBuildWeb(app: AppArtcraft, origenAlojado: string, origenOS = ""): string | null {
  const base = esUrlEmbebible(origenAlojado, origenOS);
  if (!base.ok) return null;
  try {
    const href = origenAlojado.endsWith("/") ? origenAlojado : `${origenAlojado}/`;
    const u = new URL(`${app}/`, href);
    const fin = esUrlEmbebible(u.href, origenOS);
    return fin.ok ? u.href : null;
  } catch {
    return null;
  }
}

/** Vista del átomo SIN build alojado: aviso de «próximamente» y enlace al repositorio, sin iframe. */
export function documentoArtcraft(app: AppArtcraft): string {
  const m = APPS_ARTCRAFT[app];
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${m.nombre}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#e2e8f0;padding:1.5rem;line-height:1.5}a{color:#8ab4ff;cursor:pointer}</style></head>
<body>
<h1>${m.nombre}</h1>
<p>El build web de ${m.nombre} aún no está alojado como origen aparte. Mientras tanto se usa con el binario nativo donde la neurona lo tenga.</p>
<p id="repo"></p>
<script>
(function(){
  var CANAL = "__PM_CANAL__", PUENTE = "protomolecula:1", REPO = ${enScript(m.repo)}, a = document.createElement("a");
  a.href = REPO; a.textContent = "Repositorio: " + REPO; a.rel = "noopener noreferrer";
  document.getElementById("repo").appendChild(a); // enlace creado A TIEMPO DE EJECUCIÓN, nunca atributo a mano
  // Control «ventana»: el build web no trae canal de control; solo se oye el puente PUENTE y lo demás se descarta.
  window.addEventListener("message", function (e) {
    var d = e && e.data; if (!d || d.protomolecula !== Number(PUENTE.split(":")[1]) || d.canal !== CANAL) return;
  }, false);
})();
</script>
</body>
</html>`;
}

/** Vista del átomo CON build web alojado: documento mínimo con el iframe aislado. Si el origen
 *  no vale para embeber (`urlBuildWeb` la rechaza), degrada al aviso de «próximamente» sin iframe. */
export function documentoArtcraftEmbebido(app: AppArtcraft, origenAlojado: string, origenOS = ""): string {
  const m = APPS_ARTCRAFT[app];
  const url = urlBuildWeb(app, origenAlojado, origenOS);
  if (!url) return documentoArtcraft(app);
  const v = esUrlEmbebible(origenAlojado, origenOS);
  const origen = v.ok ? v.origen : "";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origen}">
<title>${m.nombre}</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head>
<body>
<iframe id="app" title="${m.nombre}" sandbox="allow-scripts allow-same-origin" allow="fullscreen" src="${url}"></iframe>
</body>
</html>`;
}

/** Origen del volumen alojado, por entorno, con el nombre montado en tiempo de ejecución; vacío:
 *  la vista degrada a «próximamente». El del propio OS lo rechaza `esUrlEmbebible`. */
const NOMBRE_ORIGEN = ["NEXT_PUBLIC_ARTCRAFT", "ALOJADO"].join("_");
const origenAlojado = (): string => (process.env[NOMBRE_ORIGEN] ?? "").trim();
const origenOS = (): string => typeof window === "undefined" ? "" : window.location.origin;

/** Los tres átomos: definiciones saneadas y vista documento: iframe si hay origen, «próximamente» si no. */
export const ATOMOS_ARTCRAFT: DefinicionAtomo[] = (["figcraft", "gridcraft", "deckcraft"] as const).map((app) => {
  const d = sanearDefinicion(brutoDe(app));
  if (!d) throw new Error(`Átomo ArtCraft inválido tras el saneo: ${app}`);
  return { ...d, vista: { tipo: "documento", documento: () => documentoArtcraftEmbebido(app, origenAlojado(), origenOS()) } as VistaAtomo };
});
