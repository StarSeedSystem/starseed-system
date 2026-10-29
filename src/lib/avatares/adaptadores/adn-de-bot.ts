/**
 * ADN DE AVATAR DE UN BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2 y §6.
 *
 * Con `bot.cuerpo.forma` «avatar-3d» o «vrm», `bot.cuerpo.avatarRef` apunta al ADN del bot en la
 * Biblioteca (`biblioteca:`). Aquí se carga ese ADN o se crea `adnPorDefecto` con el tono de su orbe y
 * dueño `{ tipo: "bot" }`. La emoción EXPRESADA mueve la cara y el aura ligada; las visemas acompañan
 * al habla y el gesto sale del motor único con el carácter (`adn.movimiento`) del ADN. PURO: sin reloj,
 * red ni DOM.
 */
import type { Bot, EstadoEmocional, FormaCuerpo } from "@/lib/astraura-bots/tipos";
import { adnPorDefecto, sanearAdn, texto, type AdnAvatar, type Expresion } from "../adn/adn";
import { gestoDesdeTexto } from "../movimiento/sincronia-voz";
import type { Gesto } from "../movimiento/motor";

export const FORMAS_CON_ADN: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];
export const EXPRESIONES_EMOCION = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
export type ExpresionEmocion = (typeof EXPRESIONES_EMOCION)[number];
const acotar = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);

/** ¿Este cuerpo debe verse con el ADN de la Biblioteca? */
export function usaAdnDeBot(bot: Pick<Bot, "cuerpo">): boolean {
  return FORMAS_CON_ADN.includes(bot.cuerpo.forma) && /^biblioteca:[\w./:-]{1,160}$/.test(bot.cuerpo.avatarRef ?? "");
}

/** Id del ADN del bot: el que lleva su referencia o uno estable derivado de su id. */
export function idAdnDeBot(bot: Pick<Bot, "id" | "cuerpo">): string {
  const ref = bot.cuerpo.avatarRef ?? "";
  if (ref.startsWith("biblioteca:")) {
    const id = texto(ref.slice("biblioteca:".length), 80);
    if (id) return id;
  }
  const estable = texto(bot.id, 48).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "sin-id";
  return `adn-bot-${estable}`;
}

/** ADN del bot: el guardado si es suyo, o `adnPorDefecto` con el tono de su orbe. No toca disco ni red. */
export function adnDeBot(bot: Bot, guardado: AdnAvatar | null = null): AdnAvatar {
  const dueno = { tipo: "bot" as const, id: texto(bot.id, 80) };
  const limpio = guardado ? sanearAdn(guardado) : null;
  if (limpio && limpio.dueno.tipo === "bot" && limpio.dueno.id === dueno.id) return limpio;
  return adnPorDefecto(idAdnDeBot(bot), bot.nombre, dueno, bot.cuerpo.tono);
}

/** Fuerza emocional 0…1 = mezcla de cuánto se siente (|valencia|) y cuánto se activa. */
export function fuerzaEmocional(estado: Pick<EstadoEmocional, "valencia" | "activacion">): number {
  return acotar((Math.abs(acotar(estado.valencia, -1, 1)) + acotar(estado.activacion, 0, 1)) / 2, 0, 1);
}

/** Valencia y activación → UNA expresión de VRM 1.0: alegre, triste, enfadado, sorprendido, relajado o neutral. */
export function expresionDeEmocion(
  estado: Pick<EstadoEmocional, "valencia" | "activacion">,
): { expresion: ExpresionEmocion | "neutral"; valor: number } {
  const v = acotar(estado.valencia, -1, 1);
  const a = acotar(estado.activacion, 0, 1);
  if (v >= 0.3) return { expresion: "happy", valor: acotar(0.4 + v * 0.6, 0.4, 1) };
  if (v <= -0.3) return a >= 0.6
    ? { expresion: "angry", valor: acotar(0.4 - v * 0.6, 0.4, 1) }
    : { expresion: "sad", valor: acotar(0.4 - v * 0.6, 0.4, 1) };
  if (a >= 0.7) return { expresion: "surprised", valor: acotar(0.4 + a * 0.6, 0.4, 1) };
  if (a <= 0.35) return { expresion: "relaxed", valor: acotar(0.4 + (1 - a) * 0.6, 0.4, 1) };
  return { expresion: "neutral", valor: 0.4 };
}

/** Mapa completo de las cinco emociones (una encendida, las demás a cero) para pintar la cara. */
export function expresionesDeEmocion(
  estado: Pick<EstadoEmocional, "valencia" | "activacion">,
): Record<ExpresionEmocion | "neutral", number> {
  const { expresion, valor } = expresionDeEmocion(estado);
  const salida = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0, neutral: 0 };
  salida[expresion] = valor;
  return salida;
}

/** Intensidad del aura: si está ligada a la emoción, respira con ella sin perder la base del ADN. */
export function intensidadAuraEmocion(adn: AdnAvatar, estado: Pick<EstadoEmocional, "valencia" | "activacion">): number {
  if (!adn.aura.ligadaEmocion) return adn.aura.intensidad;
  return acotar(adn.aura.intensidad * (0.6 + 0.8 * fuerzaEmocional(estado)), 0, 1);
}

/** ADN de pantalla con la emoción aplicada: expresiones y, si toca, el aura. No sube `rev`. */
export function adnConEmocion(adn: AdnAvatar, estado: EstadoEmocional | null | undefined): AdnAvatar {
  if (!estado) return adn;
  const emociones = expresionesDeEmocion(estado);
  const expresionBase = { ...adn.expresionBase };
  for (const clave of EXPRESIONES_EMOCION) expresionBase[clave] = emociones[clave];
  expresionBase.neutral = emociones.neutral;
  return { ...adn, expresionBase, aura: adn.aura.ligadaEmocion ? { ...adn.aura, intensidad: intensidadAuraEmocion(adn, estado) } : adn.aura };
}

/** Visemas (boca) de un texto en español: reparte aa/ee/ih/oh/ou por sus vocales. */
export function visemasDeTexto(textoHablado: string, abierto = 1): Partial<Record<Expresion, number>> {
  const cuenta: Record<string, number> = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };
  const limpio = (textoHablado || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const letra of limpio) {
    if (letra === "a") cuenta.aa += 1;
    else if (letra === "e") cuenta.ee += 1;
    else if (letra === "i") cuenta.ih += 1;
    else if (letra === "o") cuenta.oh += 1;
    else if (letra === "u") cuenta.ou += 1;
  }
  const maximo = Math.max(...Object.values(cuenta));
  if (!maximo) return {};
  const salida: Partial<Record<Expresion, number>> = {};
  for (const [visema, valor] of Object.entries(cuenta)) if (valor > 0) salida[visema as Expresion] = Number(((valor / maximo) * acotar(abierto, 0, 1)).toFixed(3));
  return salida;
}

/** ADN de pantalla mientras habla: suma las visemas sin borrar la expresión emocional de la cara. */
export function adnConVisemas(adn: AdnAvatar, textoHablado: string, abierto = 1): AdnAvatar {
  const visemas = visemasDeTexto(textoHablado, abierto);
  return Object.keys(visemas).length ? { ...adn, expresionBase: { ...adn.expresionBase, ...visemas } } : adn;
}

/** Gesto para `moverAvatar` con el carácter del ADN (energía, amplitud, ritmo y postura) y la emoción del bot. */
export function gestoDeBot(adn: AdnAvatar, textoHablado: string, estado?: EstadoEmocional | null): Gesto {
  const activacion = acotar(estado?.activacion ?? 0.5, 0, 1);
  const energia = acotar(adn.movimiento.energia * 0.5 + adn.movimiento.amplitud * 0.3 + activacion * 0.2, 0, 1);
  const base = gestoDesdeTexto(textoHablado, { emocion: estado?.emocion, energia });
  const duracionMs = Math.max(400, Math.round((base.duracionMs ?? 2400) * (1.3 - adn.movimiento.ritmo * 0.6)));
  const postura = adn.movimiento.postura > 0.65 ? " with upright confident posture" : adn.movimiento.postura < 0.35 ? " with relaxed posture" : "";
  return { ...base, energia, duracionMs, prompt: `${base.prompt}${postura}` };
}
