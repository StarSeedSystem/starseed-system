/** Rediseño desde el fondo (Ola 1018F · tarea L) · architecture/fondos-shaders.md §4.
 * Tres propuestas de tokens a partir de la paleta del fondo. Módulo PURO: sin red,
 * disco, DOM ni aleatoriedad. La escala φ replica la tabla de memory/diseno/armonia.md
 * (armonia.ts es de servidor porque importa node:fs y no se puede traer al cliente). */
import { esHexColor, luminanciaDe, normalizarHex, type EntradaPaleta } from "./paleta-fondo";
import type { ThemeTokens } from "./theme-engine";
export type NombrePropuesta = "sobria" | "armonica" | "atrevida";
export type ModoRediseno = "claro" | "oscuro";
export interface AdnDiseno { identidad?: string; prompt?: string; prohibiciones?: readonly string[]; registroMovimiento?: string }
export type EntradaAdn = AdnDiseno | string | null | undefined;
export interface EntradaRediseno { paleta: readonly (EntradaPaleta | string)[]; temaActual: ThemeTokens; modo: ModoRediseno; adn?: EntradaAdn }
export interface ContrastePropuesta { texto: number; textoSuave: number; acento: number }
export interface PropuestaRediseno { nombre: NombrePropuesta; tokens: ThemeTokens; motivo: string; contraste: ContrastePropuesta }
export interface EntradaPedidoIA { propuestas: readonly PropuestaRediseno[]; paleta?: readonly (EntradaPaleta | string)[]; adn?: EntradaAdn; modo?: ModoRediseno; alcance?: string; correEnNeuronaPropia: boolean; gustos?: { publicos?: readonly string[]; privados?: readonly string[] }; fondo?: string }
export interface PedidoIA { rol: "director-diseno"; brief: string; memoriaGustos: string[]; privacidad: "neurona-propia" | "solo-contexto-compartido"; propuestas: Array<{ nombre: NombrePropuesta; motivo: string; tokens: ThemeTokens }>; habilidades: string[]; verificacion: string[] }
const PHI = 1.618, BLANCO = "#f8f9fa", NEGRO = "#0b0f14";
const ESCALA_PHI: Record<string, string> = { "fs-phi--2": "0.382rem", "fs-phi--1": "0.618rem", "fs-phi-1": "1.618rem", "fs-phi-2": "2.618rem", "fs-phi-3": "4.236rem", "fs-phi-4": "6.854rem" };
interface Spec { nombre: NombrePropuesta; alfa: number; tinte: number; radio: string; motion: number; acentos: number }
const SPECS: readonly Spec[] = [
  { nombre: "sobria", alfa: 0.62, tinte: 0.06, radio: "0.618rem", motion: 0.5, acentos: 1 },
  { nombre: "armonica", alfa: 0.48, tinte: 0.16, radio: "1rem", motion: 0.9, acentos: 2 },
  { nombre: "atrevida", alfa: 0.34, tinte: 0.3, radio: "1.618rem", motion: 1.4, acentos: 3 },
];
type Triple = [number, number, number];
const rgbDe = (hex: string): Triple => { const h = normalizarHex(hex).slice(1); return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Triple };
const hexDe = (rgb: readonly number[]): string => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mezcla = (a: string, b: string, t: number): string => { const A = rgbDe(a), B = rgbDe(b); return hexDe(A.map((v, i) => v + (B[i] - v) * t)) };
const contraste = (a: string, b: string): number => { const x = luminanciaDe(a), y = luminanciaDe(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 };
const rgbaDe = (hex: string, alfa: number): string => { const [r, g, b] = rgbDe(hex); return `rgba(${r}, ${g}, ${b}, ${Math.round(alfa * 100) / 100})` };
function hslAHex(valor?: string): string | null {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec((valor ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100, k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l), f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hexDe([f(0), f(8), f(4)].map((v) => v * 255));
}
function hexAHsl(hex: string): string {
  const [r, g, b] = rgbDe(hex).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${Math.round((h * 60 + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}const saturacionDe = (hex: string): number => { const [r, g, b] = rgbDe(hex).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max };
function paletaNormalizada(paleta: readonly (EntradaPaleta | string)[]): EntradaPaleta[] {
  const mapa = new Map<string, number>();   for (const e of paleta) { const color = typeof e === "string" ? e : e.color; if (!esHexColor(color)) continue; const hex = normalizarHex(color); mapa.set(hex, (mapa.get(hex) ?? 0) + (typeof e === "string" ? 1 : Math.max(0, e.peso))) }
  return [...mapa].map(([color, peso]) => ({ color, peso })).sort((a, b) => b.peso - a.peso || luminanciaDe(b.color) - luminanciaDe(a.color));
}
function ajustarAA(texto: string, superficie: string, minimo = 4.5): { color: string; ratio: number } {
  let mejor = texto, ratio = contraste(texto, superficie); if (ratio >= minimo) return { color: mejor, ratio };
  const hacia = luminanciaDe(superficie) > 0.35 ? NEGRO : BLANCO;
  for (let paso = 1; paso <= 20; paso++) { const cand = mezcla(texto, hacia, paso / 20), r = contraste(cand, superficie); if (r > ratio) { mejor = cand; ratio = r } if (r >= minimo) return { color: cand, ratio: r } }
  return { color: mejor, ratio };
}
function fondoBase(paleta: readonly (EntradaPaleta | string)[], modo: ModoRediseno, temaActual: ThemeTokens): string {
  const orden = paletaNormalizada(paleta); let base = orden[0]?.color ?? hslAHex(temaActual.vars["background-hsl"]) ?? (modo === "oscuro" ? "#0a0f1d" : "#f8f9fa");
  for (let i = 0; i < 16; i++) { const l = luminanciaDe(base); if (modo === "oscuro" && l > 0.1) base = mezcla(base, "#000000", 0.25); else if (modo === "claro" && l < 0.8) base = mezcla(base, "#ffffff", 0.25); else break }
  return base;
}
function acentosDe(paleta: EntradaPaleta[], base: string, temaActual: ThemeTokens, n: number): string[] {
  const orden = [...paleta].sort((a, b) => saturacionDe(b.color) - saturacionDe(a.color) || b.peso - a.peso).map((e) => e.color).filter((c) => c !== base); const deTema = [hslAHex(temaActual.vars["primary-hsl"]), hslAHex(temaActual.vars["accent-hsl"])].filter((c): c is string => Boolean(c));
  return [...new Set([...orden, ...deTema, "#007fff", "#10b981", "#ffbf00"])].slice(0, Math.max(1, n));
}
const adnDe = (adn: EntradaAdn): AdnDiseno => typeof adn === "string" ? { identidad: adn } : (adn ?? {});
export function propuestasDesdeFondo(entrada: EntradaRediseno): PropuestaRediseno[] {
  const paleta = paletaNormalizada(entrada.paleta), base = fondoBase(entrada.paleta, entrada.modo, entrada.temaActual), adn = adnDe(entrada.adn);
  const salida: PropuestaRediseno[] = [];
  for (const spec of SPECS) {
    const acentos = acentosDe(paleta, base, entrada.temaActual, spec.acentos); const superficie = mezcla(base, acentos[0], spec.tinte), efectiva = mezcla(base, superficie, spec.alfa);
    const tinta = luminanciaDe(efectiva) > 0.35 ? NEGRO : BLANCO; const texto = ajustarAA(tinta, efectiva), suave = ajustarAA(mezcla(tinta, efectiva, 0.35), efectiva), acentoAA = ajustarAA(acentos[0], efectiva, 3);
    if (texto.ratio < 4.5 || suave.ratio < 4.5) continue;
    const acentoFinal = acentoAA.color, tintaAcento = ajustarAA(luminanciaDe(acentoFinal) > 0.4 ? NEGRO : BLANCO, acentoFinal);
    const segundo = acentos[1] ?? acentoFinal, tintaSegundo = ajustarAA(luminanciaDe(segundo) > 0.4 ? NEGRO : BLANCO, segundo);
    const factor = adn.registroMovimiento === "sobrio" ? 0.7 : adn.registroMovimiento === "experimental" ? 1.3 : 1;; const motion = Math.round(Math.min(2, spec.motion * factor) * 100) / 100;
    salida.push({ nombre: spec.nombre, tokens: {
        ...entrada.temaActual, materialClass: "ss-crystal", motion,
        vars: {
          ...entrada.temaActual.vars, ...ESCALA_PHI,
          "background-hsl": hexAHsl(base), "foreground-hsl": hexAHsl(texto.color),
          "card-hsl": hexAHsl(efectiva), "card-foreground-hsl": hexAHsl(texto.color),
          "popover-hsl": hexAHsl(efectiva), "popover-foreground-hsl": hexAHsl(texto.color),
          "primary-hsl": hexAHsl(acentoFinal), "primary-foreground-hsl": hexAHsl(tintaAcento.color),
          "accent-hsl": hexAHsl(segundo), "accent-foreground-hsl": hexAHsl(tintaSegundo.color),
          "muted-hsl": hexAHsl(mezcla(efectiva, base, 0.35)), "muted-foreground-hsl": hexAHsl(suave.color),
          "border-hsl": hexAHsl(mezcla(efectiva, texto.color, 0.18)), "ring-hsl": hexAHsl(acentoFinal),
          "rediseno-superficie": rgbaDe(superficie, spec.alfa),
          "rediseno-superficie-fuerte": rgbaDe(superficie, Math.min(0.92, spec.alfa + 0.22)),
          "rediseno-radio": spec.radio, "rediseno-modo": entrada.modo, "rediseno-escala": `phi ${PHI}`,
        },
      },
      contraste: { texto: texto.ratio, textoSuave: suave.ratio, acento: acentoAA.ratio },
      motivo: `${spec.nombre[0].toUpperCase()}${spec.nombre.slice(1)}: cristal al ${Math.round(spec.alfa * 100)} % sobre ${base}, acentos ${acentos.slice(0, spec.acentos).join(" y ")}; texto ${texto.ratio}:1 y suave ${suave.ratio}:1; radio ${spec.radio} y escala φ.${adn.identidad ? ` Alineada con el ADN «${adn.identidad}».` : ""}`,
    });
  }
  return salida;
}
export function pedidoParaIA(entrada: EntradaPedidoIA): PedidoIA {
  const adn = adnDe(entrada.adn);
  const publicos = (entrada.gustos?.publicos ?? []).map((g) => g.trim()).filter(Boolean);
  const privados = entrada.correEnNeuronaPropia ? (entrada.gustos?.privados ?? []).map((g) => g.trim()).filter(Boolean) : [];
  const memoriaGustos = [...new Set([...publicos, ...privados])].slice(0, 12);
  const privacidad = entrada.correEnNeuronaPropia ? "neurona-propia" : "solo-contexto-compartido";
  const colores = paletaNormalizada(entrada.paleta ?? []).map((e) => e.color).slice(0, 6);
  const alcance = (entrada.alcance ?? "perfil").trim() || "perfil";
  const propuestas = entrada.propuestas.map((p) => ({ nombre: p.nombre, motivo: p.motivo, tokens: p.tokens }));
  const prohibiciones = (adn.prohibiciones ?? []).map((p) => p.trim()).filter(Boolean).join("; ");
  const brief = [
    `Rediseño de ${alcance} en modo ${entrada.modo ?? "oscuro"} a partir del fondo ${entrada.fondo ?? "actual"}.`,
    `ADN: ${adn.identidad ?? "el del contexto"}.${adn.prompt ? ` ${adn.prompt.trim().slice(0, 240)}` : ""}`,
    prohibiciones ? `Prohibiciones del ADN: ${prohibiciones.slice(0, 240)}.` : "",
    `Paleta del fondo: ${colores.length ? colores.join(", ") : "sin colores medidos; usar el tema actual"}.`,
    `Propuestas: ${propuestas.map((p) => p.nombre).join(", ")}. El fondo actual sigue siendo la opción principal.`,
    privacidad === "neurona-propia" ? "La memoria de gustos privada se usa porque corre en una neurona de la persona." : "No se envía memoria privada: este contexto no corre en una neurona de la persona.",
    "Guardas: no ocultar ni desactivar controles esenciales; contraste AA ≥ 4,5; dianas ≥ 44 px; comprobar móvil, tablet, escritorio, plegable y TV; siempre se puede deshacer.",
  ].filter(Boolean).join(" ");
  return {
    rol: "director-diseno", brief: brief.slice(0, 2400), memoriaGustos, privacidad, propuestas,
    habilidades: ["design-taste-frontend", "react-components", "shadcn-ui"],
    verificacion: ["contraste texto/superficie ≥ 4,5", "superficies translúcidas que dejan ver el fondo", "escala φ y espaciado Fibonacci", "sin controles ocultos ni desactivados"],
  };
}
