"use client";

/**
 * MÓDULO DE IDENTIDAD DE VOZ (Voz StarSeed · VZF1015M)
 * ─────────────────────────────────────────────────────────────────────────────
 * Resuelve la identidad de voz a partir de múltiples fuentes con precedencia definida:
 * cuenta > neurona > cerebro > personalidad > agente.
 *
 * Devuelve { timbre, motor, vozRT, origen } con la voz F1 de Alex como default.
 */

export interface IdentidadVozResult {
    timbre: string;
    motor: string;
    vozRT: string;
    origen: "cuenta" | "neurona" | "cerebro" | "personalidad" | "agente";
}

/** Mapa personalidad → voz RT (mismo que VOZ_POR_PERSONA en voz-rt.ts). */
const VOZ_POR_PERSONA: Record<string, string> = {
    aurora: "F1",
    astraura: "F1",
    astraura_prime: "F1",
    atenea: "F2",
    hermione: "F3",
    mnemosyne: "F4",
    kallisti: "F5",
    hephaestus: "M1",
    hermes: "M2",
    logos: "M3",
    oneiros: "M4",
};

/**
 * Resuelve la identidad de voz a partir de las fuentes provistas, con precedencia:
 * 1. cuenta (máximo privilegio)
 * 2. neurona
 * 3. cerebro
 * 4. personalidad
 * 5. agente (mínimo privilegio)
 *
 * Si ninguna fuente provee un ID, se conserva la F1 de Alex por defecto.
 */
export function identidadVoz({
    agente,
    personalidad,
    cerebro,
    neurona,
    cuenta,
}: {
    agente?: string;
    personalidad?: string;
    cerebro?: string;
    neurona?: string;
    cuenta?: string;
}): IdentidadVozResult {

    let personaId: string | undefined;
    let origen: IdentidadVozResult["origen"] = "agente";

    if (cuenta) {
        personaId = cuenta;
        origen = "cuenta";
    } else if (neurona) {
        personaId = neurona;
        origen = "neurona";
    } else if (cerebro) {
        personaId = cerebro;
        origen = "cerebro";
    } else if (personalidad) {
        personaId = personalidad;
        origen = "personalidad";
    } else if (agente) {
        personaId = agente;
        origen = "agente";
    }

    const vozRT = VOZ_POR_PERSONA[personaId?.toLowerCase() ?? ""] ?? "F1";

    const timbre = vozRT;

    const motor = vozRT.startsWith("M") ? "masculino" : "femenino";

    return { timbre, motor, vozRT, origen };
}

/** Default export for convenience. */
export default identidadVoz;