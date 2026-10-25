/**
 * Tests PURA de la tarea F (Ola 1018V): nivel «estudio» por VoiceStudio en el
 * motor único y la PRIMERA frase instantánea.
 *
 * Contrato: `architecture/voz-voicestudio.md` §3.1 y §4. Sin red, sin
 * micrófono ni altavoz, sin procesos: las medidas de latencia son FALSAS y
 * solo entran funciones puras (`niveles.ts` y las de la sección 1018V de
 * `motor.ts`).
 */

import { describe, expect, it } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import type { Capacidades } from "../capacidades";
import {
    estudioDisponible,
    nivelPara,
    nivelesDisponibles,
    RAM_LIBRE_ESTUDIO_GB,
} from "../niveles";
import {
    elegirMotorInstantaneo,
    mediaPrimerSonido,
    motorPermitido,
    nivelParaUso,
    type CandidatoNivel,
} from "../motor";

/** Capas mínimas (las más pobres): cada prueba solo toca lo que le importa. */
const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

const medida = (motor: string, valor: number): MedidaVoz => ({
    neurona: "n-prueba",
    motor,
    tipo: "primer-sonido",
    valor,
    timestamp: 1_000,
});

const candidato = (
    id: CandidatoNivel["id"],
    motorMedida: string,
    claseLicencia: CandidatoNivel["claseLicencia"],
    extra: Partial<CandidatoNivel> = {},
): CandidatoNivel => ({
    id,
    motorMedida,
    vivo: true,
    claseLicencia,
    tieneLaVoz: true,
    ...extra,
});

describe("estudioDisponible (Ola 1018V): solo VoiceStudio vivo y neurona que lo aguanta", () => {
    it("sin datos de VoiceStudio no hay estudio por esta vía", () => {
        expect(estudioDisponible(undefined)).toBe(false);
        expect(estudioDisponible({})).toBe(false);
        expect(estudioDisponible({ vozStudioVivo: false, memoriaLibreGB: 16 })).toBe(false);
    });

    it("vivo y con las RAM_LIBRE_ESTUDIO_GB libres → sí", () => {
        expect(RAM_LIBRE_ESTUDIO_GB).toBe(8);
        expect(estudioDisponible({ vozStudioVivo: true, memoriaLibreGB: 8 })).toBe(true);
        expect(estudioDisponible({ vozStudioVivo: true, memoriaLibreGB: 7.9 })).toBe(false);
        expect(estudioDisponible({ vozStudioVivo: true, memoriaLibreGB: null })).toBe(false);
    });

    it("vivo y pocas RAM libres: lo sirve otra neurona de la malla → sí", () => {
        expect(estudioDisponible({ vozStudioVivo: true, memoriaLibreGB: 3, sirveOtraNeurona: true })).toBe(true);
        expect(estudioDisponible({ vozStudioVivo: true, memoriaLibreGB: 0, sirveOtraNeurona: false })).toBe(false);
    });
});

describe("nivelPara con entrada de estudio", () => {
    it("sin la medición de VoiceStudio, el equipo pobre queda en «minima»", () => {
        expect(nivelPara(base)).toBe("minima");
    });

    it("VoiceStudio vivo y 8 GB libres abre «estudio» aunque NO haya demonio OmniVoice", () => {
        expect(nivelPara(base, { vozStudioVivo: true, memoriaLibreGB: 8 })).toBe("estudio");
    });

    it("sin el aguante ni el relevo, no abre «estudio» aunque VoiceStudio esté vivo", () => {
        expect(nivelPara(base, { vozStudioVivo: true, memoriaLibreGB: 2 })).toBe("minima");
    });

    it("el estudio del demonio OmniVoice (Ola 228) no cambia", () => {
        expect(nivelPara({ ...base, daemonLocal: true, memoriaGB: 8 })).toBe("estudio");
        expect(nivelPara({ ...base, daemonLocal: true })).toBe("alta");
    });

    it("nivelesDisponibles ofrece la cadena completa cuando hay estudio", () => {
        expect(nivelesDisponibles(base, { vozStudioVivo: true, sirveOtraNeurona: true })).toEqual([
            "estudio",
            "alta",
            "nube",
            "ligera",
            "minima",
        ]);
    });
});

/* Medidas falsas: la misma neurona, dos motores con latencia distinta. */
const medidasFalsas: MedidaVoz[] = [
    medida("kokoro", 250),
    medida("omnivoice", 500),
    medida("voicestudio", 900),
    medida("navegador", 40),
];

describe("motorPermitido: licencia por contexto (contrato §4)", () => {
    it("en lo personal vale todo vivo", () => {
        expect(motorPermitido(candidato("alta", "omnivoice", "personal"), "personal")).toBe(true);
        expect(motorPermitido(candidato("ligera", "kokoro", "libre"), "personal")).toBe(true);
    });

    it("fuera de lo personal, la clase «personal» nunca suena", () => {
        expect(motorPermitido(candidato("alta", "omnivoice", "personal"), "grupo")).toBe(false);
        expect(motorPermitido(candidato("ligera", "kokoro", "libre"), "comercial")).toBe(true);
    });

    it("una «condicionada» suena solo con su condición comprobada", () => {
        expect(motorPermitido(candidato("alta", "supertonic", "condicionada"), "publico")).toBe(false);
        expect(
            motorPermitido(candidato("alta", "supertonic", "condicionada", { condicionesCumplidas: ["cumplida"] }), "publico"),
        ).toBe(true);
    });

    it("un motor muerto jamás es permitido", () => {
        expect(motorPermitido(candidato("ligera", "kokoro", "libre", { vivo: false }), "personal")).toBe(false);
    });
});

describe("mediaPrimerSonido: la latencia de las medidas", () => {
    it("media los «primer-sonido» del motor y ignora lo de los demás", () => {
        const ms: MedidaVoz[] = [
            medida("kokoro", 200),
            medida("omnivoice", 1000),
            medida("kokoro", 400),
        ];
        expect(mediaPrimerSonido(ms, "kokoro")).toBe(300);
        expect(mediaPrimerSonido(ms, "omnivoice")).toBe(1000);
    });

    it("sin medidas devuelve null (el candidato va al final)", () => {
        expect(mediaPrimerSonido(medidasFalsas, "nube")).toBeNull();
        expect(mediaPrimerSonido([], "kokoro")).toBeNull();
    });
});

describe("elegirMotorInstantaneo: la primera frase sale del más rápido permitido con esa voz", () => {
    it("gana la MENOR latencia media medida entre los que tienen la voz", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [candidato("alta", "omnivoice", "personal"), candidato("ligera", "kokoro", "libre")],
            medidas: medidasFalsas,
            contexto: "personal",
            uso: "conversacion",
        });
        expect(r?.id).toBe("ligera");
        expect(r?.latenciaMs).toBe(250);
    });

    it("un candidato sin voz o muerto no se elige jamás", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [
                candidato("minima", "navegador", "libre", { tieneLaVoz: false }),
                candidato("alta", "omnivoice", "personal", { vivo: false }),
            ],
            medidas: medidasFalsas,
            contexto: "personal",
            uso: "conversacion",
        });
        expect(r).toBeNull();
    });

    it("«estudio» nunca en conversación, aunque sea el más rápido", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [candidato("estudio", "voicestudio", "personal"), candidato("ligera", "kokoro", "libre")],
            medidas: [medida("voicestudio", 1), medida("kokoro", 500)],
            contexto: "personal",
            uso: "conversacion",
        });
        expect(r?.id).toBe("ligera");
        expect(r?.id).not.toBe("estudio");
    });

    it("en lectura larga el estudio MANDA si está disponible", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [candidato("ligera", "kokoro", "libre"), candidato("estudio", "voicestudio", "personal")],
            medidas: [medida("kokoro", 50), medida("voicestudio", 900)],
            contexto: "personal",
            uso: "lectura",
        });
        expect(r?.id).toBe("estudio");
        expect(r?.latenciaMs).toBe(900);
    });

    it("en comercial se cae al «libre» aunque el «personal» mida mejor", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [
                candidato("alta", "omnivoice", "personal"),
                candidato("ligera", "kokoro", "libre"),
            ],
            medidas: [medida("omnivoice", 60), medida("kokoro", 700)],
            contexto: "comercial",
            uso: "conversacion",
        });
        expect(r?.id).toBe("ligera");
        expect(r?.id).not.toBe("alta");
    });

    it("el candidato sin medidas va al final y solo gana si no queda otro", () => {
        const r = elegirMotorInstantaneo({
            candidatos: [candidato("nube", "nube", "libre"), candidato("ligera", "kokoro", "libre")],
            medidas: medidasFalsas,
            contexto: "personal",
            uso: "conversacion",
        });
        expect(r?.id).toBe("ligera");
        const sinMedidas = elegirMotorInstantaneo({
            candidatos: [candidato("nube", "nube", "libre")],
            medidas: [],
            contexto: "personal",
            uso: "conversacion",
        });
        expect(sinMedidas?.id).toBe("nube");
        expect(sinMedidas?.latenciaMs).toBeNull();
    });
});

describe("nivelParaUso: «estudio» reservado a lectura larga, doblaje y audiolibros", () => {
    it("conversación, rito y avisos bajan el estudio a «alta»", () => {
        expect(nivelParaUso("conversacion", "estudio")).toBe("alta");
        expect(nivelParaUso("aviso", "estudio")).toBe("alta");
        expect(nivelParaUso("rito", "estudio")).toBe("alta");
    });

    it("los usos largos se quedan el estudio", () => {
        for (const uso of ["lectura", "imaginacion", "doblaje", "audiolibro"] as const) {
            expect(nivelParaUso(uso, "estudio")).toBe("estudio");
        }
    });

    it("un nivel que no es estudio no se toca", () => {
        expect(nivelParaUso("conversacion", "alta")).toBe("alta");
        expect(nivelParaUso("conversacion", "ligera")).toBe("ligera");
        expect(nivelParaUso("lectura", "minima")).toBe("minima");
    });
});
