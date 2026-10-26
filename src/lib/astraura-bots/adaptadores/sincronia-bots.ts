"use client";

/**
 * Adaptador de sincronía de bots (BOT1011Y): mantiene la API histórica mientras
 * separa los efectos (localStorage) de la suscripción a Supabase. La decisión de
 * qué bot gana vive en el núcleo puro `fusionar-bots.ts`.
 */
export {
  fusionarBots,
  abiertosEnEstaNeurona,
  marcarAbierto,
  migrarAbiertosDesdeAntigua,
  type EnvoltorioBots,
} from "../efectos/sincronia-bots";
export {
  suscribirBotsEntidad,
  type PayloadCambio,
} from "./sincronia-bots-supabase";
