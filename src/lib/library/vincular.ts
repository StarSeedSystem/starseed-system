import type { LibraryPackage } from "./packages";
import type { CatalogSource } from "@/ai/astraura/free-catalog";

/** Vinculación de un paquete a una opción del catálogo vivo. */
export interface VinculoPaquete {
  /** Si la opción requiere clave API. */
  requiereClave: boolean;
  /** Enlace oficial para darse de alta en el servicio. */
  enlaceAlta: string | null;
  /** Enlace a la página donde obtener la clave (API key). */
  enlaceClave: string | null;
  /** Si la opción tiene tier gratuito verificado. */
  gratis: boolean;
  /** Nombres de variables de entorno que usa la opción. */
  variables: string[];
  /** Identificador de la opción en el catálogo. */
  opcionId: string;
  /** Si el límite gratis está verificado (null = no verificado). */
  verificado: boolean | null;
}

/**
 * Deduce el vínculo de un paquete a partir del catálogo de opciones
 * (FREE_CATALOG u otro con la misma forma) o de `payload.catalogSourceId`.
 */
export function vinculoDe(
  paquete: LibraryPackage,
  catalogo: CatalogSource[]
): VinculoPaquete {
  // Buscar por catalogSourceId en payload
  const sourceId = (paquete.payload.catalogSourceId as string) ?? "";
  const fuente = catalogo.find((c) => c.id === sourceId);
  if (!fuente) {
    return {
      requiereClave: false,
      enlaceAlta: null,
      enlaceClave: null,
      gratis: false,
      variables: [],
      opcionId: sourceId,
      verificado: null,
    };
  }
  return {
    requiereClave: fuente.requiresKey,
    enlaceAlta: fuente.getKeyUrl ?? null,
    enlaceClave: fuente.getKeyUrl ?? null,
    gratis: fuente.tier === "instant",
    variables: [], // TODO: extraer de configuración de la fuente
    opcionId: fuente.id,
    verificado: true,
  };
}

/**
 * Indica si un paquete es instalable en un ámbito dado,
 * considerando las opciones ya vinculadas en ese ámbito.
 */
export function instalableEnAmbito(
  paquete: LibraryPackage,
  ambito: "cuenta" | "grupo" | "pagina",
  vinculadas: string[] // ids de opciones ya vinculadas en el ámbito
): boolean {
  const sourceId = (paquete.payload.catalogSourceId as string) ?? "";
  if (!sourceId) return true; // paquetes sin fuente externa siempre instalables
  // Si la opción ya está vinculada en el ámbito, se puede instalar
  return vinculadas.includes(sourceId);
}