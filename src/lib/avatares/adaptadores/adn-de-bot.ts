/**
 * Bots con cuerpo · ADN DE AVATAR DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2 y §12.
 *
 * Cuando `bot.cuerpo.forma` es `avatar-3d` o `vrm`, `avatarRef` apunta a un ADN de la Biblioteca
 * (`biblioteca:…`). Si no existe o es de otro dueño, se usa el ADN de la orbe con el tono del bot.
 * La emoción EXPRESADA mueve expresiones y aura; al hablar, visemas y gestos salen del mismo motor
 * de movimiento. El almacén se inyecta; sin red, sin disco, sin reloj y sin azar.
 */
import { adnPorDefecto, esRefInterna, sanearAdn, texto, type AdnAvatar, type Expresion } from "../adn/adn";
import { estimarDuracionAudioMs, gestoDesdeTexto } from "../movimiento/sincronia-voz";
import type { Gesto } from "../movimiento/motor";
import { acotar, type Bot, type EstadoEmocional } from "@/lib/astraura-bots/tipos";

export type Visema = "aa" | "ih" | "ou" | "ee" | "oh";
export interface EventoVisema { visema: Visema; desdeMs: number; hastaMs: number; peso: number }
export interface ResultadoAdnDeBot { adn: AdnAvatar; origen: "guardado" | "por-defecto"; motivo?: string }
export type CargarAdn = (ref: string) => Promise<AdnAvatar | null>;
export type OpcionesAdnDeBot = { cargar?: CargarAdn } | CargarAdn;

const FORMAS_ADN = ["avatar-3d", "vrm"] as const;
/** Expresiones VRM que mueve la emoción del bot (las cinco del contrato). */
export const EXPRESIONES_DE_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const satisfies readonly Expresion[];
const VISEMAS: readonly Visema[] = ["aa", "ih", "ou", "ee", "oh"];
const VISEMA_DE_VOCAL: Record<string, Visema> = {
  a: "aa", á: "aa", e: "ee", é: "ee", i: "ih", í: "ih", o: "oh", ó: "oh", u: "ou", ú: "ou", ü: "ou",
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** ¿Esta forma de cuerpo usa el ADN de avatar 3D? */
export function usaAdnDeBot(bot: Pick<Bot, "cuerpo">): boolean {
  return (FORMAS_ADN as readonly string[]).includes(bot.cuerpo.forma);
}

/** Id del ADN por defecto: el de su referencia si la trae, o uno estable por bot (sin reloj ni azar). */
export function idAdnDeBot(bot: Pick<Bot, "id" | "cuerpo">): string {
  const ref = bot.cuerpo.avatarRef;
  return ref && esRefInterna(ref) && ref.startsWith("biblioteca:") ? ref.slice("biblioteca:".length) : `adn-bot-${texto(bot.id, 60) || "sin-id"}`;
}

/** ADN de partida de un bot: su orbe, con el tono del cuerpo y dueño `{ tipo: "bot" }`. */
export function adnDeBotPorDefecto(bot: Bot): AdnAvatar {
  return adnPorDefecto(idAdnDeBot(bot), bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
}

/** Almacén real (solo navegador): a demanda, para que este módulo siga siendo puro. */
async function cargarDelAlmacen(ref: string): Promise<AdnAvatar | null> {
  if (typeof window === "undefined") return null;
  try {
    const { loadAdnEntry, parseAdnEntry } = await import("./almacen-adn");
    const entry = await loadAdnEntry(ref);
    return entry ? await parseAdnEntry(entry) : null;
  } catch { return null; }
}

/** Carga el ADN del bot o explica por qué se usa el de la orbe. Nunca lanza por un ADN roto. */
export async function resolverAdnDeBot(bot: Bot, op: OpcionesAdnDeBot = {}): Promise<ResultadoAdnDeBot> {
  const defecto = adnDeBotPorDefecto(bot);
  if (!usaAdnDeBot(bot)) return { adn: defecto, origen: "por-defecto", motivo: "Esta forma de cuerpo no usa el ADN de avatar 3D." };
  const ref = bot.cuerpo.avatarRef;
  if (!ref) return { adn: defecto, origen: "por-defecto", motivo: "El bot aún no eligió avatar: se muestra su orbe." };
  if (!esRefInterna(ref)) return { adn: defecto, origen: "por-defecto", motivo: "La referencia del avatar no es interna («biblioteca:»): no se carga." };
  const cargar = typeof op === "function" ? op : op.cargar ?? cargarDelAlmacen;
  const guardado = await cargar(ref);
  const adn = guardado ? sanearAdn(guardado) : null;
  if (!adn) return { adn: defecto, origen: "por-defecto", motivo: `No se encontró el ADN «${ref}»: se muestra la orbe del bot.` };
  if (adn.dueno.tipo !== "bot" || adn.dueno.id !== bot.id) {
    return { adn: defecto, origen: "por-defecto", motivo: "Ese ADN pertenece a otro dueño: un bot no viste el avatar de otra persona o entidad." };
  }
  return { adn, origen: "guardado" };
}

/** `adnDeBot(bot)`: el ADN guardado o el de la orbe, listo para el visor. */
export async function adnDeBot(bot: Bot, op: OpcionesAdnDeBot = {}): Promise<AdnAvatar> {
  return (await resolverAdnDeBot(bot, op)).adn;
}

/* ── Emoción → expresiones y aura ─────────────────────────────────────────── */

/** Matiz que aporta la emoción nombrada, además de valencia y activación. */
const MATIZ: Record<EstadoEmocional["emocion"], Partial<Record<Expresion, number>>> = {
  alegria: { happy: 0.5 }, ternura: { relaxed: 0.45 }, asombro: { surprised: 0.5 },
  preocupacion: { sad: 0.4 }, calma: { relaxed: 0.25 }, concentracion: { relaxed: 0.2 }, curiosidad: { surprised: 0.25 },
};

/**
 * Valencia y activación → expresiones (happy/sad/angry/surprised/relaxed). La valencia decide el
 * signo, la activación la energía y la emoción nombrada matiza. Siempre acotado a [0, 1].
 */
export function expresionesDeEmocion(estado: EstadoEmocional): Partial<Record<Expresion, number>> {
  const v = acotar(estado.valencia, -1, 1), a = acotar(estado.activacion);
  const penumbra = Math.max(0, (-v - 0.15) / 0.85);
  const pesos: Record<(typeof EXPRESIONES_DE_EMOCION)[number], number> = {
    happy: Math.max(0, (v - 0.15) / 0.85),
    sad: penumbra * (1 - 0.6 * a),
    angry: penumbra * Math.max(0, (a - 0.45) / 0.55),
    surprised: Math.max(0, (a - 0.55) / 0.45) * (1 - 0.5 * Math.abs(v)),
    relaxed: Math.max(0, (0.5 - a) / 0.5) * (1 - 0.5 * Math.abs(v)),
  };
  const matiz = MATIZ[estado.emocion];
  const out: Partial<Record<Expresion, number>> = {};
  for (const k of EXPRESIONES_DE_EMOCION) {
    const n = Math.max(pesos[k], matiz[k] ?? 0);
    if (n > 0.005) out[k] = r3(acotar(n));
  }
  return out;
}

/** Intensidad del aura según la emoción (solo si `aura.ligadaEmocion`). 0 … 1. */
export function intensidadAuraDeEmocion(adn: AdnAvatar, estado: EstadoEmocional): number {
  if (!adn.aura.ligadaEmocion) return adn.aura.intensidad;
  const factor = 0.65 + 0.25 * acotar(estado.valencia, -1, 1) + 0.4 * acotar(estado.activacion);
  return r3(acotar(adn.aura.intensidad * factor));
}

/** ADN listo para el visor: expresiones de la emoción y, si se habla, el visema activo (`null` = boca cerrada). */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional, visema?: Visema | null): AdnAvatar {
  const expresionBase = { ...adn.expresionBase };
  const emocion = expresionesDeEmocion(estado);
  for (const k of EXPRESIONES_DE_EMOCION) expresionBase[k] = Math.max(adn.expresionBase[k] ?? 0, emocion[k] ?? 0);
  if (visema !== undefined) for (const k of VISEMAS) expresionBase[k] = visema === k ? 0.8 : 0;
  return { ...adn, expresionBase, aura: { ...adn.aura, intensidad: intensidadAuraDeEmocion(adn, estado) } };
}

/* ── Habla: visemas y gesto ───────────────────────────────────────────────── */

/**
 * Visemas (VRM 1.0) de una frase: cada vocal, con su tramo dentro de la duración estimada por
 * `sincronia-voz.ts`. Sin texto o sin vocales no inventa boca: devuelve `[]`.
 */
export function visemasDeTexto(frase: string): EventoVisema[] {
  const limpio = texto(frase, 2000).toLowerCase();
  if (!limpio) return [];
  const vocales: Visema[] = [];
  for (const m of limpio.matchAll(/[aeiouáéíóúü]/g)) {
    const v = VISEMA_DE_VOCAL[m[0]];
    if (v) vocales.push(v);
  }
  if (!vocales.length) return [];
  const total = Math.max(200, estimarDuracionAudioMs(limpio)), tramo = total / vocales.length;
  return vocales.map((visema, i) => ({
    visema, desdeMs: Math.round(i * tramo), hastaMs: Math.round((i + 1) * tramo), peso: 0.8,
  }));
}

/** Gesto de habla: sale de `gestoDesdeTexto` y respeta el carácter de movimiento del ADN. */
export function gestoDeHabla(adn: AdnAvatar, estado: EstadoEmocional, frase: string): Gesto {
  const m = adn.movimiento;
  const base = gestoDesdeTexto(frase, {
    emocion: estado.emocion,
    energia: acotar(m.energia * (0.5 + 0.5 * estado.activacion)),
  });
  const matiz = [
    m.amplitud >= 0.66 ? "broad gestures" : m.amplitud <= 0.33 ? "contained gestures" : "",
    m.ritmo >= 0.66 ? "lively tempo" : m.ritmo <= 0.33 ? "slow tempo" : "",
    m.postura >= 0.66 ? "upright posture" : m.postura <= 0.33 ? "relaxed posture" : "",
  ].filter(Boolean).join(", ");
  return {
    ...base,
    energia: r3(acotar((base.energia ?? 0.5) * (0.45 + 0.55 * m.energia) + 0.3 * acotar(estado.activacion))),
    prompt: matiz ? `${base.prompt} with ${matiz}` : base.prompt,
  };
}
