/**
 * Protomolécula · APPS AJENAS EMBEBIDAS (F1F).
 *
 * Tercer grado de integración (contrato architecture/protomolecula.md §3.2): la app
 * completa se muestra TAL CUAL en un iframe con su propio origen y Protomolécula solo
 * controla su VENTANA y sus archivos: `control: "ventana"`, `parametros: []`,
 * `integracion: "iframe-aislado"` y `vista: {tipo: "externa", url}`. Sin canal de
 * parámetros: lo que la app da son sus propias entradas y salidas de archivo.
 *
 * HONESTIDAD (medición del 2026-10-10 con `curl -s
 * https://raw.githubusercontent.com/<repo>/HEAD/LICENSE` y `curl -sI <url>`):
 * los cuatro sitios devuelven 200 SIN cabecera `x-frame-options` y SIN
 * `content-security-policy: frame-ancestors`, así que se dejan incrustar. Licencias
 * vistas en el LICENSE de cada repo upstream: Excalidraw y three.js son MIT; Hydra y
 * Strudel son AGPL-3.0 (se usan TAL CUAL como sitio externo, no se enlazan al bundle).
 */
import { esUrlEmbebible } from "../puente-herramientas";
import type { CategoriaAtomo, DefinicionAtomo } from "../registro-atomos";
import { obtenerAtomo, registrarAtomo } from "../registro-atomos";

/** Ficha de una app ajena candidata: se mide antes de darle `vista: externa`. */
interface AppAjena {
  herramientaId: string;
  nombre: string;
  categoria: CategoriaAtomo;
  /** La URL que se incrusta; debe pasar `esUrlEmbebible` (https, sin credenciales, otro origen). */
  url: string;
  web: string;
  repo: string;
  licencia: string;
  entradas: string[];
  salidas: string[];
}

/** Medición del 2026-10-10: ninguna de las cuatro prohibe incrustarse (sin x-frame-options ni frame-ancestors). */
const APPS: AppAjena[] = [
  {
    herramientaId: "excalidraw",
    nombre: "Excalidraw",
    categoria: "imagen",
    url: "https://excalidraw.com",
    web: "https://excalidraw.com",
    repo: "https://github.com/excalidraw/excalidraw",
    licencia: "MIT",
    entradas: ["excalidraw", "png", "svg"],
    salidas: ["excalidraw", "png", "svg", "pdf"],
  },
  {
    herramientaId: "editor-threejs",
    nombre: "Editor de three.js",
    categoria: "3d",
    url: "https://threejs.org/editor/",
    web: "https://threejs.org/editor/",
    repo: "https://github.com/mrdoob/three.js",
    licencia: "MIT",
    entradas: ["glb", "gltf", "obj", "json"],
    salidas: ["glb", "gltf", "json"],
  },
  {
    herramientaId: "hydra",
    nombre: "Hydra",
    categoria: "video",
    url: "https://hydra.ojack.xyz",
    web: "https://hydra.ojack.xyz",
    repo: "https://github.com/hydra-synth/hydra",
    licencia: "AGPL-3.0",
    entradas: ["imagen", "webm"],
    salidas: ["webm"],
  },
  {
    herramientaId: "strudel",
    nombre: "Strudel",
    categoria: "audio",
    url: "https://strudel.cc",
    web: "https://strudel.cc",
    repo: "https://github.com/tidalcycles/Strudel",
    licencia: "AGPL-3.0",
    entradas: ["imagen", "mid"],
    salidas: ["mid", "wav"],
  },
];

/**
 * El tercer grado, tal cual lo fija el §3.2: control solo de ventana, ningún parámetro
 * y la app entera en un iframe con origen propio. `ficha` lleva web, repo y licencia.
 * Si una medición futura dijera que un sitio ya no se deja incrustar o su licencia no
 * se puede verificar, la ficha quedaría con `vista` AUSENTE y
 * `proximamente: "el sitio no permite incrustarse; ábrelo en su pestaña"`.
 */
const aAtomo = (app: AppAjena): DefinicionAtomo => ({
  herramientaId: app.herramientaId,
  nombre: app.nombre,
  categoria: app.categoria,
  integracion: "iframe-aislado",
  control: "ventana",
  parametros: [],
  entradas: app.entradas,
  salidas: app.salidas,
  vista: { tipo: "externa", url: app.url },
  ficha: { web: app.web, repo: app.repo, licencia: app.licencia },
});

/** Las apps ajenas embebidas. Se muestran tal cual; el control universal es «solo ventana». */
export const APPS_EMBEBIDAS: DefinicionAtomo[] = APPS.map(aAtomo);

const ORIGEN_DE_ESTA_PAGINA = "";
/**
 * Registra las apps embebidas que falten. Idempotente: llamarla dos veces no duplica
 * nada. Se omite cualquier app cuya URL no pase `esUrlEmbebible` o que esté marcada
 * «próximamente» (el registro no admite definiciones con `proximamente`).
 */
export function registrarAppsEmbebidas(): void {
  for (const def of APPS_EMBEBIDAS) {
    if (def.proximamente || def.vista?.tipo !== "externa") continue;
    if (!esUrlEmbebible(def.vista.url, ORIGEN_DE_ESTA_PAGINA).ok) continue;
    if (obtenerAtomo(def.herramientaId)) continue;
    registrarAtomo(def);
  }
}

