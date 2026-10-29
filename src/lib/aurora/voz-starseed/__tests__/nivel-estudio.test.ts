// Prueba PURA del nivel «estudio» y de la primera frase instantánea (VST1018F).
// Sin red, sin micrófono ni altavoz y sin procesos: las capacidades llegan como
// dato y las medidas de latencia son MEDIDAS FALSAS (contrato
// `architecture/voz-voicestudio.md` §4). En el entorno «node» no hay `window`,
// así que `estudioServidoDeMalla` debe responder false sin lanzar.

import { describe, it, expect } from "vitest";
import {
    estudioDisponible,
    nivelPara,
    nivelesDisponibles,
    siguienteNivel,
    type DisponibilidadEstudio,
} from "../niveles";
import {
    nivelDeMotor,
    esUsoEstudio,
    mediaPrimerSonido,
    elegirMotorInstantaneo,
    estudioServidoDeMalla,
    type CandidatoInstantaneo,
    type MedidaLatencia,
} from "../motor";
import type { Capacidades } from "../capacidades";

/** Capacidades de laboratorio, con lo que cada caso necesita. */
const caps = (d: Partial<Capacidades> = {}): Capacidades => ({
    memoriaGB: 8,
    nucleos: 4,
    webgpu: false,
    wasmSimd: true,
    movil: false,
    daemonLocal: true,
    ...d,
});

describe("estudioDisponible (VST1018F)", () => {
    it("sin consultar VoiceStudio, mantiene la regla de la Ola 228", () => {
        expect(estudioDisponible(caps())).toBe(true);
        expect(estudioDisponible(caps({ daemonLocal: false }))).toBe(false);
        expect(estudioDisponible(caps({ memoriaGB: 4 }))).toBe(false);
    });

    it("consultado, VoiceStudio vivo y 8 GB o más lo sostiene con o sin demonio", () => {
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: true, servidaPorOtraNeurona: false };
        expect(estudioDisponible(caps(), d)).toBe(true);
        expect(estudioDisponible(caps({ daemonLocal: false }), d)).toBe(true);
    });

    it("consultado y NO vivo, el estudio se retira aunque el demonio aguante", () => {
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: false, servidaPorOtraNeurona: false };
        expect(estudioDisponible(caps(), d)).toBe(false);
    });

    it("con menos de 8 GB, solo otra neurona que lo sirva lo trae; el resto exige RAM", () => {
        const muerto: Partial<DisponibilidadEstudio> = { voicestudioVivo: false, servidaPorOtraNeurona: false };
        const servida: Partial<DisponibilidadEstudio> = { voicestudioVivo: false, servidaPorOtraNeurona: true };
        expect(estudioDisponible(caps({ memoriaGB: 4 }), muerto)).toBe(false);
        expect(estudioDisponible(caps({ memoriaGB: 4, daemonLocal: false }), servida)).toBe(true);
    });

    it("la marca de la malla es false sin almacenamiento (entorno node, sin window)", () => {
        expect(estudioServidoDeMalla()).toBe(false);
    });
});

describe("nivelPara y la cadena de niveles", () => {    it("con VoiceStudio vivo y 8 GB, el nivel más alto es «estudio»", () => {
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: true, servidaPorOtraNeurona: false };
        expect(nivelPara(caps(), d)).toBe("estudio");
    });

    it("con VoiceStudio medido y apagado, el nivel más alto baja a «alta»", () => {
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: false, servidaPorOtraNeurona: false };
        expect(nivelPara(caps(), d)).toBe("alta");
    });

    it("servido por otra neurona, «estudio» existe incluso en una neurona pequeña", () => {
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: false, servidaPorOtraNeurona: true };
        expect(nivelPara(caps({ memoriaGB: 4, daemonLocal: false }), d)).toBe("estudio");
    });

    it("degradación y oferta de niveles intactas", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(siguienteNivel("minima")).toBeNull();
        const d: Partial<DisponibilidadEstudio> = { voicestudioVivo: true, servidaPorOtraNeurona: false };
        expect(nivelesDisponibles(caps(), d)[0]).toBe("estudio");
    });
});

describe("el nivel de estudio y su uso", () => {
    it("«estudio» solo para lectura larga, doblaje y audiolibros", () => {
        expect(esUsoEstudio("lectura-larga")).toBe(true);
        expect(esUsoEstudio("doblaje")).toBe(true);
        expect(esUsoEstudio("Audiolibro ")).toBe(true);
        expect(esUsoEstudio("conversacion")).toBe(false);
        expect(esUsoEstudio("aviso")).toBe(false);
        expect(esUsoEstudio(undefined)).toBe(false);
    });

    it("nivelDeMotor mantiene el reparto del catálogo", () => {
        expect(nivelDeMotor("voicestudio")).toBe("estudio");
        expect(nivelDeMotor("voicemorphic")).toBe("estudio");
        expect(nivelDeMotor("kokoro")).toBe("ligera");
        expect(nivelDeMotor("kittentts")).toBe("ligera");
        expect(nivelDeMotor("sistema")).toBe("minima");
        expect(nivelDeMotor("openvoice2")).toBe("nube");
    });
});

describe("mediaPrimerSonido con medidas falsas", () => {
    it("media de «primer-sonido», ignora otros tipos y medidas mal formadas", () => {
        const medidas: readonly MedidaLatencia[] = [
            { motor: "supertonic", tipo: "primer-sonido", valor: 100 },
            { motor: "supertonic", tipo: "primer-sonido", valor: 200 },
            { motor: "supertonic", tipo: "correccion", valor: 5 },
            { motor: "supertonic", tipo: "primer-sonido", valor: Number.NaN },
            { motor: "kokoro", tipo: "primer-sonido", valor: 40 },
        ];
        expect(mediaPrimerSonido(medidas, "supertonic")).toBe(150);
        expect(mediaPrimerSonido(medidas, "kokoro")).toBe(40);
    });

    it("sin medidas devuelve undefined", () => {
        expect(mediaPrimerSonido([], "supertonic")).toBeUndefined();
    });
});

describe("elegirMotorInstantaneo: la primera frase de una conversación", () => {
    const sinCapas = {};

    /** Dos motores: VoiceMorphic (pesos personales) y Kokoro (libre). */
    const candidatos = (conVozDe: string[]): CandidatoInstantaneo[] => [
        { id: "voicemorphic", claseLicencia: "personal", conVoz: conVozDe.includes("voicemorphic") },
        { id: "kokoro", claseLicencia: "libre", conVoz: conVozDe.includes("kokoro") },
    ];

    const medidas = (porMotor: Record<string, number>): readonly MedidaLatencia[] =>
        Object.entries(porMotor).map(([motor, valor]) => ({ motor, tipo: "primer-sonido", valor }));

    it("gana el permitido con MENOR latencia medida que tenga la voz de la persona", () => {
        const eleccion = elegirMotorInstantaneo({
            candidatos: candidatos(["voicemorphic", "kokoro"]),
            contextoLicencia: "personal",
            capas: sinCapas,
            medidas: medidas({ voicemorphic: 30, kokoro: 20, supertonic: 5 }),
        });
        expect(eleccion.motor?.id).toBe("kokoro");
    });

    it("fuera de lo personal, un motor con pesos personales no puede sonar", () => {
        const eleccion = elegirMotorInstantaneo({
            candidatos: candidatos(["voicemorphic", "kokoro"]),
            contextoLicencia: "comercial",
            capas: sinCapas,
            medidas: medidas({ voicemorphic: 5 }),
        });
        expect(eleccion.motor?.id).toBe("kokoro");
    });

    it("sin medidas manda el orden del catálogo; sin voz posible, nadie sale", () => {
        const conOrden = elegirMotorInstantaneo({
            candidatos: candidatos(["voicemorphic", "kokoro"]),
            contextoLicencia: "personal",
            capas: sinCapas,
            medidas: [],
        });
        expect(conOrden.motor?.id).toBe("voicemorphic");

        const sinVoz = elegirMotorInstantaneo({
            candidatos: candidatos(["voicemorphic"]),
            contextoLicencia: "grupo",
            capas: sinCapas,
            medidas: medidas({ voicemorphic: 5 }),
        });
        expect(sinVoz.motor).toBeNull();
        expect(sinVoz.motivo).toContain("voz");
    });

    it("la licencia condicionada sin condición cumplida queda fuera", () => {
        const eleccion = elegirMotorInstantaneo({
            candidatos: [
                { id: "supertonic", claseLicencia: "condicionada", conVoz: true },
                { id: "kokoro", claseLicencia: "libre", conVoz: true },
            ],
            contextoLicencia: "publico",
            capas: sinCapas,
            medidas: medidas({ supertonic: 3, kokoro: 90 }),
        });
        expect(eleccion.motor?.id).toBe("kokoro");
    });
});
