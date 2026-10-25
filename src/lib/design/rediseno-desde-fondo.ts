import type { ThemeTokens } from "./theme-engine";
import { luminanciaDe, normalizarHex, type EntradaPaleta } from "./paleta-fondo";

/* Rediseño desde el fondo (Ola 1018F, tarea L) · architecture/fondos-shaders.md §4.
 * Módulo PURO: sin red, sin disco, sin DOM y determinista. El fondo actual sigue
 * mandando: estas propuestas solo tiñen tokens, nunca lo cambian ni lo ocultan. */

export type Modo = "claro" | "oscuro";
export type IdPropuesta = "sobria" | "armonica" | "atrevida";

/** ADN de diseño del Director (director-diseno.md §9). Todo opcional. */
export interface AdnDiseno { identidad?: string; motivos?: string[]; radio?: number; tipografia?: string; movimiento?: number }
export interface EntradaRediseno { paleta: EntradaPaleta[]; temaActual: ThemeTokens; modo: Modo; adn: AdnDiseno }
export interface PropuestaRediseno {
  id: IdPropuesta; nombre: string; motivo: string; tokens: ThemeTokens;
  contraste: number; ajustada: boolean; descartada: boolean; motivoDescarte?: string;
}
export interface PedidoIA {
  propuesta: IdPropuesta; paleta: EntradaPaleta[]; modo: Modo; adn: AdnDiseno;
  gustos?: { publicos?: string[]; privados?: string[] }; correEnNeuronaPropia: boolean;
}
interface Hsl { h: number; s: number; l: number }
type Orden = "calma" | "peso" | "fuego";
const PHI = 1.618;
const AA = 4.5;
const NEGRO: Hsl = { h: 0, s: 0, l: 0 };
const BLANCO: Hsl = { h: 0, s: 0, l: 100 };
const ESCALA_PHI: [number, number][] = [[-2, 0.382], [-1, 0.618], [1, 1.618], [2, 2.618], [3, 4.236], [4, 6.854]];
const ESPECIFICACIONES = [
  { id: "sobria", nombre: "Sobria", motivo: "Lino y línea: rejilla áurea en calma", orden: "calma", saturacion: 0.7, opacidad: 0.8, radio: 0.875, motion: 0.6, brillo: 14 },
  { id: "armonica", nombre: "Armónica", motivo: "Espiral áurea: un solo foco", orden: "peso", saturacion: 1, opacidad: 0.55, radio: PHI, motion: 1, brillo: 20 },
  { id: "atrevida", nombre: "Atrevida", motivo: "Metatrón: red de acentos vivos", orden: "fuego", saturacion: 1.25, opacidad: 0.35, radio: PHI, motion: 1.4, brillo: 28 },
] as const;
const hs = (c: Hsl): string => `${Math.round(c.h)} ${Math.round(c.s)}% ${Math.round(c.l)}%`;
function aHex(c: Hsl): string {
  const a = (c.s / 100) * Math.min(c.l / 100, 1 - c.l / 100);
  const f = (n: number): number => Math.round((c.l / 100 - a * Math.max(-1, Math.min(((n + c.h / 30) % 12) - 3, 9 - ((n + c.h / 30) % 12), 1))) * 255);
  return `#${[0, 8, 4].map((n) => f(n).toString(16).padStart(2, "0")).join("")}`;
}
const rgb = (c: Hsl): string => [0, 1, 2].map((i) => parseInt(aHex(c).slice(1 + i * 2, 3 + i * 2), 16)).join(", ");
const ratio = (a: Hsl, b: Hsl): number => {
  const [x, y] = [luminanciaDe(aHex(a)), luminanciaDe(aHex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function aHsl(color: string): Hsl {
  const n = normalizarHex(color).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}
function ajustar(fondo: Hsl, tinta: Hsl, objetivo = AA): { tinta: Hsl; razon: number; ajustada: boolean } {
  const inicial = ratio(fondo, tinta);
  const paso = ratio(fondo, { ...tinta, l: 0 }) >= ratio(fondo, { ...tinta, l: 100 }) ? -1 : 1;
  let l = tinta.l, razon = inicial;
  while (razon < objetivo && l > 0 && l < 100) { l = Math.max(0, Math.min(100, l + paso)); razon = ratio(fondo, { ...tinta, l }); }
  return { tinta: { ...tinta, l }, razon, ajustada: razon !== inicial };
}
const tintaDe = (c: Hsl): Hsl => (ratio(c, NEGRO) >= ratio(c, BLANCO) ? NEGRO : BLANCO);
const parseHsl = (v?: string): Hsl | null => { const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(v?.trim() ?? ""); return m ? { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) } : null; };
function candidatos(paleta: EntradaPaleta[], actual: ThemeTokens): Hsl[] {
  const sueltos = paleta.filter((p) => p.peso > 0).map((p) => aHsl(p.color));
  const tokens = ["primary-hsl", "accent-hsl", "secondary-hsl"].map((k) => parseHsl(actual.vars[k])).filter((c): c is Hsl => !!c);
  const todos = sueltos.length ? sueltos : tokens;
  const vivos = todos.filter((c) => c.s >= 15 && c.l >= 10 && c.l <= 90);
  return (vivos.length ? vivos : todos.length ? todos : [{ h: 190, s: 100, l: 50 }]).slice(0, 6);
}
function elegir(cs: Hsl[], orden: Orden): Hsl[] {
  const lista = orden === "calma" ? [...cs].sort((a, b) => a.s - b.s) : orden === "fuego" ? [...cs].sort((a, b) => b.s - a.s) : [...cs];
  const out = lista.slice(0, 3);
  for (let i = 1; out.length < 3; i++) out.push({ ...cs[0], h: (cs[0].h + 137.5 * i) % 360 });
  return out;
}
export const propuestasDesdeFondo = (entrada: EntradaRediseno): PropuestaRediseno[] =>
  ESPECIFICACIONES.map((espec) => construir(entrada, espec));
function construir(e: EntradaRediseno, espec: (typeof ESPECIFICACIONES)[number]): PropuestaRediseno {
  const [p, s, a] = elegir(candidatos(e.paleta, e.temaActual), espec.orden);
  const claro = e.modo === "claro";
  const fondo: Hsl = { h: p.h, s: Math.min(p.s, 12), l: claro ? 97 : 5 };
  const superficie: Hsl = { h: p.h, s: Math.min(p.s, 18), l: claro ? 92 : 14 };
  const base: Hsl = { h: p.h, s: Math.min(p.s, 20), l: claro ? 10 : 95 };
  const fg = ajustar(superficie, base);
  const tenue = ajustar(superficie, { ...base, l: claro ? 38 : 66 });
  const acentos = [p, s, a].map((c) => ({ ...c, s: Math.max(20, Math.min(100, c.s * espec.saturacion)) }));
  const tintas = acentos.map(tintaDe);
  const contraste = Math.min(fg.razon, tenue.razon, ...acentos.map((c, i) => ratio(c, tintas[i])));
  const vars: Record<string, string> = {
    "background-hsl": hs(fondo), "foreground-hsl": hs(fg.tinta), "card-hsl": hs(superficie),
    "card-foreground-hsl": hs(fg.tinta), "muted-hsl": hs(superficie), "muted-foreground-hsl": hs(tenue.tinta),
    "primary-hsl": hs(acentos[0]), "primary-foreground-hsl": hs(tintas[0]), "primary-rgb": rgb(acentos[0]),
    "secondary-hsl": hs(acentos[1]), "secondary-foreground-hsl": hs(tintas[1]),
    "accent-hsl": hs(acentos[2]), "accent-foreground-hsl": hs(tintas[2]),
    "border-hsl": hs({ ...superficie, l: claro ? 78 : 26 }), "ring-hsl": hs(acentos[0]),
    "glass-opacity": String(espec.opacidad), "glass-blur": `${espec.brillo}px`,
    "glass-refraction": "0.4", "glass-saturation": "140%", "border-width": "1px",
    "radius": `${e.adn.radio ?? espec.radio}rem`, "neon-glow": String(espec.brillo / 10), "dur-base": `${Math.round(120 + espec.motion * 60)}ms`,
  };
  for (const [n, v] of ESCALA_PHI) vars[`fs-phi-${n}`] = `${v}rem`;
  const motivo = e.adn.motivos?.[0] ? `${espec.motivo} · ${e.adn.motivos[0]}` : espec.motivo;
  return {
    id: espec.id, nombre: espec.nombre, motivo, contraste, ajustada: fg.ajustada || tenue.ajustada, descartada: contraste < AA,
    motivoDescarte: contraste < AA ? `Contraste ${contraste.toFixed(2)}:1 por debajo de AA` : undefined,
    tokens: { vars, materialClass: "ss-crystal", fontFamily: e.adn.tipografia ?? e.temaActual.fontFamily, motion: e.adn.movimiento ?? espec.motion },
  };
}
export function pedidoParaIA(pedido: PedidoIA): { instruccion: string; incluyePrivado: boolean; aviso: string } {
  const publicos = (pedido.gustos?.publicos ?? []).filter(Boolean);
  const privados = pedido.correEnNeuronaPropia ? (pedido.gustos?.privados ?? []).filter(Boolean) : [];
  const colores = pedido.paleta.slice(0, 5).map((c) => normalizarHex(c.color)).join(", ");
  const gustos = [...publicos, ...privados];
  const instruccion = [
    `Director de diseño: propone el rediseño «${pedido.propuesta}» en modo ${pedido.modo}.`,
    `ADN: ${pedido.adn.identidad ?? "StarSeed OS"}; motivos: ${(pedido.adn.motivos ?? ["espiral áurea"]).join(", ")}. Paleta del fondo: ${colores || "la del tema actual"}.`,
    `Memoria de gustos: ${gustos.length ? gustos.join("; ") : "sin datos"}. Devuelve un parche de tokens validado, AA ≥ 4,5:1, sin ocultar controles esenciales.`,
  ].join("\n");
  const aviso = pedido.correEnNeuronaPropia ? "La memoria privada se queda en las neuronas de la persona." : "Sin neurona propia: la memoria privada no sale y no se usa.";
  return { instruccion, incluyePrivado: privados.length > 0, aviso };
}
