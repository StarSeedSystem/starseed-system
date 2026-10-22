/**
 * Vocabulario de sentidos para la interfaz de los bots (BOT1011E2).
 *
 * Tablas puras: cómo se nombra cada sentido, qué verá y para qué se usa, las tres duraciones
 * de permiso y el mapa sentido → permiso real del aparato. Sin React, sin red y sin `node:*`:
 * lo usan el indicador del anillo (`indicador-sentidos.tsx`) y el diálogo de consentimiento
 * (`dialogo-consentimiento.tsx`).
 */
import type { PermisoDispositivo, ResultadoPermiso } from "@/lib/aurora/senses/request-permission";
import type { Bot, Sentido, TipoSesion } from "@/lib/astraura-bots/tipos";

/** Cómo se nombra cada sentido en español (texto del indicador y del diálogo). */
export const NOMBRE_SENTIDO: Record<Sentido, string> = {
  microfono: "micrófono", camara: "cámara", pantalla: "pantalla", "captura-pantalla": "captura de pantalla",
  archivos: "archivos", red: "red", correo: "correo", terminal: "terminal",
  sensores: "sensores", ubicacion: "ubicación", portapapeles: "portapapeles", aparatos: "aparatos",
};

/** Qué verá y para qué: texto honesto para la persona que decide. */
export const USO_SENTIDO: Record<Sentido, { queVe: string; paraQue: string }> = {
  pantalla: { queVe: "los elementos que el OS pinta en pantalla", paraQue: "saber dónde estás y ayudarte sin preguntar" },
  "captura-pantalla": { queVe: "una imagen de toda tu pantalla, con otras apps incluidas", paraQue: "leer lo que tienes delante, también fuera del OS" },
  archivos: { queVe: "las carpetas del cerebro y de la Biblioteca que le señales", paraQue: "buscar en tus archivos y resumirlos" },
  red: { queVe: "las páginas, publicaciones, grupos, mensajes y notificaciones del OS", paraQue: "seguir lo que te pasa en la malla y avisarte" },
  correo: { queVe: "tus correos, por los conectores que conectes", paraQue: "buscar mensajes y prepararte respuestas" },
  terminal: { queVe: "la terminal de tu aparato (solo en la app nativa)", paraQue: "ejecutar tareas y revisar tu sistema" },
  camara: { queVe: "lo que ve la cámara del aparato", paraQue: "reconocer lo que tienes delante" },
  microfono: { queVe: "el audio del micrófono", paraQue: "entenderte y responderte por voz" },
  sensores: { queVe: "el movimiento, los wearables y los datos de salud", paraQue: "saber cómo te mueves y avisarte si algo cambia" },
  ubicacion: { queVe: "tu ubicación geográfica", paraQue: "adaptarse al lugar donde estás" },
  portapapeles: { queVe: "lo que copias al portapapeles", paraQue: "continuar lo que estabas copiando" },
  aparatos: { queVe: "los aparatos conectados (BLE, serie, MIDI, HID, Meshtastic)", paraQue: "hablar con tus gadgets y sensores" },
};

/** Cuánto puede durar el consentimiento de un sentido. */
export type DuracionConsentimiento = "sesion" | "hoy" | "siempre";

/** Las tres duraciones que la persona puede elegir. */
export const DURACIONES: readonly { id: DuracionConsentimiento; texto: string }[] = [
  { id: "sesion", texto: "Esta sesión" },
  { id: "hoy", texto: "Hoy" },
  { id: "siempre", texto: "Hasta que lo quite" },
];

/** Sentido → permiso real del aparato (los que no aparecen no lo piden). */
export const PERMISO_SENTIDO: Partial<Record<Sentido, PermisoDispositivo>> = {
  camara: "camara", microfono: "microfono", ubicacion: "ubicacion",
  archivos: "archivos", sensores: "movimiento",
};

/** Lo que el diálogo devuelve cuando la persona concede. */
export interface ResultadoConsentimiento {
  sentido: Sentido;
  duracion: DuracionConsentimiento;
  /** Permiso expreso para sesiones públicas. */
  expreso: boolean;
  /** Lo que contestó el aparato, si el sentido lo necesita. */
  dispositivo: ResultadoPermiso | null;
}

export interface DialogoConsentimientoProps {
  /** El bot que pide el permiso. */
  bot: Bot;
  /** El sentido único que se pide. */
  sentido: Sentido;
  /** Dónde se está: en sesión pública hace falta permiso expreso. */
  sesion: TipoSesion;
  /** Si el diálogo está abierto. */
  abierto: boolean;
  /** La persona concede: el permiso del aparato ya se ha pedido (si hacía falta). */
  onConceder: (resultado: ResultadoConsentimiento) => void;
  /** «No» o Escape: nada se otorga. */
  onDenegar: () => void;
  /** Se inyecta en las pruebas; por defecto, el permiso real del aparato. */
  pedirPermiso?: (permiso: PermisoDispositivo) => Promise<ResultadoPermiso>;
}
