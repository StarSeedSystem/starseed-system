import { describe, it, expect } from "vitest";

// Definición básica de átomo según arquitectura/protomolecula.md
export interface DefinicionAtomo {
  herramientaId: string;
  nombre: string;
  categoria: string;
  integracion: "libreria-js" | "wasm-en-worker" | "iframe-aislado" | "app-nativa-puente" | "servicio-local" | "servidor-remoto" | "solo-enlace";
  control: "total" | "ventana" | "ninguno";
  parametros: any[];
  entradas: string[];
  salidas: string[];
  vista?: {
    tipo: "documento" | "componente" | "externa";
    url?: string;
    id?: string;
  };
  proximamente?: string;
  ficha?: {
    web?: string;
    repo?: string;
    licencia?: string;
  };
}

export const APPS_EMBEBIDAS: DefinicionAtomo[] = [
  {
    herramientaId: "excalidraw",
    nombre: "Excalidraw",
    categoria: "imagen",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url: "https://excalidraw.com" },
    ficha: {
      web: "https://excalidraw.com",
      repo: "https://github.com/excalidraw/excalidraw",
      licencia: "MIT"
    }
  },
  {
    herramientaId: "three-editor",
    nombre: "Three.js Editor",
    categoria: "3d",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url: "https://threejs.org/editor/" },
    ficha: {
      web: "https://threejs.org/editor/",
      repo: "https://github.com/mrdoob/three.js",
      licencia: "MIT"
    }
  },
  {
    herramientaId: "hydra",
    nombre: "Hydra Synth",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url: "https://hydra.ojack.xyz" },
    ficha: {
      web: "https://hydra.ojack.xyz",
      repo: "https://github.com/hydra-synth/hydra",
      licencia: "MIT"
    }
  },
  {
    herramientaId: "strudel",
    nombre: "Strudel",
    categoria: "audio",
    integracion: "iframe-aislado",
    control: "ventana",
    parametros: [],
    entradas: [],
    salidas: [],
    vista: { tipo: "externa", url: "https://strudel.cc" },
    ficha: {
      web: "https://strudel.cc",
      repo: "https://github.com/tidalcycles/strudel",
      licencia: "MIT"
    }
  }
];

export function registrarAppsEmbebidas() {
  // Idempotente: logicamente debe llamar a registrarAtomo
  // PENDIENTE-DE: núcleo de la Protomolécula en main (registrarAtomo)
  console.log("Registrando apps embebidas:", APPS_EMBEBIDAS.length);
}
