/**
 * Protomolécula · APPS AJENAS EMBEBIDAS (tercer grado de integración, contrato §3.2):
 * la app completa corre TAL CUAL en un iframe aislado y la Protomolécula solo controla
 * su ventana y sus archivos de entrada/salida. Sin parámetros universales: lo que la app
 * no pueda mover desde fuera se declara («control: "ventana"»), no se finge.
 *
 * HONESTIDAD — comprobación del 2026-10-10, repetida el 2026-10-31 con el mismo resultado:
 * - Licencia: leída del `LICENSE` del repo upstream (`curl -s https://raw.githubusercontent.com/<repo>/HEAD/LICENSE`).
 * - Incrustación: medida con `curl -sI <url>` mirando `x-frame-options` y
 *   `content-security-policy: frame-ancestors`. La respuesta de cada sitio (las dos fechas)
 *   fue HTTP 200 SIN una ni otra, así que el navegador permite incrustarla; una app solo
 *   lleva vista `externa` si la medición lo permite. Si un sitio cambiara de política,
 *   la medición habría que repetirla y la ficha quedaría sin vista, con «próximamente».
 *
 * Seguridad (contrato §8.1.2): vista `externa` = `https`, nunca del origen del OS; el puente
 * (`puente-herramientas.ts`) verifica `event.origin` contra el origen declarado y `event.source`.
 */
import type { DefinicionAtomo } from "./registro-atomos";
import { obtenerAtomo, registrarAtomo } from "./registro-atomos";
import { esUrlEmbebible } from "./puente-herramientas";

/** Origen del OS publicado, para comprobar que ninguna app apunta al propio OS. */
const ORIGEN_OS = "https://starseed-os.vercel.app";

/** Solo entran las definiciones cuya vista `externa` la medición permite y supera el saneo del registro. */
function fichaEmbebible(def: DefinicionAtomo): boolean {
  if (!def.vista || def.vista.tipo !== "externa") return false;
  return esUrlEmbebible(def.vista.url, ORIGEN_OS).ok;
}

const APPS: DefinicionAtomo[] = [
  // Excalidraw · licencia: «MIT License» en excalidraw/excalidraw (leído el 2026-10-10 y el 2026-10-31).
  // Medición del 2026-10-10 (repetida el 2026-10-31): `curl -sI https://excalidraw.com` → HTTP 200, sin «x-frame-options» ni «frame-ancestors»: deja incrustarse.
  {
    herramientaId: "excalidraw",
    nombre: "Excalidraw (pizarra de croquis)",
    categoria: "imagen",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["imagen", "svg", "png", "json"],
    salidas: ["png", "svg", "json"],
    vista: { tipo: "externa", url: "https://excalidraw.com" },
    ficha: {
      web: "https://excalidraw.com",
      repo: "https://github.com/excalidraw/excalidraw",
      licencia: "MIT",
    },
  },
  // Editor de three.js · licencia: «The MIT License» en mrdoob/three.js (leído el 2026-10-10 y el 2026-10-31).
  // Medición del 2026-10-10 (repetida el 2026-10-31): `curl -sI https://threejs.org/editor/` → HTTP 200, sin cabeceras que prohíban el marco: deja incrustarse.
  {
    herramientaId: "editor-threejs",
    nombre: "Editor de three.js (escenas 3D)",
    categoria: "3d",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["glb", "obj", "json"],
    salidas: ["glb", "json"],
    vista: { tipo: "externa", url: "https://threejs.org/editor/" },
    ficha: {
      web: "https://threejs.org/editor/",
      repo: "https://github.com/mrdoob/three.js",
      licencia: "MIT",
    },
  },
  // Hydra · licencia: «GNU AFFERO GENERAL PUBLIC LICENSE, Version 3» en hydra-synth/hydra (leído el 2026-10-10 y el 2026-10-31).
  // Medición del 2026-10-10 (repetida el 2026-10-31): `curl -sI https://hydra.ojack.xyz` → HTTP 200, sin cabeceras que prohíban el marco: deja incrustarse.
  {
    herramientaId: "hydra",
    nombre: "Hydra (síntesis visual por código)",
    categoria: "video",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["codigo"],
    salidas: ["video", "gif"],
    vista: { tipo: "externa", url: "https://hydra.ojack.xyz" },
    ficha: {
      web: "https://hydra.ojack.xyz",
      repo: "https://github.com/hydra-synth/hydra",
      licencia: "AGPL-3.0",
    },
  },
  // Strudel · licencia: «GNU AFFERO GENERAL PUBLIC LICENSE, Version 3» en tidalcycles/strudel (leído el 2026-10-10 y el 2026-10-31).
  // Medición del 2026-10-10 (repetida el 2026-10-31): `curl -sI https://strudel.cc` → HTTP 200 (con «Cross-Origin-Embedder-Policy: credentialless», que no prohíbe el marco): deja incrustarse.
  {
    herramientaId: "strudel",
    nombre: "Strudel (música por código)",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["codigo"],
    salidas: ["audio"],
    vista: { tipo: "externa", url: "https://strudel.cc" },
    ficha: {
      web: "https://strudel.cc",
      repo: "https://github.com/tidalcycles/strudel",
      licencia: "AGPL-3.0",
    },
  },
];

/** Las cuatro candidatas: las que la medición prohibió se quedan aquí con `proximamente` y sin vista. */
export const APPS_EMBEBIDAS: DefinicionAtomo[] = APPS;

/** Idempotente: lo ya registrado no se vuelve a registrar, y lo que la medición dejó «próximamente» (sin vista) no entra al registro: un botón sin efecto real no se pinta. */
export function registrarAppsEmbebidas(): void {
  for (const def of APPS_EMBEBIDAS) {
    if (obtenerAtomo(def.herramientaId) || !fichaEmbebible(def)) continue;
    registrarAtomo(def);
  }
}
