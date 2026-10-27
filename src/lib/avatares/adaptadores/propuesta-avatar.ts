/**
 * Avatares · PROPUESTAS Y VOTOS EN GRUPOS Y PÁGINAS (AV1011J). Contrato:
 * `architecture/astraura-avatares-3d.md` §7. En una entidad democrática el avatar no se cambia: se PROPONE
 * el diff del ADN y la entidad lo vota. Traduce ese diff a la operación `avatar.cambiar` de Genesis y
 * rebasa al aprobar una propuesta que ya no parte de la revisión vigente. PURO: sin red, disco ni reloj.
 */
import { type Operacion, validarOperacion, type Ambito, describirCambiosAvatar } from "@/lib/genesis/operaciones";
import { type AdnAvatar } from "@/lib/avatares/adn/adn";
import { type CambioAvatar, diffAdn, aplicarCambios } from "@/lib/avatares/adn/cambios";
import { decidirCambioAvatar } from "@/lib/avatares/adn/permisos";
import { type Gobierno, type RolBot } from "@/lib/astraura-bots/tipos";

/** Todo lo que hace falta para saber si el cambio se puede proponer y cómo se vota. */
export interface PeticionPropuestaAvatar {
    actual: AdnAvatar;
    propuesto: AdnAvatar;
    /** Referencia con la que se propone; por defecto, el id del ADN actual. */
    ref?: string;
    motivo: string;
    ambito: Ambito;
    rol: RolBot;
    /** Gobierno de la entidad dueña (grupo, comunidad o página). */
    gobierno?: Gobierno;
    /** Si el avatar es de un bot, ¿el bot es de una entidad? */
    botDeEntidad?: boolean;
}

export type ResultadoPropuestaAvatar =
    | { ok: true; operacion: Operacion; cambios: CambioAvatar[]; cambiosEnPalabras: string[]; avisos: string[] }
    | { ok: false; motivo: string; problemas: string[] };

/**
 * Convierte el avatar propuesto en una operación `avatar.cambiar` con el diff como dato.
 * Solo se puede proponer cuando `decidirCambioAvatar` responde «votacion» (§7): proponer no es aplicar.
 */
export function proponerCambioAvatar(p: PeticionPropuestaAvatar): ResultadoPropuestaAvatar {
    const decision = decidirCambioAvatar({ adn: p.actual, rol: p.rol, gobierno: p.gobierno, botDeEntidad: p.botDeEntidad, vistaPrevia: false });
    if (decision.requiere !== "votacion") {
        return { ok: false, motivo: decision.motivo, problemas: ["Solo se propone el avatar de una entidad democrática; aquí se aplica o no se cambia."] };
    }
    if (p.propuesto.id !== p.actual.id) {
        return { ok: false, motivo: "El avatar propuesto tiene otro identificador: se proponen cambios, no se cambia de avatar.", problemas: ["id"] };
    }
    const ref = (p.ref ?? p.actual.id).trim();
    const cambios = diffAdn(p.actual, p.propuesto);
    if (cambios.length === 0) return { ok: false, motivo: "No hay ningún cambio entre el avatar actual y el propuesto.", problemas: ["cambios"] };
    const bruto: Operacion = { tipo: "avatar.cambiar", motivo: p.motivo, datos: { ref, revBase: p.actual.rev, cambios } };
    const validada = validarOperacion(bruto, { ambito: p.ambito });
    if (!validada.ok) return { ok: false, motivo: validada.problemas.join(" "), problemas: validada.problemas };
    return { ok: true, operacion: validada.op, cambios, cambiosEnPalabras: describirCambiosAvatar(cambios), avisos: validada.avisos };
}

/** Datos de `avatar.cambiar` tal y como llegan al aprobarse la propuesta. */
export interface DatosAplicarAvatar {
    ref: string;
    revBase: number;
    cambios: CambioAvatar[];
}

export type ResultadoAplicarAvatar =
    | { ok: true; adn: AdnAvatar; rebasado: boolean; aviso: string | null; cambios: CambioAvatar[]; cambiosEnPalabras: string[] }
    | { ok: false; motivo: string };

const mismaRef = (ref: string, actual: AdnAvatar): boolean => ref === actual.id || ref === `biblioteca:${actual.id}`;

/**
 * Aplica una propuesta ya aprobada. Si `revBase` coincide con la revisión actual, aplica los cambios tal
 * cuales; si no, REBASA: los vuelve a aplicar sobre la revisión vigente, recalcula el diff contra ella y
 * avisa de lo ocurrido para que quien aprueba lo revise. Una propuesta de una revisión MÁS NUEVA que la
 * local no se aplica: se pide recargar antes que pisar cambios que no se han visto.
 */
export function aplicarCambioAvatar(actual: AdnAvatar, datos: DatosAplicarAvatar): ResultadoAplicarAvatar {
    if (!mismaRef(datos.ref.trim(), actual)) {
        return { ok: false, motivo: `La propuesta es para «${datos.ref}» y el avatar actual es «${actual.id}».` };
    }
    if (!Number.isInteger(datos.revBase) || datos.revBase < 0) return { ok: false, motivo: "La propuesta no trae una revisión base válida." };
    if (datos.revBase > actual.rev) {
        return { ok: false, motivo: `La propuesta parte de una revisión más nueva (rev ${datos.revBase}) que la actual (rev ${actual.rev}): recarga antes de aplicarla.` };
    }
    if (datos.revBase === actual.rev) {
        return {
            ok: true,
            adn: aplicarCambios(actual, datos.cambios),
            rebasado: false,
            aviso: null,
            cambios: datos.cambios,
            cambiosEnPalabras: describirCambiosAvatar(datos.cambios),
        };
    }
    const objetivo = aplicarCambios(actual, datos.cambios);
    const cambios = diffAdn(actual, objetivo);
    return {
        ok: true,
        adn: aplicarCambios(actual, cambios),
        rebasado: true,
        cambios,
        cambiosEnPalabras: describirCambiosAvatar(cambios),
        aviso: cambios.length
            ? `La propuesta se hizo sobre la revisión ${datos.revBase} y el avatar ya va por la ${actual.rev}: se ha vuelto a calcular el diff sobre la revisión actual. Revisa que no pise lo que cambió otra persona.`
            : `La propuesta se hizo sobre la revisión ${datos.revBase} y el avatar ya va por la ${actual.rev}. Al rebasarla no queda ningún cambio que aplicar.`,
    };
}
