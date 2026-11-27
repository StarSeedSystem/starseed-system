/**
 * Fragmentación cifrada de almacenes — StarSeed OS
 *
 * El cifrado AES-256-GCM (WebCrypto) ocurre en la neurona del dueño ANTES de
 * fragmentar: los nodos reciben únicamente trozos opacos. La llave nunca viaja
 * dentro de un fragmento ni dentro del paquete fragmentado.
 */

import { fragmentarReedSolomon, reconstruirReedSolomon } from "./reed-solomon";

export const VERSION_FRAGMENTACION = 1 as const;
export const ALGORITMO_CIFRADO = "AES-GCM-256" as const;

const LONGITUD_IV = 12;

export interface FragmentoCifrado {
  indice: number;
  total: number;
  k: number;
  n: number;
  datos: Uint8Array;
  hash: string;
}

export interface PaqueteFragmentado {
  version: number;
  algoritmo: string;
  k: number;
  n: number;
  iv: Uint8Array;
  longitudCifrada: number;
  fragmentos: FragmentoCifrado[];
}

export interface OpcionesFragmentado {
  k: number;
  n: number;
}

export interface CifradoPrevio {
  cifrado: Uint8Array;
  iv: Uint8Array;
}

type HuellaFragmento = Omit<FragmentoCifrado, "hash">;

function aHex(bytes: Uint8Array): string {
  let salida = "";
  for (const byte of bytes) salida += byte.toString(16).padStart(2, "0");
  return salida;
}

async function hashFragmento(fragmento: HuellaFragmento): Promise<string> {
  const cabecera = new TextEncoder().encode(
    `${VERSION_FRAGMENTACION}|${fragmento.indice}|${fragmento.total}|${fragmento.k}|${fragmento.n}|`,
  );
  const entrada = new Uint8Array(cabecera.length + fragmento.datos.length);
  entrada.set(cabecera, 0);
  entrada.set(fragmento.datos, cabecera.length);
  const resumen = await crypto.subtle.digest("SHA-256", entrada);
  return aHex(new Uint8Array(resumen));
}

/** Genera una llave AES-256-GCM no extraíble: nunca se puede exportar en claro. */
export async function generarClaveAesGcm(): Promise<CryptoKey> {
  const algoritmo: AesKeyGenParams = { name: "AES-GCM", length: 256 };
  return crypto.subtle.generateKey(algoritmo, false, ["encrypt", "decrypt"]);
}

/** Cifra los datos en la neurona del dueño antes de que salgan a la malla. */
export async function cifrarAntesDeFragmentar(datos: Uint8Array, clave: CryptoKey): Promise<CifradoPrevio> {
  const iv = crypto.getRandomValues(new Uint8Array(LONGITUD_IV));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, datos);
  return { cifrado: new Uint8Array(cifrado), iv };
}

async function descifrarTrasReconstruir(
  cifrado: Uint8Array,
  iv: Uint8Array,
  clave: CryptoKey,
): Promise<Uint8Array> {
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, clave, cifrado);
  return new Uint8Array(claro);
}

/** Cifra, fragmenta con Reed-Solomon k de n y firma cada fragmento con SHA-256. */
export async function fragmentarCifrado(
  datos: Uint8Array,
  clave: CryptoKey,
  opciones: OpcionesFragmentado,
): Promise<PaqueteFragmentado> {
  const { cifrado, iv } = await cifrarAntesDeFragmentar(datos, clave);
  const trozos = fragmentarReedSolomon(cifrado, opciones.k, opciones.n);
  const fragmentos: FragmentoCifrado[] = [];
  for (let indice = 0; indice < trozos.length; indice += 1) {
    const huella: HuellaFragmento = {
      indice,
      total: opciones.n,
      k: opciones.k,
      n: opciones.n,
      datos: trozos[indice],
    };
    fragmentos.push({ ...huella, hash: await hashFragmento(huella) });
  }
  return {
    version: VERSION_FRAGMENTACION,
    algoritmo: ALGORITMO_CIFRADO,
    k: opciones.k,
    n: opciones.n,
    iv,
    longitudCifrada: cifrado.length,
    fragmentos,
  };
}

/** Detecta un fragmento manipulado comparando su huella SHA-256. */
export async function verificarFragmento(fragmento: FragmentoCifrado): Promise<boolean> {
  return (await hashFragmento(fragmento)) === fragmento.hash;
}

/**
 * Reconstruye y descifra usando cualquier conjunto de al menos k fragmentos.
 * Un fragmento con la huella rota se rechaza antes de participar; si falta
 * autenticación GCM, también falla en vez de devolver basura.
 */
export async function reconstruirYDescifrar(
  paquete: PaqueteFragmentado,
  fragmentos: readonly FragmentoCifrado[],
  clave: CryptoKey,
): Promise<Uint8Array> {
  if (paquete.version !== VERSION_FRAGMENTACION || paquete.algoritmo !== ALGORITMO_CIFRADO) {
    throw new Error("Fragmentos: paquete con versión o algoritmo no soportado.");
  }
  if (fragmentos.length < paquete.k) {
    throw new Error(
      `Fragmentos: se necesitan al menos ${paquete.k} fragmentos y se recibieron ${fragmentos.length}.`,
    );
  }

  const ordenados: Array<Uint8Array | null> = new Array(paquete.n).fill(null);
  for (const fragmento of fragmentos) {
    if (fragmento.k !== paquete.k || fragmento.n !== paquete.n || fragmento.total !== paquete.n) {
      throw new Error("Fragmentos: metadatos incompatibles con el paquete.");
    }
    if (!Number.isInteger(fragmento.indice) || fragmento.indice < 0 || fragmento.indice >= paquete.n) {
      throw new Error("Fragmentos: índice de fragmento fuera de rango.");
    }
    if (!(await verificarFragmento(fragmento))) {
      throw new Error(`Fragmentos: el fragmento ${fragmento.indice} está manipulado o corrupto.`);
    }
    ordenados[fragmento.indice] = fragmento.datos;
  }

  const cifrado = reconstruirReedSolomon(ordenados, paquete.k, paquete.n, paquete.longitudCifrada);
  return descifrarTrasReconstruir(cifrado, paquete.iv, clave);
}
