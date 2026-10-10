/**
 * webgl — ¿puede este navegador abrir un contexto WebGL? Se prueba UNA vez con un
 * lienzo desechable (sin tocar la escena) y se recuerda. SSR-safe: sin `document`
 * no hay nada que probar y se responde «no» (el mapa vuelve a pedirlo ya en
 * cliente). Nunca lanza.
 */

let cache: boolean | null = null;

export function webglDisponible(): boolean {
  if (cache !== null) return cache;
  try {
    if (typeof document === "undefined") return false;
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("webgl2") ?? lienzo.getContext("webgl");
    cache = !!ctx;
    // Suelta el contexto de prueba: los navegadores limitan cuántos admiten vivos.
    (ctx as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cache = false;
  }
  return cache;
}

/** Solo para pruebas: olvida el resultado recordado. */
export function olvidarWebgl(): void {
  cache = null;
}
