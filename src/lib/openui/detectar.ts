/**
 * Detecta si un string parece ser código de OpenUI Lang.
 * Heurística simple: comienza con la etiqueta del paquete esperado.
 */
export function pareceOpenUI(texto: string): boolean {
  return texto.trim().startsWith("@openuidev/react-lang@");
}
