export interface SecretoGuardado {
  metodo: "pin" | "contrasena";
  sal: string;
  hash: string;
  iteraciones: number;
  v: 1;
}

export interface EstadoIntentos {
  fallos: number;
  bloqueadoHasta: number;
}

const FALLOS_SIN_ESPERA = 4;
const ESPERA_INICIAL_MS = 30_000;
const ESPERA_MAXIMA_MS = 15 * 60_000;

function aBase64url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function desdeBase64url(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function validarSecreto(metodo: SecretoGuardado["metodo"], secreto: string): void {
  if (metodo === "pin" && !/^\d{4,12}$/.test(secreto)) {
    throw new Error("El PIN debe contener entre 4 y 12 dígitos.");
  }
  if (metodo === "contrasena" && secreto.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres.");
  }
}

async function derivarHash(secreto: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const clave = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones },
    clave,
    256,
  );
  return new Uint8Array(bits);
}

export async function crearSecreto(
  metodo: SecretoGuardado["metodo"],
  secreto: string,
  iteraciones = 210_000,
): Promise<SecretoGuardado> {
  validarSecreto(metodo, secreto);
  if (!Number.isInteger(iteraciones) || iteraciones < 1) {
    throw new Error("Las iteraciones deben ser un entero positivo.");
  }
  const sal = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivarHash(secreto, sal, iteraciones);
  return { metodo, sal: aBase64url(sal), hash: aBase64url(hash), iteraciones, v: 1 };
}

export async function verificarSecreto(guardado: SecretoGuardado, intento: string): Promise<boolean> {
  try {
    if (guardado.v !== 1 || !Number.isInteger(guardado.iteraciones) || guardado.iteraciones < 1) {
      return false;
    }
    const esperado = desdeBase64url(guardado.hash);
    const obtenido = await derivarHash(
      intento,
      desdeBase64url(guardado.sal),
      guardado.iteraciones,
    );
    let diferencia = esperado.length ^ obtenido.length;
    const longitud = Math.max(esperado.length, obtenido.length);
    for (let i = 0; i < longitud; i += 1) {
      diferencia |= (esperado[i] ?? 0) ^ (obtenido[i] ?? 0);
    }
    return diferencia === 0;
  } catch {
    return false;
  }
}

export function registrarFallo(estado: EstadoIntentos, ahora: number): EstadoIntentos {
  const fallosPrevios = Number.isFinite(estado.fallos)
    ? Math.max(0, Math.trunc(estado.fallos))
    : 0;
  const fallos = fallosPrevios + 1;
  if (fallos <= FALLOS_SIN_ESPERA) {
    return {
      fallos,
      bloqueadoHasta: Number.isFinite(estado.bloqueadoHasta) ? estado.bloqueadoHasta : 0,
    };
  }
  const espera = Math.min(
    ESPERA_INICIAL_MS * 2 ** (fallos - FALLOS_SIN_ESPERA - 1),
    ESPERA_MAXIMA_MS,
  );
  return { fallos, bloqueadoHasta: ahora + espera };
}

export function esperaRestante(estado: EstadoIntentos, ahora: number): number {
  if (!Number.isFinite(estado.bloqueadoHasta)) return 0;
  return Math.max(0, estado.bloqueadoHasta - ahora);
}
