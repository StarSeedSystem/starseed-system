"use client";

import type { HerramientaProto } from "./catalogo-herramientas";
import type { LibraryDetailItem, ListingLink } from "@/components/library/app-file-page";

/** Mapeo de categorías de la Protomolécula a categorías de la Biblioteca. */
export const categoriaToBibliotecaCategory: Record<string, string> = {
  "raster-pintura": "Imagen",
  "vector-diseno": "Imagen",
  "foto-raw": "Imagen",
  "documentos-pdf": "Arquitectura",
  "pizarras-diagramas": "Arquitectura",
  "audio-edicion": "Audio y síntesis",
  "sintesis-audio": "Audio y síntesis",
  "video-composicion": "Vídeo",
  "animacion-motion": "Vídeo",
  "transmision": "Vídeo",
  "modelado-3d": "3D y escenas",
  "materiales-shaders": "3D y escenas",
  "splats-fotogrametria": "3D y escenas",
  "arquitectura-cad": "Arquitectura",
  "fisicas": "Físicas y prototipos",
  "motores-juego": "Juegos",
  "xr": "VR/AR",
  "codigo-creativo": "Código y conversión",
  "editor-codigo": "Código y conversión",
  "conversion-formatos": "Código y conversión",
  "ia-generativa": "IA generativa",
  "controles-dispositivos": "Código y conversión",
  "sensores-wearables": "Código y conversión",
  "colaboracion-sync": "Código y conversión",
  "recursos-abiertos": "3D y escenas",
};

/** Determina el grado de control real basado en la integración y el origen. */
function getGradoControlReal(
  integracion: HerramientaProto["integracion"],
  origen: HerramientaProto["origen"]
): "total" | "solo ventana" | "solo enlace" {
  if (integracion === "libreria-js" || integracion === "wasm-en-worker") return "total";
  if (integracion === "iframe-aislado") return origen === "arcraft" ? "total" : "solo ventana";
  if (integracion === "app-nativa-puente") return "solo ventana";
  if (integracion === "servicio-local" || integracion === "servicio-remoto") return "total";
  if (integracion === "solo-enlace") return "solo enlace";
  return "solo ventana";
}

/** Construye los enlaces externos para la ficha. */
function buildLinks(tool: HerramientaProto): ListingLink[] {
  const links: ListingLink[] = [];
  if (tool.web) links.push({ label: "Web", url: tool.web });
  if (tool.codigo) links.push({ label: "Repositorio", url: tool.codigo });
  return links;
}

export function fichasProtomolecula(
  versiones: Record<string, { version?: string; fecha?: string; licencia?: string; sha?: string; estado?: string }>,
  catalogo: HerramientaProto[] = []
): LibraryDetailItem[] {
  return catalogo.map((tool) => {
    const versionInfo = versiones[tool.id] ?? {};
    const estado = versionInfo.estado ?? tool.estado;
    const descripcion = tool.descripcion + (estado === "proximamente" && tool.motivo ? `\n\npróximamente: ${tool.motivo}` : "");
    const gradoControl = getGradoControlReal(tool.integracion, tool.origen);
    const links = buildLinks(tool);
    return {
      id: tool.id,
      title: tool.nombre,
      description: descripcion,
      license: tool.licencia,
      sourceUrl: tool.web ?? tool.codigo ?? undefined,
      openUrl: undefined,
      category: categoriaToBibliotecaCategory[tool.categoria] ?? "Código y conversión",
      categoryLabel: categoriaToBibliotecaCategory[tool.categoria] ?? "Código y conversión",
      author: "Código abierto",
      verified: false,
      rating: undefined,
      ratingsCount: undefined,
      downloads: undefined,
      cover: undefined,
      screenshots: undefined,
      tags: undefined,
      sourceLabel: "Protomolécula",
      origin: "file",
      versions: [],
      media: [],
      links: links,
      related: [],
      snippet: undefined,
      snippetLang: undefined,
    };
  });
}