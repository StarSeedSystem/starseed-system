/* Rediseño sugerido por Astraura (Ola 1018F · tarea L) · architecture/fondos-shaders.md §4:
 *  tres propuestas de ThemeTokens (theme-engine) desde la paleta del fondo, con superficies
 *  translúcidas, acentos de la paleta, escala φ (armonia.ts) y contraste AA verificado.
 *  PURO y determinista. pedidoParaIA: lo privado solo en neurona de la persona. */
import type { ThemeTokens } from "./theme-engine";
import type { EntradaPaleta } from "./paleta-fondo";
import { luminanciaDe, normalizarHex } from "./paleta-fondo";
/** φ = 1.618 (memory/diseno/armonia.md); alfas translúcidos Fibonacci (13/34/55). */
export const PHI = 1.618;
export const ALFAS = { sobria: 0.13, armonica: 0.34, atrevida: 0.55 } as const;
export type Modo = "claro" | "oscuro";
/** ADN de diseño del Director (misma forma que «AdnDiseno», buscar-referencias.ts). */
export type AdnRediseno = string | string[] | { claves?: string[]; tema?: string; movimiento?: string };
export interface EntradaRediseno { paleta: EntradaPaleta[]; temaActual: ThemeTokens; modo: Modo; adn?: AdnRediseno; }
export interface PropuestaRediseno {
  id: "sobria" | "armonica" | "atrevida"; nombre: string; motivo: string; tokens: ThemeTokens;
  contrasteMinimo: number; contrasteAA: boolean; descartada?: string;
}
export interface GustosDiseno { publicos?: string[]; privados?: string[] }
/** Lo privado (gustos.privados) solo sale si corre en una neurona de la persona. */
export interface ContextoPedido extends EntradaRediseno { gustos?: GustosDiseno; enNeuronaPersonal?: boolean; destino?: "pagina" | "perfil"; }
export interface PedidoDirector { destinatario: "director-diseno"; texto: string; privado: boolean }

interface Perfil { id: PropuestaRediseno["id"]; nombre: string; motivo: string; alfa: number; factor: number; cristal?: boolean }
const PERFILES: Perfil[] = [
  { id: "sobria", nombre: "Sobria", alfa: ALFAS.sobria, factor: 1, motivo: "Velo casi neutro con un toque del acento dominante: el fondo manda y la interfaz no compite." },
  { id: "armonica", nombre: "Armonía", alfa: ALFAS.armonica, factor: PHI, motivo: "Equilibrio a razón φ entre acento y neutro: radios armónicos y jerarquía Fibonacci." },
  { id: "atrevida", nombre: "Atrevida", alfa: ALFAS.atrevida, factor: PHI * PHI, cristal: true, motivo: "Vidrio cristal generoso: el fondo protagonista hasta en los menús y los acentos vivos." },
];
type Canales = [number, number, number];
const FONDO_NEUTRO = { claro: "#eef1f6", oscuro: "#0b0e14" } as const;
const TEXTO = { claro: "#141a24", oscuro: "#f5f6f8" } as const, ACENTO_HUERFANO = "#7c8cf8";
const clamp8 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
export const hexACanales = (hex: string): Canales => { const h = normalizarHex(hex).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Canales; };
export const canalesAHex = (c: Canales): string => `#${c.map((v) => clamp8(v).toString(16).padStart(2, "0")).join("")}`;
/** Superficie translúcida vista por la persona: esmalte al alfa sobre el fondo dominante. */
export const superficieViva = (esmalte: Canales, fondo: Canales, alfa: number): Canales =>
  esmalte.map((v, i) => v * alfa + fondo[i] * (1 - alfa)) as Canales;
const contrasteDe = (a: Canales, b: Canales): number => {
  const [lA, lB] = [a, b].map((c) => luminanciaDe(canalesAHex(c)));
  return Math.round(((Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05)) * 100) / 100;
};
/** Acentos de la paleta: únicos, orden por peso, máximo tres. */
export const acentosDe = (paleta: EntradaPaleta[]): string[] => paleta.filter((e) => e.peso > 0)
  .map((e) => e.color).filter((c, i, l) => l.indexOf(c) === i).slice(0, 3);
/** Contraste AA (§4.4): superficie translúcida con ratio ≥ 4,5 frente al texto; null se descarta. */
export function asegurarContraste(
  esmalte: Canales, fondo: Canales, alfa: number, texto: string, modo: Modo, intentos = 14,
): { esmalte: Canales; superficie: Canales; ratio: number } | null {
  const polos = hexACanales(texto);
  let e: Canales = [...esmalte] as Canales, s = superficieViva(e, fondo, alfa), r = contrasteDe(s, polos);
  for (let quedan = intentos; r < 4.5 && quedan > 0; quedan--) {
    e = (modo === "oscuro" ? e.map((v) => v * 0.86) : e.map((v) => v + (255 - v) * 0.12)) as Canales;
    s = superficieViva(e, fondo, alfa); r = contrasteDe(s, polos);
  }
  e = e.map(clamp8) as Canales; s = superficieViva(e, fondo, alfa); r = contrasteDe(s, polos);
  return r >= 4.5 ? { esmalte: e, superficie: s, ratio: r } : null;
}
const radioDesde = (tema: ThemeTokens, factor: number): string => { const m = /^([\d.]+)(rem|px)$/.exec(tema.vars?.radius ?? "1rem"); return `${((m ? parseFloat(m[1]) : 1) * factor).toFixed(3)}${m ? m[2] : "rem"}`; };
const vidrio = (c: Canales, alfa: number): string => `rgb(${c.map(clamp8).join(" ")} / ${alfa})`;
const textoAdn = (adn?: AdnRediseno): string => typeof adn !== "object" || adn === null ? String(adn ?? "") :
  Array.isArray(adn) ? adn.join("; ") : (adn.claves?.join("; ") ?? [adn.tema, adn.movimiento].filter(Boolean).join("; "));

/** Tres propuestas (sobria, armónica, atrevida) de ThemeTokens desde la paleta del fondo. */
export function propuestasDesdeFondo(entrada: EntradaRediseno): PropuestaRediseno[] {
  const { paleta, temaActual, modo } = entrada;
  const colorBase = paleta.length > 0 && paleta[0].peso > 0 ? normalizarHex(paleta[0].color) : FONDO_NEUTRO[modo];
  const fondo = hexACanales(colorBase), texto = TEXTO[modo];
  const [principal = ACENTO_HUERFANO, secundario = ACENTO_HUERFANO, terciario = secundario] = acentosDe(paleta);
  return PERFILES.map((perfil) => {
    const alfa = perfil.alfa, alfaMenu = Math.round((alfa + 0.21) * 100) / 100;
    const velo = asegurarContraste(fondo, fondo, alfa, texto, modo);
    const tarjeta = asegurarContraste(hexACanales(principal), fondo, alfa, texto, modo);
    const menu = asegurarContraste(hexACanales(secundario), fondo, alfaMenu, texto, modo);
    const ficha = { id: perfil.id, nombre: perfil.nombre, motivo: perfil.motivo };
    if (!velo || !tarjeta || !menu) {
      return { ...ficha, tokens: temaActual, contrasteMinimo: 0, contrasteAA: false,
        descartada: "No alcanza contraste AA 4,5:1 entre texto y superficie; se descarta y se dice por qué." };
    }
    return {
      ...ficha,
      tokens: {
        vars: {
          primary: principal, secondary: secundario, accent: terciario, foreground: texto,
          background: vidrio(velo.esmalte, alfa), card: vidrio(tarjeta.esmalte, alfa),
          popover: vidrio(menu.esmalte, alfaMenu), ring: principal,
          radius: radioDesde(temaActual, perfil.factor),
        },
        fontFamily: temaActual.fontFamily,
        materialClass: perfil.cristal ? "ss-crystal" : temaActual.materialClass,
        motion: perfil.cristal ? 2 : (temaActual.motion ?? 1),
      },
      contrasteMinimo: Math.min(velo.ratio, tarjeta.ratio, menu.ratio), contrasteAA: true,
    };
  });
}

/** Pedido al Director de diseño (director-diseno.md): lo privado solo en neurona propia. */
export function pedidoParaIA(contexto: ContextoPedido): PedidoDirector {
  const destino = contexto.destino ?? "perfil";
  const paletaTxt = contexto.paleta.filter((e) => e.peso > 0).map((e) => `${e.color} ${Math.round(e.peso * 100)}%`).join(", ");
  const pub = (contexto.gustos?.publicos ?? []).join("; ");
  const priv = contexto.enNeuronaPersonal === true ? (contexto.gustos?.privados ?? []).join("; ") : "";
  const adnTxt = textoAdn(contexto.adn), texto = [
    `Propón tres temas (sobria, armónica, atrevida) para el ${destino} desde el fondo aplicado.`,
    `Modo ${contexto.modo}; paleta medida del fondo: ${paletaTxt || "sin muestra"}.`,
    `Tema actual: ${JSON.stringify(contexto.temaActual.vars)}.`,
    adnTxt ? `ADN de diseño: ${adnTxt}.` : "", pub ? `Gustos públicos: ${pub}.` : "",
    priv ? `Gustos privados (neurona personal de la persona): ${priv}.` : "",
    "Guardas: escala φ y Fibonacci (memory/diseno/armonia.md), superficies translúcidas que dejan ver el",
    "fondo, contraste AA ≥ 4,5:1 (se ajusta o se descarta), dianas ≥ 44 px, ningún control esencial oculto",
    "ni desactivado, y verificación en la matriz de pantallas (280–3840 px).",
  ].filter(Boolean).join(" ");
  return { destinatario: "director-diseno", texto, privado: contexto.enNeuronaPersonal === true };
}
