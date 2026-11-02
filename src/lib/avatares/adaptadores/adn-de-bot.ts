/**
 * Avatares 3D · ADN DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §6 y §12.
 *
 * Cuando el cuerpo del bot es `avatar-3d` o `vrm`, `cuerpo.avatarRef` apunta al ADN
 * (`biblioteca:<id>`), no a una malla: el ADN guarda la malla y todo lo demás. Aquí se
 * resuelve ese ADN —el guardado, o uno por defecto con el tono de la orbe— y se traduce
 * la emoción del bot a expresiones VRM, visemas y gestos del motor único de movimiento.
 *
 * PURO: sin almacenamiento, red, DOM, reloj ni azar. Quien llama trae el ADN ya leído
 * (una lectura por sesión y revisión, §3); este módulo no sondea nada.
 */
import {
  adnPorDefecto,
  esRefInterna,
  sanearAdn,
  type AdnAvatar,
  type EstiloMovimiento,
  type Expresion,
} from "@/lib/avatares/adn/adn";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import type { Bot, Emocion, EstadoEmocional, FormaCuerpo } from "@/lib/astraura-bots/tipos";

/** Formas de cuerpo que viven en un avatar 3D/VRM (las demás son orbe, imagen o ser). */
export const FORMAS_AVATAR_3D: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];

/** Expresiones de emoción que mueve el estado del bot (las de VRM 1.0). */
export const EXPRESIONES_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
export type ExpresionEmocion = (typeof EXPRESIONES_EMOCION)[number];

/** Visemas de VRM 1.0 que se encienden al hablar. */
export const VISEMAS = ["aa", "ih", "ou", "ee", "oh"] as const;

/** Expresión dominante de cada emoción cuando la valencia es neutra. */
const EXPRESION_POR_EMOCION: Record<Emocion, ExpresionEmocion> = {
  calma: "relaxed",
  alegria: "happy",
  curiosidad: "surprised",
  concentracion: "relaxed",
  preocupacion: "sad",
  ternura: "relaxed",
  asombro: "surprised",
};

const acotar = (v: number, min: number, max: number): number =>
  (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);

/** ¿La forma del cuerpo pide un avatar 3D? */
export function esFormaAvatar3d(forma: FormaCuerpo): boolean {
  return FORMAS_AVATAR_3D.includes(forma);
}

/** Id estable de un ADN de bot cuando aún no hay referencia guardada (`adn-bot-<id>`). */
function idPorDefectoDeBot(bot: Bot): string {
  const limpio = bot.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `adn-bot-${limpio || "sin-id"}`;
}

/**
 * Referencia interna del ADN del bot (`biblioteca:<id>`), o `null` si su forma no es 3D,
 * no hay `avatarRef` o esta no es interna. Nunca devuelve una URL externa.
 */
export function refAdnDeBot(bot: Pick<Bot, "cuerpo">): string | null {
  const { forma, avatarRef } = bot.cuerpo;
  if (!esFormaAvatar3d(forma) || typeof avatarRef !== "string") return null;
  const ref = avatarRef.trim();
  return ref.startsWith("biblioteca:") && esRefInterna(ref) ? ref : null;
}

/** Id del ADN que corresponde al bot: el de su referencia, o uno estable derivado de su id. */
export function idAdnDeBot(bot: Bot): string {
  const ref = refAdnDeBot(bot);
  return ref ? ref.slice("biblioteca:".length) : idPorDefectoDeBot(bot);
}

/**
 * ADN del bot: el guardado que se pasa (ya leído), o uno por defecto con el tono de su
 * orbe y dueño `{ tipo: "bot", id }`. Un ADN de otro dueño, roto o de otro id no se usa:
 * se devuelve el de fábrica (nunca se mezcla la identidad de dos botones).
 */
export function adnDeBot(bot: Bot, guardado?: unknown): AdnAvatar {
  const id = idAdnDeBot(bot);
  const previo = guardado === undefined || guardado === null ? null : sanearAdn(guardado);
  if (previo && previo.id === id && previo.dueno.tipo === "bot" && previo.dueno.id === bot.id) return previo;
  return adnPorDefecto(id, bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

/* ─────────────── Emoción → expresiones y aura ─────────────── */

/**
 * Expresión dominante. Valencia y activación mandan (contrato §6): una valencia muy
 * negativa con activación alta es enfado; una baja es tristeza; una alta y activa es
 * alegría. Con valencia neutra decide la emoción que el bot está expresando.
 */
export function expresionDeEmocion(estado: EstadoEmocional): ExpresionEmocion {
  const valencia = acotar(estado.valencia, -1, 1);
  const activacion = acotar(estado.activacion, 0, 1);
  if (valencia <= -0.5 && activacion >= 0.6) return "angry";
  if (valencia <= -0.25) return "sad";
  if (valencia >= 0.6 && activacion >= 0.75) return "happy";
  return EXPRESION_POR_EMOCION[estado.emocion] ?? "relaxed";
}

/** Fuerza de la expresión en [0,1]: el ánimo más marcado (valencia o activación) la sube. */
export function intensidadDeEmocion(estado: EstadoEmocional): number {
  const valencia = Math.abs(acotar(estado.valencia, -1, 1));
  const activacion = acotar(estado.activacion, 0, 1);
  return Number(acotar(0.2 + 0.8 * Math.max(valencia, activacion), 0, 1).toFixed(4));
}

export interface EmocionExpresada {
  expresion: ExpresionEmocion;
  intensidad: number;
  /** Mapa listo para `expresionBase` del ADN (solo la expresión dominante). */
  expresiones: Partial<Record<Expresion, number>>;
}

/** Emoción del bot → peso de su expresión VRM dominante. Pura. */
export function expresionesDeEmocion(estado: EstadoEmocional): EmocionExpresada {
  const expresion = expresionDeEmocion(estado);
  const intensidad = intensidadDeEmocion(estado);
  return { expresion, intensidad, expresiones: { [expresion]: intensidad } };
}

/**
 * Intensidad del aura con la emoción del bot: solo cambia si `aura.ligadaEmocion`.
 * El ánimo sube o baja el brillo y la activación lo enciende, sin salir de [0,1].
 */
export function intensidadAuraConEmocion(adn: Pick<AdnAvatar, "aura">, estado: EstadoEmocional): number {
  if (!adn.aura.ligadaEmocion) return adn.aura.intensidad;
  const animo = (acotar(estado.valencia, -1, 1) + 1) / 2;
  const activacion = acotar(estado.activacion, 0, 1);
  const ajuste = 0.25 * (animo - 0.5) + 0.2 * activacion;
  return Number(acotar(adn.aura.intensidad + ajuste, 0, 1).toFixed(4));
}

/**
 * ADN derivado para dibujar: cambia la expresión emocional (sin tocar visemas ni
 * parpadeo) y el aura si está ligada a la emoción. No sube `rev`: no es un cambio
 * guardado, es cómo se ve el bot ahora.
 */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional): AdnAvatar {
  const { expresion, expresiones } = expresionesDeEmocion(estado);
  const expresionBase: AdnAvatar["expresionBase"] = { ...adn.expresionBase };
  for (const k of EXPRESIONES_EMOCION) delete expresionBase[k];
  expresionBase[expresion] = expresiones[expresion] ?? 0;
  return { ...adn, expresionBase, aura: { ...adn.aura, intensidad: intensidadAuraConEmocion(adn, estado) } };
}

/* ─────────────── Visemas al hablar ─────────────── */

/** Vocal (con acentos y diéresis) → visema de VRM 1.0. */
const VISEMA_POR_VOCAL: Record<string, (typeof VISEMAS)[number]> = {
  a: "aa", e: "ee", i: "ih", o: "oh", u: "ou",
};

/**
 * Visemas que se encienden al decir `texto`, en orden: uno por vocal, hasta `max`.
 * No es una sincronía fonética real —no hay audio alineado todavía—, pero sí sigue
 * las vocales que se dicen y da boca al avatar sin inventar fonemas que no existen.
 */
export function visemasDeTexto(texto: string, max = 12): Expresion[] {
  const tope = Math.max(0, Math.min(64, Math.floor(max)));
  const out: Expresion[] = [];
  for (const letra of (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) {
    const visema = VISEMA_POR_VOCAL[letra];
    if (!visema) continue;
    out.push(visema);
    if (out.length >= tope) break;
  }
  return out;
}

/* ─────────────── Gesto con el carácter del ADN ─────────────── */

/**
 * Aplica el carácter de movimiento del ADN (`energia`, `amplitud`, `ritmo`) al gesto
 * que llega de la voz. El gesto se pide igual al motor único —la identidad del gesto
 * no cambia—; solo se ajustan la energía y el tempo. Pura.
 */
export function gestoConMovimiento(gesto: Gesto, movimiento: EstiloMovimiento): Gesto {
  const base = acotar(gesto.energia ?? 0.5, 0, 1);
  const energia = acotar(base * 0.5 + acotar(movimiento.energia, 0, 1) * 0.3 + acotar(movimiento.amplitud, 0, 1) * 0.2, 0, 1);
  const ritmo = 0.5 + acotar(movimiento.ritmo, 0, 1);
  const duracionMs = gesto.duracionMs && gesto.duracionMs > 0
    ? Math.max(200, Math.round(gesto.duracionMs / ritmo))
    : gesto.duracionMs;
  return {
    ...gesto,
    energia: Number(energia.toFixed(4)),
    ...(duracionMs !== undefined ? { duracionMs } : {}),
  };
}
