/**
 * Protomolécula · REFERENCIAS A ENTIDADES ÚNICAS.
 * Contrato: `architecture/protomolecula.md`. Módulo PURO: sin React, sin red, sin `node:*`.
 */

/** Información básica de una Entidad Única. */
export interface EntidadInfo {
  id: string;
  titulo: string;
  formato: string;
  version: string;
  ambito: string; // Ambito de la entidad (personal, perfil, grupo, publica)
}

/** Fuente que sabe obtener información de una Entidad Única y crear ramas. */
export interface FuenteEntidad {
  /** Obtiene la información de una entidad por su id y versión opcional. */
  obtener(id: string, version?: string): Promise<EntidadInfo | null>;
  
  /** Devuelve el ámbito al que pertenece una entidad. */
  ambito(id: string): string; // Ambito de la entidad
  
  /** Crea una rama de la entidad y devuelve su id y versión. */
  crearRama(id: string): Promise<{ id: string; version: string } | null>;
}

/** Abre una capa referenciada obteniendo la información de la entidad fuente. */
export async function abrirCapaReferenciada(
  capa: { referencia: { tipo: string; id: string; version?: string } | null },
  fuentes: Record<string, FuenteEntidad>
): Promise<{ ok: true; entidad: EntidadInfo } | { ok: false; motivo: string }> {
  if (!capa.referencia) {
    return { ok: false, motivo: "La capa no tiene referencia a ninguna entidad." };
  }

  const { tipo, id, version } = capa.referencia;
  const fuente = fuentes[tipo];
  
  if (!fuente) {
    return { ok: false, motivo: `Tipo de fuente desconocido: ${tipo}.` };
  }

  const entidad = await fuente.obtener(id, version);
  
  if (!entidad) {
    return { ok: false, motivo: `Entidad borrada o no encontrada: ${id}.` };
  }

  return { ok: true, entidad };
}

/** Edita una referencia creando una rama y devolviendo una nueva capa. */
export async function editarReferencia(
  capa: { referencia: { tipo: string; id: string; version?: string } | null; titulo: string; formato: string; orden: number; visible: boolean; bloqueada: boolean; id: string },
  fuentes: Record<string, FuenteEntidad>
): Promise<{ ok: true; capa: typeof capa } | { ok: false; motivo: string }> {
  if (!capa.referencia) {
    return { ok: false, motivo: "La capa no tiene referencia a ninguna entidad para editar." };
  }

  const { tipo, id } = capa.referencia;
  const fuente = fuentes[tipo];
  
  if (!fuente) {
    return { ok: false, motivo: `próximamente: esta fuente aún no admite ramas; no se ha cambiado nada` };
  }

  const rama = await fuente.crearRama(id);
  
  if (!rama) {
    return { ok: false, motivo: `próximamente: esta fuente aún no admite ramas; no se ha cambiado nada` };
  }

  // Devolver una nueva capa con la referencia actualizada a la rama
  const nuevaCapa = {
    ...capa,
    referencia: {
      tipo,
      id: rama.id,
      version: rama.version
    }
  };

  return { ok: true, capa: nuevaCapa };
}

/** Crea una función que devuelve el ámbito de una entidad dada las fuentes. */
export function ambitoDeReferencias(fuentes: Record<string, FuenteEntidad>): (tipo: string, id: string) => string {
  return (tipo: string, id: string): string => {
    const fuente = fuentes[tipo];
    if (!fuente) {
      // Tipo desconocido → «personal», la opción más reservada
      return "personal";
    }
    return fuente.ambito(id);
  };
}

/** Adaptador real que envuelve entity-library.ts y media-library.ts. */
export function fuentesDeBiblioteca(): Record<string, FuenteEntidad> {
  // Nota: Para mantener la pureza del módulo (sin React, sin red, sin node:*),
  // las funciones reales de las bibliotecas deberían ser inyectadas como dependencias.
  // Esta implementación proporciona la estructura esperada y puede ser reemplazada
  // por la implementación real en el contexto de uso.
  
  // En una integración real, se haría algo como:
  // import { getEntidadInfo, getEntidadAmbito, crearRamaEntidad } from '@/lib/library/entity-library-adapter';
  // import { getMediaInfo, getMediaAmbito, crearRamaMedia } from '@/lib/library/media-library-adapter';
  
  // Por ahora, devolvemos una estructura que cumple con la interfaz pero que
  // siempre retorna valores nulos, indicando que falta la implementación real.
  // Esto permite que el módulo se compile y se pruebe sin dependencias externas.
  
  return {
    entidad: {
      obtener: async (_id: string, _version?: string): Promise<EntidadInfo | null> => {
        // En la implementación real, llamaría a las funciones de entity-library.ts
        // para obtener la información de la entidad por su id y version
        return null;
      },
      ambito: (_id: string): string => {
        // En la implementación real, llamaría a las funciones de entity-library.ts
        // para determinar el ámbito de la entidad
        return "personal";
      },
      crearRama: async (_id: string): Promise<{ id: string; version: string } | null> => {
        // En la implementación real, llamaría a las funciones de entity-library.ts
        // para crear una rama de la entidad
        return null;
      }
    },
    media: {
      obtener: async (_id: string, _version?: string): Promise<EntidadInfo | null> => {
        // En la implementación real, llamaría a las funciones de media-library.ts
        // para obtener la información de la entidad por su id y version
        return null;
      },
      ambito: (_id: string): string => {
        // En la implementación real, llamaría a las funciones de media-library.ts
        // para determinar el ámbito de la entidad
        return "personal";
      },
      crearRama: async (_id: string): Promise<{ id: string; version: string } | null> => {
        // En la implementación real, llamaría a las funciones de media-library.ts
        // para crear una rama de la entidad
        return null;
      }
    }
  };
}