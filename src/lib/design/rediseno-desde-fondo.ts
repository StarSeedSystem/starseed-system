import type { ThemeTokens } from "./theme-engine";
import { esHexColor, luminanciaDe, normalizarHex, type EntradaPaleta } from "./paleta-fondo";

/** Rediseño sugerido por Astraura (Ola 1018F, tarea L) · contrato en
 *  architecture/fondos-shaders.md §4: tres propuestas de tokens para que la
 *  página o el perfil acompañen al fondo, con contraste AA verificado.
 *  Módulo PURO: sin red, sin disco, sin DOM y determinista. */

export type ModoRediseno = "claro" | "oscuro";
export type AmbitoRediseno = "neurona-privada" | "compartido";

export interface AdnDiseno {
  nombre?: string;
  alma?: { una_linea?: string; adjetivos?: string[]; energia?: Record<string, number> };
  firmas?: Array<{ jugada: string; como?: string }>;
  prohibiciones?: string[];
}

export interface EntradaRediseno {
  paleta: EntradaPaleta[];
  temaActual: ThemeTokens;
  modo: ModoRediseno;
  adn?: AdnDiseno | null;
}

export interface PropuestaRediseno {
  id: "sobria" | "armonica" | "atrevida";
  nombre: string;
  motivo: string;
  tokens: ThemeTokens;
  contraste: number;
  ajustada: boolean;
  descartada: boolean;
}

export interface EntradaPedido extends EntradaRediseno {
  ambito: AmbitoRediseno;
  gustosPrivados?: string[];
  gustosCompartidos?: string[];
  propuestas?: PropuestaRediseno[];
}

export interface PedidoDiseno {
  rol: "director-diseno";
  intencion: string;
  contexto: { modo: ModoRediseno; colores: string[]; adn: string };
  propuestas: Array<Pick<PropuestaRediseno, "id" | "nombre" | "motivo" | "contraste" | "descartada">>;
  memoriaGustos: { gustos: string[]; privacidad: "neurona-propia" | "solo-compartido"; nota: string };
  guardas: string[];
  formatoSalida: string;
}

interface Hsl { h: number; s: number; l: number }
interface Perfil {
  id: PropuestaRediseno["id"];
  nombre: string;
  idea: string;
  opacidad: number;
  blur: number;
  radio: string;
  motion: number;
  matiz: number;
}

const PHI = 1.6180339887;
const ANGULO_AUREO = 137.507764;

const hsl = (c: Hsl, a?: number): string =>
  `${Math.round(c.h)} ${Math.round(c.s)}% ${Math.round(c.l)}%${a === undefined ? "" : ` / ${Math.round(a * 100) / 100}`}`;

function desdeHex(hex: string): Hsl {
  const n = normalizarHex(hex).slice(1);
  const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(...v), min = Math.min(...v), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === v[0] ? 60 * (((v[1] - v[2]) / d) % 6) : max === v[1] ? 60 * ((v[2] - v[0]) / d + 2) : 60 * ((v[0] - v[1]) / d + 4);
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

function aHex(c: Hsl): string {
  const l = c.l / 100, s = c.s / 100, a = s * Math.min(l, 1 - l);
  const k = (n: number): number => (n + c.h / 30) % 12;
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const parsear = (v: string | undefined): Hsl | null => {
  const m = v ? /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(v) : null;
  return m ? { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) } : null;
};

const contraste = (a: Hsl, b: Hsl): number => {
  const [x, y] = [luminanciaDe(aHex(a)), luminanciaDe(aHex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

function mezcla(base: Hsl, capa: Hsl, alfa: number): Hsl {
  const [a, b] = [aHex(base).slice(1), aHex(capa).slice(1)];
  const canal = (i: number): string =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - alfa) + parseInt(b.slice(i, i + 2), 16) * alfa)
      .toString(16).padStart(2, "0");
  return desdeHex(`#${[0, 2, 4].map(canal).join("")}`);
}

function ajustar(fondo: Hsl, texto: Hsl): { texto: Hsl; razon: number; cambiado: boolean } {
  let actual = texto, razon = contraste(fondo, actual);
  if (razon >= 4.5) return { texto, razon, cambiado: false };
  const oscuro = contraste(fondo, { h: 0, s: 0, l: 0 }) >= contraste(fondo, { h: 0, s: 0, l: 100 });
  for (let i = 1; i <= 100 && razon < 4.5; i++) {
    actual = { ...texto, l: texto.l + ((oscuro ? 0 : 100) - texto.l) * (i / 100) };
    razon = contraste(fondo, actual);
  }
  if (razon < 4.5) { actual = { h: texto.h, s: 0, l: oscuro ? 0 : 100 }; razon = contraste(fondo, actual); }
  return { texto: actual, razon, cambiado: true };
}

const tinte = (base: Hsl, acento: Hsl, cantidad: number): Hsl => ({
  h: acento.h,
  s: Math.min(100, base.s + (acento.s - base.s) * cantidad + 10 * cantidad),
  l: base.l + (acento.l - base.l) * cantidad * 0.3,
});

const rgb = (c: Hsl): string => {
  const h = aHex(c).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
};

const textoBase = (c: Hsl): Hsl => ({ h: c.h, s: 12, l: c.l > 55 ? 10 : 98 });

function coloresDe(paleta: EntradaPaleta[], actual: ThemeTokens, modo: ModoRediseno): { base: Hsl; acentos: Hsl[] } {
  const orden = paleta.filter((e) => esHexColor(e.color))
    .map((e) => ({ c: desdeHex(e.color), peso: e.peso }))
    .sort((a, b) => b.peso - a.peso);
  const semilla = orden.length
    ? (modo === "oscuro"
      ? orden.slice(0, 3).reduce((a, b) => (a.c.l <= b.c.l ? a : b)).c
      : orden.slice(0, 3).reduce((a, b) => (a.c.l >= b.c.l ? a : b)).c)
    : (parsear(actual.vars?.["background-hsl"]) ?? { h: modo === "oscuro" ? 260 : 45, s: 30, l: modo === "oscuro" ? 8 : 96 });
  const base: Hsl = {
    h: semilla.h,
    s: Math.min(semilla.s, 30),
    l: modo === "oscuro" ? Math.min(semilla.l, 20) : Math.max(semilla.l, 92),
  };
  const acentos = orden.map((e) => e.c).filter((c) => contraste(aHex(c), aHex(base)) > 1.2).slice(0, 3);
  while (acentos.length < 3) {
    const ref = acentos[0] ?? semilla;
    acentos.push({
      h: (ref.h + ANGULO_AUREO * (acentos.length + 1)) % 360,
      s: Math.max(45, Math.min(90, ref.s)),
      l: modo === "oscuro" ? 68 : 44,
    });
  }
  return { base, acentos };
}

const PERFILES: Perfil[] = [
  { id: "sobria", nombre: "Sobria", idea: "Rejilla áurea y vesica piscis contenida: superficies casi opacas y un solo acento para que el fondo se intuya sin competir con la lectura.", opacidad: 0.78, blur: 18, radio: "0.75rem", motion: 0.5, matiz: 0.12 },
  { id: "armonica", nombre: "Armónica", idea: "Espiral áurea y flor de la vida: superficies de cristal medio, acentos repartidos y movimiento sereno que acompaña sin distraer.", opacidad: 0.58, blur: 26, radio: "1.25rem", motion: 1, matiz: 0.24 },
  { id: "atrevida", nombre: "Atrevida", idea: "Metatrón y sólidos platónicos: cristal profundo, acentos vivos y una curva más enérgica para que el fondo y la interfaz compartan protagonismo.", opacidad: 0.42, blur: 34, radio: "2rem", motion: 1.45, matiz: 0.4 },
];

function construir(p: Perfil, entrada: EntradaRediseno): PropuestaRediseno {
  const { base, acentos } = coloresDe(entrada.paleta, entrada.temaActual, entrada.modo);
  const [primario, secundario, acento] = acentos;
  const superficie = tinte(base, primario, p.matiz);
  const efectiva = mezcla(base, superficie, p.opacidad);
  const tenue = mezcla(base, tinte(base, secundario, p.matiz), Math.min(0.9, p.opacidad * 0.7));
  const textos = [
    ajustar(base, textoBase(base)),
    ajustar(efectiva, textoBase(efectiva)),
    ajustar(primario, textoBase(primario)),
    ajustar(secundario, textoBase(secundario)),
    ajustar(acento, textoBase(acento)),
    ajustar(tenue, textoBase(tenue)),
  ];
  const [texto, textoSuperficie, textoPrimario, textoSecundario, textoAcento, textoTenue] = textos;
  const contrasteMin = Math.min(...textos.map((x) => x.razon));
  const adjetivo = entrada.adn?.alma?.adjetivos?.[0];
  const motivo = `${p.idea} Superficies al ${Math.round(p.opacidad * 100)} % de opacidad, escala φ y acentos de la paleta.${adjetivo ? ` ADN: ${adjetivo}.` : ""}`;
  return {
    id: p.id,
    nombre: p.nombre,
    motivo,
    contraste: Math.round(contrasteMin * 100) / 100,
    ajustada: textos.some((x) => x.cambiado),
    descartada: contrasteMin < 4.5,
    tokens: {
      vars: {
        "background-hsl": hsl(base),
        "foreground-hsl": hsl(texto.texto),
        "card-hsl": hsl(superficie, p.opacidad),
        "card-foreground-hsl": hsl(textoSuperficie.texto),
        "popover-hsl": hsl(superficie, p.opacidad),
        "popover-foreground-hsl": hsl(textoSuperficie.texto),
        "primary-hsl": hsl(primario),
        "primary-foreground-hsl": hsl(textoPrimario.texto),
        "primary-rgb": rgb(primario),
        "secondary-hsl": hsl(secundario),
        "secondary-foreground-hsl": hsl(textoSecundario.texto),
        "accent-hsl": hsl(acento),
        "accent-foreground-hsl": hsl(textoAcento.texto),
        "muted-hsl": hsl(tenue, Math.min(0.9, p.opacidad * 0.7)),
        "muted-foreground-hsl": hsl(textoTenue.texto),
        "border-hsl": hsl(mezcla(base, primario, 0.25)),
        "input-hsl": hsl(mezcla(base, primario, 0.25)),
        "ring-hsl": hsl(acento),
        "glass-opacity": String(p.opacidad),
        "glass-blur": `${p.blur}px`,
        "glass-refraction": String(Math.round(p.matiz * 100) / 100),
        radius: p.radio,
        phi: String(PHI),
        "fs-phi--1": `${Math.pow(PHI, -1).toFixed(3)}rem`,
        "fs-phi-0": "1rem",
        "fs-phi-1": `${Math.pow(PHI, 1).toFixed(3)}rem`,
        "fs-phi-2": `${Math.pow(PHI, 2).toFixed(3)}rem`,
        "fs-phi-3": `${Math.pow(PHI, 3).toFixed(3)}rem`,
      },
      materialClass: "ss-crystal",
      fontFamily: entrada.temaActual.fontFamily,
      motion: p.motion,
    },
  };
}

export function propuestasDesdeFondo(entrada: EntradaRediseno): PropuestaRediseno[] {
  return PERFILES.map((p) => construir(p, entrada));
}

export function pedidoParaIA(_entrada: EntradaPedido): PedidoDiseno {
  throw new Error("pendiente");
}
