/**
 * Protomolécula · APPS AJENAS EMBEBIDAS (tercer grado de integración, contrato §3.2):
 * la app completa se muestra TAL CUAL en un iframe aislado (solo https, origen verificado en
 * cada mensaje) y Protomolécula solo controla su ventana y sus archivos de entrada/salida:
 * `control: "ventana"`, `parametros: []`, `integracion: "iframe-aislado"`, `vista: externa`.
 *
 * HONESTIDAD (medidas el 2026-10-10 con `curl -sI <url>` y el LICENSE del repo upstream;
 * se buscó cualquier `x-frame-options` o `content-security-policy: frame-ancestors`):
 * - excalidraw.com          · LICENSE de excalidraw/excalidraw: MIT       · sin XFO ni CSP → embebible
 * - threejs.org/editor/     · LICENSE de mrdoob/three.js: MIT             · sin XFO ni CSP → embebible
 * - hydra.ojack.xyz         · LICENSE de hydra-synth/hydra: AGPL-3.0      · sin XFO ni CSP → embebible
 * - strudel.cc              · LICENSE de tidalcycles/strudel: AGPL-3.0    · sin XFO ni CSP → embebible
 * Si un sitio pasa a DENY/SAMEORIGIN o fija `frame-ancestors` sin nosotros, se le retira la
 * `vista` externa y su ficha queda SIN vista y con `proximamente: "el sitio no permite
 * incrustarse; ábrelo en su pestaña"`. Control «ventana» = lo que el OS ofrece hoy.
 *
 * Contrato: architecture/protomolecula.md §3.2 y §11.1. Módulo puro: sin red ni node:*.
 */
import type { DefinicionAtomo } from "./registro-atomos";
import { obtenerAtomo, registrarAtomo } from "./registro-atomos";

export const APPS_EMBEBIDAS: DefinicionAtomo[] = [
  {
    herramientaId: "excalidraw",
    nombre: "Excalidraw (pizarra de dibujo)",
    categoria: "imagen",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["json", "svg", "png"],
    salidas: ["json", "svg", "png"],
    vista: { tipo: "externa", url: "https://excalidraw.com" },
    ficha: { web: "https://excalidraw.com", repo: "excalidraw/excalidraw", licencia: "MIT" },
  },
  {
    herramientaId: "editor-threejs",
    nombre: "Editor de escenas three.js",
    categoria: "3d",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["gltf", "glb", "obj"],
    salidas: ["gltf", "glb", "json"],
    vista: { tipo: "externa", url: "https://threejs.org/editor/" },
    ficha: { web: "https://threejs.org/editor/", repo: "mrdoob/three.js", licencia: "MIT" },
  },
  {
    herramientaId: "hydra-sintesis-visual",
    nombre: "Hydra (síntesis visual en vivo)",
    categoria: "imagen",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: ["png", "webm"],
    vista: { tipo: "externa", url: "https://hydra.ojack.xyz" },
    ficha: { web: "https://hydra.ojack.xyz", repo: "hydra-synth/hydra", licencia: "AGPL-3.0" },
  },
  {
    herramientaId: "strudel-audio-vivo",
    nombre: "Strudel (música viva, TidalCycles)",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url: "https://strudel.cc" },
    ficha: { web: "https://strudel.cc", repo: "tidalcycles/strudel", licencia: "AGPL-3.0" },
  },
];

/** Registra las apps embebidas que falten. Idempotente: dos veces no duplica nada. */
export function registrarAppsEmbebidas(): void {
  for (const def of APPS_EMBEBIDAS) {
    if (obtenerAtomo(def.herramientaId)) continue;
    registrarAtomo(def);
  }
}
