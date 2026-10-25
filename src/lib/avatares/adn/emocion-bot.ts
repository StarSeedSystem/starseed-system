/**
 * Avatares 3D · EMOCIÓN DEL BOT EN EL AVATAR (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2 y §6.
 *
 * La emoción EXPRESADA del bot (valencia y activación de `EstadoEmocional`) mueve las expresiones
 * VRM 1.0 y la intensidad del aura del ADN; al hablar, el texto se convierte en visemas de boca.
 * PURO y determinista: mismas señales, mismo gesto; sin red, reloj ni aleatorio.
 */
import { acotar01, type AdnAvatar, type Expresion } from "./adn";
import type { EstadoEmocional } from "@/lib/astraura-bots/tipos";

/** Las cinco emociones que un avatar VRM puede mostrar con expresión propia. */
export const EXPRESIONES_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
export type ExpresionEmocion = (typeof EXPRESIONES_EMOCION)[number];

/** Los cinco visemas de boca de VRM 1.0 que usa el habla en español. */
export const VISEMAS_HABLA = ["aa", "ee", "ih", "oh", "ou"] as const;
export type VisemaHabla = (typeof VISEMAS_HABLA)[number];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const entre = (x: number, min: number, max: number) => (Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min);

/** Valencia (−1…1) y activación (0…1) saneadas de un estado emocional. */
export function senalesDeEstado(e: EstadoEmocional | null | undefined): { valencia: number; activacion: number } {
  return { valencia: entre(e?.valencia ?? 0, -1, 1), activacion: acotar01(e?.activacion, 0.3) };
}

/**
 * Emoción expresada → pesos de expresión VRM. La valencia decide alegría o tristeza; la activación
 * añade sorpresa o enfado; la emoción nombrada afina el matiz. Si no hay señal, queda «neutral».
 */
export function expresionesDeEstado(estado: EstadoEmocional | null | undefined): Partial<Record<Expresion, number>> {
  const { valencia, activacion } = senalesDeEstado(estado);
  const salida: Partial<Record<Expresion, number>> = {};
  const poner = (clave: Expresion, peso: number): void => {
    const w = r3(acotar01(peso));
    if (w > 0.01) salida[clave] = Math.max(salida[clave] ?? 0, w);
  };

  if (valencia > 0.05) {
    poner("happy", valencia * (0.55 + 0.35 * activacion));
    poner("relaxed", valencia * (0.55 - 0.4 * activacion));
  } else if (valencia < -0.05) {
    poner("sad", -valencia * (0.65 - 0.35 * activacion));
    poner("angry", -valencia * activacion * 0.7);
  }
  if (activacion > 0.65) poner("surprised", ((activacion - 0.65) / 0.35) * (0.45 + 0.4 * Math.max(0, valencia)));

  switch (estado?.emocion) {
    case "alegria":
      poner("happy", 0.6 + 0.35 * Math.max(0, valencia));
      poner("relaxed", 0.25 + 0.25 * (1 - activacion));
      break;
    case "calma":
      poner("relaxed", 0.6 + 0.3 * (1 - activacion));
      break;
    case "ternura":
      poner("relaxed", 0.55 + 0.2 * (1 - activacion));
      poner("happy", 0.35 + 0.2 * Math.max(0, valencia));
      break;
    case "preocupacion":
      poner("sad", 0.4 + 0.4 * Math.max(0, -valencia));
      poner("relaxed", 0.2 * (1 - activacion));
      break;
    case "concentracion":
      poner("relaxed", 0.35 + 0.15 * (1 - activacion));
      break;
    case "asombro":
      poner("surprised", 0.55 + 0.35 * activacion);
      poner("happy", 0.2 * Math.max(0, valencia));
      break;
    case "curiosidad":
      poner("surprised", 0.3 + 0.25 * activacion);
      poner("relaxed", 0.2 + 0.15 * (1 - activacion));
      break;
    default:
      break;
  }
  if (Object.keys(salida).length === 0) salida.neutral = 1;
  return salida;
}

/** Aura del ADN con la emoción: si está ligada, la activación la enciende y la valencia la tiñe. */
export function intensidadAuraEmocion(adn: Pick<AdnAvatar, "aura">, estado: EstadoEmocional | null | undefined): number {
  const base = acotar01(adn.aura.intensidad, 0.6);
  if (!adn.aura.ligadaEmocion) return r3(base);
  const { valencia, activacion } = senalesDeEstado(estado);
  return r3(acotar01(base * (0.7 + 0.4 * activacion) + 0.1 * valencia));
}

/** Copia del ADN con las expresiones emocionales renovadas (sin dejar restos de la emoción anterior). */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional | null | undefined): AdnAvatar {
  const expresionBase = { ...adn.expresionBase };
  for (const clave of EXPRESIONES_EMOCION) delete expresionBase[clave];
  return {
    ...adn,
    expresionBase: { ...expresionBase, ...expresionesDeEstado(estado) },
    aura: { ...adn.aura, intensidad: intensidadAuraEmocion(adn, estado) },
  };
}

/** Letra del español → visema de boca. Las consonantes no abren la boca: `null`. */
const VISEMA_POR_LETRA: Readonly<Record<string, VisemaHabla>> = {
  a: "aa", á: "aa", ä: "aa",
  e: "ee", é: "ee", ë: "ee",
  i: "ih", í: "ih", ï: "ih", y: "ih",
  o: "oh", ó: "oh", ö: "oh",
  u: "ou", ú: "ou", ü: "ou", w: "ou",
};

export function visemaDeLetra(letra: string): VisemaHabla | null {
  const c = (letra ?? "").toLowerCase();
  return c.length === 1 ? VISEMA_POR_LETRA[c] ?? null : null;
}

/** Vocales del texto, en orden: la secuencia de bocas que hay que recorrer al hablar. */
export function visemasDeTexto(texto: string | null | undefined, maximo = 48): VisemaHabla[] {
  const salida: VisemaHabla[] = [];
  const tope = Math.max(1, Math.floor(maximo));
  for (const letra of (texto ?? "").toLowerCase()) {
    const visema = visemaDeLetra(letra);
    if (visema) salida.push(visema);
    if (salida.length >= tope) break;
  }
  return salida;
}

/** Visema que toca en un punto del habla (fracción 0…1 del texto), o `null` si no hay vocales. */
export function visemaEnProgreso(texto: string | null | undefined, fraccion: number): VisemaHabla | null {
  const visemas = visemasDeTexto(texto);
  if (visemas.length === 0) return null;
  const f = entre(fraccion, 0, 1);
  return visemas[Math.min(visemas.length - 1, Math.floor(f * visemas.length))];
}

/** Peso de expresión para un visema suelto (1 = boca en esa forma; sin visema, nada). */
export function expresionDeVisema(visema: VisemaHabla | null): Partial<Record<Expresion, number>> {
  const salida: Partial<Record<Expresion, number>> = {};
  if (visema) salida[visema] = 1;
  return salida;
}
