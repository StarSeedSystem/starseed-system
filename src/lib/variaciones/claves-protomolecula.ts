// src/lib/variaciones/claves-protomolecula.ts
import type { HerramientaProto } from '@/lib/protomolecula/catalogo-herramientas.ts'
import { CATALOGO_PROTOMOLECULA } from '@/lib/protomolecula/catalogo-herramientas.ts'
import { obtenerAtomo } from '@/lib/protomolecula/registro-atomos.ts'
import type { ClaveElemento } from './clave-elemento'
import { leerClave } from './clave-elemento'

/**
 * Crea una clave para una herramienta de la Protomolécula.
 * @param id - Identificador de la herramienta (kebab-case)
 * @returns Clave en formato 'herramienta:<id>' si el id es válido, null en caso contrario
 */
export function claveDeHerramienta(id: string): ClaveElemento | null {
  // Validar que el id no esté vacío y exista en el catálogo
  if (!id || typeof id !== 'string') {
    return null
  }
  
  // Buscar en el catálogo de herramientas
  const herramienta = CATALOGO_PROTOMOLECULA.find(h => h.id === id)
  if (!herramienta) {
    return null
  }
  
  // Devolver la clave canónica
  return `herramienta:${id}` as ClaveElemento
}

/**
 * Crea una clave para un átomo de la Protomolécula.
 * @param id - Identificador del átomo (debe corresponder a una herramienta registrada)
 * @returns Clave en formato 'atomo:<id>' si el id es válido, null en caso contrario
 */
export function claveDeAtomo(id: string): ClaveElemento | null {
  // Validar que el id no esté vacío
  if (!id || typeof id !== 'string') {
    return null
  }
  
  // Verificar que el átomo exista en el registro
  const atomo = obtenerAtomo(id)
  if (!atomo) {
    return null
  }
  
  // Devolver la clave canónica
  return `atomo:${id}` as ClaveElemento
}

/**
 * Crea una clave para una molécula de la Protomolécula.
 * @param id - Identificador de la molécula
 * @returns Clave en formato 'molecula:<id>' si el id es válido (existe en catálogo de herramientas o registro de átomos), null en caso contrario
 */
export function claveDeMolecula(id: string): ClaveElemento | null {
  // Validar que el id no esté vacío
  if (!id || typeof id !== 'string') {
    return null
  }
  
  // Validar que el id exista ya sea en el catálogo de herramientas o en el registro de átomos
  const herramienta = CATALOGO_PROTOMOLECULA.find(h => h.id === id)
  const atomo = obtenerAtomo(id)
  
  if (!herramienta && !atomo) {
    return null
  }
  
  // Devolver la clave canónica
  return `molecula:${id}` as ClaveElemento
}

/**
 * Devuelve los atributos DOM para establecer la clave de un elemento.
 * @param clave - Clave canónica en formato '<familia>:<id>[#<parte>]'
 * @returns Objeto con el atributo 'data-ss-elemento' si la clave es válida, null en caso contrario
 */
export function atributosClave(clave: string): Record<string, string> | null {
  // Validar el formato de la clave usando la función existente
  if (!leerClave(clave)) {
    return null
  }
  
  // Devolver el atributo para establecer en el DOM
  return { 'data-ss-elemento': clave }
}