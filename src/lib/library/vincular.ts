// src/lib/library/vincular.ts
// Tipo VinculoPaquete y funciones relacionadas para vincular paquetes

import type { LibraryPackage } from './packages';

export interface VinculoPaquete {
  requiereClave: boolean
  enlaceAlta: string | null
  enlaceClave: string | null
  gratis: boolean
  variables: string[]
  opcionId: string | null
}

/**
 * Catálogo de entrada mínimo necesario para construir un VinculoPaquete.
 */
interface VinculoCatalogEntry {
  id: string;
  requiereClave: boolean;
  enlaceAlta: string | null;
  enlaceClave: string | null;
  gratis: boolean
  variables: string[]
}

/**
 * Obtiene el vínculo de un paquete a partir del catálogo de opciones o de su payload.
 * @param paquete - El paquete library
 * @param catalogo - El catálogo de opciones (fusionado de proveedores y fuentes)
 * @returns El vínculo del paquete
 */
export function vinculoDe(
  paquete: LibraryPackage,
  catalogo: VinculoCatalogEntry[]
): VinculoPaquete {
  // Si el paquete tiene un catalogSourceId en su payload, intentar buscarlo en el catálogo
  const catalogSourceId = paquete.payload?.catalogSourceId as string | undefined;
  if (typeof catalogSourceId === 'string' && catalogSourceId.length > 0) {
    const entry = catalogo.find(entry => entry.id === catalogSourceId);
    if (entry) {
      return {
        requiereClave: entry.requiereClave,
        enlaceAlta: entry.enlaceAlta,
        enlaceClave: entry.enlaceClave,
        gratis: entry.gratis,
        variables: [...entry.variables], // copia para evitar mutación externa
        opcionId: entry.id
      };
    }
  }

  // Si no se encontró o no hay catalogSourceId, devolver un vínculo por defecto
  // basado en si el paquete es gratis o no.
  return {
    requiereClave: false,
    enlaceAlta: null,
    enlaceClave: null,
    gratis: paquete.free ?? true,
    variables: [],
    opcionId: null
  };
}

/**
 * Determina si un paquete es instalable en un ámbito dado considerando los vínculos existentes.
 * @param paquete - El paquete a instalar
 * @param ambito - El ámbito (cuenta, grupo, página) con su configuración y límites
 * @param vinculadas - Conjunto de IDs de paquetes ya vinculados en este ámbito
 * @returns true si es instalable, false en caso contrario
 */
export function instalableEnAmbito(
  paquete: LibraryPackage,
  ambito: {
    /** Límite máximo de paquetes vinculados en este ámbito, null para ilimitado */
    maxVinculados: number | null;
    /** Ya se ha alcanzado el límite de vinculados? */
    limiteAlcanzado: boolean;
    /** El paquete requiere una clave y el ámbito no permite claves? */
    permiteClaves: boolean;
  },
  vinculadas: Set<string>
): boolean {
  // Si el paquete ya está vinculado en este ámbito, no se puede volver a vincular
  if (vinculadas.has(paquete.id)) {
    return false;
  }

  // Si se ha alcanzado el límite de vinculados en el ámbito, no se puede instalar más
  if (ambito.limiteAlcanzado) {
    return false;
  }

  // Si el paquete requiere una clave y el ámbito no permite claves, no se puede instalar
  // Nota: Esta verificación es simplificada; en la práctica, se debería verificar
  // si el paquete en particular requiere clave y si el ámbito tiene permiso para ella.
  // Por ahora, usamos una bandera general del ámbito.
  if (!ambito.permiteClaves && paquete.payload?.requiresKey) {
    return false;
  }

  // En caso contrario, se considera instalable
  return true;
}