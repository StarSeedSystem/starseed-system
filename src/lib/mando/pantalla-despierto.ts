/**
 * «Seguir trabajando con la pantalla apagada» (KAL1101C) · lógica PURA.
 * Lee el modo (pantalla/sistema) y `salud.despierto` (KAL1101B). En un portátil
 * Mac, cerrar la tapa duerme el equipo aunque haya aserciones; solo sigue
 * despierto en clamshell (corriente + pantalla externa) o con `disablesleep 1`.
 */
export type ModoPantalla = "pantalla" | "sistema";
export type TapaDespierto = "desactivada" | "clamshell" | "sin-tapa" | "duerme" | "";

export interface EstadoDespiertoLatido {
    despierta: boolean;
    herramienta: string | null;
    bateria: number | null;
    enchufada: boolean;
    tapa: TapaDespierto;
    vaADormir: boolean;
    seVaADormir: boolean;
    umbralBateria: number | null;
}

/** Texto honesto que se enseña siempre que la tapa puede dormir la neurona. */
export const LIMITE_TAPA_HONESTO =
    "En un portátil, cerrar la tapa duerme el equipo salvo con corriente y pantalla externa; si duerme, sus tareas siguen en el A1.";

const TAPAS: readonly TapaDespierto[] = ["desactivada", "clamshell", "sin-tapa", "duerme"];
const CLAVES = [
    "despierta",
    "herramienta",
    "bateria",
    "enchufada",
    "tapa",
    "va_a_dormir",
    "se_va_a_dormir",
    "umbral_bateria",
] as const;

export function esModoPantalla(valor: unknown): valor is ModoPantalla {
    return valor === "pantalla" || valor === "sistema";
}

/** Texto del modo, nombrando el flag real de keepalive que usa cada uno. */
export function textoModoPantalla(modo: ModoPantalla): string {
    return modo === "pantalla"
        ? "Modo pantalla: keepalive mantiene despiertos la pantalla y el sistema (--keep-display=true)."
        : "Modo sistema: keepalive mantiene despierto el sistema y la pantalla puede apagarse (--keep-display=false).";
}

function numeroEntre(valor: unknown, min: number, max: number): number | null {
    return typeof valor === "number" && Number.isFinite(valor) && valor >= min && valor <= max
        ? valor
        : null;
}

function tapaDe(valor: unknown): TapaDespierto {
    return typeof valor === "string" && (TAPAS as readonly string[]).includes(valor)
        ? (valor as TapaDespierto)
        : "";
}

/**
 * PURA. Sanea la capacidad `despierto`: acepta el latido completo
 * (`{salud:{despierto}}`), la raíz (`{despierto}`) o la capacidad suelta.
 * Devuelve null si no hay ningún campo reconocible: no se inventa el estado.
 */
export function parsearDespiertoLatido(bruto: unknown): EstadoDespiertoLatido | null {
    if (!bruto || typeof bruto !== "object") return null;
    const obj = bruto as Record<string, unknown>;
    const salud = obj.salud;
    const deSalud = salud && typeof salud === "object"
        ? (salud as Record<string, unknown>).despierto
        : undefined;
    const candidato = deSalud ?? obj.despierto ?? obj;
    if (!candidato || typeof candidato !== "object") return null;
    const cap = candidato as Record<string, unknown>;
    if (!CLAVES.some((clave) => clave in cap)) return null;
    const herramienta = typeof cap.herramienta === "string" ? cap.herramienta.trim().slice(0, 40) : "";
    return {
        despierta: cap.despierta === true,
        herramienta: herramienta || null,
        bateria: numeroEntre(cap.bateria, 0, 100),
        enchufada: cap.enchufada === true,
        tapa: tapaDe(cap.tapa),
        vaADormir: cap.va_a_dormir === true,
        seVaADormir: cap.se_va_a_dormir === true,
        umbralBateria: numeroEntre(cap.umbral_bateria, 0, 100),
    };
}

function sufijo(estado: EstadoDespiertoLatido): string {
    const bateria = estado.bateria !== null ? ` · batería ${estado.bateria} %` : "";
    const corriente = estado.enchufada ? " · con corriente" : "";
    return `${bateria}${corriente}`;
}

/** PURA. Texto del latido, sin prometer lo que la tapa no permite. */
export function textoDespiertoLatido(estado: EstadoDespiertoLatido | null): string {
    if (!estado) return "Sin latido de energía (KAL1101B): esta neurona aún no publica si sigue despierta.";
    if (estado.seVaADormir) {
        const umbral = estado.umbralBateria !== null ? ` (batería por debajo del ${estado.umbralBateria} %)` : "";
        return `Se va a dormir: cerrar la tapa apaga el equipo${umbral}. Sus tareas siguen en el A1.`;
    }
    if (estado.tapa === "desactivada") {
        return `Reposo desactivado (pmset disablesleep 1): sigue despierto con la tapa cerrada${sufijo(estado)}.`;
    }
    if (estado.tapa === "clamshell") {
        return `Modo clamshell: con corriente y pantalla externa sigue despierto con la tapa cerrada${sufijo(estado)}.`;
    }
    if (estado.tapa === "sin-tapa") {
        return `Equipo sin tapa: no se duerme al cerrar una tapa${sufijo(estado)}.`;
    }
    if (estado.tapa === "duerme" || estado.vaADormir) {
        return `${LIMITE_TAPA_HONESTO}${sufijo(estado)}`;
    }
    if (estado.despierta) {
        const por = estado.herramienta ? ` (${estado.herramienta})` : "";
        return `Sistema despierto ahora${por}${sufijo(estado)}.`;
    }
    return `Sin aserción de energía activa: el sistema podría dormirse por inactividad${sufijo(estado)}.`;
}
