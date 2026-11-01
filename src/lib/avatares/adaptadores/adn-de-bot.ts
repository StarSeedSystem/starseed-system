/**
 * ADN DE UN BOT · adaptador orbe ↔ avatar 3D (AV1011C).
 * Contrato: architecture/astraura-avatares-3d.md §2, §8 y §12.
 *
 * Un bot con `cuerpo.forma` «avatar-3d» o «vrm» lleva en `cuerpo.avatarRef` una referencia
 * `biblioteca:…` al ADN que lo viste. Aquí se decide qué ADN usar (el guardado del bot o el de
 * por defecto con el tono de su orbe) y cómo la emoción y la voz lo modulan.
 *
 * PURO: sin React, red, reloj ni almacenamiento. Quien monta el avatar lee el ADN guardado UNA
 * vez por sesión (almacen-adn, §3) y lo pasa como `guardado`; este módulo no sondea Supabase.
 */
import {
  acotar01, adnPorDefecto, sanearAdn,
  type AdnAvatar, type Expresion,
} from "@/lib/avatares/adn/adn";
import type { Bot, EstadoEmocional } from "@/lib/astraura-bots/tipos";

/** Formas de cuerpo que se dibujan con el ADN de avatar. */
export const FORMAS_CON_ADN = ["avatar-3d", "vrm"] as const;

/** Lo mínimo que un bot necesita para tener ADN (un `Bot` completo encaja tal cual). */
export type BotConCuerpo = Pick<Bot, "id" | "nombre" | "cuerpo">;

/** Expresiones que mueve la emoción (VRM 1.0). */
export type ExpresionEmotiva = "happy" | "sad" | "angry" | "surprised" | "relaxed";

const PREFIJO = "biblioteca:";
const VISEMA_DE_VOCAL: Record<string, Expresion> = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou" };

export function esFormaConAdn(forma: string): boolean {
  return (FORMAS_CON_ADN as readonly string[]).includes(forma);
}

const idSeguro = (v: string): string => v.replace(/[^\w./:-]/g, "").slice(0, 80);
const idDeRef = (ref?: string): string | null => {
  if (!ref || !ref.startsWith(PREFIJO)) return null;
  return idSeguro(ref.slice(PREFIJO.length)) || null;
};

/** Referencia `biblioteca:…` del ADN de este bot, o `null` si no tiene una válida. */
export function refDeAdnDeBot(bot: BotConCuerpo): string | null {
  const id = idDeRef(bot.cuerpo.avatarRef);
  return id ? `${PREFIJO}${id}` : null;
}

/**
 * ADN del bot. Si `guardado` es válido y pertenece a ESTE bot (mismo dueño y misma referencia),
 * se usa; si no, se crea el de por defecto con el tono de la orbe y dueño `{ tipo: "bot" }`.
 * Una referencia externa no se acepta: el ADN queda como orbe con un id seguro.
 */
export function adnDeBot(bot: BotConCuerpo, guardado?: AdnAvatar | null): AdnAvatar {
  const ref = refDeAdnDeBot(bot);
  const limpio = guardado ? sanearAdn(guardado) : null;
  if (limpio && limpio.dueno.tipo === "bot" && limpio.dueno.id === bot.id && (!ref || `${PREFIJO}${limpio.id}` === ref)) {
    return limpio;
  }
  const id = idDeRef(bot.cuerpo.avatarRef) ?? (idSeguro(`bot-${bot.id}`) || "bot");
  return adnPorDefecto(id, bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

/**
 * Emoción expresada → pesos de expresiones VRM. La valencia manda en el signo (positiva: happy y
 * relaxed; negativa: sad y angry) y la activación reparte intensidad (alta: angry y surprised; baja:
 * sad y relaxed). La etiqueta de la emoción afina lo que es ambiguo (calma, ternura, asombro…).
 */
export function expresionesPorEmocion(estado: EstadoEmocional): Partial<Record<ExpresionEmotiva, number>> {
  const v = Number.isFinite(estado.valencia) ? Math.min(1, Math.max(-1, estado.valencia)) : 0;
  const a = acotar01(estado.activacion);
  const positivo = Math.max(0, v);
  const negativo = Math.max(0, -v);
  const pesos: Record<ExpresionEmotiva, number> = {
    happy: positivo * (0.4 + 0.6 * a),
    relaxed: (1 - a) * (0.35 + 0.45 * positivo),
    sad: negativo * (1 - 0.5 * a),
    angry: negativo * a,
    surprised: a * 0.45,
  };
  switch (estado.emocion) {
    case "alegria": pesos.happy += 0.25; break;
    case "ternura": pesos.happy += 0.15; pesos.relaxed += 0.2; break;
    case "calma": pesos.relaxed += 0.25; pesos.surprised -= 0.2; break;
    case "preocupacion": pesos.sad += 0.2; pesos.angry += 0.1; break;
    case "asombro": pesos.surprised += 0.3; break;
    case "curiosidad": pesos.surprised += 0.12; pesos.happy += 0.05; break;
    case "concentracion": pesos.surprised -= 0.1; break;
  }
  const out: Partial<Record<ExpresionEmotiva, number>> = {};
  for (const k of ["happy", "sad", "angry", "surprised", "relaxed"] as const) {
    const n = Math.round(acotar01(pesos[k]) * 10000) / 10000;
    if (n > 0) out[k] = n;
  }
  return out;
}

/**
 * Proyección del ADN con la emoción: estampa las expresiones (sin bajar las que ya tenía el ADN,
 * para no borrar un ajuste del dueño) y modula la intensidad del aura si `ligadaEmocion`. No sube
 * `rev`: es una vista, no un cambio guardado.
 */
export function adnConEmocion(adn: AdnAvatar, estado?: EstadoEmocional | null): AdnAvatar {
  if (!estado) return adn;
  const expresionBase: Partial<Record<Expresion, number>> = { ...adn.expresionBase };
  for (const [k, peso] of Object.entries(expresionesPorEmocion(estado)) as [ExpresionEmotiva, number][]) {
    expresionBase[k] = Math.max(expresionBase[k] ?? 0, peso);
  }
  const intensidad = adn.aura.ligadaEmocion
    ? acotar01(adn.aura.intensidad * (0.7 + 0.6 * acotar01(estado.activacion)))
    : adn.aura.intensidad;
  return { ...adn, expresionBase, aura: { ...adn.aura, intensidad } };
}

/**
 * Visemas aproximados de un texto (VRM 1.0). No es fonética: cuenta vocales sin acentos y reparte
 * su proporción entre aa/ee/ih/oh/ou. Es lo que se puede hacer sin audio; el clip real de voz llega
 * por el evento `starseed:gesto` de `sincronia-voz.ts`.
 */
export function visemasDeTexto(texto: string): Partial<Record<Expresion, number>> {
  const conteo = new Map<Expresion, number>();
  for (const c of (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) {
    const visema = VISEMA_DE_VOCAL[c];
    if (visema) conteo.set(visema, (conteo.get(visema) ?? 0) + 1);
  }
  const total = [...conteo.values()].reduce((suma, n) => suma + n, 0);
  const out: Partial<Record<Expresion, number>> = {};
  if (!total) return out;
  for (const [visema, n] of conteo) out[visema] = Math.round((n / total) * 10000) / 10000;
  return out;
}

/** Energía 0–1 del gesto a partir del carácter de movimiento del ADN (energía y amplitud). */
export function energiaParaGesto(adn: Pick<AdnAvatar, "movimiento">): number {
  const { energia, amplitud } = adn.movimiento;
  return Math.round(acotar01(0.5 * energia + 0.5 * amplitud) * 10000) / 10000;
}
