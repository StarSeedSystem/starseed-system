/**
 * Protomolécula · REFERENCIAS DE ENTIDAD.
 * Contrato: arquitectura/protomolecula.md. Módulo PURO: sin React, sin red, sin `node:*`.
 * 
 * Las entidades únicas se gestionan en la Biblioteca (entity-library.ts) y en la
 * Biblioteca de Media (media-library.ts). Esta capa adapta esas APIs al
 * interfaz FuenteEntidad requerida por la Protomolécula.
 */

import type { Ambito } from "./tipos";
import type { Capa } from "./tipos";
import { type EntityRef, type LibraryEntityKind, libraryRef } from "../library/entity-library";
import {
  ensureMediaFolders,
  saveMediaToLibrary,
  type MediaOrigin,
  type SaveMediaInput,
  type SaveMediaResult,
  isMediaItem,
} from "../library/media-library";
import { listLibrary, readLibrarySnapshot, type EntityLibraryDoc, type SavedItem } from "../library/entity-library";

/** Información básica de una Entidad Única. */
export interface EntidadInfo {
  id: string;
  titulo: string;
  formato: string;
  version?: string;
  ambito: Ambito;
}

/** Fuente de Entidad Única: sabe obtener información, ámbito y crear ramas. */
export interface FuenteEntidad {
  /** Obtiene información de una entidad por su ID y versión opcional. */
  obtener: (id: string, version?: string) => Promise<EntidadInfo | null>;
  /** Devuelve el ámbito de una entidad por su ID. */
  ambito: (id: string) => Ambito;
  /** Intenta crear una rama de la entidad. Devuelve null si no es posible. */
  crearRama: (id: string) => Promise<{ id: string; version: string } | null>;
}

/**
 * Abre una capa referenciada usando las fuentes proporcionadas.
 * Devuelve {ok: true, entidad: EntidadInfo} si tiene éxito,
 * {ok: false, motivo: string} si falla (tipo desconocido o entidad borrada).
 */
export async function abrirCapaReferenciada(
  capa: Capa,
  fuentes: Record<string, FuenteEntidad>
): Promise<{ ok: true; entidad: EntidadInfo } | { ok: false; motivo: string }> {
  try {
    const fuente = fuentes[capa.tipo];
    if (!fuente) {
      return {
        ok: false,
        motivo: `Tipo de fuente desconocido: ${capa.tipo}`,
      };
    }

    const entidadInfo = await fuente.obtener(capa.referencia?.id ?? "", capa.referencia?.version);
    if (!entidadInfo) {
      return {
        ok: false,
        motivo: `Entidad borrada o no encontrada: ${capa.referencia?.id}`,
      };
    }

    return { ok: true, entidad: entidadInfo };
  } catch (error) {
    // Cualquier error inesperado se trata como entidad no encontrada
    return {
      ok: false,
      motivo: `Entidad borrada o no encontrada: ${capa.referencia?.id}`,
    };
  }
}

/**
 * Edita una referencia creando una rama y devolviendo una capa nueva.
 * NO edita la original: pide una rama con crearRama y devuelve una capa NUEVA
 * cuya referencia apunta a la rama y a su versión.
 * Si la fuente no sabe hacer ramas → «próximamente: esta fuente aún no admite ramas; no se ha cambiado nada».
 */
export async function editarReferencia(
  capa: Capa,
  fuentes: Record<string, FuenteEntidad>
): Promise<{ ok: true; capa: Capa } | { ok: false; motivo: string }> {
  try {
    const fuente = fuentes[capa.tipo];
    if (!fuente) {
      return {
        ok: false,
        motivo: `Tipo de fuente desconocido: ${capa.tipo}`,
      };
    }

    const ramaResult = await fuente.crearRama(capa.referencia?.id ?? "");
    if (!ramaResult) {
      return {
        ok: false,
        motivo: "próximamente: esta fuente aún no admite ramas; no se ha cambiado nada",
      };
    }

    const nuevaCapa: Capa = {
      ...capa,
      referencia: {
        tipo: capa.tipo,
        id: ramaResult.id,
        version: ramaResult.version,
      },
    };

    return { ok: true, capa: nuevaCapa };
  } catch (error) {
    // Cualquier error inesperado al crear rama se trata como si la fuente no admite ramas
    return {
      ok: false,
      motivo: "próximamente: esta fuente aún no admite ramas; no se ha cambiado nada",
    };
  }
}

/**
 * Devuelve una función que mapea (tipo, id) → Ambito usando las fuentes proporcionadas.
 * Tipo desconocido → «personal» (la opción más reservada).
 */
export function ambitoDeReferencias(
  fuentes: Record<string, FuenteEntidad>
): (tipo: string, id: string) => Ambito {
  return (tipo: string, id: string): Ambito => {
    try {
      const fuente = fuentes[tipo];
      if (!fuente) {
        return "personal"; // opción más reservada para tipo desconocido
      }
      return fuente.ambito(id);
    } catch (error) {
      // Si hay cualquier error al obtener el ámbito, devolvemos el más reservado
      return "personal";
    }
  };
}

/**
 * Adaptador real: envuelve entity-library.ts y media-library.ts.
 * Devuelve un Record<string, FuenteEntidad> con las fuentes disponibles.
 */
export function fuentesDeBiblioteca(): Record<string, FuenteEntidad> {
  return {
    // Fuente para entidades generales (entity-library)
    entity: crearFuenteEntityLibrary(),
    
    // Fuente para medios (media-library)
    media: crearFuenteMediaLibrary(),
  };
}

/**
 * Crea una FuenteEntidad que adapta la API de entity-library.ts.
 */
function crearFuenteEntityLibrary(): FuenteEntidad {
  // En una implementación real, necesitaríamos saber qué entidad (usuario, perfil, etc.)
  // Por ahora, usamos una entidad por defecto para demostrar el concepto
  const defaultRef: EntityRef = libraryRef("user", "default");

  return {
    obtener: async (id: string, version?: string): Promise<EntidadInfo | null> => {
      try {
        const doc = await listLibrary(defaultRef);
        const item = doc.items.find((it) => it.id === id);
        
        if (!item) {
          return null;
        }

        // Determinar formato basado en el tipo
        let formato = "desconocido";
        switch (item.type) {
          case "file":
            formato = item.mime || "archivo";
            break;
          case "post":
            formato = "publicación";
            break;
          case "page":
            formato = "página";
            break;
          case "package":
            formato = "paquete";
            break;
          default:
            formato = item.type;
        }

        return {
          id: item.id,
          titulo: item.title,
          formato,
          version: item.updatedAt || undefined, // Usar updatedAt como versión
          ambito: "personal", // En una implementación real, esto vendría de los ACLs
        };
      } catch (error) {
        console.error("Error obteniendo entidad:", error);
        return null;
      }
    },

    ambito: (id: string): Ambito => {
      // En una implementación real, consultaríamos los ACLs de la entidad
      // Por ahora, devolvemos personal como default
      return "personal";
    },

    crearRama: async (id: string): Promise<{ id: string; version: string } | null> => {
      // Siguiendo el principio de que si la fuente no sabe hacer ramas,
      // devolvemos null con motivo "próximamente: esta fuente aún no admite ramas; no se ha cambiado nada"
      return null;
    },
  };
}

/**
 * Crea una FuenteEntidad que adapta la API de media-library.ts.
 */
function crearFuenteMediaLibrary(): FuenteEntidad {
  // Similar a la anterior, pero usando media-library
  const defaultRef: EntityRef = libraryRef("user", "default");

  return {
    obtener: async (id: string, version?: string): Promise<EntidadInfo | null> => {
      try {
        // Para medios, necesitamos buscar en la biblioteca de media
        const doc = await listLibrary(defaultRef);
        const item = doc.items.find((it) => it.id === id && isMediaItem(it));
        
        if (!item) {
          return null;
        }

        let formato = "desconocido";
        if (item.mime) {
          if (item.mime.startsWith("image/")) {
            formato = "imagen";
          } else if (item.mime.startsWith("video/")) {
            formato = "video";
          } else {
            formato = item.mime;
          }
        }

        return {
          id: item.id,
          titulo: item.title,
          formato,
          version: item.updatedAt || undefined,
          ambito: "personal",
        };
      } catch (error) {
        console.error("Error obteniendo entidad de media:", error);
        return null;
      }
    },

    ambito: (id: string): Ambito => {
      return "personal";
    },

    crearRama: async (id: string): Promise<{ id: string; version: string } | null> => {
      // Siguiendo el principio de que si la fuente no sabe hacer ramas,
      // devolvemos null con motivo "próximamente: esta fuente aún no admite ramas; no se ha cambiado nada"
      return null;
    },
  };
}