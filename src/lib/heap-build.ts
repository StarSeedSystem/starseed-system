export function heapBuildMb(env: Record<string, string | undefined>): number {
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