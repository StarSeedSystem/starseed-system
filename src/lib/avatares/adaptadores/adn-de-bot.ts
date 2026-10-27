/**
 * AV1011C · EL ADN DE UN BOT CON CUERPO 3D. Contrato: architecture/astraura-avatares-3d.md §2 y §8.
 * Con `avatar-3d` o `vrm`, `avatarRef` apunta al ADN («biblioteca:…»); si no hay ADN se usa
 * `adnPorDefecto` con el tono de su orbe y dueño `{ tipo: "bot" }`. Aquí vive todo el mapeo puro:
 * emoción → expresiones/aura, habla → gesto (respetando `adn.movimiento`) y visemas. Sin red,
 * disco, reloj ni aleatorio.
 */
import { adnPorDefecto, esRefInterna, sanearAdn, type AdnAvatar, type Expresion } from "../adn/adn";
import type { Bot, EstadoEmocional, FormaCuerpo } from "@/lib/astraura-bots/tipos";
import { estimarDuracionAudioMs, gestoDesdeTexto } from "../movimiento/sincronia-voz";
import type { Gesto } from "../movimiento/motor";

/** Formas de cuerpo que pueden vestir el ADN de un avatar. */
export const FORMAS_CON_ADN: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];
/** Las cinco expresiones que mueve la emoción (además de los visemas del habla). */
export const EXPRESIONES_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
export type LeerAdn = (ref: string) => AdnAvatar | null;

export interface AdnDeBot {
  adn: AdnAvatar;
  /** `false` si el cuerpo no es avatar 3D/VRM: no se pinta un avatar que no toca. */
  aplica: boolean;
  origen: "guardado" | "por-defecto";
  /** Motivo legible cuando no se pudo usar el ADN guardado (basta de ilusiones). */
  aviso?: string;
}

export function formaConAdn(forma: FormaCuerpo): boolean {
  return FORMAS_CON_ADN.includes(forma);
}

/** Id estable del ADN por defecto de un bot (mismo bot → mismo id en todos los aparatos). */
export function idAdnDeBot(botId: string): string {
  return `adn-bot-${botId.replace(/[^\w.:-]/g, "-").slice(0, 60)}`;
}

/** Referencia al ADN del bot, solo con forma 3D y referencia interna de la Biblioteca. */
export function refAdnDeBot(bot: Pick<Bot, "cuerpo">): string | null {
  if (!formaConAdn(bot.cuerpo.forma)) return null;
  const ref = bot.cuerpo.avatarRef;
  return esRefInterna(ref) && ref.startsWith("biblioteca:") ? ref : null;
}

/** ADN que viste al bot: el guardado bajo su referencia (si `leer` lo entrega) o el de por defecto. */
export function adnDeBot(bot: Pick<Bot, "id" | "nombre" | "cuerpo">, leer?: LeerAdn): AdnDeBot {
  const aplica = formaConAdn(bot.cuerpo.forma);
  const base = adnPorDefecto(idAdnDeBot(bot.id), bot.nombre, { tipo: "bot", id: bot.id }, bot.cuerpo.tono);
  if (!aplica) return { adn: base, aplica, origen: "por-defecto", aviso: "Su cuerpo no es un avatar 3D: no se usa ADN." };
  if (!bot.cuerpo.avatarRef) return { adn: base, aplica, origen: "por-defecto" };
  const interna = refAdnDeBot(bot);
  if (!interna) return { adn: base, aplica, origen: "por-defecto", aviso: "La referencia del avatar no es interna («biblioteca:»): se usa la orbe del bot." };
  const cargado = leer && sanearAdn(leer(interna));
  if (!cargado) return { adn: base, aplica, origen: "por-defecto", aviso: "No hay un ADN guardado válido en este aparato: se usa la orbe del bot." };
  if (cargado.dueno.tipo !== "bot" || cargado.dueno.id !== bot.id) {
    return { adn: base, aplica, origen: "por-defecto", aviso: "Ese ADN pertenece a otro dueño: se usa la orbe de este bot." };
  }
  return { adn: cargado, aplica, origen: "guardado" };
}

function num(v: unknown, min: number, max: number, def = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

/** Expresión principal según valencia (-1…1) y activación (0…1). */
export function expresionDeEmocion(e: Pick<EstadoEmocional, "valencia" | "activacion">): Expresion {
  const v = num(e.valencia, -1, 1);
  const a = num(e.activacion, 0, 1);
  if (v >= 0.3) return a >= 0.65 ? "happy" : "relaxed";
  if (v <= -0.3) return a >= 0.6 ? "angry" : "sad";
  return a >= 0.8 ? "surprised" : "relaxed";
}

/** Mezcla de expresiones para el visor: una principal y su intensidad (0,35…1). */
export function expresionesDeEmocion(e: Pick<EstadoEmocional, "valencia" | "activacion">): Partial<Record<Expresion, number>> {
  const fuerza = Math.round(Math.min(1, 0.35 + 0.65 * Math.max(Math.abs(num(e.valencia, -1, 1)), num(e.activacion, 0, 1))) * 100) / 100;
  return { [expresionDeEmocion(e)]: fuerza };
}

/** Intensidad del aura: ligada a la emoción respira con la activación; si no, queda fija. */
export function intensidadAura(adn: Pick<AdnAvatar, "aura">, e: Pick<EstadoEmocional, "valencia" | "activacion">): number {
  if (!adn.aura.ligadaEmocion) return adn.aura.intensidad;
  const x = adn.aura.intensidad * (0.55 + 0.65 * num(e.activacion, 0, 1) + 0.2 * ((num(e.valencia, -1, 1) + 1) / 2));
  return Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000;
}

/** ADN de PINTADO (no toca `rev`): limpia las cinco emociones anteriores y pone la actual. */
export function aplicarEmocion(adn: AdnAvatar, e: EstadoEmocional): AdnAvatar {
  const expresionBase = { ...adn.expresionBase };
  for (const k of EXPRESIONES_EMOCION) delete expresionBase[k];
  return { ...adn, expresionBase: { ...expresionBase, ...expresionesDeEmocion(e) }, aura: { ...adn.aura, intensidad: intensidadAura(adn, e) } };
}

/** Gesto de habla con el carácter del ADN (energía, amplitud, ritmo y postura) intacto. */
export function gestoDeHabla(texto: string, adn: Pick<AdnAvatar, "movimiento">, emocion?: EstadoEmocional): Gesto {
  const m = adn.movimiento;
  const g = gestoDesdeTexto(texto, { emocion: emocion?.emocion, energia: m.energia });
  const porte = [
    m.amplitud >= 0.66 ? "wide amplitude" : m.amplitud <= 0.33 ? "small amplitude" : "",
    m.ritmo >= 0.66 ? "quick rhythm" : m.ritmo <= 0.33 ? "slow rhythm" : "",
    m.postura >= 0.66 ? "upright posture" : m.postura <= 0.33 ? "relaxed posture" : "",
  ].filter(Boolean).join(", ");
  return { ...g, prompt: porte ? `${g.prompt} with ${porte}` : g.prompt };
}

export type VisemaExpresion = Extract<Expresion, "aa" | "ih" | "ou" | "ee" | "oh">;
export interface Visema { expresion: VisemaExpresion; inicioMs: number; finMs: number; valor: number }

const VOCAL: Record<string, VisemaExpresion | undefined> = {
  a: "aa", á: "aa", e: "ee", é: "ee", i: "ih", í: "ih", y: "ih",
  o: "oh", ó: "oh", u: "ou", ú: "ou", ü: "ou",
};

/** Visemas del texto, repartidos por su duración estimada por `sincronia-voz`. */
export function visemasDeTexto(texto: string, duracionMs?: number): Visema[] {
  const limpio = (texto || "").trim().toLowerCase();
  const lista: VisemaExpresion[] = [];
  for (const c of limpio) { const v = VOCAL[c]; if (v) lista.push(v); }
  if (!lista.length) return [];
  const seleccion = lista.slice(0, 160);
  const total = Math.max(200, Math.round(duracionMs ?? estimarDuracionAudioMs(limpio)));
  const paso = total / seleccion.length;
  return seleccion.map((expresion, i) => ({ expresion, inicioMs: Math.round(i * paso), finMs: Math.round((i + 1) * paso), valor: 0.9 }));
}

/** Visema activo en un instante, o `null` si el habla ya terminó o aún no empieza. */
export function visemaEn(visemas: readonly Visema[], ms: number): Visema | null {
  return visemas.find((v) => ms >= v.inicioMs && ms < v.finMs) ?? null;
}
