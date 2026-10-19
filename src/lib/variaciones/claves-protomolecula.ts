// src/lib/variaciones/claves-protomolecula.ts
import type { ClaveElemento } from './clave-elemento';
import { leerClave } from './clave-elemento';
import { CATALOGO_PROTOMOLECULA } from '../protomolecula/catalogo-herramientas';
import { obtenerAtomo } from '../protomolecula/registro-atomos';

/**
 * Valida un ID de herramienta contra el catálogo y devuelve la clave canónica.
 * @param id - ID de la herramienta (kebab-case, con puntos, guiones o guiones bajos)
 * @returns Clave en formato `herramienta:<id>` si es válida, null en caso contrario
 */
export function claveDeHerramienta(id: string): ClaveElemento | null {
  if (!id || typeof id !== 'string') {
    return null;
  }
  const tool = CATALOGO_PROTOMOLECULA.find(t => t.id === id);
  if (tool) {
    return `herramienta:${id}` as ClaveElemento;
  }
  return null;
}

/**
 * Valida un ID de átomo contra el registro y devuelve la clave canónica.
 * @param id - ID del átomo (debe estar registrado en el átomo)
 * @returns Clave en formato `atomo:<id>` si es válida, null en caso contrario
 */
export function claveDeAtomo(id: string): ClaveElemento | null {
  if (!id || typeof id !== 'string') {
    return null;
  }
  const atom = obtenerAtomo(id);
  if (atom) {
    return `atomo:${id}` as ClaveElemento;
  }
  return null;
}

/**
 * Valida un ID de molécula por patrón y devuelve la clave canónica.
 * @param id - ID de la molécula (debe seguir el mismo patrón que las herramientas/átomos)
 * @returns Clave en formato `molecula:<id>` si es válida, null en caso contrario
 */
export function claveDeMolecula(id: string): ClaveElemento | null {
  if (!id || typeof id !== 'string') {
    return null;
  }
  // Patrón válido para IDs: empieza por letra minúscula o dígito, seguido de hasta 63 caracteres
  // de letras minúsculas, dígitos, punto, guión o guión bajo
  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  if (ID_PATTERN.test(id)) {
    return `molecula:${id}` as ClaveElemento;
  }
  return null;
}

/**
 * Devuelve los atributos DOM que deben establecerse para una clave válida.
 * @param clave - Clave canónica en formato `<familia>:<id>[#<parte>]`
 * @returns Objeto con el atributo `data-ss-elemento` si la clave es válida, null en caso contrario
 */
export function atributosClave(clave: string): { [key: string]: string } | null {
  if (!clave || typeof clave !== 'string') {
    return null;
  }
  if (leerClave(clave)) {
    return { 'data-ss-elemento': clave };
  }
  return null;
}