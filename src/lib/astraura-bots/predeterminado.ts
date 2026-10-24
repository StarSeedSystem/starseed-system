/**
 * Bot predeterminado de Astraura y migración del almacén de bots personales
 * (BOT1011A · 2026-10-11). Contrato: architecture/astraura-bots.md.
 *
 * Módulo PURO: el núcleo aporta los tipos y las guardas con sus nombres reales.
 * Los bots guardados son solo de PERFIL; los de entidad viven en su tabla.
 */
import type { Bot, Personalidad } from "./tipos";
import { acotar, esOrigen, esSentido, esTipoDueno } from "./tipos";
import { deserializarVozBot, normalizarVozBot } from "./voz-bot";

/** Versión del formato persistido en el almacén de bots. */
export const VERSION_BOTS = 1;

/** Personalidad fija del bot Astraura predeterminado. */
export const PERSONALIDAD_ASTRAURA: Personalidad = {
  calidez: 0.7,
  energia: 0.55,
  formalidad: 0.4,
  curiosidad: 0.7,
  humor: 0.4,
  concision: 0.5,
};

/** El bot Astraura del perfil: orbe, jerárquico, con sentidos no íntimos. */
export function botPredeterminado(perfilId: string, cuentaId: string): Bot {
  return {
    id: `astraura:${perfilId}`,
    nombre: "Astraura",
    origen: "astraura",
    gobierno: "jerarquico",
    dueno: { tipo: "perfil", id: perfilId, cuentaId },
    personalidad: { ...PERSONALIDAD_ASTRAURA },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 },
    sentidosHabilitados: ["pantalla", "red"],
    activo: true,
  };
}

/* ── Migración ───────────────────────────────────────────────────────────── */

const esRegistro = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const esCadena = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Sanea un valor desconocido a `Bot` o lo descarta (`null`). */
function sanearBot(bruto: unknown, cuentaId: string): Bot | null {
  if (!esRegistro(bruto)) return null;
  if (!esCadena(bruto.id) || !esCadena(bruto.nombre) || !esOrigen(bruto.origen)) return null;
  if (bruto.gobierno !== "jerarquico" && bruto.gobierno !== "democratico") return null;

  const due = esRegistro(bruto.dueno) ? bruto.dueno : null;
  if (!due || !esTipoDueno(due.tipo) || !esCadena(due.id) || !esCadena(due.cuentaId)) return null;

  const p = esRegistro(bruto.personalidad) ? bruto.personalidad : null;
  if (!p) return null;
  const personalidad: Personalidad = {
    calidez: acotar(esNumero(p.calidez) ? p.calidez : NaN),
    energia: acotar(esNumero(p.energia) ? p.energia : NaN),
    formalidad: acotar(esNumero(p.formalidad) ? p.formalidad : NaN),
    curiosidad: acotar(esNumero(p.curiosidad) ? p.curiosidad : NaN),
    humor: acotar(esNumero(p.humor) ? p.humor : NaN),
    concision: acotar(esNumero(p.concision) ? p.concision : NaN),
  };

  const c = esRegistro(bruto.cuerpo) ? bruto.cuerpo : null;
  if (!c) return null;
  if (!["orbe", "avatar-2d", "avatar-3d", "vrm", "ser-genesis"].includes(String(c.forma))) return null;

  const sentidos = Array.isArray(bruto.sentidosHabilitados)
    ? bruto.sentidosHabilitados.filter(esSentido)
    : [];

  // El perfil de voz (VZR1011E) viaja con el bot: llega como objeto o ya serializado;
  // sin perfil válido no existe (nada inventado).
  const voz = typeof bruto.voz === "string" ? deserializarVozBot(bruto.voz) : normalizarVozBot(bruto.voz);

  return {
    id: bruto.id,
    nombre: bruto.nombre,
    origen: bruto.origen,
    gobierno: bruto.gobierno,
    dueno: { tipo: due.tipo, id: due.id, cuentaId: due.cuentaId || cuentaId },
    personalidad,
    cuerpo: {
      forma: c.forma as Bot["cuerpo"]["forma"],
      ...(esCadena(c.avatarRef) ? { avatarRef: c.avatarRef } : {}),
      tono: esNumero(c.tono) ? acotar(c.tono, 0, 360) : 200,
      escala: esNumero(c.escala) ? acotar(c.escala, 0.5, 2) : 1,
    },
    sentidosHabilitados: sentidos,
    activo: bruto.activo === true,
    ...(voz ? { voz } : {}),
  };
}

/**
 * Migra lo guardado: acepta `{ version, bots }` o un array anterior a la versión.
 * Descarta lo que no pase las guardas del núcleo (con rasgos acotados), quita ids
 * repetidos y garantiza que el predeterminado del perfil existe, el primero.
 */
export function migrarBots(bruto: unknown, perfilId: string, cuentaId: string): Bot[] {
  const lista: unknown[] = Array.isArray(bruto)
    ? bruto
    : esRegistro(bruto) && Array.isArray(bruto.bots)
      ? bruto.bots
      : [];

  const vistos = new Set<string>();
  const bots: Bot[] = [];
  for (const crudo of lista) {
    const b = sanearBot(crudo, cuentaId);
    if (b && !vistos.has(b.id)) {
      vistos.add(b.id);
      bots.push(b);
    }
  }

  const idPredeterminado = `astraura:${perfilId}`;
  if (!vistos.has(idPredeterminado)) {
    bots.unshift(botPredeterminado(perfilId, cuentaId));
  } else {
    const i = bots.findIndex((b) => b.id === idPredeterminado);
    if (i > 0) bots.unshift(...bots.splice(i, 1));
  }
  return bots;
}
