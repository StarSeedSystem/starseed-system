/**
 * scripts/heap-build.mjs (VRC01 · 2026-11-17)
 * Devuelve el tamaño del heap de Node (MB) para `next build` según el entorno.
 * Como módulo: exporta `heapBuildMb(env) → number`.
 * Como programa: imprime solo el número (sin logs).
 */

export function heapBuildMb(env) {
  const starseedHeap = env.STARSEED_BUILD_HEAP_MB;
  if (starseedHeap !== undefined) {
    if (/^\d+$/.test(starseedHeap)) {
      const parsed = Number.parseInt(starseedHeap, 10);
      if (parsed >= 2048 && parsed <= 7168) {
        return parsed;
      }
    }
  }

  if (env.VERCEL === "1") {
    return 5120;
  }

  return 4096;
}

// Ejecución directa: imprime solo el número
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(heapBuildMb(process.env));
}