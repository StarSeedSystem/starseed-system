/*
 * tipos — lo que devuelven los comandos de la app nativa (2026-10-10).
 * Espejo EXACTO de las estructuras de Rust (native/src-tauri/src/{antenas,nativa,carpetas,disco,android}.rs).
 * Los campos van en snake_case porque así los serializa serde. Contrato:
 * architecture/apps-nativas-segundo-plano.md §8. Módulo puro: sin Node, sin React.
 */

/** Cómo está una antena. Nada es «viva» sin haberlo medido el guardián. */
export type EstadoAntenaNativa = "viva" | "detectada" | "apagada" | "sin-permiso" | "no-disponible";

export type IdAntena = "wifi-local" | "lora" | "bluetooth" | "reticulum" | "internet" | "guardian" | (string & {});

export interface EstadoAntena {
  id: IdAntena;
  nombre: string;
  estado: EstadoAntenaNativa;
  motivo: string;
  /** ¿Sigue con la app cerrada en este sistema? */
  segundo_plano: boolean;
  detalle: string[];
}

export interface VecinoFaro {
  ip: string;
  tipo: "escritorio" | "android" | "ios" | "servidor" | "desconocido" | (string & {});
  propia: boolean;
  neurona: string | null;
  puerto_servicio: number;
  nas: boolean;
  lora: boolean;
  segundo_plano: boolean;
  visto_hace_s: number;
}

export interface EstadoAntenas {
  medido_ms: number;
  plataforma: string;
  guardian_activo: boolean;
  app_en_segundo_plano: boolean;
  antenas: EstadoAntena[];
  vecinos: VecinoFaro[];
  /** Neuronas StarSeed cerca que NO son de esta cuenta (solo el número). */
  otras_cerca: number;
}

export interface ConfigAntenas {
  /** 64 hex (32 bytes). Ver faro-clave.ts. */
  clave_faro: string | null;
  neurona: string | null;
  conocidas: string[];
  meshtastic_hosts: string[];
  nas: boolean;
  faro_apagado: boolean;
}

export interface ServicioAndroid {
  vivo: boolean;
  motivo: string;
  desde_ms: number;
  sdk: number;
  bateria_exenta: boolean;
  notificaciones: boolean;
}

export interface EstadoFondo {
  plataforma: string;
  disponible: boolean;
  activo: boolean;
  al_cerrar: string;
  oculta: boolean;
  arranque_con_sistema: boolean | null;
  servicio: ServicioAndroid | null;
}

export type ModoCarpeta = "lectura" | "lectura-escritura";

export interface CarpetaConcedida {
  ruta: string;
  modo: ModoCarpeta;
  nas: boolean;
  desde_ms: number;
  amplia: boolean;
}

export interface CapaEnDisco {
  nombre: string;
  bytes: number;
}

export interface EstadoCapasDisco {
  dir: string;
  libre_bytes: number | null;
  ocupado_bytes: number;
  presupuesto_bytes: number | null;
  instaladas: CapaEnDisco[];
}

export interface PeticionDescarga {
  url: string;
  sha256: string;
  nombre: string;
  tamano_bytes: number;
}

export interface Verificacion {
  ok: boolean;
  sha256: string;
  bytes: number;
  motivo: string;
}

export interface EntradaNas {
  nombre: string;
  ruta: string;
  carpeta: boolean;
  bytes: number;
  modificado_ms: number;
}

/** Resultado de cualquier llamada a la app: nunca lanza. */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

export const EVENTO_ANTENAS = "starseed://antenas";
export const EVENTO_SERIE = "starseed://serie";
export const EVENTO_SERIE_CERRADA = "starseed://serie-cerrada";
