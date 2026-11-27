/**
 * Fragmentación segura con cifrado AES-GCM y Reed-Solomon
 *
 * Flujo:
 * 1. Cifrar datos con AES-GCM (WebCrypto) en la neurona del dueño
 * 2. Fragmentar datos cifrados con Reed-Solomon (k de n)
 * 3. Distribuir fragmentos (nodos guardan fragmentos opacos, sin claves)
 * 4. Reconstruir: reunir k fragmentos -> Reed-Solomon decode -> AES-GCM decrypt
 *
 * Las claves NUNCA salen en claro ni se almacenan en los fragmentos.
 */

import {
  reedSolomonEncode,
  reedSolomonDecode,
  ReedSolomonError,
} from "./reed-solomon";

export class FragmentacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FragmentacionError";
  }
}

/** Metadatos necesarios para reconstruir los datos */
export interface MetadatosFragmentacion {
  /** Número mínimo de fragmentos para reconstruir */
  k: number;
  /** Número total de fragmentos generados */
  n: number;
  /** Longitud original de los datos (antes de cifrar) */
  originalLength: number;
  /** Vector de inicialización usado en AES-GCM */
  iv: Uint8Array;
  /** Fragmentos generados */
  fragmentos: Fragmento[];
}

/** Un fragmento individual */
export interface Fragmento {
  /** Índice del fragmento (0 a n-1) */
  indice: number;
  /** Datos del fragmento (cifrado + paridad Reed-Solomon) */
  datos: Uint8Array;
}

/** Algoritmo de cifrado utilizado */
const ALGORITMO_CIFRADO = { name: "AES-GCM", length: 256 } as const;
const IV_LENGTH = 12; // 96 bits para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Genera una clave AES-GCM de 256 bits usando WebCrypto
 */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    ALGORITMO_CIFRADO,
    true, // extraíble (para poder exportar/importar)
    ["encrypt", "decrypt"]
  );
}

/**
 * Exporta una CryptoKey a formato raw (ArrayBuffer de 32 bytes)
 */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key);
}

/**
 * Importa una clave desde formato raw
 */
export async function importKey(rawKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey, ALGORITMO_CIFRADO, false, ["encrypt", "decrypt"]);
}

/**
 * Cifra datos con AES-GCM
 * @param key Clave de cifrado
 * @param data Datos a cifrar
 * @param iv Vector de inicialización (12 bytes)
 * @returns Datos cifrados (incluye auth tag al final)
 */
export async function encryptData(key: CryptoKey, data: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  if (iv.length !== IV_LENGTH) {
    throw new FragmentacionError(`IV debe tener ${IV_LENGTH} bytes`);
  }

  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return new Uint8Array(encrypted);
  } catch (e) {
    throw new FragmentacionError(`Error cifrando: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Descifra datos con AES-GCM
 * @param key Clave de descifrado
 * @param encryptedData Datos cifrados (con auth tag)
 * @param iv Vector de inicialización (12 bytes)
 * @returns Datos descifrados
 */
export async function decryptData(key: CryptoKey, encryptedData: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  if (iv.length !== IV_LENGTH) {
    throw new FragmentacionError(`IV debe tener ${IV_LENGTH} bytes`);
  }
  if (encryptedData.length < AUTH_TAG_LENGTH) {
    throw new FragmentacionError("Datos cifrados demasiado cortos");
  }

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );
    return new Uint8Array(decrypted);
  } catch (e) {
    throw new FragmentacionError(`Error descifrando (clave/IV incorrectos o datos corruptos): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Fragmenta datos: cifra con AES-GCM y luego aplica Reed-Solomon (k de n)
 * @param key Clave de cifrado (nunca sale de esta función)
 * @param data Datos originales a fragmentar
 * @param k Número mínimo de fragmentos para reconstruir
 * @param n Número total de fragmentos a generar
 * @returns Metadatos con todos los fragmentos
 */
export async function fragmentar(
  key: CryptoKey,
  data: Uint8Array,
  k: number,
  n: number
): Promise<MetadatosFragmentacion> {
  if (k <= 0 || n <= 0) {
    throw new FragmentacionError("k y n deben ser positivos");
  }
  if (k > n) {
    throw new FragmentacionError("k no puede ser mayor que n");
  }
  if (n > 255) {
    throw new FragmentacionError("n no puede exceder 255 (límite Reed-Solomon GF(256))");
  }

  // Generar IV aleatorio
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Cifrar datos
  const encryptedData = await encryptData(key, data, iv);

  // Aplicar Reed-Solomon a los datos cifrados
  // Los datos cifrados deben ser múltiplo de k para Reed-Solomon
  // Si no lo son, paddeamos con ceros y guardamos la longitud original cifrada
  const encryptedLength = encryptedData.length;
  const padding = (k - (encryptedLength % k)) % k;
  const paddedData = new Uint8Array(encryptedLength + padding);
  paddedData.set(encryptedData);

  // Codificar con Reed-Solomon
  const shards = reedSolomonEncode(paddedData, k, n);

  // Crear fragmentos
  const fragmentos: Fragmento[] = shards.map((shard, indice) => ({
    indice,
    datos: shard,
  }));

  return {
    k,
    n,
    originalLength: data.length,
    iv,
    fragmentos,
  };
}

/**
 * Reconstruye datos originales desde k fragmentos
 * @param key Clave de descifrado
 * @param metadatos Metadatos de la fragmentación original
 * @param fragmentos Array de k fragmentos (cualesquiera de los n)
 * @returns Datos originales descifrados
 */
export async function reconstruir(
  key: CryptoKey,
  metadatos: MetadatosFragmentacion,
  fragmentos: Fragmento[]
): Promise<Uint8Array> {
  // Validaciones básicas
  if (fragmentos.length !== metadatos.k) {
    throw new FragmentacionError(`Se necesitan exactamente ${metadatos.k} fragmentos, se recibieron ${fragmentos.length}`);
  }
  if (metadatos.k !== metadatos.k || metadatos.n !== metadatos.n) {
    throw new FragmentacionError("Metadatos inconsistentes");
  }

  // Verificar índices únicos y válidos
  const indices = fragmentos.map((f) => f.indice);
  if (new Set(indices).size !== indices.length) {
    throw new FragmentacionError("Fragmentos con índices duplicados");
  }
  for (const idx of indices) {
    if (idx < 0 || idx >= metadatos.n) {
      throw new FragmentacionError(`Índice de fragmento fuera de rango: ${idx} (0-${metadatos.n - 1})`);
    }
  }

  // Verificar que todos los fragmentos tienen el mismo tamaño
  const shardSize = fragmentos[0].datos.length;
  for (const frag of fragmentos) {
    if (frag.datos.length !== shardSize) {
      throw new FragmentacionError("Fragmentos con tamaños inconsistentes");
    }
  }

  // Preparar shards para Reed-Solomon decode
  const shards = fragmentos.map((f) => f.datos);

  try {
    // Decodificar Reed-Solomon (recupera datos cifrados + padding)
    const paddedEncrypted = reedSolomonDecode(shards, indices, metadatos.k, metadatos.n, shardSize * metadatos.k);

    // Quitar padding para obtener datos cifrados exactos
    // La longitud original cifrada se puede inferir: originalLength no ayuda directamente
    // porque el cifrado añade auth tag. Pero sabemos que paddedEncrypted.length = shardSize * k
    // y que encryptedLength = paddedEncrypted.length - padding
    // El padding fue (k - (encryptedLength % k)) % k
    // Como no guardamos encryptedLength, lo inferimos: el auth tag son 16 bytes al final
    // Pero más simple: el descifrado AES-GCM fallará si hay bytes extra
    // Así que probamos descifrando progresivamente quitando padding

    // El padding máximo es k-1 bytes. Intentamos descifrar quitando 0, 1, ..., k-1 bytes del final
    let decrypted: Uint8Array | null = null;
    for (let pad = 0; pad < metadatos.k; pad++) {
      const encryptedLength = paddedEncrypted.length - pad;
      if (encryptedLength < AUTH_TAG_LENGTH) continue;

      const encryptedData = paddedEncrypted.subarray(0, encryptedLength);
      try {
        decrypted = await decryptData(key, encryptedData, metadatos.iv);
        // Verificar que la longitud coincide
        if (decrypted.length === metadatos.originalLength) {
          break;
        }
        // Si no coincide, seguir probando
        decrypted = null;
      } catch {
        // Seguir probando con menos padding
      }
    }

    if (decrypted === null) {
      throw new FragmentacionError("No se pudo descifrar: fragmentos corruptos, clave incorrecta o metadatos inválidos");
    }

    return decrypted;
  } catch (e) {
    if (e instanceof ReedSolomonError) {
      throw new FragmentacionError(`Error Reed-Solomon: ${e.message}`);
    }
    if (e instanceof FragmentacionError) {
      throw e;
    }
    throw new FragmentacionError(`Error reconstruyendo: ${e instanceof Error ? e.message : String(e)}`);
  }
}