// Validador de variaciones públicas y detector de aislamiento de código
// Valida que una variación cumpla las reglas de seguridad y dimensiones para su publicación pública
// Arquitectura/variaciones-publicas.md:7

export type PayloadVariacion = Record<string, unknown>;

export interface Variacion {
  clave: string;
  tipo: string;
  nota: string;
  payload: PayloadVariacion;
  familia: string;
  version: string;
  licencia: string;
  enlaceExterno?: string;
  requiereAislamiento: boolean;
}

// Valida que una variación pueda publicarse como variación pública
// Valida que una variación pueda publicarse como variación pública
// Requisitos:
// - Tamaño ≤ 256 KB (1 MB = 1048576 bytes)
// - El payload debe ser JSON plano (sin funciones, fechas u otros tipos no serializables)
// - No puede contener claves privadas (SYNCED_KEYS, private, secret, token)
// - No puede contener valores privados ni URLs que no sean https
// - Las variaciones de código tienen requiereAislamiento: true y solo se ejecutan en iframe con sandbox sin allow-same-origin
export function validarVariacion(variacion: Variacion): { ok: true } | { ok: false; motivos: string[] } {
  const motivos: string[] = [];
  const sizeInBytes = JSON.stringify(variacion.payload).length;
  const maxSizeInBytes = 256 * 1024;

  if (sizeInBytes > maxSizeInBytes) {
    motivos.push('excede el límite');
  }

  const payload = variacion.payload;
  if (!isPlainJson(payload)) {
    motivos.push('no es JSON plano');
  }

  if (contieneClavesPrivadas(payload)) {
    motivos.push('contiene claves privadas');
  }

  if (tieneValoresPrivados(payload)) {
    motivos.push('contiene valores privados');
  }

  if (tieneUrlsIncorrectas(payload)) {
    motivos.push('contiene URLs que no son HTTPS');
  }

  if (esTipoCodigo(variacion.familia) && !variacion.requiereAislamiento) {
    motivos.push('deben tener requiereAislamiento: true');
  }

  if (variacion.requiereAislamiento && variacion.enlaceExterno && variacion.enlaceExterno.includes('allow-same-origin')) {
    motivos.push('no deben abrirse con allow-same-origin');
  }

  return motivos.length > 0 ? { ok: false, motivos } : { ok: true };
}

function isPlainJson(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.every((item) => isPlainJson(item));
  }

  if (typeof obj === 'function') {
    return false;
  }

  if (Object.prototype.toString.call(obj) === '[object Date]') {
    return false;
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'function' || Object.prototype.toString.call(value) === '[object Date]') {
      return false;
    }
    if (typeof value === 'object' && !isPlainJson(value)) {
      return false;
    }
  }

  return true;
}

function contieneClavesPrivadas(obj: unknown): boolean {
  const clavesPrivadas = ['SYNCED_KEYS', 'private', 'secret', 'token', 'api_key', 'access_key', 'auth_token'];

  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    if (clavesPrivadas.some((clave) => Object.prototype.hasOwnProperty.call(obj, clave))) {
      return true;
    }

    for (const value of Object.values(obj)) {
      if (contieneClavesPrivadas(value)) {
        return true;
      }
    }
  }

  return false;
}

function tieneValoresPrivados(obj: unknown): boolean {
  if (typeof obj === 'string') {
    // Patrones de tokens (UUID-like, JWT-like, claves aleatorias)
    const tokenRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (tokenRegex.test(obj) || obj.startsWith('sk_') || obj.startsWith('pk_') || obj.includes('token')) {
      return true;
    }

    // Detecta JWT (dos puntos)
    if (obj.includes('.') && obj.split('.').length === 3) {
      return true;
    }
  }

  if (Array.isArray(obj)) {
    return obj.some(tieneValoresPrivados);
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const value of Object.values(obj)) {
      if (tieneValoresPrivados(value)) {
        return true;
      }
    }
  }

  return false;
}

function tieneUrlsIncorrectas(obj: unknown): boolean {
  if (typeof obj === 'string') {
    // Detecta URLs que no son HTTPS (detecta cualquier URL excepto https://)
    if ((obj.includes('://') && !/^https:\/\//.test(obj)) || obj.startsWith('//')) {
      return true;
    }
  }

  if (Array.isArray(obj)) {
    return obj.some(tieneUrlsIncorrectas);
  }

  if (typeof obj === 'object' && obj !== null) {
    for (const value of Object.values(obj)) {
      if (tieneUrlsIncorrectas(value)) {
        return true;
      }
    }
  }

  return false;
}

function esTipoCodigo(familia: string): boolean {
  // Familias conocidas relacionadas con código
  const familiasCodigo = ['codigo', 'javascript', 'typescript', 'html', 'css', 'react', 'vue', 'angular'];
  return familiasCodigo.includes(familia.toLowerCase());
}
