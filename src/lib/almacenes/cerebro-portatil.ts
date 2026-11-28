/**
 * Cerebro portátil — un cerebro entero o una parte en un medio extraíble,
 * abrible en cualquier neurona (ALC1125I).
 *
 * Estructura portable y cifrada del contrato `architecture/almacenes-cerebros.md`:
 * el cifrado ocurre en la neurona del dueño (AES-GCM-256, WebCrypto) y la llave
 * nunca viaja en el paquete. Sin llave, el cerebro se abre en modo solo lectura.
 * Los conflictos nunca pisan: se ofrecen como variación.
 */

import { cifrarDatos, descifrarDatos, type ClaveCifrado } from "./fragmentos";
import { nombreVariacion } from "./sincronia";
import type { ModalidadAlmacen } from "./modelo";

export const FORMATO_CEREBRO_PORTATIL = "starseed-cerebro-portatil" as const;
export const VERSION_CEREBRO_PORTATIL = 1 as const;

export type ModalidadPortatil = Extract<ModalidadAlmacen, "cerebro-completo" | "parte">;
export type ModoApertura = "lectura-escritura" | "solo-lectura";

export interface PaqueteCerebroPortatil {
  formato: typeof FORMATO_CEREBRO_PORTATIL;
  version: number;
  idPaquete: string;
  cerebroId: string;
  nombre: string;
  modalidad: ModalidadPortatil;
  partes: string[];
  creadoEn: string;
  cifrado: { algoritmo: "AES-GCM-256"; iv: string; authTag: string };
  contenido: string;
  huella: string;
}

export interface EntradaExportacion {
  cerebroId: string;
  nombre: string;
  modalidad: ModalidadPortatil;
  partes?: string[];
  contenido: string;
  clave: ClaveCifrado;
  idPaquete?: string;
  creadoEn?: string;
}

export interface ResultadoExportacion {
  ok: boolean;
  paquete?: PaqueteCerebroPortatil;
  error?: string;
}

export interface ValidacionPaquete {
  valido: boolean;
  errores: string[];
}

export interface ResultadoParseo {
  ok: boolean;
  paquete?: PaqueteCerebroPortatil;
  error?: string;
}

export interface CerebroAbierto {
  paquete: PaqueteCerebroPortatil;
  modo: ModoApertura;
  contenido?: string;
  motivo?: string;
}

export interface DestinoParcial {
  ruta: string;
  contenido: string;
}

export interface ResultadoImportacion {
  ok: boolean;
  modo: ModoApertura;
  contenido?: string;
  conflicto?: { ruta: string; guardarComo: string };
  motivo?: string;
  error?: string;
}

const CAMPOS_PROHIBIDOS = [
  "clave",
  "llave",
  "secret",
  "secreto",
  "token",
  "password",
  "contrasena",
  "privatekey",
  "apikey",
] as const;

const MODALIDADES_VALIDAS: readonly ModalidadPortatil[] = ["cerebro-completo", "parte"];

function aBase64(datos: Uint8Array): string {
  let binario = "";
  for (const b of datos) binario += String.fromCharCode(b);
  return btoa(binario);
}

function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

async function huellaSha256(datos: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", datos as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valores de UI legibles; nunca contienen el contenido descifrado. */
export function resumenPaquete(paquete: PaqueteCerebroPortatil): {
  nombre: string;
  modalidad: ModalidadPortatil;
  partes: string[];
  creadoEn: string;
  cifrado: boolean;
} {
  return {
    nombre: paquete.nombre,
    modalidad: paquete.modalidad,
    partes: [...paquete.partes],
    creadoEn: paquete.creadoEn,
    cifrado: paquete.cifrado.algoritmo === "AES-GCM-256",
  };
}

/**
 * Valida la estructura portable y rechaza cualquier campo que pueda llevar un
 * secreto: la llave del dueño nunca se escribe en el paquete.
 */
export function validarPaquete(paquete: unknown): ValidacionPaquete {
  const errores: string[] = [];
  if (!paquete || typeof paquete !== "object" || Array.isArray(paquete)) {
    return { valido: false, errores: ["El paquete debe ser un objeto"] };
  }
  const p = paquete as Record<string, unknown>;

  if (p.formato !== FORMATO_CEREBRO_PORTATIL) {
    errores.push(`formato debe ser «${FORMATO_CEREBRO_PORTATIL}»`);
  }
  if (p.version !== VERSION_CEREBRO_PORTATIL) {
    errores.push(`versión no soportada: ${String(p.version)}`);
  }
  for (const campo of ["idPaquete", "cerebroId", "nombre", "creadoEn", "contenido", "huella"] as const) {
    if (typeof p[campo] !== "string" || (p[campo] as string).trim() === "") {
      errores.push(`Campo ${campo} debe ser una cadena no vacía`);
    }
  }
  if (!MODALIDADES_VALIDAS.includes(p.modalidad as ModalidadPortatil)) {
    errores.push("modalidad debe ser «cerebro-completo» o «parte»");
  }
  if (!Array.isArray(p.partes) || !p.partes.every((x: unknown) => typeof x === "string")) {
    errores.push("partes debe ser un array de cadenas");
  }

  const cifrado = p.cifrado as Record<string, unknown> | undefined;
  if (!cifrado || typeof cifrado !== "object" || Array.isArray(cifrado)) {
    errores.push("cifrado debe ser un objeto");
  } else {
    if (cifrado.algoritmo !== "AES-GCM-256") errores.push("cifrado.algoritmo debe ser AES-GCM-256");
    for (const campo of ["iv", "authTag"] as const) {
      if (typeof cifrado[campo] !== "string" || (cifrado[campo] as string).trim() === "") {
        errores.push(`cifrado.${campo} debe ser una cadena no vacía`);
      }
    }
    for (const campo of Object.keys(cifrado)) {
      if (CAMPOS_PROHIBIDOS.some((prohibido) => campo.toLowerCase().includes(prohibido))) {
        errores.push(`campo prohibido (posible secreto): cifrado.${campo}`);
      }
    }
  }

  for (const campo of Object.keys(p)) {
    if (CAMPOS_PROHIBIDOS.some((prohibido) => campo.toLowerCase().includes(prohibido))) {
      errores.push(`campo prohibido (posible secreto): ${campo}`);
    }
  }

  return { valido: errores.length === 0, errores };
}

export function serializarPaquete(paquete: PaqueteCerebroPortatil): string {
  return JSON.stringify(paquete, null, 2);
}

export function parsearPaquete(json: string): ResultadoParseo {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${e instanceof Error ? e.message : String(e)}` };
  }
  const validacion = validarPaquete(obj);
  if (!validacion.valido) {
    return { ok: false, error: `Paquete inválido: ${validacion.errores.join("; ")}` };
  }
  return { ok: true, paquete: obj as PaqueteCerebroPortatil };
}

/**
 * Exporta un cerebro completo o una parte a un paquete portable cifrado.
 * La llave se queda en la neurona del dueño: solo viaja el resultado cifrado.
 */
export async function exportarCerebroPortatil(entrada: EntradaExportacion): Promise<ResultadoExportacion> {
  if (!entrada.cerebroId.trim() || !entrada.nombre.trim()) {
    return { ok: false, error: "El cerebro y el nombre son obligatorios" };
  }
  if (!MODALIDADES_VALIDAS.includes(entrada.modalidad)) {
    return { ok: false, error: `Modalidad inválida: ${entrada.modalidad}` };
  }
  if (entrada.clave.length !== 32) {
    return { ok: false, error: "La llave debe ser de 32 bytes (256 bits)" };
  }

  const { cifrado, iv, authTag } = await cifrarDatos(
    new TextEncoder().encode(entrada.contenido),
    entrada.clave
  );
  const paquete: PaqueteCerebroPortatil = {
    formato: FORMATO_CEREBRO_PORTATIL,
    version: VERSION_CEREBRO_PORTATIL,
    idPaquete: entrada.idPaquete ?? `cerebro-${entrada.cerebroId}-${Date.now().toString(36)}`,
    cerebroId: entrada.cerebroId,
    nombre: entrada.nombre,
    modalidad: entrada.modalidad,
    partes: [...(entrada.partes ?? [])],
    creadoEn: entrada.creadoEn ?? new Date().toISOString(),
    cifrado: { algoritmo: "AES-GCM-256", iv: aBase64(iv), authTag: aBase64(authTag) },
    contenido: aBase64(cifrado),
    huella: await huellaSha256(cifrado),
  };
  return { ok: true, paquete };
}

/**
 * Abre un paquete en una neurona. Con la llave del dueño queda en lectura y
 * escritura; sin llave, o con una llave que no coincide, se abre en solo
 * lectura y el contenido descifrado no se expone.
 */
export async function abrirCerebroPortatil(
  paquete: PaqueteCerebroPortatil,
  clave?: ClaveCifrado
): Promise<CerebroAbierto> {
  if (!validarPaquete(paquete).valido) {
    return { paquete, modo: "solo-lectura", motivo: "El paquete no es válido; se abre en modo solo lectura." };
  }
  if (!clave || clave.length !== 32) {
    return { paquete, modo: "solo-lectura", motivo: "Sin llave: el cerebro se abre en modo solo lectura." };
  }
  try {
    const contenido = await descifrarDatos(
      deBase64(paquete.contenido),
      clave,
      deBase64(paquete.cifrado.iv),
      deBase64(paquete.cifrado.authTag)
    );
    return { paquete, modo: "lectura-escritura", contenido: new TextDecoder().decode(contenido) };
  } catch {
    return {
      paquete,
      modo: "solo-lectura",
      motivo: "La llave no coincide o el paquete fue manipulado; se abre en modo solo lectura.",
    };
  }
}

export function esSoloLectura(estado: CerebroAbierto): boolean {
  return estado.modo === "solo-lectura";
}

/**
 * Importa un paquete en otra neurona. Si el destino ya tiene otra versión de la
 * misma ruta, no pisa: propone una variación y avisa. Sin llave, la importación
 * queda en solo lectura.
 */
export async function importarCerebroPortatil(
  paquete: PaqueteCerebroPortatil,
  clave?: ClaveCifrado,
  destino?: DestinoParcial
): Promise<ResultadoImportacion> {
  const validacion = validarPaquete(paquete);
  if (!validacion.valido) {
    return { ok: false, modo: "solo-lectura", error: `Paquete inválido: ${validacion.errores.join("; ")}` };
  }

  const abierto = await abrirCerebroPortatil(paquete, clave);
  if (abierto.modo === "solo-lectura" || abierto.contenido === undefined) {
    return { ok: true, modo: "solo-lectura", motivo: abierto.motivo };
  }

  if (destino && destino.contenido !== abierto.contenido) {
    return {
      ok: true,
      modo: abierto.modo,
      conflicto: {
        ruta: destino.ruta,
        guardarComo: nombreVariacion(destino.ruta, "portatil", paquete.huella.slice(0, 6)),
      },
      motivo: "El destino ya tiene otra versión; no se pisa, se propone una variación.",
    };
  }

  return { ok: true, modo: abierto.modo, contenido: abierto.contenido };
}