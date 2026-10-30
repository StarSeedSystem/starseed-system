/**
 * Avatares 3D · ADN DE UN BOT (AV1011C · contrato architecture/astraura-avatares-3d.md §2, §3 y §8).
 *
 * La orbe de un bot puede ser un avatar 3D: cuando `Cuerpo.forma` es `avatar-3d` o `vrm`, su
 * `avatarRef` apunta a un ADN de la Biblioteca. Este módulo resuelve ese ADN (el guardado si es del
 * bot, o uno por defecto con el tono de su orbe) y traduce la emoción EXPRESADA del bot a expresiones
 * VRM, intensidad del aura y visemas de habla. PURO: sin red, disco, reloj ni React.
 */
import { adnPorDefecto, esRefInterna, type AdnAvatar, type Expresion } from "@/lib/avatares/adn/adn";
import { acotar, type Bot, type Emocion, type EstadoEmocional, type FormaCuerpo } from "@/lib/astraura-bots/tipos";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import { estimarDuracionAudioMs, gestoDesdeTexto } from "@/lib/avatares/movimiento/sincronia-voz";

/** Formas de cuerpo que se dibujan con el avatar 3D del ADN (no con la orbe). */
export const FORMAS_AVATAR_3D: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];

/** ¿Esta forma usa el ADN 3D? */
export function usaAvatar3d(forma: FormaCuerpo): boolean {
  return FORMAS_AVATAR_3D.includes(forma);
}

const limpiarId = (id: string): string => id.replace(/[^\w.-]+/g, "-").slice(0, 60) || "bot";

/** Id determinista del ADN por defecto de un bot (el mismo bot siempre produce el mismo ADN). */
export function idAdnDeBot(bot: Pick<Bot, "id" | "cuerpo">): string {
  const ref = bot.cuerpo.avatarRef;
  if (typeof ref === "string" && esRefInterna(ref) && ref.startsWith("biblioteca:")) {
    const id = ref.slice("biblioteca:".length);
    if (/^[\w./:-]{1,80}$/.test(id)) return id;
  }
  return `adn-bot-${limpiarId(bot.id)}`;
}

/** Referencia interna del ADN del bot (nunca una URL externa). */
export function refAdnDeBot(bot: Pick<Bot, "id" | "cuerpo">): string {
  return `biblioteca:${idAdnDeBot(bot)}`;
}

/**
 * ADN del bot: el guardado si de verdad es suyo, o uno por defecto con el tono de la orbe y dueño
 * `{ tipo: "bot", id }`. No muta lo que recibe: devuelve siempre un ADN válido.
 */
export function adnDeBot(bot: Bot, guardado?: AdnAvatar | null): AdnAvatar {
  if (guardado && guardado.dueno.tipo === "bot" && guardado.dueno.id === bot.id) return guardado;
  return adnPorDefecto(idAdnDeBot(bot), bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Empujón que da el nombre de la emoción sobre la valencia y la activación (sin inventar estados). */
const PISTA_EMOCION: Record<Emocion, Partial<Record<Expresion, number>>> = {
  calma: { relaxed: 0.15 },
  alegria: { happy: 0.25 },
  curiosidad: { surprised: 0.1 },
  concentracion: { neutral: 0.15 },
  preocupacion: { sad: 0.2 },
  ternura: { relaxed: 0.15 },
  asombro: { surprised: 0.3 },
};

/** Expresiones VRM (0…1) que mueve la emoción del bot: valencia + activación, con su nombre como pista. */
export function expresionesDeEmocion(estado: EstadoEmocional): Partial<Record<Expresion, number>> {
  const valencia = acotar(estado.valencia, -1, 1);
  const activacion = acotar(estado.activacion);
  const positiva = Math.max(0, valencia);
  const negativa = Math.max(0, -valencia);
  const reposo = 1 - activacion;
  const pista = PISTA_EMOCION[estado.emocion] ?? {};
  const bruto = {
    happy: positiva * activacion + (pista.happy ?? 0),
    sad: negativa * reposo + (pista.sad ?? 0),
    angry: negativa * activacion + (pista.angry ?? 0),
    surprised: Math.max(0, activacion - 0.7) / 0.3 * 0.6 + (pista.surprised ?? 0),
    relaxed: positiva * reposo + (pista.relaxed ?? 0),
  };
  const happy = acotar(bruto.happy), sad = acotar(bruto.sad), angry = acotar(bruto.angry);
  const surprised = acotar(bruto.surprised), relaxed = acotar(bruto.relaxed);
  const neutral = acotar(1 - (happy + sad + angry + surprised + relaxed) + (pista.neutral ?? 0));
  return {
    happy: r3(happy), sad: r3(sad), angry: r3(angry),
    surprised: r3(surprised), relaxed: r3(relaxed), neutral: r3(neutral),
  };
}

/** Aura modulada por la emoción SOLO si el ADN la tiene ligada; si no, se queda exactamente igual. */
export function intensidadAuraEmocion(adn: AdnAvatar, estado: EstadoEmocional): number {
  if (!adn.aura.ligadaEmocion) return adn.aura.intensidad;
  const activacion = acotar(estado.activacion);
  const valencia = Math.max(0, acotar(estado.valencia, -1, 1));
  return r3(acotar(adn.aura.intensidad * (0.6 + 0.6 * activacion) + 0.1 * valencia));
}

/** ADN con las expresiones de la emoción y el aura modulada (copia; el original no se toca). */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional): AdnAvatar {
  return {
    ...adn,
    expresionBase: { ...adn.expresionBase, ...expresionesDeEmocion(estado) },
    aura: { ...adn.aura, intensidad: intensidadAuraEmocion(adn, estado) },
  };
}

/* ── Visemas: la boca sigue a la voz ────────────────────────────────────────── */

/** Visemas VRM 1.0 de vocal española. */
const VISEMA_DE_VOCAL: Record<string, Expresion> = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou" };
export const VISEMAS: readonly Expresion[] = ["aa", "ee", "ih", "oh", "ou"];

export interface Visema {
  expresion: Expresion;
  desdeMs: number;
  hastaMs: number;
}

/**
 * Visemas de un texto: una vocal → una postura de boca, repartidas por la duración estimada de la
 * voz (`estimarDuracionAudioMs`, de `sincronia-voz.ts`). Sin vocales no hay visemas (el gesto sí).
 */
export function visemasDeTexto(texto: string): Visema[] {
  const limpio = (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const vocales = [...limpio].filter((c) => VISEMA_DE_VOCAL[c]);
  if (!vocales.length) return [];
  const total = estimarDuracionAudioMs(texto);
  const paso = total / vocales.length;
  return vocales.map((c, i) => ({
    expresion: VISEMA_DE_VOCAL[c],
    desdeMs: Math.round(i * paso),
    hastaMs: Math.round((i + 1) * paso),
  }));
}

/** Visema que toca en el milisegundo `ms`, o `null` si ya terminó. */
export function visemaEn(visemas: readonly Visema[], ms: number): Expresion | null {
  return visemas.find((v) => ms >= v.desdeMs && ms < v.hastaMs)?.expresion ?? null;
}

/**
 * Superpone el visema actual a las expresiones del ADN. Con `null` no cambia nada (así los visemas
 * del editor no se borran al terminar de hablar: cada fotograma se recalcula desde el ADN base).
 */
export function conVisema(adn: AdnAvatar, actual: Expresion | null): AdnAvatar {
  if (!actual) return adn;
  const expresionBase = { ...adn.expresionBase };
  for (const v of VISEMAS) if (v !== actual) delete expresionBase[v];
  expresionBase[actual] = 0.85;
  return { ...adn, expresionBase };
}

/* ── Gesto de habla: el motor único con el carácter del ADN ─────────────────── */

/**
 * Gesto para `moverAvatar` respetando `adn.movimiento`: la energía y la amplitud suben la del gesto,
 * el ritmo acorta su duración y la postura se añade a la frase de Kimodo. Misma identidad de gesto
 * en todos los niveles del motor; aquí solo cambia el carácter del dueño del avatar.
 */
export function gestoDeHabla(adn: AdnAvatar, texto: string, estado: EstadoEmocional): Gesto {
  const m = adn.movimiento;
  const energia = acotar(0.25 + 0.45 * acotar(m.energia) + 0.2 * acotar(m.amplitud) + 0.1 * acotar(estado.activacion));
  const base = gestoDesdeTexto(texto, { emocion: estado.emocion, energia });
  const postura = acotar(m.postura) >= 0.5 ? "upright and confident posture" : "relaxed and close posture";
  const duracionMs = Math.max(400, Math.round((base.duracionMs ?? 1600) * (1.2 - 0.4 * acotar(m.ritmo))));
  return { ...base, prompt: `${base.prompt}, ${postura}`, energia: r3(energia), duracionMs };
}
