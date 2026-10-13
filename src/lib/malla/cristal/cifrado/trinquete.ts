export interface Cadena {
  raiz: CryptoKey;
  n: number;
  desde: number;
}

export async function iniciarCadena(secreto: ArrayBuffer, contexto: string, ahora: number): Promise<Cadena> {
  // Importar la clave HKDF usando HKDF-SHA256 con permisos para derivar bits y claves
  const hkdfKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secreto,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  // Derivar los bits para la clave raíz HKDF usando el contexto como info
  const raizBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      info: new TextEncoder().encode(contexto),
      salt: new Uint8Array([]) // Salt vacío según especificación
    },
    hkdfKey,
    256 // Longitud de la clave derivada en bits
  );

    // Importar los bits derivados como una clave HKDF
    const raiz = await globalThis.crypto.subtle.importKey(
      'raw',
      raizBits,
      { name: 'HKDF' },
      false,
      ['deriveKey', 'deriveBits']
    );

  return {
    raiz,
    n: 0,
    desde: ahora
  };
}

export async function siguienteClave(c: Cadena): Promise<{clave: CryptoKey; cadena: Cadena; n: number}> {
  // Derivar los bits para la clave de mensaje para el índice actual n (AES-GCM)
  const mensajeInfo = new TextEncoder().encode(`starseed-cristal-msg-${c.n}`);
  const mensajeBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      info: mensajeInfo,
      salt: new Uint8Array([])
    },
    c.raiz,
    256 // Longitud de la clave derivada en bits
  );

  // Importar los bits derivados como una clave AES-GCM
  const mensajeClave = await globalThis.crypto.subtle.importKey(
    'raw',
    mensajeBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  // Derivar los bits para la clave de la siguiente cadena (n+1) (HKDF)
  const cadenaInfo = new TextEncoder().encode('starseed-cristal-cadena');
  const siguienteRaizBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      info: cadenaInfo,
      salt: new Uint8Array([])
    },
    c.raiz,
    256 // Longitud de la clave derivada en bits
  );

    // Importar los bits derivados como una clave HKDF
    const siguienteRaiz = await globalThis.crypto.subtle.importKey(
      'raw',
      siguienteRaizBits,
      { name: 'HKDF' },
      false,
      ['deriveKey', 'deriveBits']
    );

  return {
    clave: mensajeClave,
    cadena: {
      raiz: siguienteRaiz,
      n: c.n + 1,
      desde: c.desde
    },
    n: c.n
  };
}

export function debeRotar(c: Cadena, ahora: number): boolean {
  // Rotar si se han generado 500 claves o han pasado 15 minutos (900000 ms)
  return c.n >= 500 || (ahora - c.desde) >= 15 * 60 * 1000;
}

export async function cifrar(clave: CryptoKey, datos: Uint8Array, aad: Uint8Array): Promise<{iv: Uint8Array; cifrado: Uint8Array}> {
  // Generar un IV aleatorio de 12 bytes para AES-GCM
  const ivBuffer = new ArrayBuffer(12);
  const ivArray = new Uint8Array(ivBuffer);
  globalThis.crypto.getRandomValues(ivArray);
  
  // Cifrar los datos usando AES-GCM
  const cifrado = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
      additionalData: new Uint8Array(aad),
    },
    clave,
    new Uint8Array(datos)
  );
  
  return {
    iv: ivArray,
    cifrado: new Uint8Array(cifrado)
  };
}

export async function descifrar(clave: CryptoKey, iv: Uint8Array, cifrado: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  // Descifrar los datos usando AES-GCM
  const datos = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      additionalData: new Uint8Array(aad),
    },
    clave,
    new Uint8Array(cifrado)
  );
  
  return new Uint8Array(datos);
}