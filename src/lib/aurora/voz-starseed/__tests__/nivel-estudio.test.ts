// src/lib/aurora/voz-starseed/__tests__/nivel-estudio.test.ts
/**
 * NIVEL «ESTUDIO» Y ELECCIÓN DE LA PRIMERA FRASE (Ola 1018V · VST1018F)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pruebas puras del contrato `architecture/voz-voicestudio.md` §4: «estudio»
 * solo con VoiceStudio vivo y RAM (u otra neurona), y la primera frase de una
 * conversación sale del motor permitido con menor latencia medida. Sin red,
 * sin disco, sin audio y sin procesos.
 */

import { describe, expect, it } from "vitest";

import type { Capacidades } from "../capacidades";
import {
    RAM_MIN_ESTUDIO_GB,
    estudioDisponible,
    nivelConEstudio,
    nivelesDisponiblesConEstudio,
} from "../niveles";
import {
    elegirMotorDeFrase,
    usoDeEstudio,
    usoDesdeContexto,
    type CandidatoVoz,
} from "../motor";

const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

describe("estudioDisponible", () => {
    it("sin VoiceStudio vivo no hay estudio aunque sobre RAM", () => {
        expect(estudioDisponible({ ...base, memoriaGB: 32 }, { voicestudioVivo: false })).toBe(false);
    });

    it("VoiceStudio vivo con 8 GB justos sí ofrece estudio", () => {
        expect(estudioDisponible({ ...base, memoriaGB: 8 }, { voicestudioVivo: true })).toBe(true);
        expect(RAM_MIN_ESTUDIO_GB).toBe(8);
    });

    it("VoiceStudio vivo por debajo de 8 GB no ofrece estudio local", () => {
        expect(estudioDisponible({ ...base, memoriaGB: 7.9 }, { voicestudioVivo: true })).toBe(false);
    });

    it("sin dato de memoria, otra neurona puede servir el estudio", () => {
        expect(
            estudioDisponible(base, { voicestudioVivo: true, servidoPorOtraNeurona: true }),
        ).toBe(true);
    });

    it("la memoria libre inyectada manda sobre la del hardware", () => {
        expect(
            estudioDisponible({ ...base, memoriaGB: 16 }, { voicestudioVivo: true, memoriaLibreGB: 4 }),
        ).toBe(false);
        expect(
            estudioDisponible({ ...base, memoriaGB: 4 }, { voicestudioVivo: true, memoriaLibreGB: 8 }),
        ).toBe(true);
    });
});

describe("nivelConEstudio", () => {
    it("hardware de estudio sin VoiceStudio baja a alta", () => {
        expect(nivelConEstudio({ ...base, daemonLocal: true, memoriaGB: 16 }, { voicestudioVivo: false })).toBe("alta");
    });

    it("hardware de estudio con VoiceStudio vivo conserva estudio", () => {
        expect(nivelConEstudio({ ...base, daemonLocal: true, memoriaGB: 16 }, { voicestudioVivo: true })).toBe("estudio");
    });

    it("VoiceStudio vivo y RAM suficiente ofrece estudio aunque el demonio no conste", () => {
        expect(nivelConEstudio({ ...base, memoriaGB: 8 }, { voicestudioVivo: true })).toBe("estudio");
    });

    it("sin hardware de estudio no inventa el nivel", () => {
        expect(nivelConEstudio({ ...base, wasmSimd: true }, { voicestudioVivo: true })).toBe("ligera");
    });
});

describe("nivelesDisponiblesConEstudio", () => {
    it("con estudio ofrece los cinco niveles en orden", () => {
        expect(nivelesDisponiblesConEstudio({ ...base, memoriaGB: 8 }, { voicestudioVivo: true })).toEqual([
            "estudio",
            "alta",
            "nube",
            "ligera",
            "minima",
        ]);
    });

    it("sin VoiceStudio empieza en alta", () => {
        expect(
            nivelesDisponiblesConEstudio({ ...base, daemonLocal: true, memoriaGB: 16 }, { voicestudioVivo: false }),
        ).toEqual(["alta", "nube", "ligera", "minima"]);
    });
});

const CAPAS_PERSONAL = { persona: "personal", comunidad: "condicionada" } as const;

function candidato(parcial: Partial<CandidatoVoz> & Pick<CandidatoVoz, "id">): CandidatoVoz {
    return {
        nivel: "ligera",
        claseLicencia: "libre",
        tieneVoz: true,
        latenciaMs: null,
        ...parcial,
    };
}

const CATALOGO: CandidatoVoz[] = [
    candidato({ id: "estudio-omni", nivel: "estudio", claseLicencia: "personal", latenciaMs: 5_000 }),
    candidato({ id: "kokoro", latenciaMs: 900 }),
    candidato({ id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true, latenciaMs: 400 }),
    candidato({ id: "sin-voz", latenciaMs: 1, tieneVoz: false }),
];

describe("usoDeEstudio y usoDesdeContexto", () => {
    it("solo lectura, doblaje y audiolibro justifican estudio", () => {
        expect(usoDeEstudio("conversacion")).toBe(false);
        expect(usoDeEstudio("lectura")).toBe(true);
        expect(usoDeEstudio("doblaje")).toBe(true);
        expect(usoDeEstudio("audiolibro")).toBe(true);
    });

    it("el contexto del motor único solo marca lectura", () => {
        expect(usoDesdeContexto("lectura")).toBe("lectura");
        expect(usoDesdeContexto("conversacion")).toBe("conversacion");
        expect(usoDesdeContexto("rito")).toBe("conversacion");
        expect(usoDesdeContexto("aviso")).toBe("conversacion");
        expect(usoDesdeContexto("imaginacion")).toBe("conversacion");
    });
});

describe("elegirMotorDeFrase · primera frase de una conversación", () => {
    it("elige la menor latencia medida entre los permitidos con voz", () => {
        const r = elegirMotorDeFrase(CATALOGO, "personal", CAPAS_PERSONAL, "conversacion");
        expect(r).toEqual({ motor: "supertonic", nivel: "ligera", motivo: "elegido" });
    });

    it("en conversación el estudio va al final aunque sea el más rápido", () => {
        const catalogo = [
            candidato({ id: "estudio-omni", nivel: "estudio", claseLicencia: "personal", latenciaMs: 50 }),
            candidato({ id: "kokoro", latenciaMs: 900 }),
        ];
        expect(elegirMotorDeFrase(catalogo, "personal", CAPAS_PERSONAL, "conversacion").motor).toBe("kokoro");
    });

    it("en lectura el estudio va primero aunque sea el más lento", () => {
        expect(elegirMotorDeFrase(CATALOGO, "personal", CAPAS_PERSONAL, "lectura").motor).toBe("estudio-omni");
    });

    it("si el estudio es la única voz, se usa: Aurora nunca se queda muda", () => {
        const soloEstudio = [
            candidato({ id: "estudio-omni", nivel: "estudio", claseLicencia: "personal", latenciaMs: 50 }),
        ];
        expect(elegirMotorDeFrase(soloEstudio, "personal", CAPAS_PERSONAL, "conversacion").motor).toBe("estudio-omni");
    });

    it("lo no medido va tras lo medido y, a igualdad, manda el orden del catálogo", () => {
        const catalogo = [
            candidato({ id: "sin-medida-a" }),
            candidato({ id: "medido", latenciaMs: 700 }),
            candidato({ id: "sin-medida-b" }),
        ];
        expect(elegirMotorDeFrase(catalogo, "personal", CAPAS_PERSONAL).motor).toBe("medido");
        const empate = [candidato({ id: "primero" }), candidato({ id: "segundo" })];
        expect(elegirMotorDeFrase(empate, "personal", CAPAS_PERSONAL).motor).toBe("primero");
    });
});

describe("elegirMotorDeFrase · licencia por contexto", () => {
    it("en grupo sin capas solo suena lo libre", () => {
        expect(elegirMotorDeFrase(CATALOGO, "grupo", {}, "conversacion").motor).toBe("kokoro");
    });

    it("en grupo con capa condicionada entra la condicionada cumplida", () => {
        expect(elegirMotorDeFrase(CATALOGO, "grupo", { grupo: "condicionada" }, "conversacion").motor).toBe(
            "supertonic",
        );
    });

    it("lo personal no suena fuera de lo personal ni siendo el más rápido", () => {
        const catalogo = [
            candidato({ id: "estudio-omni", nivel: "estudio", claseLicencia: "personal", latenciaMs: 50 }),
        ];
        expect(elegirMotorDeFrase(catalogo, "publico", { persona: "personal" }, "lectura")).toEqual({
            motor: null,
            nivel: null,
            motivo: "sin-licencia",
        });
    });

    it("sin ningún motor con la voz de esa persona devuelve sin-voz", () => {
        const catalogo = [candidato({ id: "otra", tieneVoz: false })];
        expect(elegirMotorDeFrase(catalogo, "personal", CAPAS_PERSONAL)).toEqual({
            motor: null,
            nivel: null,
            motivo: "sin-voz",
        });
    });
});

describe("elegirMotorDeFrase · un mensaje, un motor", () => {
    it("respeta el motor fijado mientras siga permitido y con voz", () => {
        const r = elegirMotorDeFrase(CATALOGO, "personal", CAPAS_PERSONAL, "conversacion", "kokoro");
        expect(r).toEqual({ motor: "kokoro", nivel: "ligera", motivo: "fijado" });
    });

    it("si el motor fijado ya no está permitido, elige otro sin romper el mensaje", () => {
        const r = elegirMotorDeFrase(CATALOGO, "grupo", {}, "conversacion", "estudio-omni");
        expect(r.motor).toBe("kokoro");
        expect(r.motivo).toBe("elegido");
    });
});
