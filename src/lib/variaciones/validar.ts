// Validación de variaciones públicas
import { SYNCED_KEYS } from '@/lib/settings-sync';

// Tipo de variación pública
export type TipoVariacion = 'variacion' | 'nota' | 'repo' | 'fuente' | 'adaptacion';

// Interfaz de una variación pública para validar
export interface VariacionPublica {
  tipo: TipoVariacion;
  payload: string;
  tamano?: number; // tamaño en bytes, opcional; si no se proporciona se calcula desde payload
}

// Resultado de la validación
export interface ResultadoValidacion {
  esValida: boolean;
  requiereAislamiento: boolean;
  error?: string;
}

/**
 * Valida una variación pública según las reglas del OS.
 * @param v La variación a validar
 * @returns Objeto con el resultado de la validación
 */
export function validarVariacion(v: VariacionPublica): ResultadoValidacion {
  // 1. Check size
  const tamano = v.tamano ?? new TextEncoder().encode(v.payload).length;
  const LIMITE_TAMANO = 256 * 1024; // 256 KB
  if (tamano > LIMITE_TAMANO) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: `El tamaño de la variación (${tamano} bytes) supera el límite de ${LIMITE_TAMANO} bytes`
    };
  }

  // 2. Parse JSON
  let payloadParsed: unknown;
  try {
    payloadParsed = JSON.parse(v.payload);
  } catch (e) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: 'El payload no es un JSON válido'
    };
  }

  // 3. Check that payload is plain JSON (no functions, no undefined)
  if (!esValorPlano(payloadParsed)) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: 'El payload contiene funciones o valores no permitidos'
    };
  }

  // 4. Check that payload does not contain any SYNCED_KEYS
  if (contieneClaveSincronizada(payloadParsed)) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: 'El payload contiene claves de sincronización prohibidas'
    };
  }

  // 5. Check that payload does not contain anything that looks like a token or a key
  if (contieneTokenOClave(payloadParsed)) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: 'El payload contiene elementos que parecen tokens o claves'
    };
  }

  // 6. Check that there are no URLs that are not https
  if (contieneHttpNoSeguro(payloadParsed)) {
    return {
      esValida: false,
      requiereAislamiento: false,
      error: 'El payload contiene URLs no seguras (solo se permiten https)'
    };
  }

  // Determine if the variation requires isolation
  const requiereAislamiento = esTipoCodigo(v.tipo);

  return {
    esValida: true,
    requiereAislamiento,
    error: undefined
  };
}

// Helper function to check if a value is plain (no functions, no undefined)
function esValorPlano(valor: unknown): boolean {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return true;
  }

  for (const clave in valor as object) {
    // @ts-ignore: we know it's an object
    const valorPropiedad = (valor as any)[clave];
    if (typeof valorPropiedad === 'function' || typeof valorPropiedad === 'undefined') {
      return false;
    }
    if (!esValorPlano(valorPropiedad)) {
      return false;
    }
  }
  return true;
}

// Helper function to determine if a tipo requires isolation
function esTipoCodigo(tipo: TipoVariacion): boolean {
  // Types that are considered code and require isolation in a sandbox
  return ['repo', 'fuente', 'adaptacion'].includes(tipo);
}

// Helper function to check if the payload contains any SYNCED_KEYS
function contieneClaveSincronizada(valor: unknown): boolean {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return false;
  }

  for (const clave in valor as object) {
    // @ts-ignore: we know it's an object
    const valorPropiedad = (valor as any)[clave];
    if (typeof valorPropiedad === 'string' || typeof valorPropiedad === 'number' || typeof valorPropiedad === 'boolean') {
      // Primitive value, check the key
      if (SYNCED_KEYS.some(key => key === clave)) {
        return true;
      }
    } else {
      // Nested object or array, recurse
      if (contieneClaveSincronizada(valorPropiedad)) {
        return true;
      }
    }
  }
  return false;
}

// Helper function to check if the payload contains anything that looks like a token or a key
function contieneTokenOClave(valor: unknown): boolean {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return false;
  }

  const tokenPattern = /(key|token|secret|password|auth|cred)/i;

  for (const clave in valor as object) {
    // @ts-ignore: we know it's an object
    const valorPropiedad = (valor as any)[clave];
    if (typeof valorPropiedad === 'string' && valorPropiedad !== '') {
      // Check if the key looks like a token/key
      if (tokenPattern.test(clave)) {
        return true;
      }
    } else if (typeof valorPropiedad === 'object' && valorPropiedad !== null && !Array.isArray(valorPropiedad)) {
      // Nested object, recurse
      if (contieneTokenOClave(valorPropiedad)) {
        return true;
      }
    } else if (Array.isArray(valorPropiedad)) {
      // Array, check each element
      for (const elemento of valorPropiedad) {
        if (contieneTokenOClave(elemento)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Helper function to check if the payload contains any http:// URLs (not https)
function contieneHttpNoSeguro(valor: unknown): boolean {
  if (typeof valor === 'string') {
    // Check if the string starts with http:// (case-insensitive)
    return valor.toLowerCase().startsWith('http://');
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return false;
  }

  if (Array.isArray(valor)) {
    for (const elemento of valor) {
      if (contieneHttpNoSeguro(elemento)) {
        return true;
      }
    }
    return false;
  }

  // Object
  for (const clave in valor as object) {
    // @ts-ignore: we know it's an object
    const valorPropiedad = (valor as any)[clave];
    if (contieneHttpNoSeguro(valorPropiedad)) {
      return true;
    }
  }
  return false;
}