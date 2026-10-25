/**
 * Avatares 3D · ADN DEL BOT (AV1011C). Contrato: architecture/astraura-avatares-3d.md §2, §8 y §9-C.
 *
 * Cuando el cuerpo del bot es `avatar-3d` o `vrm`, `cuerpo.avatarRef` apunta a un ADN interno
 * (`biblioteca:…`). Aquí se carga ese ADN o se crea el de partida (`adnPorDefecto`) con el tono de su
 * orbe y dueño `{ tipo: "bot" }`. La carga real vive en el almacén del aparato y se inyecta para poder
 * probar la lógica sin disco. También traduce el gesto del habla y el clip del motor único de movimiento
 * al estilo 2,5D de un avatar 3D, respetando `adn.movimiento`.
 */
import { adnPorDefecto, esRefInterna, sanearAdn, texto, type AdnAvatar, type EstiloMovimiento } from "../adn/adn";
import type { Bot, EstadoEmocional, FormaCuerpo } from "@/lib/astraura-bots/tipos";
import { gestoDesdeTexto } from "../movimiento/sincronia-voz";
import type { Gesto, MovimientoClip } from "../movimiento/motor";

/** Formas de cuerpo que pintan un avatar 3D con ADN. */
export const FORMAS_CON_AVATAR: readonly FormaCuerpo[] = ["avatar-3d", "vrm"];
export const usaAvatar3d = (forma: FormaCuerpo): boolean => FORMAS_CON_AVATAR.includes(forma);

/** Carga un ADN por su referencia interna. Se inyecta en las pruebas; por defecto lee el almacén. */
export type CargarAdnDeBot = (ref: string) => Promise<AdnAvatar | null>;

async function cargarDelAlmacen(ref: string): Promise<AdnAvatar | null> {
  try {
    const { loadAdnEntry } = await import("./almacen-adn");
    const entrada = await loadAdnEntry(ref);
    if (!entrada) return null;
    return sanearAdn(JSON.parse(entrada.raw));
  } catch {
    return null;
  }
}

/** Id estable del ADN de un bot: el mismo bot conserva su avatar entre montajes y equipos. */
export function idAdnDeBot(bot: Pick<Bot, "id">): string {
  const limpio = texto(bot.id, 64).replace(/[^\w.-]+/g, "-");
  return `adn-bot-${limpio || "local"}`;
}

/** ADN de partida del bot: la orbe de siempre, con su tono, ya con dueño de tipo bot. */
export function adnPorDefectoDeBot(bot: Pick<Bot, "id" | "nombre" | "cuerpo">): AdnAvatar {
  return adnPorDefecto(idAdnDeBot(bot), bot.nombre, { tipo: "bot", id: texto(bot.id, 80) }, bot.cuerpo.tono);
}

/**
 * ADN con el que se viste un bot: el guardado en `cuerpo.avatarRef` si existe y es válido; si no
 * (o si su forma no es de avatar 3D), el de partida con el tono de su orbe. Nunca lanza: un almacén
 * caído o una entrada rota acaban en el ADN por defecto.
 */
export async function adnDeBot(bot: Bot, cargar: CargarAdnDeBot = cargarDelAlmacen): Promise<AdnAvatar> {
  const ref = bot.cuerpo.avatarRef;
  if (usaAvatar3d(bot.cuerpo.forma) && esRefInterna(ref)) {
    const guardado = await cargar(ref).catch(() => null);
    const adn = guardado ? sanearAdn(guardado) : null;
    if (adn) return adn;
  }
  return adnPorDefectoDeBot(bot);
}

const entre = (x: number, min: number, max: number) => (Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min);

/**
 * Gesto del habla del bot: solo mientras habla y con texto. La energía del ADN manda en la amplitud
 * del gesto y su ritmo alarga o acorta el clip; la emoción tiñe el prompt. Sin habla, `null`.
 */
export function gestoDeBot(
  adn: Pick<AdnAvatar, "movimiento">,
  estado: EstadoEmocional | null | undefined,
  textoDicho: string,
  hablando: boolean,
): Gesto | null {
  const frase = (textoDicho ?? "").trim();
  if (!hablando || !frase) return null;
  const m = adn.movimiento;
  const energia = entre(m.energia, 0, 1) * (0.6 + 0.6 * entre(m.amplitud, 0, 1));
  const base = gestoDesdeTexto(frase, { emocion: estado?.emocion, energia: entre(energia, 0, 1) });
  const ritmo = entre(m.ritmo, 0, 1);
  const duracion = base.duracionMs ?? 2000;
  return { ...base, duracionMs: Math.max(400, Math.round(duracion * (1.4 - 0.8 * ritmo))) };
}

/** Estilo del contenedor 2,5D para el fotograma del clip (o reposo si aún no hay clip). */
export interface EstiloVivo { transform: string; transition: string }

/** Convierte el fotograma del motor único de movimiento en balanceo, respiración y énfasis. */
export function estiloDeClip(
  clip: MovimientoClip | null,
  fotograma: number,
  movimiento: EstiloMovimiento,
): EstiloVivo {
  const n = clip?.rotaciones.length ?? 0;
  if (!clip || n === 0) return { transform: "none", transition: "transform 300ms ease-in-out" };
  const i = Math.max(0, Math.min(n - 1, Math.floor(fotograma)));
  const fila = clip.rotaciones[i];
  if (!fila || fila.length === 0) return { transform: "none", transition: "transform 300ms ease-in-out" };
  const columna = ((fila[1] ?? 0) + (fila[2] ?? 0) + (fila[3] ?? 0)) / 3;
  const cabeza = fila[4] ?? columna;
  const amplitud = 0.6 + 1.2 * entre(movimiento.amplitud, 0, 1);
  const energia = entre(movimiento.energia, 0, 1);
  const balanceo = entre((((fila[0] ?? 0) * 45) + columna * 12) * amplitud, -12, 12);
  const inclinacion = entre(cabeza * 38 * amplitud, -8, 8);
  const respiracion = entre((clip.raiz?.[i]?.[1] ?? 0) * 140 * amplitud, -6, 6);
  const escala = 1 + entre(columna * energia * 0.35, -0.05, 0.06);
  return {
    transform: `translateY(${respiracion.toFixed(2)}%) rotate(${balanceo.toFixed(2)}deg) rotateX(${inclinacion.toFixed(2)}deg) scale(${escala.toFixed(3)})`,
    transition: "transform 90ms linear",
  };
}
