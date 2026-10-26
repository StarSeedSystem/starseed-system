/* protocolo — LocalSend v2 puro (Ola 1020U · LSD1020A). Contrato verificado el 2026-10-20
 * en github.com/localsend/protocol (architecture/repos-libreria-1020d.md §2): puerto 53317
 * TCP/UDP, multidifusión 224.0.0.167, anuncio version «2.0», register/prepare-upload/upload/
 * cancel con PIN ?pin= (204/401/403 y 422), sin descarga «por navegador». Sin red ni node:*. */
import type { DestinoArchivo, MsgOferta } from "@/lib/network/archivos-malla";
export const PUERTO_LOCALSEND = 53317;
export const GRUPO_MULTIDIFUSION = "224.0.0.167";
export const VERSION_PROTOCOLO = "2.0";
export const TROZO_DEFECTO = 16 * 1024;
export interface AnuncioLocalSend {
  alias: string; version: string; deviceModel?: string; deviceType: string;
  fingerprint: string; port: number; protocol: "http" | "https";
  download?: string; announce?: boolean;
}
export interface ArchivoLocalSend {
  id: string; fileName: string; size: number; fileType: string; sha256?: string; preview?: string;
}
export interface PeticionPrepararSubida { info: AnuncioLocalSend; files: Record<string, ArchivoLocalSend>; }
export interface RespuestaPrepararSubida { sessionId: string; files: Record<string, string>; }
export type ResultadoPreparar = "ok" | "nada-que-enviar" | "pin-invalido" | "rechazado" | "desconocido";
export type ResultadoSubida = "ok" | "hash-no-coincide" | "desconocido";

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** Lectura validada del anuncio (también el cuerpo de register). Mal formado → null. */
export function anuncioDesdeValor(x: unknown): AnuncioLocalSend | null {
  if (!esObjeto(x) || x.version !== VERSION_PROTOCOLO) return null;
  const { alias, deviceType, fingerprint, port, protocol } = x;
  if (typeof alias !== "string" || typeof deviceType !== "string" || typeof fingerprint !== "string") return null;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (protocol !== "http" && protocol !== "https") return null;
  const a: AnuncioLocalSend = { alias, version: VERSION_PROTOCOLO, deviceType, fingerprint, port, protocol };
  if (typeof x.deviceModel === "string") a.deviceModel = x.deviceModel;
  if (typeof x.download === "string") a.download = x.download; if (typeof x.announce === "boolean") a.announce = x.announce;
  return a;
}

function desdeJson<T>(bruto: string, leer: (x: unknown) => T | null): T | null {
  try { return leer(JSON.parse(bruto) as unknown); } catch { return null; }
}
export const anuncioDesdeJson = (bruto: string) => desdeJson(bruto, anuncioDesdeValor);

/** Lectura validada de prepare-upload (info + files). Mal formado → null. */
export function peticionPrepararDesdeValor(x: unknown): PeticionPrepararSubida | null {
  if (!esObjeto(x) || !esObjeto(x.files)) return null;
  const info = anuncioDesdeValor(x.info);
  if (!info) return null;
  const files: Record<string, ArchivoLocalSend> = {};
  for (const [clave, valor] of Object.entries(x.files)) {
    if (!esObjeto(valor)) return null;
    const { id, fileName, size, fileType, sha256, preview } = valor;
    if (typeof id !== "string" || typeof fileName !== "string" || typeof fileType !== "string") return null;
    if (typeof size !== "number" || !(size >= 0)) return null;
    files[clave] = { id, fileName, size, fileType, ...(typeof sha256 === "string" ? { sha256 } : {}),
      ...(typeof preview === "string" ? { preview } : {}) };
  }
  return { info, files };
}
export const peticionPrepararDesdeJson = (bruto: string) => desdeJson(bruto, peticionPrepararDesdeValor);

/** Lectura validada de la respuesta ({sessionId, files: id→token}). Mal formado → null. */
export function respuestaPrepararDesdeValor(x: unknown): RespuestaPrepararSubida | null {
  if (!esObjeto(x) || typeof x.sessionId !== "string" || !esObjeto(x.files)) return null;
  const files: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(x.files)) {
    if (typeof valor !== "string") return null;
    files[clave] = valor;
  }
  return { sessionId: x.sessionId, files };
}
export const respuestaPrepararDesdeJson = (bruto: string) => desdeJson(bruto, respuestaPrepararDesdeValor);

/** Anuncio con los defectos del contrato: version 2.0, puerto 53317, https y announce. */
export function crearAnuncioLocalSend(opciones: {
  alias: string; fingerprint: string; deviceType: string; deviceModel?: string;
  port?: number; protocol?: "http" | "https"; download?: string; announce?: boolean;
}): AnuncioLocalSend {
  return { ...opciones, version: VERSION_PROTOCOLO, port: opciones.port ?? PUERTO_LOCALSEND,
    protocol: opciones.protocol ?? "https", announce: opciones.announce ?? true };
}
export function crearPeticionPreparar(info: AnuncioLocalSend, files: Record<string, ArchivoLocalSend>): PeticionPrepararSubida {
  return { info, files };
}

/** Ruta común de las llamadas POST; el PIN va como ?pin=. */
function rutaPost(base: string, nombre: string, extra?: Record<string, string>): string {
  const url = new URL(`/api/localsend/v2/${nombre}`, base);
  if (extra) for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.toString();
}
export const urlRegistro = (base: string, pin?: string) => rutaPost(base, "register", pin ? { pin } : undefined);
export const urlPrepararSubida = (base: string, pin?: string) => rutaPost(base, "prepare-upload", pin ? { pin } : undefined);
export const urlSubida = (base: string, sessionId: string, fileId: string, token: string, pin?: string) =>
  rutaPost(base, "upload", pin ? { sessionId, fileId, token, pin } : { sessionId, fileId, token });
export const urlCancelar = (base: string, sessionId: string, pin?: string) =>
  rutaPost(base, "cancel", pin ? { sessionId, pin } : { sessionId });

/** Estados del contrato: prepare-upload 204/401/403; upload 422 si el sha256 no casa. */
const ESTADOS_PREPARAR: Record<number, ResultadoPreparar> = { 204: "nada-que-enviar", 401: "pin-invalido", 403: "rechazado" };
export function interpretarEstadoPreparar(codigo: number): ResultadoPreparar {
  return ESTADOS_PREPARAR[codigo] ?? (codigo >= 200 && codigo < 300 ? "ok" : "desconocido");
}
export function interpretarEstadoSubida(codigo: number): ResultadoSubida {
  if (codigo === 422) return "hash-no-coincide";
  return codigo >= 200 && codigo < 300 ? "ok" : "desconocido";
}

/** prepare-upload entrante (info + archivo) → MsgOferta del motor de archivos de la malla. */
export function ofertaDesdeLocalSend(info: AnuncioLocalSend, archivo: ArchivoLocalSend,
  opciones?: { destino?: DestinoArchivo; tamanoTrozo?: number }): MsgOferta {
  const tamanoTrozo = opciones?.tamanoTrozo ?? TROZO_DEFECTO;
  return { t: "archivo.oferta", id: archivo.id, nombre: archivo.fileName, tipo: archivo.fileType,
    tamano: archivo.size, sha256: archivo.sha256 ?? "", trozos: Math.max(1, Math.ceil(archivo.size / tamanoTrozo)),
    tamanoTrozo, destino: opciones?.destino ?? { tipo: "dispositivo" }, origen: info.alias };
}
/** MsgOferta → lo que pide prepare-upload; la raíz por trozos NO es el sha256 del archivo. */
export function archivoParaLocalSend(oferta: MsgOferta, opciones?: { sha256Real?: string }): ArchivoLocalSend {
  const a: ArchivoLocalSend = { id: oferta.id, fileName: oferta.nombre, size: oferta.tamano, fileType: oferta.tipo };
  if (opciones?.sha256Real !== undefined) a.sha256 = opciones.sha256Real;
  return a;
}
