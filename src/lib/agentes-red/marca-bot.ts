/**
 * Marca de «bot de un agente de IA» (Ola 1025U · U3). PURO: sin React, sin red, sin `node:*`, sin reloj.
 *
 * Regla de Alex: todo lo que publique o comente un agente de IA lleva SIEMPRE la etiqueta «Bot de IA». La etiqueta
 * no se decide en la tarjeta: sale de un dato REAL del autor. Hay dos mitades:
 *   · ESCRIBIR — `marcarComoBot()` es la única puerta por la que pasa el envío de un agente: pone la marca en el
 *     cuerpo (publicaciones y comentarios de `os_posts` / `os_post_comments` / `cafe_posts`, dentro del comentario
 *     `<!--ss:meta {…}-->` que el OS ya sabe leer) o en el objeto (`content` / `post_references` de la tabla
 *     `posts`). Retrocompatible: lo que ya está publicado no tiene marca y se lee como persona, sin migraciones.
 *   · LEER — `esAutorBot()` / `marcaBotDe()` reconocen al bot por esa marca o por los datos reales del autor (un
 *     `Bot`, un `AgenteMundoRef`, un perfil marcado como bot).
 *
 * La marca acompaña al bot, no a la cuenta: un agente publica con la cuenta de su persona, así que bloquear al
 * bot (`bloqueo-bots.ts`) nunca bloquea a la persona.
 */
import { idAgenteMundo, type AgenteMundoRef, type OrigenAgenteMundo } from "@/lib/avatares/mundo/agente-mundo";
import { ORIGENES_BOT, TIPOS_DUENO } from "@/lib/astraura-bots/tipos";

export interface MarcaBot {
  esBotIA: true;
  /** Id del agente en el mundo (`<origen>:<id de origen>`): es lo que se bloquea. */
  agenteId: string;
  nombre: string;
  origen: OrigenAgenteMundo;
  /** Quién responde por él. Con esto se sabe «de qué entidad es» este bot. */
  dueno?: { tipo: string; id: string };
}

const ORIGENES_MUNDO: readonly OrigenAgenteMundo[] = ["personalidad", "bot", "agente-grupo"];
const PATRON_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/;
const ETIQUETA_DUENO: readonly string[] = [...TIPOS_DUENO, "cuenta"];

const obj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

function limpiarDueno(x: unknown): MarcaBot["dueno"] {
  const o = obj(x);
  if (!o || typeof o.tipo !== "string" || !ETIQUETA_DUENO.includes(o.tipo)) return undefined;
  if (typeof o.id !== "string" || !PATRON_ID.test(o.id)) return undefined;
  return { tipo: o.tipo, id: o.id };
}

/** Saneado de una marca que viene de fuera (un jsonb, un comentario del cuerpo): nunca se fía de su forma. */
export function normalizarMarca(x: unknown): MarcaBot | null {
  const o = obj(x);
  if (!o || o.esBotIA !== true || typeof o.agenteId !== "string" || !PATRON_ID.test(o.agenteId)) return null;
  const origen = ORIGENES_MUNDO.includes(o.origen as OrigenAgenteMundo) ? (o.origen as OrigenAgenteMundo) : "bot";
  const nombre = typeof o.nombre === "string" ? o.nombre.trim().slice(0, 80) : "";
  const dueno = limpiarDueno(o.dueno);
  return { esBotIA: true, agenteId: o.agenteId, nombre: nombre || "Bot de IA", origen, ...(dueno ? { dueno } : {}) };
}

export function esMarcaBot(x: unknown): x is MarcaBot {
  return normalizarMarca(x) !== null;
}

/** La marca que lleva lo que publica un agente del mundo. */
export function marcaDeAgente(agente: Pick<AgenteMundoRef, "id" | "origen" | "nombre" | "dueno">): MarcaBot {
  return normalizarMarca({
    esBotIA: true, agenteId: agente.id, nombre: agente.nombre, origen: agente.origen, dueno: agente.dueno,
  }) ?? { esBotIA: true, agenteId: "bot:desconocido", nombre: "Bot de IA", origen: "bot" };
}

/* ── Leer: ¿este autor es un bot? ────────────────────────────────────────── */

/** Contenedores en los que el OS guarda datos del autor o de la publicación (se miran con profundidad acotada). */
const CONTENEDORES = ["autorBot", "bot", "author", "autor", "post_references", "content", "references"] as const;

function pareceBotReal(o: Record<string, unknown>): boolean {
  const dueno = obj(o.dueno);
  return typeof o.id === "string" && !!dueno && typeof dueno.tipo === "string" && typeof dueno.id === "string"
    && typeof o.origen === "string" && (ORIGENES_BOT as readonly string[]).includes(o.origen)
    && !!obj(o.personalidad) && !!obj(o.cuerpo);
}

function pareceAgenteMundo(o: Record<string, unknown>): boolean {
  return o.esBotIA === true && typeof o.id === "string" && typeof o.origen === "string" && !!obj(o.dueno);
}

/**
 * La marca de bot de lo que se le pase, o `null` si es una persona. Reconoce, por este orden: una marca; un
 * `AgenteMundoRef`; un `Bot` de Astraura; un autor con `esBotIA`/`is_bot`/`isBot` o de tipo «bot»; y, dentro de
 * `author`/`content`/`post_references`/`bot`/`autorBot`, cualquiera de lo anterior.
 */
export function marcaBotDe(fuente: unknown, profundidad = 0): MarcaBot | null {
  const o = obj(fuente);
  if (!o || profundidad > 2) return null;

  const directa = normalizarMarca(o);
  if (directa) return directa;

  if (pareceAgenteMundo(o)) {
    return marcaDeAgente(o as unknown as Pick<AgenteMundoRef, "id" | "origen" | "nombre" | "dueno">);
  }
  if (pareceBotReal(o)) {
    const dueno = obj(o.dueno)!;
    return normalizarMarca({
      esBotIA: true, agenteId: idAgenteMundo("bot", String(o.id)), nombre: o.nombre, origen: "bot",
      dueno: { tipo: dueno.tipo, id: dueno.id },
    });
  }

  const marcadoComoBot = o.esBotIA === true || o.is_bot === true || o.isBot === true
    || o.kind === "bot" || o.tipo === "bot" || o.profile_kind === "bot";
  if (marcadoComoBot) {
    const id = [o.agenteId, o.id, o.handle, o.slug].find((v): v is string => typeof v === "string" && PATRON_ID.test(v));
    const nombre = [o.nombre, o.name, o.display_name, o.authorName].find((v): v is string => typeof v === "string");
    return normalizarMarca({ esBotIA: true, agenteId: id ?? "bot:perfil-marcado", nombre, origen: "bot", dueno: o.dueno });
  }

  for (const clave of CONTENEDORES) {
    const dentro = marcaBotDe(o[clave], profundidad + 1);
    if (dentro) return dentro;
  }
  return null;
}

/** ¿El autor (o la publicación/comentario que lo lleva) es un bot de un agente de IA? */
export function esAutorBot(autor: unknown): boolean {
  return marcaBotDe(autor) !== null;
}

/* ── Escribir: marcar lo que publica un agente ───────────────────────────── */

const SS_META_RE = /<!--ss:meta\s+([\s\S]*?)-->/;

/** JSON seguro dentro de un comentario HTML: ni `<` ni `>` literales (un `-->` en un nombre lo cortaría). */
function jsonEnComentario(valor: unknown): string {
  return JSON.stringify(valor).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

type FuenteMarca = Pick<AgenteMundoRef, "id" | "origen" | "nombre" | "dueno"> | MarcaBot;
const aMarca = (a: FuenteMarca): MarcaBot => (esMarcaBot(a) ? normalizarMarca(a)! : marcaDeAgente(a as AgenteMundoRef));

/** Pone la marca en el cuerpo de una publicación o comentario, fusionándola con el `ss:meta` que ya tenga. */
export function marcarCuerpo(cuerpo: string, agente: FuenteMarca): string {
  const marca = aMarca(agente);
  const previo = SS_META_RE.exec(cuerpo);
  if (previo?.[1]) {
    try {
      const datos = JSON.parse(previo[1]) as unknown;
      const base = obj(datos) ?? {};
      return cuerpo.replace(SS_META_RE, () => `<!--ss:meta ${jsonEnComentario({ ...base, bot: marca })}-->`);
    } catch {
      /* metadatos corruptos: se añade la marca aparte, sin tocar lo que había */
    }
  }
  const limpio = cuerpo.replace(SS_META_RE, "").trimEnd();
  return `${limpio}\n<!--ss:meta ${jsonEnComentario({ bot: marca })}-->`;
}

/** Saca la marca de un cuerpo y devuelve el texto limpio (para comentarios, que no tienen más metadatos). */
export function leerMarcaDeCuerpo(cuerpo: string): { cuerpo: string; marca: MarcaBot | null } {
  const m = SS_META_RE.exec(cuerpo);
  if (!m?.[1]) return { cuerpo, marca: null };
  let marca: MarcaBot | null = null;
  try {
    marca = normalizarMarca(obj(JSON.parse(m[1]))?.bot);
  } catch {
    /* metadatos corruptos: ni marca ni resto del comentario */
  }
  return { cuerpo: cuerpo.replace(SS_META_RE, "").trim(), marca };
}

/**
 * LA puerta de todo envío de un agente. Con un texto devuelve el texto marcado; con un objeto (`content` o
 * `post_references` de la tabla `posts`) devuelve una copia con `bot`. Nunca muta lo que recibe.
 */
export function marcarComoBot(carga: string, agente: FuenteMarca): string;
export function marcarComoBot<T extends Record<string, unknown>>(carga: T, agente: FuenteMarca): T & { bot: MarcaBot };
export function marcarComoBot(carga: string | Record<string, unknown>, agente: FuenteMarca): string | Record<string, unknown> {
  if (typeof carga === "string") return marcarCuerpo(carga, agente);
  return { ...carga, bot: aMarca(agente) };
}
