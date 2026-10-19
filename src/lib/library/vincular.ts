// src/lib/library/vincular.ts
// Tipo VinculoPaquete y funciones relacionadas para vincular paquetes

/** Interfaz que representa una entrada del catálogo unificado de opciones */
interface CatalogoEntrada {
  /** Id estable de la entrada */
  id: string;
  /** Nombre legible */
  nombre: string;
  /** Tipo de entrada (modelo, proveedor, contenedor, herramienta, habilidad, conector) */
  tipo: string;
  /** Papeles para los que sirve esta entrada */
  papeles: string[];
  /** Límite gratis estructurado */
  limiteGratis: string;
  /** Si pide cuenta para usar el servicio */
  pideCuenta: boolean;
  /** Enlace oficial para darse de alta en el servicio */
  enlaceAlta: string | null;
  /** Enlace a la página de la clave del servicio */
  enlaceClave: string | null;
  /** Nombres de variables de entorno necesarias (nunca sus valores) */
  variables: string[] | null;
  /** Privacidad: local, nube con retención, nube sin retención */
  privacidad: string;
  /** Licencia de uso */
  licencia: string;
  /** Fecha de verificación de la información */
  fechaVerificacion: string;
}

/** Información necesaria para vincular un paquete con un servicio */
export interface VinculoPaquete {
  /** Si requiere clave API para funcionar */
  requiereClave: boolean;
  /** Enlace para darse de alta en el servicio */
  enlaceAlta: string | null;
  /** Enlace a la página de la clave del servicio */
  enlaceClave: string | null;
  /** Si el servicio tiene nivel gratuito */
  gratis: boolean;
  /** Variables de entorno necesarias (mapeado nombre->nombre, nunca valores) */
  variables: Record<string, string> | null;
  /** Id de la opción en el catálogo */
  opcionId: string | null;
}

/**
 * Deduce el vínculo de un paquete del catálogo de opciones o de payload.catalogSourceId
 * @param paquete - Paquete de la biblioteca que se quiere vincular
 * @param catalogo - Catálogo unificado de opciones disponibles
 * @returns VinculoPaquete con la información de vinculación
 */
export function vinculoDe(paquete: any, catalogo: CatalogoEntrada[]): VinculoPaquete {
  // Si el paquete no tiene payload o catalogSourceId, devolver valores predeterminados
  if (!paquete?.payload || !paquete.payload.catalogSourceId) {
    return {
      requiereClave: false,
      enlaceAlta: null,
      enlaceClave: null,
      gratis: true,
      variables: null,
      opcionId: null,
    };
  }

  const catalogSourceId = paquete.payload.catalogSourceId;
  
  // Buscar la entrada en el catálogo
  const entrada = catalogo.find((e) => e.id === catalogSourceId);
  
  // Si no se encuentra la entrada, devolver valores predeterminados
  if (!entrada) {
    return {
      requiereClave: false,
      enlaceAlta: null,
      enlaceClave: null,
      gratis: true,
      variables: null,
      opcionId: null,
    };
  }

  // Determinar si requiere clave basado en si pide cuenta
  const requiereClave = entrada.pideCuenta;
  
  // Determinar las variables de entorno necesarias
  let variables: Record<string, string> | null = null;
  if (entrada.variables && entrada.variables.length > 0) {
    variables = {};
    entrada.variables.forEach((varName) => {
      variables[varName] = varName; // Solo el nombre de la variable, nunca el valor
    });
  }

  return {
    requiereClave: requiereClave,
    enlaceAlta: entrada.enlaceAlta,
    enlaceClave: entrada.enlaceClave,
    gratis: entrada.limiteGratis && entrada.limiteGratis !== "0", // Simplificado: si tiene límite gratis > 0, es gratis
    variables: variables,
    opcionId: entrada.id,
  };
}

/**
 * Determina si un paquete es instalable en un ámbito dado
 * @param paquete - Paquete de la biblioteca
 * @param ambito - Ámbito donde se intenta instalar (objeto con permisos y estado)
 * @param vinculadas - Paquetes ya vinculados en el ámbito
 * @returns true si es instalable, false en caso contrario
 */
export function instalableEnAmbito(paquete: any, ambito: any, vinculadas: any[]): boolean {
  // Verificar si el paquete ya está vinculado en este ámbito
  const yaVinculado = vinculadas.some((vinculada: any) => vinculada.id === paquete.id);
  if (yaVinculado) {
    return false;
  }
  
  // Verificar si el ámbito tiene capacidad para más paquetes vinculados
  // (en una implementación real, esto vendría del ambito)
  const capacidadMaxima = ambito?.capacidadMaximaVinculaciones ?? 10;
  if (vinculadas.length >= capacidadMaxima) {
    return false;
  }
  
  // Verificar si el paquete es compatible con el ámbito
  // (en una implementación real, esto sería más complejo)
  const esCompatible = ambito?.tiposPermitidos?.includes(paquete.kind) ?? true;
  
  return esCompatible;
}