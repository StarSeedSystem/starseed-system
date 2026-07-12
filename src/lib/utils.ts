import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Aplica opacidad a un color de fondo (canvas / gradientes).
 * - `hsl(...)` / `hsla(...)` → usa la sintaxis moderna `hsl(H S% L% / a)`.
 * - `rgb(...)` / `rgba(...)` → `rgb(R G B / a)`.
 * - hex (#rgb, #rrggbb) → concatena el par hexadecimal de alfa.
 * Cualquier otro formato (p.ej. "transparent") se devuelve intacto.
 *
 * @param col        Color base.
 * @param hexAlpha   Alfa en hexadecimal de 2 dígitos, p.ej. "66" (~40%).
 * @param floatAlpha Alfa en 0..1 como string, p.ej. "0.4" (para hsl/rgb).
 */
export function applyAlpha(col: string, hexAlpha: string, floatAlpha: string): string {
  const c = col.trim();
  if (c.startsWith("hsl") || c.startsWith("rgb")) {
    const fn = c.startsWith("hsl") ? "hsl" : "rgb";
    const inner = c.slice(c.indexOf("(") + 1, c.lastIndexOf(")")).trim();
    if (inner.includes(",")) {
      // Sintaxis clásica con comas: hsl(H, S%, L%) / rgb(R, G, B) → hsla()/rgba().
      const parts = inner.split(",").map((p) => p.trim()).slice(0, 3);
      return `${fn}a(${parts.join(", ")}, ${floatAlpha})`;
    }
    // Sintaxis moderna: hsl(H S% L% [/ a]) → sustituimos/añadimos el alfa.
    const base = inner.includes("/") ? inner.slice(0, inner.indexOf("/")).trim() : inner;
    return `${fn}(${base} / ${floatAlpha})`;
  }
  if (c.startsWith("#")) {
    const h = c.slice(1);
    // #rgb → #rrggbb; #rrggbbaa → recorta el alfa previo.
    const rrggbb =
      h.length === 3 || h.length === 4
        ? h.slice(0, 3).split("").map((x) => x + x).join("")
        : h.slice(0, 6);
    return `#${rrggbb}${hexAlpha}`;
  }
  return c;
}
