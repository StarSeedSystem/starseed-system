/**
 * Avatares 3D · DICTADO SIN MODELO (AV1011). Contrato: architecture/astraura-avatares-3d.md §3.3.
 *
 * Frases cortas en español → cambios del ADN, al instante y sin red: «pelo azul», «más alto»,
 * «ojos verdes y aura dorada», «sonríe», «más tranquilo». Lo que no entiende lo devuelve en
 * `sinEntender` para que Astraura (modelo local 1.58 o el que toque) lo traduzca a cambios con el
 * MISMO formato. Así el dictado funciona aunque no haya modelo, y el modelo solo hace lo difícil.
 * PURO.
 */
import type { AdnAvatar, Expresion, Morfologia, SlotMaterial } from "./adn";
import { sanearCambio, type CambioAvatar } from "./cambios";

export const COLORES: Readonly<Record<string, string>> = {
  rojo: "#dc143c", roja: "#dc143c", azul: "#007fff", verde: "#10b981", amarillo: "#ffbf00", amarilla: "#ffbf00",
  morado: "#7c5cff", morada: "#7c5cff", violeta: "#8b5cf6", lila: "#c4b5fd", rosa: "#ec4899", naranja: "#f97316",
  blanco: "#f8fafc", blanca: "#f8fafc", negro: "#0f172a", negra: "#0f172a", gris: "#94a3b8",
  dorado: "#d4af37", dorada: "#d4af37", plateado: "#c0c0c0", plateada: "#c0c0c0",
  turquesa: "#14b8a6", celeste: "#7dd3fc", cian: "#22d3ee", marron: "#8b5a2b", castano: "#8b5a2b", castana: "#8b5a2b",
};
const SLOTS: ReadonlyArray<[RegExp, SlotMaterial]> = [
  [/\b(pelo|cabello|melena)\b/, "cabello"], [/\bojos?\b/, "ojos"], [/\bpiel\b/, "piel"],
  [/\b(pantalon(es)?|falda|abajo)\b/, "ropa-2"], [/\b(ropa|camisa|camiseta|remera|chaqueta|vestido|traje)\b/, "ropa-1"],
  [/\b(detalles?|acento|adornos?)\b/, "acento"], [/\b(aura|brillo|resplandor|orbe)\b/, "aura"],
];
/** Partes del cuerpo: la dirección la dan «grande/largo/ancho» o «pequeño/corto/estrecho» (y «menos»). */
const PARTES: ReadonlyArray<[RegExp, Morfologia]> = [
  [/\bcabeza\b/, "cabeza"], [/\bhombros\b/, "hombros"], [/\bcintura\b/, "cintura"], [/\bpiernas\b/, "piernas"], [/\bbrazos\b/, "brazos"],
];
/** Rasgos con dirección propia: «alto» sube la altura, «delgado» baja la complexión. */
const RASGOS: ReadonlyArray<[RegExp, Morfologia, 1 | -1]> = [
  [/\b(alt[oa]|grande)\b/, "altura", 1], [/\b(baj[oa]|pequen[oa])\b/, "altura", -1],
  [/\b(fuerte|robust[oa]|corpulent[oa])\b/, "complexion", 1], [/\b(delgad[oa]|flac[oa]|esbelt[oa])\b/, "complexion", -1],
  [/\b(caricatur\w*|cartoon|estilizad[oa])\b/, "estilizado", 1], [/\b(realista)\b/, "estilizado", -1],
];
const ADJ_MAS = /\b(grande|larg[oa]s?|anch[oa]s?|grues[oa]s?)\b/;
const ADJ_MENOS = /\b(pequen[oa]s?|cort[oa]s?|estrech[oa]s?|fin[oa]s?)\b/;
const EXPR: ReadonlyArray<[RegExp, Expresion]> = [
  [/\b(sonri\w*|feliz|alegre|content[oa])\b/, "happy"], [/\b(triste|apenad[oa])\b/, "sad"],
  [/\b(enojad[oa]|enfadad[oa]|furios[oa])\b/, "angry"], [/\b(sorprendid[oa]|asombrad[oa])\b/, "surprised"],
  [/\b(relajad[oa]|serena?|en paz)\b/, "relaxed"], [/\b(neutral|seri[oa])\b/, "neutral"],
];
const EXPR_EMOCION: readonly Expresion[] = ["happy", "sad", "angry", "surprised", "relaxed", "neutral"];

/** Quita tildes y mayúsculas: «Más ALTO» → «mas alto». */
export const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Tono (0-360) de un color #rrggbb, para el aura. */
export function tonoDe(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (Math.round(h * 60) + 360) % 360;
}

function paso(t: string): number {
  if (/\b(muchisimo|mucho mas|mucho menos|bastante)\b/.test(t)) return 0.2;
  if (/\b(un poco|poquito|ligeramente|algo)\b/.test(t)) return 0.05;
  return 0.1;
}

/** Un trozo («pelo azul», «más alto») → cambios. */
function trozo(t: string, adn: AdnAvatar): CambioAvatar[] {
  const out: CambioAvatar[] = [];
  const color = Object.keys(COLORES).find((c) => new RegExp(`\\b${c}(es|s)?\\b`).test(t));
  if (color) {
    const slot = SLOTS.find(([re]) => re.test(t))?.[1];
    if (slot === "aura") out.push({ op: "aura", campo: "tono", valor: tonoDe(COLORES[color]) });
    else if (slot) out.push({ op: "material", slot, campo: "color", valor: COLORES[color] });
    if (slot) return out;
  }
  const signo = /\b(menos|reduce|baja)\b/.test(t) ? -1 : /\b(mas|aumenta|sube)\b/.test(t) ? 1 : 0;
  if (/\b(energia|energic[oa]|activ[oa]|dinamic[oa])\b/.test(t)) {
    out.push({ op: "movimiento", campo: "energia", valor: adn.movimiento.energia + (signo || 1) * paso(t) });
    return out;
  }
  if (/\b(tranquil[oa]|calmad[oa]|pausad[oa])\b/.test(t)) {
    out.push({ op: "movimiento", campo: "energia", valor: adn.movimiento.energia - paso(t) });
    return out;
  }
  if (/\b(brille|brillante|luminos[oa])\b/.test(t)) {
    out.push({ op: "aura", campo: "intensidad", valor: adn.aura.intensidad + (signo || 1) * paso(t) });
    return out;
  }
  const menos = signo === -1 ? -1 : 1;
  const parte = PARTES.find(([re]) => re.test(t));
  const adj = ADJ_MAS.test(t) ? 1 : ADJ_MENOS.test(t) ? -1 : 0;
  if (parte && (signo !== 0 || adj !== 0)) {
    out.push({ op: "morfologia", clave: parte[1], valor: (adn.morfologia[parte[1]] ?? 0.5) + menos * (adj || 1) * paso(t) });
    return out;
  }
  const r = parte ? undefined : RASGOS.find(([re]) => re.test(t));
  if (r) {
    out.push({ op: "morfologia", clave: r[1], valor: (adn.morfologia[r[1]] ?? 0.5) + menos * r[2] * paso(t) });
    return out;
  }
  const e = EXPR.find(([re]) => re.test(t));
  if (e) {
    for (const x of EXPR_EMOCION) out.push({ op: "expresion", clave: x, valor: x === e[1] ? 1 : 0 });
  }
  return out;
}

/**
 * Frase → cambios (en orden) + trozos que no entendió. Separa por «y», comas y punto y coma.
 * El ADN se usa para los relativos («más alto» sube desde donde está).
 */
export function cambiosDesdeFrase(frase: string, adn: AdnAvatar): { cambios: CambioAvatar[]; sinEntender: string[] } {
  const cambios: CambioAvatar[] = [], sinEntender: string[] = [];
  const trozos = normalizar(frase).slice(0, 400).split(/\s*(?:,|;|\.|\by\b|\be\b|\bademas\b)\s*/).filter(Boolean);
  for (const t of trozos) {
    const cs = trozo(t, adn).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    if (cs.length) cambios.push(...cs); else sinEntender.push(t);
  }
  return { cambios, sinEntender };
}
