/** Rediseño sugerido por Astraura desde el fondo (Ola 1018F, tarea L).
 *  Módulo PURO: sin red, sin disco, sin DOM. Contrato: architecture/fondos-shaders.md §4. */
import type { ThemeTokens } from "./theme-engine";
import { luminanciaDe, normalizarHex, type EntradaPaleta } from "./paleta-fondo";
import { contraste, mezclar } from "../xr/tokens-3d";

export type ModoDiseno = "claro" | "oscuro";
export type ColorEntrada = EntradaPaleta | string;
export interface AdnDiseno { nombre?: string; motivos?: string[]; tipografia?: string; radio?: number; movimiento?: number }
export interface GustosDiseno { publicos?: string[]; privados?: string[] }
export interface PropuestaRediseno {
  id: "sobria" | "armonica" | "atrevida"; nombre: string; motivo: string; geometria: string; tokens: ThemeTokens;
  contraste: { textoSuperficie: number; textoSuave: number; acentoSuperficie: number; textoAcento: number };
}
export interface ResultadoRediseno { propuestas: PropuestaRediseno[]; descartadas: Array<{ id: string; motivo: string }> }
export interface EntradaRediseno { paleta: ColorEntrada[]; temaActual: ThemeTokens; modo: ModoDiseno; adn?: AdnDiseno }
export interface EntradaPedido { paleta: ColorEntrada[]; modo: ModoDiseno; adn?: AdnDiseno; gustos?: GustosDiseno; enNeuronaPropia?: boolean; contextoCompartido?: boolean; propuestas?: PropuestaRediseno[] }
export interface PedidoIA { encargo: string; fondo: { colores: string[]; modo: ModoDiseno }; memoria: string[]; privacidad: { incluyePrivado: boolean; motivo: string }; politica: { gratisPrimero: true; relevoEn: number[] }; instrucciones: string[] }

const AA = 4.5, PHI = 1.618, NEGRO = "#0b0b0f", BLANCO = "#ffffff";
export const ESCALA_PHI = [0.382, 0.618, 1, PHI, PHI ** 2, PHI ** 3, PHI ** 4];
const ESCALA_VARS: Record<string, string> = Object.fromEntries([-2, -1, 1, 2, 3, 4].map((n, i) => [`fs-phi-${n}`, `${ESCALA_PHI[i + 1]}rem`]));

type Rgb = [number, number, number];
const aRgb = (h: string): Rgb => [0, 2, 4].map((i) => parseInt(normalizarHex(h).slice(1).slice(i, i + 2), 16)) as Rgb;
const hsl = (hex: string): string => {
  const [r, g, b] = aRgb(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn, l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(h * 60 + 360) % 360; }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};
const mejorTexto = (fondo: string): string => (contraste(NEGRO, fondo) >= contraste(BLANCO, fondo) ? NEGRO : BLANCO);
const redondear = (n: number): number => Math.round(n * 100) / 100;

function legible(fondo: string, base: string, alfa: number): { superficie: string; texto: string; razon: number } {
  let comp = mezclar(base, alfa, fondo), texto = mejorTexto(comp), razon = contraste(texto, comp);
  if (razon < AA) { base = texto === NEGRO ? BLANCO : "#000000"; comp = mezclar(base, alfa, fondo); texto = mejorTexto(comp); razon = contraste(texto, comp); }
  return { superficie: base, texto, razon };
}

function acentoLegible(fondo: string, base: string): { color: string; razon: number } {
  const hacia = contraste(BLANCO, fondo) >= contraste("#000000", fondo) ? BLANCO : "#000000";
  const color = contraste(base, fondo) >= AA ? base : hacia;
  return { color, razon: contraste(color, fondo) };
}

function normalizarPaleta(paleta: ColorEntrada[]): EntradaPaleta[] {
  const vistos = new Map<string, number>();
  for (const c of paleta ?? []) { const color = normalizarHex(typeof c === "string" ? c : c.color); vistos.set(color, (vistos.get(color) ?? 0) + (typeof c === "string" ? 1 : Math.max(0, c.peso))); }
  const lista = [...vistos].map(([color, peso]) => ({ color, peso })).sort((a, b) => b.peso - a.peso);
  return lista.length ? lista : [{ color: "#0a0f1d", peso: 1 }];
}

const VARIANTES = [
  { id: "sobria", nombre: "Sobria", alfa: 0.86, radio: 0.875, movimiento: 0.6, geometria: "rejilla áurea", acento: 1, motivo: "Superficie casi opaca: el fondo asoma por el borde y la lectura manda." },
  { id: "armonica", nombre: "Armónica", alfa: 0.72, radio: 1.625, movimiento: 1, geometria: "vesica piscis", acento: 2, motivo: "Vidrio medio en proporción φ: el fondo tiñe sin robar el foco." },
  { id: "atrevida", nombre: "Atrevida", alfa: 0.56, radio: 1.875, movimiento: 1.4, geometria: "espiral áurea", acento: 3, motivo: "Vidrio ligero y acento del fondo: la capa de color manda y el texto se sostiene." },
] as const;

export function propuestasDesdeFondo(e: EntradaRediseno): ResultadoRediseno {
  const cols = normalizarPaleta(e.paleta), dom = cols[0].color, oscuro = e.modo === "oscuro";
  const fondo = mezclar(dom, 0.82, oscuro ? "#070a12" : "#f8f9fb");
  const propuestas: PropuestaRediseno[] = [], descartadas: ResultadoRediseno["descartadas"] = [];
  for (const v of VARIANTES) {
    const sup = legible(fondo, mezclar(dom, 0.8, oscuro ? "#11151f" : "#ffffff"), v.alfa);
    if (sup.razon < AA) { descartadas.push({ id: v.id, motivo: `No alcanza AA 4,5:1 (${redondear(sup.razon)}:1).` }); continue; }
    const comp = mezclar(sup.superficie, v.alfa, fondo);
    const acento = acentoLegible(comp, cols[Math.min(v.acento, cols.length - 1)].color);
    const suave = mezclar(comp, 0.7, sup.texto), textoSuave = contraste(suave, comp) >= AA ? suave : sup.texto;
    const textoAcento = mejorTexto(acento.color), seg = mezclar(dom, 0.35, acento.color);
    const vars = { ...ESCALA_VARS,
      "background-hsl": hsl(fondo), "foreground-hsl": hsl(sup.texto), "card-hsl": hsl(sup.superficie), "card-foreground-hsl": hsl(sup.texto),
      "primary-hsl": hsl(acento.color), "primary-foreground-hsl": hsl(textoAcento), "secondary-hsl": hsl(seg), "ring-hsl": hsl(acento.color),
      "muted-hsl": hsl(comp), "muted-foreground-hsl": hsl(textoSuave), "border-hsl": hsl(mezclar(comp, 0.24, sup.texto)),
      "radius": `${redondear(e.adn?.radio ?? v.radio)}rem`, "glass-opacity": String(v.alfa),
      "glass-blur": `${Math.round(8 + v.alfa * 20)}px`, "glass-frost": String(redondear(1 - v.alfa)),
    };
    const fuente = e.adn?.tipografia ?? e.temaActual?.fontFamily;
    propuestas.push({
      id: v.id, nombre: v.nombre, motivo: v.motivo, geometria: e.adn?.motivos?.[propuestas.length] ?? v.geometria,
      tokens: { vars, materialClass: "ss-crystal", motion: e.adn?.movimiento ?? e.temaActual?.motion ?? v.movimiento, ...(fuente ? { fontFamily: fuente } : {}) },
      contraste: { textoSuperficie: redondear(sup.razon), textoSuave: redondear(contraste(textoSuave, comp)), acentoSuperficie: redondear(acento.razon), textoAcento: redondear(contraste(textoAcento, acento.color)) },
    });
  }
  return { propuestas, descartadas };
}

export function pedidoParaIA(e: EntradaPedido): PedidoIA {
  const cols = normalizarPaleta(e.paleta).map((c) => c.color), privados = e.gustos?.privados ?? [];
  const incluyePrivado = privados.length > 0 && e.enNeuronaPropia === true && e.contextoCompartido !== true;
  const motivo = incluyePrivado ? "Corre en una neurona de la persona: su memoria privada se usa aquí y no sale de ella."
    : e.contextoCompartido === true ? "Contexto compartido: solo se usa lo que ese contexto ya comparte."
      : "Sin neurona propia declarada: la memoria privada de gustos no se envía.";
  const revisadas = (e.propuestas ?? []).map((p) => `${p.nombre}: ${p.geometria}; ${p.motivo}`);
  const adn = e.adn ? `ADN: ${e.adn.nombre ?? "sin nombre"}${e.adn.motivos?.length ? `; motivos: ${e.adn.motivos.join(", ")}` : ""}.` : "";
  return {
    encargo: "Rediseña la página o el perfil para que el fondo siga siendo el protagonista: superficies translúcidas, acentos de su paleta y escala φ, sin ocultar ni desactivar ningún control esencial.",
    fondo: { colores: cols, modo: e.modo }, memoria: [...(e.gustos?.publicos ?? []), ...(incluyePrivado ? privados : [])],
    privacidad: { incluyePrivado, motivo }, politica: { gratisPrimero: true, relevoEn: [429, 402] },
    instrucciones: [
      "Devuelve un parche de tokens con tres variantes (sobria, armónica, atrevida) y su motivo; no cambies estructura ni contenido.",
      "Mantén contraste AA ≥ 4,5:1, dianas ≥ 44 px y la matriz de director-diseno.md; respeta prefers-reduced-motion.",
      `Verifica 280, 360, 430, 768, 1024, 1280, 1920 y 3840 px en ${e.modo}.`,
      ...(adn ? [adn] : []), ...(revisadas.length ? [`Ya verificadas: ${revisadas.join(" | ")}.`] : []),
    ],
  };
}
