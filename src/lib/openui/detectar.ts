export function pareceOpenUI(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;
  const limpio = texto.trim();
  // Heurística barata sobre la sintaxis real de OpenUI Lang: empieza con root = o contiene root = ... Componente(
  return /^\s*(?:```[a-z]*\n)?\s*root\s*=\s*[A-Z][a-zA-Z0-9_]*\s*\(/.test(limpio);
}
