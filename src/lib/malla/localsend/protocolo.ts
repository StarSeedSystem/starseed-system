/* protocolo — LocalSend v2 puro (Ola 1020U · LSD1020A). Contrato verificado el
 * 2026-10-20 en github.com/localsend/protocol (resumen: architecture/repos-libreria-1020d.md §2):
 * puerto 53317 (TCP y UDP), multidifusión 224.0.0.167; anuncio {alias, version "2.0",
 * deviceModel, deviceType, fingerprint, port, protocol, download, announce}; respuesta por
 * POST /api/localsend/v2/register; subida por prepare-upload ({info, files} → {sessionId,
 * files: {id → token}}; 204 nada que enviar, 401 PIN, 403 rechazado) y upload?sessionId&fileId&token
 * (422 si el sha256 no casa); cancelar por cancel?sessionId. PIN con ?pin=. PURO: sin red,
 * sin node:* (lo importa el cliente). Lo no listado ahí queda fuera: nada inventado.
 * La descarga «por navegador» (HTTP sin cifrar) no se implementa.
 */

import type { DestinoArchivo, MsgOferta } from "@/lib/network/archivos-malla";

export const PUERTO_LOCALSEND = 53317;
export const GRUPO_MULTIDIFUSION = "224.0.0.167";
export const VERSION_PROTOCOLO = "2.0";
/** Bytes por trozo por defecto, coherente con el motor de archivos de la malla. */
export const TROZO_DEFECTO = 16 * 1024;

export interface AnuncioLocalSend {
  alias: string;
  version: string;
  deviceModel?: string;
  deviceType: string;
  fingerprint: string;
  port: number;
  protocol: "http" | "https";
  download?: string;
  announce?: boolean;
}

export interface ArchivoLocalSend {
  id: string;
  fileName: string;
  size: number;
  fileType: string;
  sha256?: string;
  preview?: string;
}

export interface PeticionPrepararSubida {
  info: AnuncioLocalSend;
  files: Record<string, ArchivoLocalSend>;
}

export interface RespuestaPrepararSubida {
  sessionId: string;
  files: Record<string, string>;
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Lectura validada del anuncio (es también el cuerpo de register). Mal formado → null. */
export function anuncioDesdeValor(x: unknown): AnuncioLocalSend | null {
  if (!esObjeto(x) || x.version !== VERSION_PROTOCOLO) return null;
  if (typeof x.alias !== "string" || typeof x.deviceType !== "string" || typeof x.fingerprint !== "string") return null;
  if (typeof x.port !== "number" || !Number.isInteger(x.port) || x.port < 1 || x.port > 65535) return null;
  if (x.protocol !== "http" && x.protocol !== "https") return null;
  const a: AnuncioLocalSend = {
    alias: x.alias,
    version: VERSION_PROTOCOLO,
    deviceType: x.deviceType,
    fingerprint: x.fingerprint,
    port: x.port,
    protocol: x.protocol,
  };
  if (typeof x.deviceModel === "string") a.deviceModel = x.deviceModel;
  if (typeof x.download === "string") a.download = x.download;
  if (typeof x.announce === "boolean") a.announce = x.announce;
  return a;
}

function desdeJson<T>(bruto: string, leer: (x: unknown) => T | null): T | null {
  try {
    return leer(JSON.parse(bruto) as unknown);
  } catch {
    return null;
  }
}

export const anuncioDesdeJson = (bruto: string) => desdeJson(bruto, anuncioDesdeValor);

/** Lectura validada de la petición prepare-upload (info + files). Mal formado → null. */
export function peticionPrepararDesdeValor(x: unknown): PeticionPrepararSubida | null {
  if (!esObjeto(x) || !esObjeto(x.files)) return null;
  const info = anuncioDesdeValor(x.info);
  if (!info) return null;
  const files: Record<string, ArchivoLocalSend> = {};
  for (const [k, v] of Object.entries(x.files)) {
    if (
      !esObjeto(v) ||
      typeof v.id !== "string" ||
      typeof v.fileName !== "string" ||
      typeof v.fileType !== "string" ||
      typeof v.size !== "number" ||
      !(v.size >= 0)
    ) {
      return null;
    }
    files[k] = {
      id: v.id,
      fileName: v.fileName,
      size: v.size,
      fileType: v.fileType,
      ...(typeof v.sha256 === "string" ? { sha256: v.sha256 } : {}),
      ...(typeof v.preview === "string" ? { preview: v.preview } : {}),
    };
  }
  return { info, files };
}

export const peticionPrepararDesdeJson = (bruto: string) => desdeJson(bruto, peticionPrepararDesdeValor);

/** Lectura validada de la respuesta prepare-upload ({sessionId, files: id→token}). Mal formado → null. */
export function respuestaPrepararDesdeValor(x: unknown): RespuestaPrepararSubida | null {
  if (!esObjeto(x) || typeof x.sessionId !== "string" || !esObjeto(x.files)) return null;
  const files: Record<string, string> = {};
  for (const k of Object.keys(x.files)) {
    const v = (x.files as Record<string, unknown>)[k];
    if (typeof v !== "string") return null;
    files[k] = v;
  }
  return { sessionId: x.sessionId, files };
}

export const respuestaPrepararDesdeJson = (bruto: string) => desdeJson(bruto, respuestaPrepararDesdeValor);

/** Anuncio con los defectos del contrato: version "2.0", puerto 53317, https y announce a true. */
export function crearAnuncioLocalSend(
  opciones: { alias: string; fingerprint: string; deviceType: string; deviceModel?: string; port?: number; protocol?: "http" | "https"; download?: string; announce?: boolean },
): AnuncioLocalSend {
  return {
    ...opciones,
    version: VERSION_PROTOCOLO,
    port: opciones.port ?? PUERTO_LOCALSEND,
    protocol: opciones.protocol ?? "https",
    announce: opciones.announce ?? true,
  };
}

export function crearPeticionPreparar(info: AnuncioLocalSend, files: Record<string, ArchivoLocalSend>): PeticionPrepararSubida {
  return { info, files };
}

/** Ruta común de las llamadas POST; PIN opcional como ?pin=. */
function rutaPost(base: string, nombre: string, extra?: Record<string, string>): string {
  const url = new URL(`/api/localsend/v2/${nombre}`, base);
  if (extra) for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.toString();
}

export function urlRegistro(base: string, pin?: string): string {
  return rutaPost(base, "register", pin ? { pin } : undefined);
}

export function urlPrepararSubida(base: string, pin?: string): string {
  return rutaPost(base, "prepare-upload", pin ? { pin } : undefined);
}

export function urlSubida(base: string, sessionId: string, fileId: string, token: string, pin?: string): string {
  return rutaPost(base, "upload", pin ? { sessionId, fileId, token, pin } : { sessionId, fileId, token });
}

export function urlCancelar(base: string, sessionId: string, pin?: string): string {
  return rutaPost(base, "cancel", pin ? { sessionId, pin } : { sessionId });
}

/** Resultados que declara el contrato de prepare-upload: 204, 401 (PIN) y 403; el resto 2xx es ok. */
export type ResultadoPreparar = "ok" | "nada-que-enviar" | "pin-invalido" | "rechazado" | "desconocido";

export function interpretarEstadoPreparar(codigo: number): ResultadoPreparar {
  if (codigo === 204) return "nada-que-enviar";
  if (codigo === 401) return "pin-invalido";
  if (codigo === 403) return "rechazado";
  if (codigo >= 200 && codigo < 300) return "ok";
  return "desconocido";
}

/**
 * ofertaDesdeLocalSend — de lo que llega en prepare-upload (info de quien
 * envía + archivo) a un `MsgOferta` del motor de archivos de la malla. Un
 * archivo sin sha256 declarado queda con sha256 "" (sin hash verificable:
 * decide la política de aceptación si lo acepta).
 */
export function ofertaDesdeLocalSend(
  info: AnuncioLocalSend,
  archivo: ArchivoLocalSend,
  opciones?: { destino?: DestinoArchivo; tamanoTrozo?: number },
): MsgOferta {
  const tamanoTrozo = opciones?.tamanoTrozo ?? TROZO_DEFECTO;
  return {
    t: "archivo.oferta",
    id: archivo.id,
    nombre: archivo.fileName,
    tipo: archivo.fileType,
    tamano: archivo.size,
    sha256: archivo.sha256 ?? "",
    trozos: Math.max(1, Math.ceil(archivo.size / tamanoTrozo)),
    tamanoTrozo,
    destino: opciones?.destino ?? { tipo: "dispositivo" },
    origen: info.alias,
  };
}

/**
 * archivoParaLocalSend — de un `MsgOferta` a lo que pide prepare-upload.
 * OJO (honesto): el sha256 de `MsgOferta` es la RAÍZ de la lista de hashes por
 * trozo de la malla, NO el sha256 del archivo entero que LocalSend compara
 * (un local-422 manda si no casa). Solo se anuncia el sha256 REAL del archivo
 * si quien llama lo da en `opciones.sha256Real`; si falta, se omite (LocalSend
 * lo tiene opcional y entonces no comprobará el hash).
 */
export function archivoParaLocalSend(oferta: MsgOferta, opciones?: { sha256Real?: string }): ArchivoLocalSend {
  const a: ArchivoLocalSend = {
    id: oferta.id,
    fileName: oferta.nombre,
    size: oferta.tamano,
    fileType: oferta.tipo,
  };
  if (opciones?.sha256Real !== undefined) a.sha256 = opciones.sha256Real;
  return a;
}
