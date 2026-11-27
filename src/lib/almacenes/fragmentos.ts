/**
 * Fragmentos cifrados con AES-GCM (WebCrypto) — Módulo puro TypeScript.
 *
 * El cifrado ocurre EN LA NEURONA DEL DUEÑO antes de fragmentar.
 * La llave NUNCA va en el fragmento. Los nodos guardan fragmentos opacos.
 */

export type ClaveCifrado = Uint8Array<ArrayBuffer>; // 32 bytes para AES-256

export interface FragmentoMetadata {
  /** Índice del fragmento (0 a n-1). */
  indice: number;
  /** Total de fragmentos (n). */
  total: number;
  /** Hash de integridad del fragmento CIFRADO (SHA-256 hex). */
  hash: string;
  /** Algoritmo de cifrado usado. */
  algoritmo: "AES-GCM-256";
  /** Vector de inicialización (12 bytes para GCM). */
  iv: Uint8Array;
  /** Etiqueta de autenticación (16 bytes para GCM). */
  authTag: Uint8Array;
  /** Timestamp de creación. */
  timestamp: string;
}

export interface Fragmento {
  /** Índice del fragmento. */
  indice: number;
  /** Datos CIFRADOS del fragmento. */
  datos: Uint8Array;
  /** Metadatos del fragmento (incluye IV, authTag, hash). */
  metadata: FragmentoMetadata;
}

/**
 * Hash rápido no criptográfico para integridad (cyrb53).
 * En producción usar SHA-256 via WebCrypto crypto.subtle.digest.
 */
function hashRapido(datos: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const b of datos) {
    h1 = Math.imul(h1 ^ b, 2654435761);
    h2 = Math.imul(h2 ^ b, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * Importa una clave raw como CryptoKey para AES-GCM.
 */
async function importarClave(clave: ClaveCifrado): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", clave as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
}

/**
 * Cifra datos con AES-GCM-256 usando WebCrypto.
 * Genera IV aleatorio de 12 bytes (estándar GCM).
 * Retorna { cifrado, iv, authTag }.
 */
export async function cifrarDatos(
  datos: Uint8Array,
  clave: ClaveCifrado
): Promise<{ cifrado: Uint8Array; iv: Uint8Array; authTag: Uint8Array }> {
  if (clave.length !== 32) throw new Error("Clave debe ser de 32 bytes (256 bits)");

  const cryptoKey = await importarClave(clave);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cifradoConTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    datos as BufferSource
  );

  // WebCrypto devuelve ciphertext || authTag concatenados
  const cifradoCompleto = new Uint8Array(cifradoConTag);
  const authTag = cifradoCompleto.slice(-16);
  const cifrado = cifradoCompleto.slice(0, -16);

  return { cifrado, iv, authTag };
}

/**
 * Descifra datos con AES-GCM-256 usando WebCrypto.
 * Lanza error si la autenticación falla (clave/IV/authTag incorrectos o datos manipulados).
 */
export async function descifrarDatos(
  cifrado: Uint8Array,
  clave: ClaveCifrado,
  iv: Uint8Array,
  authTag: Uint8Array
): Promise<Uint8Array> {
  if (clave.length !== 32) throw new Error("Clave debe ser de 32 bytes (256 bits)");
  if (iv.length !== 12) throw new Error("IV debe ser de 12 bytes");
  if (authTag.length !== 16) throw new Error("AuthTag debe ser de 16 bytes");

  const cryptoKey = await importarClave(clave);

  // Reconstruir ciphertext || authTag para WebCrypto
  const cifradoConTag = new Uint8Array(cifrado.length + authTag.length);
  cifradoConTag.set(cifrado);
  cifradoConTag.set(authTag, cifrado.length);

  try {
    const descifrado = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      cryptoKey,
      cifradoConTag as BufferSource
    );
    return new Uint8Array(descifrado);
  } catch {
    throw new Error("Falló la autenticación: datos manipulados o clave/IV incorrectos");
  }
}

/**
 * Cifra un trozo de datos ya preparado (no hace slicing).
 * Para uso con fragmentos ya generados (ej. por Reed-Solomon).
 */
export async function cifrarFragmento(
  trozo: Uint8Array,
  indice: number,
  total: number,
  clave: ClaveCifrado
): Promise<Fragmento> {
  if (indice < 0 || indice >= total) throw new Error("Índice de fragmento fuera de rango");
  if (total <= 0) throw new Error("Total de fragmentos debe ser > 0");

  const { cifrado, iv, authTag } = await cifrarDatos(trozo, clave);
  const hash = hashRapido(cifrado);

  const metadata: FragmentoMetadata = {
    indice,
    total,
    hash,
    algoritmo: "AES-GCM-256",
    iv,
    authTag,
    timestamp: new Date().toISOString(),
  };

  return {
    indice,
    datos: cifrado,
    metadata,
  };
}

/**
 * Crea un fragmento cifrado a partir de una porción de datos (hace slicing automático).
 * Para uso directo con datos originales sin Reed-Solomon previo.
 */
export async function crearFragmento(
  datos: Uint8Array,
  indice: number,
  total: number,
  clave: ClaveCifrado,
  tamFragmento: number
): Promise<Fragmento> {
  if (indice < 0 || indice >= total) throw new Error("Índice de fragmento fuera de rango");
  if (total <= 0) throw new Error("Total de fragmentos debe ser > 0");

  const inicio = indice * tamFragmento;
  const fin = Math.min(inicio + tamFragmento, datos.length);
  const trozo = datos.slice(inicio, fin);

  return cifrarFragmento(trozo, indice, total, clave);
}

/**
 * Valida la integridad de un fragmento (hash del cifrado coincide).
 * No descifra: solo verifica que el fragmento no ha sido manipulado en tránsito/almacenamiento.
 */
export function validarFragmento(fragmento: Fragmento): boolean {
  if (fragmento.indice < 0 || fragmento.indice >= fragmento.metadata.total) return false;
  if (fragmento.metadata.total <= 0) return false;
  if (!fragmento.metadata.hash || fragmento.metadata.hash.length === 0) return false;
  if (fragmento.metadata.algoritmo !== "AES-GCM-256") return false;
  if (fragmento.metadata.iv.length !== 12) return false;
  if (fragmento.metadata.authTag.length !== 16) return false;

  const hashCalculado = hashRapido(fragmento.datos);
  return hashCalculado === fragmento.metadata.hash;
}

/**
 * Reconstruye los datos originales a partir de k fragmentos válidos.
 * Descifra cada fragmento y concatena en orden de índice.
 * Lanza error si algún fragmento falla la validación o descifrado.
 */
export async function reconstruirDeFragmentos(
  fragmentos: Fragmento[],
  indices: number[],
  clave: ClaveCifrado,
  longitudOriginal: number,
  k: number
): Promise<Uint8Array> {
  if (fragmentos.length !== indices.length) throw new Error("Longitud de fragmentos e índices no coincide");
  if (fragmentos.length < k) throw new Error(`Se necesitan al menos ${k} fragmentos`);
  if (k <= 0) throw new Error("k debe ser > 0");

  // Validar todos los fragmentos primero
  for (const frag of fragmentos) {
    if (!validarFragmento(frag)) {
      throw new Error(`Fragmento ${frag.indice} inválido o manipulado`);
    }
    if (frag.indice !== indices[fragmentos.indexOf(frag)]) {
      throw new Error("Índice de fragmento no coincide con array de índices");
    }
  }

  // Ordenar por índice para concatenar en orden correcto
  const ordenados = [...fragmentos].sort((a, b) => a.indice - b.indice);

  // Descifrar y concatenar
  const partes: Uint8Array[] = [];
  for (const frag of ordenados) {
    const descifrado = await descifrarDatos(frag.datos, clave, frag.metadata.iv, frag.metadata.authTag);
    partes.push(descifrado);
  }

  // Concatenar todas las partes
  const totalLength = partes.reduce((sum, p) => sum + p.length, 0);
  const resultado = new Uint8Array(totalLength);
  let offset = 0;
  for (const parte of partes) {
    resultado.set(parte, offset);
    offset += parte.length;
  }

  return resultado.slice(0, longitudOriginal);
}

/**
 * Genera una clave de cifrado aleatoria de 32 bytes (256 bits).
 */
export function generarClave(): ClaveCifrado {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Deriva una clave a partir de una passphrase usando PBKDF2 (WebCrypto).
 * Para uso cuando la clave viene de entrada del usuario, no de generación aleatoria.
 */
export async function derivarClave(passphrase: string, salt: Uint8Array, iteraciones = 100000): Promise<ClaveCifrado> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: iteraciones,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}