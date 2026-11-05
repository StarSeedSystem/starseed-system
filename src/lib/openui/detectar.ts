export function pareceOpenUI(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;

  const textoLimpio = texto.trim();

  if (textoLimpio.startsWith("```openui") || textoLimpio.includes("```openui")) return true;

  if (/^\s*(Tarjeta|Tabla|Pasos|Comparacion|LineaDeTiempo|Lista|Accion)\s*\(/.test(textoLimpio)) return true;

  if (textoLimpio.includes("root =")) return true;

  const patrones = [
    /\[\s*[a-zA-Z]/,
    /\{[^}]*:\s*[a-zA-Z]/,
    /,\s*[a-zA-Z]\s*\(/,
  ];

  return patrones.some((p) => p.test(textoLimpio));
}