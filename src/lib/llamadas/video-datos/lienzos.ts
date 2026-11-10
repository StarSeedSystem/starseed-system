/**
 * video-datos/lienzos — los lienzos del vídeo ligero de ESTA página (LLA1110C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (sin DOM: solo guarda referencias). Hay una llamada activa por página y, por el enlace de datos, solo de dos en
 * dos: el lienzo pintado hace menos tiempo es el de la otra persona. La superficie lo usa cuando el motor ofrece una
 * pista WebRTC de vídeo que NO trae imagen (negociada sin ruta IP: `muted`) y por eso no le pasa el lienzo aunque el
 * vídeo ligero esté pintando (prueba.33: 289 cuadros pintados en la Mac y la pantalla en negro).
 */

export interface LienzoVivo<L = unknown> {
  lienzo: L;
  pintadoEn: number;
  pintados: number;
}

const vivos = new Set<LienzoVivo>();

export function registrarLienzoVivo<L>(lienzo: L): LienzoVivo<L> {
  const v: LienzoVivo<L> = { lienzo, pintadoEn: 0, pintados: 0 };
  vivos.add(v as LienzoVivo);
  return v;
}

export function quitarLienzoVivo(v: LienzoVivo<unknown>): void {
  vivos.delete(v as LienzoVivo);
}

/** El lienzo pintado lo último (como mucho hace `edadMaxMs`), o null. */
export function lienzoLigeroReciente<L = HTMLCanvasElement>(edadMaxMs = 3000, ahora: number = typeof performance !== "undefined" ? performance.now() : Date.now()): L | null {
  let mejor: LienzoVivo | null = null;
  for (const l of vivos) if (l.pintados > 0 && ahora - l.pintadoEn <= edadMaxMs && (!mejor || l.pintadoEn > mejor.pintadoEn)) mejor = l;
  return (mejor?.lienzo as L | undefined) ?? null;
}

/** Pruebas. */
export function olvidarLienzosVivos(): void {
  vivos.clear();
}
