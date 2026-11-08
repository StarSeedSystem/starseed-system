/*
 * avisos-nativos — los comandos de la app nativa para los avisos de mensajes y el origen del servidor local
 * (NOT1108A · 2026-11-08). Contratos: architecture/avisos-mensajes.md y apps-autonomas-sin-internet.md §2.2.
 * Rust: native/src-tauri/src/avisos_mensajes.rs y origen_local.rs. Una prueba (contrato-rust.test.ts)
 * vigila que estos tipos casen con los de Rust. Nunca lanza (devuelve `Resultado`); en la web normal dice
 * «Solo en la app nativa».
 */

import type { Resultado } from "./tipos";
import { puenteNativo, type PuenteNativo } from "./puente";

export const COMANDO_AVISO = "aviso_mensaje";
export const COMANDO_CONFIG = "avisos_config";
export const COMANDO_ESTADO = "avisos_estado";
export const COMANDO_PERMISO = "avisos_pedir_permiso";
export const COMANDO_PENDIENTE = "avisos_pendiente";
export const COMANDO_ORIGEN = "origen_local_estado";
/** Evento de la app al pulsar una notificación: la ruta del chat. */
export const EVENTO_ABRIR = "starseed://aviso-abrir";

/** Espejo de `ResultadoAviso` (avisos_mensajes.rs). */
export interface ResultadoAvisoNativo {
  mostrada: boolean;
  motivo: string | null;
}

/** Espejo de `EstadoAvisos` (avisos_mensajes.rs). */
export interface EstadoAvisosNativo {
  plataforma: string;
  /** "concedido" | "denegado" | "preguntar" | "desconocido" */
  permiso: string;
  canal: string | null;
  enfocada: boolean | null;
  pendiente: string | null;
  respaldo_nativo: boolean;
  ultimo_error: string | null;
}

/** Espejo de `ConfigAvisos` (avisos_mensajes.rs): lo que usa el respaldo nativo para filtrar. */
export interface ConfigAvisosNativo {
  neurona: string | null;
  uid: string | null;
  silenciados: string[];
  sistema: boolean;
}

/** Espejo de `EstadoOrigenLocal` (origen_local.rs). */
export interface EstadoOrigenLocal {
  principal: number | null;
  ultimo_puerto: number | null;
  puertos_usados: number[];
  cambios: number;
  ultimo_rescate: string | null;
}

export interface AvisoParaSistema {
  id: string;
  clave: string;
  titulo: string;
  cuerpo: string;
  ruta: string;
  sistema: boolean;
}

export function avisosNativos(p: PuenteNativo = puenteNativo()) {
  return {
    disponible: p.disponible,
    avisar: (a: AvisoParaSistema): Promise<Resultado<ResultadoAvisoNativo>> => p.llamar(COMANDO_AVISO, { ...a }),
    configurar: (config: ConfigAvisosNativo): Promise<Resultado<null>> => p.llamar(COMANDO_CONFIG, { config }),
    estado: (): Promise<Resultado<EstadoAvisosNativo>> => p.llamar(COMANDO_ESTADO),
    pedirPermiso: (): Promise<Resultado<string>> => p.llamar(COMANDO_PERMISO),
    pendiente: (): Promise<Resultado<string | null>> => p.llamar(COMANDO_PENDIENTE),
    origen: (): Promise<Resultado<EstadoOrigenLocal>> => p.llamar(COMANDO_ORIGEN),
    alAbrir: (cb: (ruta: string) => void) => p.escuchar(EVENTO_ABRIR, (x) => {
      if (typeof x === "string") cb(x);
    }),
  };
}
