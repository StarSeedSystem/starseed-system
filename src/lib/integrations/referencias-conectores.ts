// Tipo para representar una entrada del catálogo de referencias e inspiración
export type ReferenciaEntrada = {
  id: string;
  nombre: string;
  url: string;
  tema: string;
  subtema: string | null;
  que_es: string;
  tipo: string;
  acceso: string;
  clase_uso: string;
  condiciones: string;
  canales: string[];
  prohibido: string[];
  actualizacion: Array<{
    tipo: string;
    ref?: string;
    url?: string;
    nota?: string;
  }>;
  integracion: Array<{
    tipo: string;
    url?: string;
    ref?: string;
    licencia?: string;
    nombre?: string;
    requiere?: string;
  }>;
  terminos: string | null;
  og_imagen: string | null;
  verificado: string;
  sin_verificar: string[];
};

// Tipo para representar el estado de un conector
export type EstadoConector = {
  id: string;
  conectados: boolean;
};

// Datos del catálogo (se importan desde el archivo JSON)
let catalogo: ReferenciaEntrada[] = [];

/**
 * Carga el catálogo de referencias e inspiración
 */
export function cargarCatálogo(entradas: ReferenciaEntrada[]): void {
  catalogo = [...entradas];
}

/**
 * Obtiene todas las entradas del catálogo
 */
export function obtenerTodasReferencias(): ReferenciaEntrada[] {
  return [...catalogo];
}

/**
 * Obtiene una referencia específica por su ID
 */
export function obtenerReferenciaPorId(id: string): ReferenciaEntrada | undefined {
  return catalogo.find(entrada => entrada.id === id);
}

/**
 * Obtiene todas las referencias de un tema específico
 */
export function obtenerReferenciasPorTema(tema: string): ReferenciaEntrada[] {
  return [...catalogo.filter(entrada => entrada.tema === tema)];
}

/**
 * Obtiene todas las referencias que tienen un tipo de uso específico
 */
export function obtenerReferenciasPorClaseUso(claseUso: string): ReferenciaEntrada[] {
  return [...catalogo.filter(entrada => entrada.clase_uso === claseUso)];
}

/**
 * Obtiene todas las referencias que tienen un tipo de acceso específico
 */
export function obtenerReferenciasPorAcceso(acceso: string): ReferenciaEntrada[] {
  return [...catalogo.filter(entrada => entrada.acceso === acceso)];
}

/**
 * Obtiene el estado de un conector específico
 */
export function estadoConector(id: string, conectados: boolean): EstadoConector {
  return {
    id,
    conectados
  };
}

/**
 * Verifica si una referencia tiene canales oficiales de MCP o API disponibles
 */
export function tieneCanalesOficiales(referencia: ReferenciaEntrada): boolean {
  return referencia.canales.some(canal => 
    canal === 'mcp-oficial' || 
    canal === 'api-oficial' || 
    canal === 'cli-oficial'
  );
}

/**
 * Obtiene todas las referencias que tienen integraciones oficiales (MCP, API, CLI)
 */
export function obtenerReferenciasConIntegracionesOficiales(): ReferenciaEntrada[] {
  return [...catalogo.filter(tieneCanalesOficiales)];
}