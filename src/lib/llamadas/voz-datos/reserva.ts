/**
 * voz-datos/reserva — lo que la voz usa AHORA del carril, para que el reparto con el vídeo lo respete (VOZ1111J).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro y diminuto. Cada sesión de voz por enlace de datos publica los kb/s de texto de su escalón actual
 * (`niveles.ts`, `kbpsTextoNivel`) y los retira al acabar. `video-datos/reparto.ts` reserva para la voz lo mayor entre
 * esto y la voz medida: si la voz baja de escalón, el vídeo gana ese sitio; si sube, se lo devuelve. No se reserva por
 * lo medido solo porque en un silencio (DTX) la voz casi no gasta y el vídeo se quedaría el sitio de la siguiente frase.
 * Con varias llamadas a la vez (raro) se reserva la mayor.
 */
const reservas = new Map<object, number>();

export function fijarReservaVoz(dueno: object, kbps: number | null): void {
  if (kbps === null || !(kbps > 0)) reservas.delete(dueno);
  else reservas.set(dueno, Math.round(kbps));
}

/** kb/s que la voz tiene reservados ahora (null: ninguna sesión de voz por datos activa). */
export function reservaVozKbps(): number | null {
  let m: number | null = null;
  for (const v of reservas.values()) m = m === null ? v : Math.max(m, v);
  return m;
}

/** Solo pruebas. */
export function __vaciarReservasVoz(): void {
  reservas.clear();
}
