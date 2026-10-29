import { roleVars, type H, type RoleSet } from "./theme-catalog";
import type { ThemeTokens } from "./theme-engine";
/* Rediseño sugerido por Astraura (Ola 1018F · tarea L) · architecture/fondos-shaders.md §4: tres
 * propuestas de ThemeTokens (sobria, armónica, atrevida) adaptadas a la paleta del fondo: superficies
 * translúcidas que dejan ver el fondo, acentos de la paleta, escala φ (armonia.md), un motivo sagrado cada una y AA ≥ 4,5:1. */
export type ModoTema = "claro" | "oscuro";
export interface ColorPaleta { color: string; peso: number }
/** ADN del Director de diseño; gustosPrivados SOLO si corre en una neurona de la persona. */
export interface AdnDiseno { identidad?: string; gustosPublicos?: string[]; gustosPrivados?: string[]; neuronaPropia?: boolean }
export interface ParContraste { par: string; ratio: number; pasa: boolean; ajustado: boolean }
export interface EntradaRediseno { paleta: ColorPaleta[]; temaActual: ThemeTokens; modo: ModoTema; adn?: AdnDiseno }
export interface PropuestaRediseno {
  id: "sobria" | "armonica" | "atrevida"; nombre: string;
  motivo: string; tokens: ThemeTokens; contrastes: ParContraste[]; descartada?: string; // motivo: geometría sagrada (armonia.md); descartada solo si un texto crítico no llegó al AA
}
const PHI = 1.618;
const AA = 4.5;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Hex #rgb/#rrggbb → HSL (matiz 0-360, sat/luz 0-100); token "270 80% 60%" → tupla. */
export function hslDeHex(color: string): H | null {
  const m = HEX_RE.exec(color.trim()); if (!m) return null;
  const hexa = m[0].length === 4 ? m[0].slice(1).replace(/./g, (c) => c + c) : m[0].slice(1);
  const v = (i: number) => parseInt(hexa.slice(i, i + 2), 16) / 255;
  const [r, g, b] = [v(0), v(2), v(4)];
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b), l = (max + Math.min(r, g, b)) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), hue = d === 0 ? 0 : max === r ? 60 * ((g - b) / d) : max === g ? 120 + 60 * ((b - r) / d) : 240 + 60 * ((r - g) / d);
  return [(Math.round(hue) % 360 + 360) % 360, Math.round(s * 100), Math.round(l * 100)];
}
export function hslDeToken(token: string | undefined): H | null {
  const p = (token ?? "").trim().split(/\s+/).map(parseFloat);
  return p.length >= 3 && p.every((n) => !Number.isNaN(n)) ? [p[0], p[1], p[2]] as H : null;
}
/** HSL → RGB (hexágono como theme-catalog.ts) y luminancia WCAG. */
export function rgbDe(h: H): [number, number, number] {
  const hue = ((h[0] % 360) + 360) % 360, s = h[1] / 100, l = h[2] / 100, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const t: [number, number, number] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return t.map((v) => Math.round((v + m) * 255)) as [number, number, number];
}
function luminancia(h: H): number {
  const lin = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return rgbDe(h).reduce((acc, v, i) => acc + [0.2126, 0.7152, 0.0722][i] * lin(v), 0);
}
/** Contraste WCAG 2.x entre dos colores HSL. */
export const contrasteAA = (a: H, b: H): number => luminancia(a) < luminancia(b) ? (luminancia(b) + 0.05) / (luminancia(a) + 0.05) : (luminancia(a) + 0.05) / (luminancia(b) + 0.05);
/** Empuja la LUZ del texto (conserva matiz) hasta el AA ≥ objetivo, hacia el extremo que más contraste da (el cruce WCAG real está en luminancia ≈ 0,179, no en luz 50 %). */
export function ajustarContraste(bg: H, fg: H, objetivo: number = AA): { color: H; ratio: number; ajustado: boolean } {
  const ratio0 = contrasteAA(bg, fg); if (ratio0 >= objetivo) return { color: fg, ratio: ratio0, ajustado: false };
  const oscuro = contrasteAA(bg, [fg[0], fg[1], 0]) >= contrasteAA(bg, [fg[0], fg[1], 100]);
  const paso = oscuro ? -1 : 1;
  let l = fg[2], i = 0, ratio = ratio0;
  while (ratio < objetivo && i < 100 && l > 0 && l < 100) { l = Math.max(0, Math.min(100, l + paso)); ratio = contrasteAA(bg, [fg[0], fg[1], l]); i += 1; }
  return { color: [fg[0], l <= 4 || l >= 96 ? Math.min(fg[1], 18) : fg[1], l], ratio, ajustado: true };
}
/** Escala φ tipográfica (peldaños φ⁻¹…φ²) en rem. */
export function escalaPhi(base = 1): Record<string, string> {
  const r = (v: number) => `${Math.round(v * 1000) / 1000}rem`;
  return { "fs-phi--1": r(base / PHI), "fs-phi-0": r(base), "fs-phi-1": r(base * PHI), "fs-phi-2": r(base * PHI * PHI) };
}
/** Pares fondo/texto verificados; `true` = crítico (si no ajusta, la propuesta se descarta). */
const PARES: Array<[string, string, boolean]> = [
  ["background-hsl", "foreground-hsl", true], ["card-hsl", "card-foreground-hsl", true], ["popover-hsl", "popover-foreground-hsl", false], ["primary-hsl", "primary-foreground-hsl", true],
  ["secondary-hsl", "secondary-foreground-hsl", false], ["accent-hsl", "accent-foreground-hsl", true], ["muted-hsl", "muted-foreground-hsl", false], ["destructive-hsl", "destructive-foreground-hsl", false],
];
function verificar(vars: Record<string, string>): { vars: Record<string, string>; contrastes: ParContraste[]; fallo?: string } {
  const fijos = { ...vars }, contrastes: ParContraste[] = [];
  let fallo: string | undefined;
  for (const [fondo, texto, critico] of PARES) {
    const bg = hslDeToken(vars[fondo]), fg = hslDeToken(vars[texto]); if (!bg || !fg) continue;
    const a = ajustarContraste(bg, fg);
    fijos[texto] = `${a.color[0]} ${a.color[1]}% ${a.color[2]}%`;
    contrastes.push({ par: texto.replace("-foreground-hsl", ""), ratio: Math.round(a.ratio * 100) / 100, pasa: a.ratio >= AA, ajustado: a.ajustado });
    if (a.ratio < AA && critico) fallo = `${texto} no alcanzó 4,5:1 sobre ${fondo}`;
  }
  return { vars: fijos, contrastes, fallo };
}
interface Plan {
  id: PropuestaRediseno["id"]; nombre: string; motivo: string; cristal: Record<string, string>; material?: string;
  satPrim: number; lPrimario: number; radioRem: number; motion: number;
}
const MOTIVOS: Record<PropuestaRediseno["id"], string> = {
  sobria: "Semilla de la vida en los vacíos, en capa aria-hidden y sutil; radios 12 px.",
  armonica: "Vesica piscis en la superposición de tarjetas; escala φ en la tipografía y rejilla áurea 1:1.618.",
  atrevida: "Espiral áurea que guía al foco (el botón primario); Metatrón como estructura del fondo; neón contenido.",
};
const PLANES: Plan[] = [
  { id: "sobria", nombre: "Sobria", motion: 0.8, satPrim: -25, lPrimario: 56, radioRem: 0.75, cristal: { "glass-blur": "12px", "glass-opacity": "0.85", "glass-frost": "0.4" } },
  { id: "armonica", nombre: "Armónica", motion: 1, satPrim: 0, lPrimario: 58, radioRem: 1.25, material: "ss-crystal", cristal: { "glass-blur": "21px", "glass-opacity": "0.62", "glass-frost": "0.5" } },
  { id: "atrevida", nombre: "Atrevida", motion: 1.4, satPrim: 12, lPrimario: 61, radioRem: 1.618, material: "ss-crystal", cristal: { "glass-blur": "30px", "glass-opacity": "0.45", "glass-frost": "0.3", "neon-glow": "0.4" } },
];
function rolesDe(plan: Plan, e: EntradaRediseno): RoleSet {
  const top = hslDeHex(e.paleta[0]?.color ?? "") ?? hslDeToken(e.temaActual.vars?.["primary-hsl"]) ?? [220, 70, 55];
  const otros = e.paleta.slice(1).map((c) => hslDeHex(c.color)).filter((h): h is H => h !== null).map((h) => h[0]);
  const hue = top[0], claro = e.modo === "claro";
  const sP = Math.max(20, Math.min(95, top[1] + (claro ? plan.satPrim - 8 : plan.satPrim)));
  const hueA = otros.find((h) => Math.abs(h - hue) > 18) ?? (hue + 26) % 360;
  const hueS = otros.find((h) => Math.abs(h - hue) > 18 && Math.abs(h - hueA) > 18) ?? (hueA + 26) % 360;
  return {
    bg: [hue, claro ? 34 : 40, claro ? 96 : 9], fg: [hue, 14, claro ? 13 : 94], card: [hue, claro ? 22 : 30, claro ? 99 : 14], primary: [hue, sP, claro ? plan.lPrimario - 16 : plan.lPrimario],
    secondary: [hueS, Math.max(22, Math.min(70, top[1])), claro ? 40 : 58], accent: [hueA, Math.max(30, Math.min(90, top[1])), claro ? 40 : 64], border: [hue, 16, claro ? 84 : 22],
  };
}
function propuesta(plan: Plan, e: EntradaRediseno): PropuestaRediseno {
  const ver = verificar({ ...e.temaActual.vars, ...roleVars(rolesDe(plan, e)) });
  const tokens: ThemeTokens = {
    vars: { ...ver.vars, ...plan.cristal, ...escalaPhi(1), radius: `${plan.radioRem}rem` },
    materialClass: plan.material ?? e.temaActual.materialClass, background: e.temaActual.background, motion: plan.motion, // el set de fondo queda intacto
  };
  return { id: plan.id, nombre: plan.nombre, motivo: MOTIVOS[plan.id], tokens, contrastes: ver.contrastes, descartada: ver.fallo };
}
/** Tres propuestas de rediseño adaptadas al fondo (sobria, armónica, atrevida), con motivo y AA verificado. */
export function propuestasDesdeFondo(e: EntradaRediseno): PropuestaRediseno[] { return PLANES.map((plan) => propuesta(plan, e)); }
/** Pedido al Director de diseño (architecture/director-diseno.md); los gustos privados solo viajan si corre en una neurona de la persona. */
export function pedidoParaIA(e: { paleta: ColorPaleta[]; modo: ModoTema; adn?: AdnDiseno; propuestas?: PropuestaRediseno[] }): string {
  const colores = e.paleta.map((c) => `${c.color} (${Math.round(c.peso * 100)} %)`).join(", ") || "sin paleta recogida";
  const privados = e.adn?.neuronaPropia === true ? (e.adn?.gustosPrivados ?? []) : [];
  const gustos = `Memoria de gustos compartida: ${(e.adn?.gustosPublicos ?? []).join("; ") || "(sin gustos anotados)"}.`;
  const lineas = [
    "Elige un rediseño para una página o perfil sobre un fondo " + e.modo + ".",
    `Paleta del fondo: ${colores}. Entrega tres propuestas de tokens de tema (sobria, armónica y atrevida),`,
    "cada una con superficies translúcidas que dejen ver el fondo, acentos de la paleta,",
    "la escala φ (armonia.md) y su motivo de geometría sagrada.",
    `ADN de diseño: ${e.adn?.identidad ?? "starseed-os"}.`, gustos,
    ...(privados.length > 0 ? [`Gustos privados (solo esta neurona de la persona): ${privados.join("; ")}.`] : []),
    "Guardas: contraste AA ≥ 4,5:1, dianas ≥ 44 px, no ocultar ni desactivar controles esenciales, todo deshacible.",
  ];
  if (e.propuestas?.length) lineas.push(`Propuestas ya generadas: ${e.propuestas.map((p) => p.nombre).join(", ")}.`);
  return lineas.join("\n");
}
