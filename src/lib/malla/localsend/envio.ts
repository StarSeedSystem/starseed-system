/* envio — el protocolo LocalSend v2 APLICADO (Ola 1020U · LSD1020A). Contrato verificado el
 * 2026-10-20 en github.com/localsend/protocol (resumen: architecture/repos-libreria-1020d.md §2).
 * EMISIÓN: dado un `MsgOferta` del motor de archivos de la malla, habla con un aparato con
 * LocalSend por la red local: POST /register (presencia), POST /prepare-upload ({info, files} →
 * {sessionId, files: id → token}), POST /upload?sessionId&fileId&token con los bytes y, si tras
 * abrir sesión algo falla, POST /cancel?sessionId (el PIN va como ?pin=). RECEPCIÓN: lo que
 * llega en un prepare-upload entra al MISMO motor como `MsgOferta` (oferta, hash, destino).
 * PURO salvo el fetch, que llega inyectado (las pruebas no usan red). Sin `node:*` ni descarga
 * «por navegador» (HTTP sin cifrar: no se implementa). El paquete de multidifusión va en
 * `anuncio-udp.ts`; quien lo envía por la red es la app nativa o el servidor (LSD1020B).
 */

import type { DestinoArchivo, MsgOferta } from "@/lib/network/archivos-malla";
import {
  PUERTO_LOCALSEND,
  archivoParaLocalSend,
  crearAnuncioLocalSend,
  crearPeticionPreparar,
  interpretarEstadoPreparar,
  interpretarEstadoSubida,
  ofertaDesdeLocalSend,
  peticionPrepararDesdeJson,
  respuestaPrepararDesdeJson,
  urlCancelar,
  urlPrepararSubida,
  urlRegistro,
  urlSubida,
  type AnuncioLocalSend,
} from "./protocolo";

export type FetchEnvio = (url: string, init?: RequestInit) => Promise<Response>;

export interface AparatoLocalSend {
  /** Base de la API del otro aparato, con su puerto: p. ej. https://192.168.1.5:53317 */
  base: string;
  /** PIN del receptor, si lo pide (va como ?pin=). */
  pin?: string;
}

/** Cómo se presenta este aparato en el protocolo (el anuncio nos obliga a alias, tipo y huella). */
export interface NombreEmisor {
  alias: string;
  deviceType: string;
  fingerprint: string;
  deviceModel?: string;
}

export type ResultadoEnviar = {
  estado: "enviado" | "nada-que-enviar" | "pin-invalido" | "rechazado" | "hash-no-coincide" | "cancelado" | "sin-respuesta";
  motivo?: string;
};

/** Base de la API de un aparato LocalSend por su IP: HTTPS y el puerto del protocolo (53317). */
export function baseDeAparato(ip: string, puerto = PUERTO_LOCALSEND): string {
  return `https://${ip}:${puerto}`;
}

/** Registrar nuestra presencia en el otro aparato por HTTP (alternativa a la multidifusión UDP). */
export async function registrarPorLocalSend(
  aparato: AparatoLocalSend,
  yo: AnuncioLocalSend,
  opciones?: { fetchImpl?: FetchEnvio },
): Promise<boolean> {
  const f = opciones?.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const r = await f(urlRegistro(aparato.base, aparato.pin), { method: "POST", body: JSON.stringify(yo) });
  // El cuerpo del register no lo declara el resumen del contrato: solo se mira el código (2xx = presentados).
  return r.ok;
}

/**
 * enviarPorLocalSend — manda por el protocolo lo que el motor de la malla quiere enviar.
 * `datos` llega perezoso (el llamante abre el archivo); el sha256 REAL del archivo (no la raíz
 * por trozos de la malla) se da en `opciones.sha256Real` si se quiere que el receptor lo compare.
 */
export async function enviarPorLocalSend(
  oferta: MsgOferta,
  datos: Blob | ArrayBuffer,
  aparato: AparatoLocalSend,
  opciones: { yo: NombreEmisor; sha256Real?: string; fetchImpl?: FetchEnvio },
): Promise<ResultadoEnviar> {
  const f = opciones.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const anuncio = crearAnuncioLocalSend({
    alias: opciones.yo.alias,
    deviceType: opciones.yo.deviceType,
    fingerprint: opciones.yo.fingerprint,
    deviceModel: opciones.yo.deviceModel,
  });
  const archivo = archivoParaLocalSend(oferta, { sha256Real: opciones?.sha256Real });
  const preparar = await f(urlPrepararSubida(aparato.base, aparato.pin), {
    method: "POST",
    body: JSON.stringify(crearPeticionPreparar(anuncio, { [archivo.id]: archivo })),
  });
  const estadoPreparar = interpretarEstadoPreparar(preparar.status);
  if (estadoPreparar !== "ok") {
    return {
      estado: estadoPreparar === "desconocido" ? "sin-respuesta" : estadoPreparar,
      ...(estadoPreparar === "desconocido" ? { motivo: `el receptor respondió ${preparar.status}` } : {}),
    };
  }
  const sesion = respuestaPrepararDesdeJson(await preparar.text());
  if (!sesion) return { estado: "sin-respuesta", motivo: "la respuesta de prepare-upload no se entendió" };
  const token = sesion.files[archivo.id];
  if (typeof token !== "string") return { estado: "sin-respuesta", motivo: "el receptor no dio token para el archivo" };
  const subida = await f(urlSubida(aparato.base, sesion.sessionId, archivo.id, token, aparato.pin), {
    method: "POST",
    body: datos,
  });
  const estadoSubida = interpretarEstadoSubida(subida.status);
  if (estadoSubida === "ok") return { estado: "enviado" };
  // Solo mandamos un archivo: cualquier subida que no sea ok deja la sesión sin sentido, la cancelamos.
  void f(urlCancelar(aparato.base, sesion.sessionId, aparato.pin), { method: "POST" }).catch(() => undefined);
  return {
    estado: estadoSubida === "hash-no-coincide" ? "hash-no-coincide" : "cancelado",
    ...(estadoSubida === "desconocido" ? { motivo: `la subida respondió ${subida.status}` } : {}),
  };
}

/** RECEPCIÓN: un prepare-upload entrante (JSON) → `MsgOferta[]` para el motor de archivos de la malla. Mal formado → null. */
export function ofertasDePrepareUpload(
  bruto: string,
  opciones?: { destino?: DestinoArchivo; tamanoTrozo?: number },
): MsgOferta[] | null {
  const pet = peticionPrepararDesdeJson(bruto);
  if (!pet) return null;
  return Object.values(pet.files).map((a) => ofertaDesdeLocalSend(pet.info, a, opciones));
}
