// src/lib/variaciones/fuentes.ts
// Funciones puras para manejar variaciones públicas en el OS

/** Representa una variación pública en el OS */
export interface VariacionPublica {
  /** Clave única del elemento (ej: widget:clima, tema:synthwave-horizon) */
  elemento: string;
  /** Tipo de variación (variacion, nota, repo, fuente, adaptacion) */
  tipo: 'variacion' | 'nota' | 'repo' | 'fuente' | 'adaptacion';
  /** Título descriptivo de la variación */
  titulo: string;
  /** Descripción detallada */
  descripcion: string;
  /** Payload con los datos específicos de la variación */
  payload: unknown;
  /** Familia a la que pertenece el elemento */
  familia: string;
  /** Versión de la variación */
  version: string;
  /** Licencia aplicada */
  licencia: string;
  /** Etiquetas para búsqueda y filtrado */
  etiquetas: string[];
  /** Tema asociado (si aplica) */
  tema?: string;
  /** Autor de la variación */
  autor: string;
  /** Fecha de creación */
  fechaCreacion: string;
  /** Fecha de última actualización */
  fechaActualizacion: string;
  /** Contadores de uso */
  contadores: {
    vistas: number;
    aplicaciones: number;
    descargas: number;
  };
  /** Referencia a variación de la que deriva (si aplica) */
  deVariacion?: string;
  /** Enlace externo (si aplica) */
  enlaceExterno?: string;
}

/** Resultado de buscar variaciones públicas */
export interface ResultadoBusquedaVariaciones {
  /** Lista de variaciones encontradas */
  variaciones: VariacionPublica[];
  /** Total de resultados disponibles */
  total: number;
  /** Página actual (para paginación) */
  pagina: number;
  /** Elementos por página */
  porPagina: number;
}

/**
 * Genera una clave canónica para un elemento basado en su tipo e identificador
 * @param tipo Tipo de elemento (widget, tema, fondo, ajuste, app, etc.)
 * @param identificador Identificador único del elemento
 * @param parte Parte opcional del elemento (para elementos compuestos)
 * @return Clave en formato <tipo>:<identificador>[#<parte>]
 */
export function generarClaveElemento(tipo: string, identificador: string, parte?: string): string {
  if (parte) {
    return `${tipo}:${identificador}#${parte}`;
  }
  return `${tipo}:${identificador}`;
}

/**
 * Extrae la familia de una clave de elemento
 * @param clave Clave en formato <familia>:<id>[#<parte>]
 * @return Familia del elemento
 */
export function extraerFamilia(clave: string): string {
  return clave.split(':')[0];
}

/**
 * Valida si una clave de elemento tiene el formato correcto
 * @param clave Clave a validar
 * @return true si el formato es válido
 */
export function validarClaveElemento(clave: string): boolean {
  return /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+(?:#[a-zA-Z0-9_-]+)?$/.test(clave);
}

/**
 * Crea una nueva variación pública con datos básicos
 * @param elemento Clave del elemento
 * @param tipo Tipo de variación
 * @param titulo Título de la variación
 * @param descripcion Descripción de la variación
 * @param payload Datos específicos de la variación
 * @param familia Familia del elemento
 * @param autor Autor de la variación
 * @returns Nueva variación pública
 */
export function crearVariacionPublica(
  elemento: string,
  tipo: 'variacion' | 'nota' | 'repo' | 'fuente' | 'adaptacion',
  titulo: string,
  descripcion: string,
  payload: unknown,
  familia: string,
  autor: string
): VariacionPublica {
  const ahora = new Date().toISOString();
  return {
    elemento,
    tipo,
    titulo,
    descripcion,
    payload,
    familia,
    version: "1.0.0",
    licencia: "CC-BY-4.0",
    etiquetas: [],
    autor,
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
    contadores: {
      vistas: 0,
      aplicaciones: 0,
      descargas: 0,
    }
  };
}

/**
 * Añade etiquetas a una variación pública
 * @param variacion Variación a modificar
 * @param nuevasEtiquetas Etiquetas a añadir
 * @returns Nueva variación con las etiquetas añadidas
 */
export function conEtiquetas(variacion: VariacionPublica, nuevasEtiquetas: string[]): VariacionPublica {
  return {
    ...variacion,
    etiquetas: [...new Set([...variacion.etiquetas, ...nuevasEtiquetas])],
    fechaActualizacion: new Date().toISOString()
  };
}

/**
 * Actualiza el contador de vistas de una variación
 * @param variacion Variación a modificar
 * @returns Nueva variación con el contador actualizado
 */
export function incrementarVistas(variacion: VariacionPublica): VariacionPublica {
  return {
    ...variacion,
    contadores: {
      ...variacion.contadores,
      vistas: variacion.contadores.vistas + 1
    },
    fechaActualizacion: new Date().toISOString()
  };
}

/**
 * Valida si una variación pública tiene todos los campos requeridos
 * @param variacion Variación a validar
 * @return true si es válida
 */
export function validarVariacionPublica(variacion: VariacionPublica): boolean {
  if (!variacion.elemento || !variacion.titulo || !variacion.descripcion || !variacion.autor) {
    return false;
  }
  
  if (!validarClaveElemento(variacion.elemento)) {
    return false;
  }
  
  if (variacion.contadores.vistas < 0 || 
      variacion.contadores.aplicaciones < 0 || 
      variacion.contadores.descargas < 0) {
    return false;
  }
  
  return true;
}

/**
 * Filtra variaciones públicas por tipo
 * @param variaciones Lista de variaciones
 * @param tipo Tipo de variación a filtrar
 * @returns Variaciones que coinciden con el tipo
 */
export function filtrarPorTipo(variaciones: VariacionPublica[], tipo: 'variacion' | 'nota' | 'repo' | 'fuente' | 'adaptacion'): VariacionPublica[] {
  return variaciones.filter(v => v.tipo === tipo);
}

/**
 * Filtra variaciones públicas por familia
 * @param variaciones Lista de variaciones
 * @param familia Familia a filtrar
 * @returns Variaciones que pertenecen a la familia
 */
export function filtrarPorFamilia(variaciones: VariacionPublica[], familia: string): VariacionPublica[] {
  return variaciones.filter(v => v.familia === familia);
}

/**
 * Ordena variaciones públicas por fecha de creación (más recientes primero)
 * @param variaciones Lista de variaciones
 * @returns Variaciones ordenadas
 */
export function ordenarPorFechaReciente(variaciones: VariacionPublica[]): VariacionPublica[] {
  return [...variaciones].sort((a, b) => 
    new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime()
  );
}

/**
 * Busca variaciones públicas por texto en título o descripción
 * @param variaciones Lista de variaciones
 * @param texto Texto a buscar (case-insensitive)
 * @returns Variaciones que coinciden con la búsqueda
 */
export function buscarPorTexto(variaciones: VariacionPublica[], texto: string): VariacionPublica[] {
  if (!texto.trim()) return variaciones;
  
  const termino = texto.toLowerCase().trim();
  return variaciones.filter(v => 
    v.titulo.toLowerCase().includes(termino) || 
    v.descripcion.toLowerCase().includes(termino)
  );
}