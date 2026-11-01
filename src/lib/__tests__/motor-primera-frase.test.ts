import { describe, expect, it } from "vitest";

import {
    motorPrimeraFrase,
    type CandidatoPrimeraFrase,
} from "../aurora/voz-starseed/motor";

/** Candidato con la voz de la persona lista, salvo lo que se diga al revés. */
function cand(
    id: string,
    nivel: CandidatoPrimeraFrase["nivel"],
    latenciaMs: number | null,
    claseLicencia: CandidatoPrimeraFrase["claseLicencia"] = "libre",
    ajustes: Partial<CandidatoPrimeraFrase> = {},
): CandidatoPrimeraFrase {
    return { id, nivel, latenciaMs, claseLicencia, tieneVoz: true, ...ajustes };
}

describe("motorPrimeraFrase", () => {
    it("elige el motor permitido con la MENOR latencia medida", () => {
        const elegido = motorPrimeraFrase(
            [cand("alta", "alta", 600), cand("supertonic", "ligera", 40), cand("kokoro", "ligera", 90)],
            "conversacion",
        );
        expect(elegido).toEqual({ id: "supertonic", nivel: "ligera", latenciaMs: 40 });
    });

    it("un motor personal NO suena fuera del sitio personal", () => {
        const elegido = motorPrimeraFrase(
            [cand("voicestudio", "alta", 30, "personal"), cand("kokoro", "ligera", 80)],
            "conversacion",
            "grupo",
        );
        expect(elegido?.id).toBe("kokoro");
    });

    it("un motor personal Sí suena en lo personal", () => {
        const elegido = motorPrimeraFrase(
            [cand("voicestudio", "alta", 30, "personal"), cand("kokoro", "ligera", 80)],
            "conversacion",
            "personal",
            { persona: "personal" },
        );
        expect(elegido?.id).toBe("voicestudio");
    });

    it("condicionada sin condición cumplida se excluye, aunque la capa lo permita", () => {
        const candidatos = [cand("supertonic", "ligera", 35, "condicionada"), cand("kokoro", "ligera", 90)];
        expect(motorPrimeraFrase(candidatos, "conversacion", "personal", { comunidad: "condicionada" })?.id).toBe("kokoro");
        expect(
            motorPrimeraFrase(
                [cand("supertonic", "ligera", 35, "condicionada", { condicionCumplida: true }), cand("kokoro", "ligera", 90)],
                "conversacion",
                "personal",
                { comunidad: "condicionada" },
            )?.id,
        ).toBe("supertonic");
    });

    it("sin latencia medida no se elige; si nada está medido, devuelve null", () => {
        expect(motorPrimeraFrase([cand("supertonic", "ligera", null)], "conversacion")).toBeNull();
        const elegido = motorPrimeraFrase(
            [cand("supertonic", "ligera", null), cand("kokoro", "ligera", 90)],
            "conversacion",
        );
        expect(elegido?.id).toBe("kokoro");
    });

    it("sin la voz de esa persona no se elige", () => {
        expect(
            motorPrimeraFrase([cand("supertonic", "ligera", 35, undefined, { tieneVoz: false })], "conversacion"),
        ).toBeNull();
    });

    it("«estudio» se acota a «alta» en conversación y aviso; se mantiene en lectura larga", () => {
        const estudio = [cand("voicestudio", "estudio", 25, "personal"), cand("alta", "alta", 200, "personal")];
        expect(motorPrimeraFrase(estudio, "conversacion", "personal", { persona: "personal" })).toMatchObject({ nivel: "alta" });
        expect(motorPrimeraFrase(estudio, "aviso", "personal", { persona: "personal" })).toMatchObject({ nivel: "alta" });
        const lectura = motorPrimeraFrase(estudio, "lectura", "personal", { persona: "personal" });
        expect(lectura).toMatchObject({ id: "voicestudio", nivel: "estudio" });
        expect(motorPrimeraFrase(estudio, "doblaje", "personal", { persona: "personal" })).toMatchObject({ nivel: "estudio" });
        expect(motorPrimeraFrase(estudio, "audiolibro", "personal", { persona: "personal" })).toMatchObject({ nivel: "estudio" });
    });

    it("en empate de latencia gana el primero de la lista (el elector ya ordenó)", () => {
        const elegido = motorPrimeraFrase(
            [cand("kitten", "ligera", 40), cand("supertonic", "ligera", 40)],
            "conversacion",
        );
        expect(elegido?.id).toBe("kitten");
    });
});
