// Modelos de API de proveedores externos (MQC2 · 2026-11-16).
// Librería de modelos con fuente y fecha de verificación.
// Módulo puro: sin red, sin disco, sin procesos lanzados.

import { FECHA_SEMILLA } from "./catalogo-datos";

export type EstadoModeloApi = "vigente" | "obsoleto";

export interface ModeloApi {
  proveedor: string;
  id: string;
  contextoK: number;
  vision: boolean;
  herramientas: boolean;
  razonamientoDesactivable: boolean;
  precioEntradaUsd: number;
  precioEntradaCacheUsd: number;
  precioSalidaUsd: number;
  base: string | null;
  sinFiltros: boolean;
  estado: EstadoModeloApi;
  fuentes: string[];
  comprobado: string;
}

const ABLITERATION_MODELS: ModeloApi[] = [
  {
    proveedor: "abliteration.ai",
    id: "abliterated-model",
    contextoK: 262144,
    vision: true,
    herramientas: true,
    razonamientoDesactivable: true,
    precioEntradaUsd: 1,
    precioEntradaCacheUsd: 0.1,
    precioSalidaUsd: 3,
    base: null,
    sinFiltros: true,
    estado: "vigente",
    fuentes: [
      "https://docs.abliteration.ai/models.md",
      "https://abliteration.ai/pricing",
    ],
    comprobado: FECHA_SEMILLA,
  },
  {
    proveedor: "abliteration.ai",
    id: "abliterated-model-large-flash",
    contextoK: 1048576,
    vision: true,
    herramientas: true,
    razonamientoDesactivable: true,
    precioEntradaUsd: 1,
    precioEntradaCacheUsd: 0.1,
    precioSalidaUsd: 2,
    base: "DeepSeek V4.1-Flash-1017",
    sinFiltros: true,
    estado: "vigente",
    fuentes: [
      "https://docs.abliteration.ai/models.md",
      "https://abliteration.ai/pricing",
    ],
    comprobado: FECHA_SEMILLA,
  },
  {
    proveedor: "abliteration.ai",
    id: "abliterated-model-large-v2",
    contextoK: 1000000,
    vision: false,
    herramientas: true,
    razonamientoDesactivable: true,
    precioEntradaUsd: 3,
    precioEntradaCacheUsd: 0.3,
    precioSalidaUsd: 5,
    base: "GLM-5.3",
    sinFiltros: true,
    estado: "vigente",
    fuentes: [
      "https://docs.abliteration.ai/models.md",
      "https://abliteration.ai/pricing",
    ],
    comprobado: FECHA_SEMILLA,
  },
  {
    proveedor: "abliteration.ai",
    id: "abliterated-model-large",
    contextoK: 1000000,
    vision: false,
    herramientas: true,
    razonamientoDesactivable: true,
    precioEntradaUsd: 3,
    precioEntradaCacheUsd: 0.3,
    precioSalidaUsd: 5,
    base: null,
    sinFiltros: true,
    estado: "obsoleto",
    fuentes: [
      "https://docs.abliteration.ai/models.md",
      "https://abliteration.ai/pricing",
    ],
    comprobado: FECHA_SEMILLA,
  },
];

export const MODELOS_API: ModeloApi[] = ABLITERATION_MODELS;

export function modeloApiValido(m: ModeloApi): boolean {
  return (
    m.estado === "vigente" &&
    m.fuentes.length > 0 &&
    m.comprobado !== "" &&
    m.precioEntradaUsd >= 0 &&
    m.precioEntradaCacheUsd >= 0 &&
    m.precioSalidaUsd >= 0
  );
}

export function modelosValidos(m: ModeloApi[]): ModeloApi[] {
  return m.filter(modeloApiValido);
}