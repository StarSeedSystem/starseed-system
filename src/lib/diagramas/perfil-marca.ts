// Perfil de marca de los diagramas a partir del tema activo (perfil, página o
// grupo) y de la paleta de su fondo. Basado en la skill MIT diagram-design:
// references/style-guide.md (roles, tipografías, trazos y contrato de contraste)
// y references/profiles.md (cabecera del perfil activo). Contrato:
// architecture/diagramas.md §3 y architecture/fondos-shaders.md §4.
// PURO: sin red, sin disco y sin navegador.

import type { ThemeTokens } from "@/lib/design/theme-engine";

export type ModoPerfil = "claro" | "oscuro";

export interface TextoToken {
  family: string;
  size: string;
  weight: number;
}

export interface TipografiaPerfil {
  /** Fuente servida por el OS (nunca Google Fonts en tiempo de uso). */
  fuente: "sistema";
  title: TextoToken;
  nodeName: TextoToken;
  sublabel: TextoToken;
  eyebrow: TextoToken;
  arrowLabel: TextoToken;
  callout: TextoToken;
}

export interface TrazosPerfil {
  thin: number;
  default: number;
  strong: number;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  grid: number;
}

export interface ContrastePerfil {
  accent: number;
  soft: number;
  link: number;
  muted: number;
  cumpleAA: boolean;
}

export interface PerfilMarca {
  nombre: string;
  slug: string;
  fuenteUrl?: string;
  notas?: string;
  creado?: string;
  actualizado?: string;
  modo: ModoPerfil;
  paper: string;
  paper2: string;
  ink: string;
  inkStrong: string;
  muted: string;
  soft: string;
  rule: string;
  ruleSolid: string;
  accent: string;
  accentTint: string;
  link: string;
  tipografia: TipografiaPerfil;
  trazos: TrazosPerfil;
  contraste: ContrastePerfil;
}

interface Hsl { h: number; s: number; l: number }
interface Rgb { r: number; g: number; b: number }

const SERIF = "'Instrument Serif', 'Noto Serif', Georgia, serif";
const SANS = "'Geist', system-ui, sans-serif";
const MONO = "'Geist Mono', ui-monospace, monospace";

const TRAZOS: TrazosPerfil = {
  thin: 0.8,
  default: 1,
  strong: 1.2,
  radiusSm: 4,
  radiusMd: 6,
  radiusLg: 8,
  grid: 4,
};

const TIPOGRAFIA: TipografiaPerfil = {
  fuente: "sistema",
  title: { family: SERIF, size: "1.75rem", weight: 400 },
  nodeName: { family: SANS, size: "12px", weight: 600 },
  sublabel: { family: MONO, size: "9px", weight: 400 },
  eyebrow: { family: MONO, size: "8px", weight: 500 },
  arrowLabel: { family: MONO, size: "8px", weight: 400 },
  callout: { family: SERIF, size: "14px", weight: 400 },
};

const limitar = (n: number, min = 0, max = 100): number => Math.min(max, Math.max(min, n));

function aRgb(c: Hsl): Rgb {
  const s = c.s / 100;
  const l = c.l / 100;
  const k = (n: number) => (n + c.h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const dos = (n: number): string => Math.round(n).toString(16).padStart(2, "0");

const aHex = (c: Rgb): string => `#${dos(c.r)}${dos(c.g)}${dos(c.b)}`;

const rgba = (c: Rgb, alfa: number): string => `rgba(${c.r}, ${c.g}, ${c.b}, ${alfa})`;

function rgbAHsl(valor: string): Hsl | null {
  const m = valor.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (!m) return null;
  const [r, g, b] = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

function hslDeValor(valor: string | undefined): Hsl | null {
  if (!valor) return null;
  const v = valor.trim();
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let d = hex[1];
    if (d.length === 3 || d.length === 4) d = d.split("").map((x) => x + x).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16));
    return rgbAHsl(`rgb(${r}, ${g}, ${b})`);
  }
  const m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (m) return { h: Number(m[1]) % 360, s: limitar(Number(m[2])), l: limitar(Number(m[3])) };
  const t = v.match(/^([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%$/i);
  if (t) return { h: Number(t[1]) % 360, s: limitar(Number(t[2])), l: limitar(Number(t[3])) };
  return rgbAHsl(v);
}

function luminancia(c: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contraste(a: Rgb, b: Rgb): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Ajusta la luminosidad al mínimo cambio que alcanza el mínimo AA pedido. */
function ajustarAA(base: Hsl, fondo: Hsl, minimo = 4.5): { color: Hsl; ratio: number } {
  const fr = aRgb(fondo);
  let ratio = contraste(aRgb(base), fr);
  if (ratio >= minimo) return { color: base, ratio: Number(ratio.toFixed(2)) };
  let mejor: Hsl = base;
  for (let paso = 1; paso <= 100; paso += 1) {
    for (const dir of [-1, 1]) {
      const l = base.l + dir * paso;
      if (l < 0 || l > 100) continue;
      const candidato = { ...base, l };
      const r = contraste(aRgb(candidato), fr);
      if (r > ratio) {
        ratio = r;
        mejor = candidato;
      }
      if (r >= minimo) return { color: candidato, ratio: Number(r.toFixed(2)) };
    }
  }
  return { color: mejor, ratio: Number(ratio.toFixed(2)) };
}

function buscarVar(vars: Record<string, string>, ...nombres: string[]): string | undefined {
  for (const nombre of nombres) {
    const v = vars[nombre] ?? vars[`${nombre}-hsl`];
    if (v) return v;
  }
  return undefined;
}

function coloresDeFondo(paleta: readonly string[]): Hsl[] {
  return paleta.map((c) => hslDeValor(c)).filter((c): c is Hsl => c !== null);
}

function papelDeFondo(paleta: readonly string[], claro: boolean): Hsl | null {
  const cols = coloresDeFondo(paleta);
  if (!cols.length) return null;
  return cols.reduce((a, b) => (claro ? (b.l > a.l ? b : a) : (b.l < a.l ? b : a)));
}

function acentoDeFondo(paleta: readonly string[]): Hsl | null {
  const cols = coloresDeFondo(paleta).filter((c) => c.l > 12 && c.l < 92);
  if (!cols.length) return null;
  const croma = (c: Hsl) => c.s * (1 - Math.abs(c.l - 55) / 100);
  return cols.reduce((a, b) => (croma(b) > croma(a) ? b : a));
}

function normalizarSlug(valor: string): string {
  const limpio = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return limpio || "perfil";
}

export function perfilDesdeTema(
  tokens: ThemeTokens,
  modo: ModoPerfil,
  paletaFondo?: readonly string[],
): PerfilMarca {
  const vars = tokens.vars ?? {};
  const claro = modo === "claro";
  const fondo = hslDeValor(buscarVar(vars, "background-hsl", "background", "bg"))
    ?? (claro ? { h: 45, s: 8, l: 96 } : { h: 222, s: 17, l: 19 });
  const tinta = hslDeValor(buscarVar(vars, "foreground-hsl", "foreground", "fg"))
    ?? (claro ? { h: 222, s: 17, l: 19 } : { h: 45, s: 8, l: 96 });
  const acentoBase = hslDeValor(buscarVar(vars, "accent-hsl", "accent", "primary-hsl", "primary"))
    ?? (claro ? { h: 16, s: 71, l: 44 } : { h: 20, s: 85, l: 64 });

  // El fondo manda cuando existe: de su paleta salen el papel y el acento.
  const papel = (paletaFondo && papelDeFondo(paletaFondo, claro)) || fondo;
  const acentoCrudo = (paletaFondo && acentoDeFondo(paletaFondo)) || acentoBase;
  const ring = hslDeValor(buscarVar(vars, "ring-hsl", "ring"));
  const enlaceBase = hslDeValor(buscarVar(vars, "link-hsl", "link"))
    ?? (ring && Math.abs(ring.h - acentoCrudo.h) > 30
      ? ring
      : { h: 216, s: 55, l: claro ? 36 : 70 });

  const paper2 = { ...papel, l: limitar(papel.l + (claro ? -4 : 4)) };
  const ink = ajustarAA({ ...tinta, s: Math.min(tinta.s, 24) }, papel);
  const muted = ajustarAA(
    { h: ink.color.h, s: Math.min(ink.color.s, 18), l: ink.color.l + (claro ? 22 : -22) },
    papel,
  );
  const soft = ajustarAA(
    { h: ink.color.h, s: Math.min(ink.color.s, 14), l: ink.color.l + (claro ? 34 : -34) },
    papel,
  );
  const accent = ajustarAA(acentoCrudo, papel);
  const link = ajustarAA(enlaceBase, papel);

  const inkRgb = aRgb(ink.color);
  const accentRgb = aRgb(accent.color);
  const mutedRgb = aRgb(muted.color);
  const inkStrong = contraste({ r: 17, g: 17, b: 17 }, accentRgb) >= 4.5 ? "#111111" : "#f5f5f5";
  const ratio = {
    accent: accent.ratio,
    soft: soft.ratio,
    link: link.ratio,
    muted: muted.ratio,
  };

  return {
    nombre: paletaFondo?.length ? `Tema ${modo} con fondo` : `Tema ${modo}`,
    slug: normalizarSlug(`tema-${modo}${paletaFondo?.length ? "-fondo" : ""}`),
    modo,
    paper: aHex(aRgb(papel)),
    paper2: aHex(aRgb(paper2)),
    ink: aHex(inkRgb),
    inkStrong,
    muted: aHex(mutedRgb),
    soft: aHex(aRgb(soft.color)),
    rule: rgba(inkRgb, 0.12),
    ruleSolid: aHex(mutedRgb),
    accent: aHex(accentRgb),
    accentTint: rgba(accentRgb, claro ? 0.08 : 0.1),
    link: aHex(aRgb(link.color)),
    tipografia: {
      ...TIPOGRAFIA,
      nodeName: {
        ...TIPOGRAFIA.nodeName,
        family: tokens.fontFamily ? `${tokens.fontFamily}, ${SANS}` : SANS,
      },
    },
    trazos: { ...TRAZOS },
    contraste: {
      ...ratio,
      cumpleAA: Object.values(ratio).every((r) => r >= 4.5),
    },
  };
}

function limpiarValor(valor: string | undefined, respaldo = "none"): string {
  const v = (valor ?? "").replace(/[\r\n]+/g, " ").replace(/--+/g, "-").trim();
  return v || respaldo;
}

function fechaValida(valor: string | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? null : valor;
}

/**
 * Cabecera del perfil activo con el formato de references/profiles.md.
 * Se antepone al cuerpo de la guía de estilo; no reescribe el cuerpo.
 */
export function bloquePerfil(perfil: PerfilMarca): string {
  const nombre = limpiarValor(perfil.nombre, "Perfil sin nombre");
  const slug = normalizarSlug(perfil.slug || nombre);
  const creado = fechaValida(perfil.creado) ?? new Date().toISOString().slice(0, 10);
  const actualizado = fechaValida(perfil.actualizado) ?? creado;
  const lineas = [
    "<!-- diagram-design-profile",
    `name: ${nombre}`,
    `slug: ${slug}`,
    `source-url: ${limpiarValor(perfil.fuenteUrl)}`,
    `created: ${creado}`,
    `updated: ${actualizado}`,
    `notes: ${limpiarValor(perfil.notas)}`,
    "-->",
  ];
  return `${lineas.join("\n")}\n`;
}
