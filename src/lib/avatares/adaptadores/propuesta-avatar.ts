/**
 * Avatares 3D · PROPUESTA Y APROBACIÓN DE AVATAR (AV1011J). Contrato: architecture/astraura-avatares-3d.md §7 y §9-J.
 *
 * En un grupo, comunidad o página democráticos el avatar no lo cambia una persona: se PROPONE el diff (`diffAdn`) y se
 * vota. La operación es `avatar.cambiar` con `{ ref, revBase, cambios }`, del vocabulario de Genesis/PoliGenesis.
 *
 * Al aprobarse: si `revBase` sigue siendo la revisión actual, se aplican los cambios tal cual. Si el avatar cambió
 * mientras se votaba, se RECALCULA el diff sobre la revisión actual (`propuesto` si se conoce) y se avisa; nunca se
 * pisa a ciegas un cambio posterior.
 *
 * PURO: sin React, red, reloj ni almacenamiento. Enviar la propuesta y guardar el ADN es de quien monta la tarjeta.
 */
import type { AdnAvatar } from "@/lib/avatares/adn/adn";
import { aplicarCambios, diffAdn, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { decidirCambioAvatar, type PeticionCambioAvatar } from "@/lib/avatares/adn/permisos";
import type { AvatarCambioDatos, Operacion } from "@/lib/genesis/operaciones";

export type DecisionAvatar = ReturnType<typeof decidirCambioAvatar>;

export interface EntradaPropuestaAvatar {
  actual: AdnAvatar;
  propuesto: AdnAvatar;
  motivo: string;
  rol: PeticionCambioAvatar["rol"];
  gobierno?: PeticionCambioAvatar["gobierno"];
  botDeEntidad?: boolean;
}

export type ResultadoPropuestaAvatar =
  | { ok: true; operacion: Operacion; cambios: CambioAvatar[]; decision: DecisionAvatar }
  | { ok: false; motivo: string; decision: DecisionAvatar };

/** Construye la operación `avatar.cambiar`, pero solo si el gobierno del avatar exige votación. */
export function proponerCambioAvatar(p: EntradaPropuestaAvatar): ResultadoPropuestaAvatar {
  const decision = decidirCambioAvatar({
    adn: { dueno: p.actual.dueno },
    rol: p.rol,
    gobierno: p.gobierno,
    botDeEntidad: p.botDeEntidad,
    vistaPrevia: false,
  });
  if (p.actual.id !== p.propuesto.id) {
    return { ok: false, motivo: "El avatar propuesto no es el mismo que el actual: no se puede proponer un reemplazo.", decision };
  }
  const cambios = diffAdn(p.actual, p.propuesto);
  if (!cambios.length) return { ok: false, motivo: "El avatar propuesto es igual al actual: no hay nada que votar.", decision };
  if (decision.requiere !== "votacion") {
    return { ok: false, motivo: `${decision.motivo} Solo se propone a votación un avatar de gobierno democrático.`, decision };
  }
  const motivo = p.motivo.trim() || "Cambio de avatar propuesto.";
  return {
    ok: true,
    cambios,
    decision,
    operacion: { tipo: "avatar.cambiar", motivo, datos: { ref: p.actual.id, revBase: p.actual.rev, cambios } },
  };
}

export type ResultadoAplicarAvatar =
  | { ok: true; adn: AdnAvatar; cambios: CambioAvatar[]; rebasado: boolean; aviso: string | null }
  | { ok: false; problema: string };

/** Cambios que llegan del registro: se vuelven a sanear; uno inválido invalida toda la propuesta. */
function cambiosLimpios(cambios: readonly CambioAvatar[]): CambioAvatar[] | null {
  const salida: CambioAvatar[] = [];
  for (const cambio of cambios) {
    const limpio = sanearCambio(cambio);
    if (!limpio) return null;
    salida.push(limpio);
  }
  return salida;
}

/**
 * Aplica una propuesta ya aprobada. `propuesto` es el ADN que se quería conseguir: sin él, en un rebase se reaplican
 * los cambios guardados sobre la revisión actual (y se dice así). Devuelve siempre el aviso para enseñarlo.
 */
export function aplicarPropuestaAvatar(
  actual: AdnAvatar,
  datos: AvatarCambioDatos,
  propuesto?: AdnAvatar,
): ResultadoAplicarAvatar {
  const mismaRef = datos.ref === actual.id || datos.ref === `biblioteca:${actual.id}`;
  if (!mismaRef) return { ok: false, problema: "La propuesta es de otro avatar: no se aplica sobre este." };
  const guardados = cambiosLimpios(datos.cambios);
  if (!guardados) return { ok: false, problema: "La propuesta trae cambios que ya no son válidos: no se aplica." };
  if (actual.rev === datos.revBase) {
    if (!guardados.length) return { ok: false, problema: "La propuesta no trae ningún cambio." };
    return { ok: true, adn: aplicarCambios(actual, guardados), cambios: guardados, rebasado: false, aviso: null };
  }

  if (propuesto && propuesto.id !== actual.id) {
    return { ok: false, problema: "El avatar propuesto para el rebase no es el mismo que el actual." };
  }
  const cambios = propuesto ? diffAdn(actual, propuesto) : diffAdn(actual, aplicarCambios(actual, guardados));
  const aviso = propuesto
    ? `El avatar cambió desde que se propuso (era la revisión ${datos.revBase}; ahora es la ${actual.rev}). Se ha recalculado el cambio sobre la revisión actual.`
    : `El avatar cambió desde que se propuso (era la revisión ${datos.revBase}; ahora es la ${actual.rev}). Se han reaplicado los cambios propuestos sobre la revisión actual.`;
  if (!cambios.length) {
    return { ok: true, adn: actual, cambios: [], rebasado: true, aviso: `La revisión actual (${actual.rev}) ya tiene ese cambio: no había nada que aplicar.` };
  }
  return { ok: true, adn: aplicarCambios(actual, cambios), cambios, rebasado: true, aviso };
}
