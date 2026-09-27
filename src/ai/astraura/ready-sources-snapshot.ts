/**
 * ready-sources-snapshot — última lista de ids de fuente que
 * `detectAvailability()` marcó `ready` en CUALQUIER parte de la app (Ola 368).
 *
 * Módulo DELIBERADAMENTE sin dependencias pesadas (ni de `availability.ts` ni
 * de la malla de neuronas) para que ambos puedan importarlo sin crear un
 * ciclo — el mismo motivo que ya explica `declaracionAstrauraLocal()` en
 * `src/lib/network/malla-neuronas.ts`.
 *
 * `availability.ts` publica aquí, como efecto secundario BARATO, el
 * resultado de cada sondeo real que YA iba a hacer (por un chat del usuario,
 * por el indicador de capas, por el «Reintentar» de un mensaje…). La ficha de
 * la malla de neuronas (`fuentesServibles`) LEE este snapshot en vez de
 * sondear de nuevo: "cheap, no extra probing" — nunca dispara una sonda
 * propia, solo refleja la última que ya se hizo por otro motivo.
 */

let ultimaListaLista: string[] = [];
let ultimaAt = 0;

/** Publica la lista de ids `ready` de la última pasada de `detectAvailability()`. */
export function publicarFuentesListas(ids: string[]): void {
  ultimaListaLista = Array.from(new Set(ids));
  ultimaAt = Date.now();
}

/** Lectura síncrona, nunca sondea nada. `at: 0` si nunca se publicó nada todavía. */
export function fuentesListasSnapshot(): { ids: string[]; at: number } {
  return { ids: ultimaListaLista, at: ultimaAt };
}

/** Solo para pruebas: vuelve al estado inicial. */
export function reiniciarFuentesListasSnapshotParaTests(): void {
  ultimaListaLista = [];
  ultimaAt = 0;
}
