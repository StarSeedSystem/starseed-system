/**
 * Protomolécula — Apps embebidas (F1B, contrato §3.2 «grado 3 de integración»).
 *
 * Cada app ajena se muestra TAL CUAL (`iframe-aislado`, `control: "ventana"`,
 * `parametros: []`) y la Protomolécula solo controla ventana y archivos.
 *
 * HONESTIDAD (2026-10-10):
 * - Excalidraw: curl -sI https://excalidraw.com → sin x-frame-options ni CSP
 *   frame-ancestors; licencia MIT verificada en excalidraw/excalidraw (raw HEAD).
 * - three.js editor: curl -sI https://threejs.org/editor/ → sin restricciones;
 *   licencia MIT verificada en mrdoob/three.js (raw HEAD).
 * - Hydra: curl -sI https://hydra.ojack.xyz → sin restricciones; licencia
 *   AGPL-3.0 verificada en hydra-synth/hydra (raw HEAD).
 * - Strudel: curl -sI https://strudel.cc → sin x-frame-options; licencia
 *   AGPL-3.0 verificada en tidalcycles/strudel (raw HEAD). Cross-Origin
 *   políticas presentes pero no bloquean incrustación (no frame-ancestors).
 *
 * Ninguna lleva `proximamente`: todas permiten incrustarse.
 */
import type { DefinicionAtomo } from "./registro-atomos";

export const APPS_EMBEBIDAS: DefinicionAtomo[] = [
  {
    herramientaId: "excalidraw",
    nombre: "Excalidraw",
    categoria: "pizarras-diagramas",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["json", "png", "svg"],
    salidas: ["json", "png", "svg"],
    vista: { tipo: "externa", url: "https://excalidraw.com" },
    ficha: {
      web: "https://excalidraw.com",
      repo: "https://github.com/excalidraw/excalidraw",
      licencia: "MIT",
    },
  },
  {
    herramientaId: "threejs-editor",
    nombre: "Editor de three.js",
    categoria: "3d",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["glb", "gltf", "json"],
    salidas: ["glb", "gltf", "json"],
    vista: { tipo: "externa", url: "https://threejs.org/editor/" },
    ficha: {
      web: "https://threejs.org/editor/",
      repo: "https://github.com/mrdoob/three.js",
      licencia: "MIT",
    },
  },
  {
    herramientaId: "hydra",
    nombre: "Hydra",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["audio", "video"],
    salidas: ["audio", "video"],
    vista: { tipo: "externa", url: "https://hydra.ojack.xyz" },
    ficha: {
      web: "https://hydra.ojack.xyz",
      repo: "https://github.com/hydra-synth/hydra",
      licencia: "AGPL-3.0",
    },
  },
  {
    herramientaId: "strudel",
    nombre: "Strudel",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: ["audio", "codigo"],
    salidas: ["audio", "codigo"],
    vista: { tipo: "externa", url: "https://strudel.cc" },
    ficha: {
      web: "https://strudel.cc",
      repo: "https://github.com/tidalcycles/strudel",
      licencia: "AGPL-3.0",
    },
  },
];

export function registrarAppsEmbebidas(): void {
  // Idempotente: no modifica el registro; solo expone APPS_EMBEBIDAS.
}
