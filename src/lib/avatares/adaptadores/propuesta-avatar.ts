/**
 * Avatares 3D · PROPUESTAS Y VOTOS DE AVATAR EN GRUPOS Y PÁGINAS (AV1011J).
 * Contrato: architecture/astraura-avatares-3d.md §7 y §9-J.
 *
 * Un avatar compartido no se cambia de golpe: se PROPONE el diff (`diffAdn`) como
 * operación `avatar.cambiar` de PoliGenesis y se vota. Al aprobarse se comprueba
 * la revisión: si nadie movió el avatar, se aplican los cambios; si ya cambió
 * (`revBase` no coincide), se recalcula el diff sobre la revisión ACTUAL y se avisa.
 * PURO: sin red, sin disco, sin reloj.
 */
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { type CambioAvatar, aplicarCambios, diffAdn, sanearCambio } from "@/lib/avatares/adn/cambios";
import { decidirCambioAvatar, type DecisionAvatar, type PeticionCambioAvatar } from "@/lib/avatares/adn/permisos";
import {
  validarOperacion,
  type Ambito,
  type AvatarCambioDatos,
  type Operacion,
} from "@/lib/genesis/operaciones";

/** Lo que se necesita para proponer: el avatar actual, el que se quiere y quién lo propone (§7). */
export interface PeticionPropuestaAvatar {
  actual: AdnAvatar;
  propuesto: AdnAvatar;
  motivo: string;
  ambito: Ambito;
  rol: PeticionCambioAvatar["rol"];
  gobierno?: PeticionCambioAvatar["gobierno"];
  /** Si el avatar es de un bot de una entidad (grupo, comunidad o página). */
  botDeEntidad?: boolean;
}

export type ResultadoPropuestaAvatar =
  | { ok: true; op: Operacion; decision: DecisionAvatar; avisos: string[] }
  | { ok: false; motivos: string[]; decision: DecisionAvatar };

export interface ResultadoResolucionAvatar {
  ok: boolean;
  adn: AdnAvatar;
  /** Diff efectivo sobre la revisión actual (lo que de verdad cambia). */
  cambios: CambioAvatar[];
  rebasado: boolean;
  aviso: string | null;
  motivo?: string;
}

/** La tarjeta solo propone cuando la decisión del dueño es «votación» (§7). */
export function proponerCambioAvatar(p: PeticionPropuestaAvatar): ResultadoPropuestaAvatar {
  const decision = decidirCambioAvatar({
    adn: { dueno: p.actual.dueno },
    rol: p.rol,
    gobierno: p.gobierno,
    botDeEntidad: p.botDeEntidad,
    vistaPrevia: false,
  });
  if (decision.requiere !== "votacion") {
    return { ok: false, motivos: [motivoSinVotacion(decision)], decision };
  }
  if (p.actual.id !== p.propuesto.id) {
    return { ok: false, motivos: ["El avatar propuesto no es el mismo que el actual (tienen que compartir su id)."], decision };
  }
  if (p.actual.dueno.tipo !== p.propuesto.dueno.tipo || p.actual.dueno.id !== p.propuesto.dueno.id) {
    return { ok: false, motivos: ["El avatar propuesto pertenece a otro dueño; no se puede votar en esta entidad."], decision };
  }
  if (p.ambito.tipo === "entidad" && p.actual.dueno.id !== p.ambito.entidad.id) {
    return { ok: false, motivos: ["Ese avatar no es de esta entidad."], decision };
  }
  const cambios = diffAdn(p.actual, p.propuesto);
  if (cambios.length === 0) {
    return { ok: false, motivos: ["El avatar propuesto es igual al actual: no hay nada que votar."], decision };
  }
  const validado = validarOperacion(
    { tipo: "avatar.cambiar", motivo: p.motivo, datos: { ref: p.actual.id, revBase: p.actual.rev, cambios } },
    { ambito: p.ambito },
  );
  if (!validado.ok) return { ok: false, motivos: validado.problemas, decision };
  return { ok: true, op: validado.op, decision, avisos: validado.avisos };
}

/** Cuando el dueño no pide votación, se dice qué toca hacer en su lugar (sin prometer votos falsos). */
function motivoSinVotacion(decision: DecisionAvatar): string {
  if (decision.requiere === "nada") return `${decision.motivo} No se vota: se cambia directamente.`;
  if (decision.requiere === "confirmacion") return `${decision.motivo} No se vota: lo aprueba quien administra.`;
  return decision.motivo;
}

/** Al aprobarse una propuesta: aplica si la revisión coincide; si no, recalcula el diff y avisa. */
export function resolverCambioAvatar(actual: AdnAvatar, propuesta: AvatarCambioDatos): ResultadoResolucionAvatar {
  if (propuesta.ref !== actual.id) {
    return { ok: false, adn: actual, cambios: [], rebasado: false, aviso: null, motivo: "La propuesta es de otro avatar: no se aplica." };
  }
  const limpios: CambioAvatar[] = [];
  for (const bruto of propuesta.cambios) {
    const c = sanearCambio(bruto);
    if (c) limpios.push(c);
  }
  if (limpios.length === 0) {
    return { ok: false, adn: actual, cambios: [], rebasado: false, aviso: null, motivo: "La propuesta no trae ningún cambio válido." };
  }
  const candidato = aplicarCambios(actual, limpios);
  const efectivos = diffAdn(actual, candidato);
  if (propuesta.revBase === actual.rev) {
    return { ok: true, adn: candidato, cambios: efectivos, rebasado: false, aviso: null };
  }
  if (efectivos.length === 0) {
    return {
      ok: true,
      adn: actual,
      cambios: [],
      rebasado: true,
      aviso: `El avatar ya está como se propuso (revisión ${propuesta.revBase} → ${actual.rev}); no hay nada que aplicar.`,
    };
  }
  return {
    ok: true,
    adn: aplicarCambios(actual, efectivos),
    cambios: efectivos,
    rebasado: true,
    aviso: `El avatar cambió desde que se propuso (revisión ${propuesta.revBase} → ${actual.rev}). El diff se ha recalculado sobre la revisión actual: ${efectivos.length} cambio(s).`,
  };
}
