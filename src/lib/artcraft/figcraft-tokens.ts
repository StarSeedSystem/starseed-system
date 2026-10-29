/**
 * Variables de FigCraft → tokens del ADN (contrato §4.4).
 * Empareja por cercanía de color y avisa de los pares que no llegan a 4.5:1
 * sobre noche o nieve. Módulo PURO: sin red, sin disco, sin React.
 */
export interface ParContraste {
  variable: string; token: string; color: string; fondo: "noche" | "nieve"; contraste: number;
}

/** Paleta Trinity del ADN (`memory/diseno/identidades.md`). */
export const TOKENS_ADN: Record<string, string> = {
  zenith: "#007FFF", horizonte: "#10B981", logica: "#FFBF00",
  anchor: "#DC143C", nieve: "#F8F9FA", noche: "#0A0F1D",
};

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Normaliza un color de FigCraft (`#rgb`, `#rrggbb[aa]`, `{r,g,b}` o `{hex}`) a `#RRGGBB`. */
export function aHex(valor: unknown): string | null {
  if (typeof valor === "string") {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(valor.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1].slice(0, 6);
    return `#${h.toUpperCase()}`;
  }
  if (Array.isArray(valor) && valor.length >= 3) return aHex({ r: valor[0], g: valor[1], b: valor[2] });
  if (esObjeto(valor)) {
    if (valor.hex !== undefined) return aHex(valor.hex);
    const r = Number(valor.r), g = Number(valor.g), b = Number(valor.b);
    if ([r, g, b].every(Number.isFinite)) {
      const escala = Math.max(r, g, b) <= 1 ? 255 : 1;
      const dos = (n: number) => Math.round(Math.max(0, Math.min(255, n * escala))).toString(16).padStart(2, "0");
      return `#${dos(r)}${dos(g)}${dos(b)}`.toUpperCase();
    }
  }
  return null;
}

/** Luminancia relativa WCAG 2.x de un color `#RRGGBB`. */
export function luminancia(hex: string): number {
  const canal = (n: number): number => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Contraste WCAG entre dos colores `#RRGGBB` (de 1:1 a 21:1). */
export function contrasteWcag(a: string, b: string): number {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function distancia(a: string, b: string): number {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
}

interface VariableColor { nombre: string; color: string }

/** Recorre la forma variable de FigCraft y recoge nombre + color sin fiarse del esquema. */
function recoger(entrada: unknown, contexto: string | undefined, salida: VariableColor[], profundidad = 0): void {
  if (profundidad > 8 || entrada === null || entrada === undefined) return;
  if (Array.isArray(entrada)) {
    for (const valor of entrada) recoger(valor, contexto, salida, profundidad + 1);
    return;
  }
  if (!esObjeto(entrada)) {
    const hex = aHex(entrada);
    if (hex && contexto) salida.push({ nombre: contexto, color: hex });
    return;
  }
  const nombre = [entrada.name, entrada.nombre, entrada.id].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? contexto;
  const directo = aHex(entrada) ?? aHex(entrada.value) ?? aHex(entrada.valor) ?? aHex(entrada.color) ?? aHex(entrada.hex);
  if (directo) {
    salida.push({ nombre: nombre ?? `variable-${salida.length + 1}`, color: directo });
    return;
  }
  for (const [clave, valor] of Object.entries(entrada)) {
    if (!["name", "nombre", "id", "type", "tipo"].includes(clave)) recoger(valor, nombre, salida, profundidad + 1);
  }
}

/** Pares variable↔token que NO alcanzan contraste 4.5:1 sobre noche o nieve. */
export function tokensDesdeVariables(variables: unknown): ParContraste[] {
  const colores: VariableColor[] = [];
  recoger(variables, undefined, colores);
  const vistos = new Set<string>();
  const pares: ParContraste[] = [];
  for (const { nombre, color } of colores) {
    const huella = `${nombre}|${color}`;
    if (vistos.has(huella)) continue;
    vistos.add(huella);
    let token = "";
    let cercania = Infinity;
    for (const [candidato, hex] of Object.entries(TOKENS_ADN)) {
      const d = distancia(color, hex);
      if (d < cercania) { cercania = d; token = candidato; }
    }
    if (cercania > 120) continue;
    for (const fondo of ["noche", "nieve"] as const) {
      const valor = contrasteWcag(color, TOKENS_ADN[fondo]);
      if (valor < 4.5) pares.push({ variable: nombre, token, color, fondo, contraste: Math.round(valor * 100) / 100 });
    }
  }
  return pares;
}
