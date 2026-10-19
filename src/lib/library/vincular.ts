import type { LibraryPackage } from "./packages";
import type { CatalogSource } from "@/ai/astraura/free-catalog";

/** Información de vinculación para conectar un paquete con un servicio externo. */
export interface VinculoPaquete {
  requiereClave: boolean;
  enlaceAlta: string;
  enlaceClave: string;
  gratis: boolean;
  variables: Record<string, string>;
  opcionId: string;
}

/**
 * Obtiene la información de vinculación para un paquete.
 */
export function vinculoDe(paquete: LibraryPackage, catalogo: CatalogSource[]): VinculoPaquete {
  if (paquete.payload && typeof paquete.payload === 'object' && 'catalogSourceId' in paquete.payload) {
    const fuente = catalogo.find(f => f.id === paquete.payload.catalogSourceId as string);
    if (fuente) {
      return {
        requiereClave: fuente.requiresKey,
        enlaceAlta: fuente.getKeyUrl || '#',
        enlaceClave: fuente.getKeyUrl || '#',
        gratis: ['instant', 'free-key', 'local'].includes(fuente.tier),
        variables: obtenerVariablesDeFuente(fuente),
        opcionId: fuente.id
      };
    }
  }
  return { requiereClave: false, enlaceAlta: '#', enlaceClave: '#', gratis: true, variables: {}, opcionId: '' };
}

/** Extrae variables de entorno necesarias de una fuente del catálogo. */
function obtenerVariablesDeFuente(fuente: CatalogSource): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fuente.requiresKey) return vars;
  
   switch (fuente.providerId as string) {
     case 'groq': vars.GROQ_API_KEY = 'GROQ_API_KEY'; break;
     case 'cerebras': vars.CEREBRAS_API_KEY = 'CEREBRAS_API_KEY'; break;
     case 'openrouter': vars.OPENROUTER_API_KEY = 'OPENROUTER_API_KEY'; break;
     case 'google': vars.GOOGLE_API_KEY = 'GOOGLE_API_KEY'; break;
     case 'mistral': vars.MISTRAL_API_KEY = 'MISTRAL_API_KEY'; break;
     case 'nvidia': vars.NVIDIA_API_KEY = 'NVIDIA_API_KEY'; break;
     case 'ollama': vars.OLLAMA_HOST = 'OLLAMA_HOST'; break;
     default: if (fuente.requiresKey) vars.API_KEY = 'API_KEY';
   }
  return vars;
}

/**
 * Determina si un paquete puede ser instalado en un ámbito específico.
 */
export function instalableEnAmbito(
  paquete: LibraryPackage,
  ambito: { id: string; tipo: string; visibilidad: string },
  vinculadas: VinculoPaquete[]
): boolean {
  // Implementación básica: siempre permite la instalación
  // La lógica específica dependería de reglas de negocio más complejas
  return true;
}