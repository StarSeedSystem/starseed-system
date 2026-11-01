// src/lib/aurora/voz-starseed/__tests__/motor-primera-frase.test.ts
/**
 * La PRIMERA FRASE de una conversación (Ola 1018V · VST1018F, parte 2).
 * Contrato `architecture/voz-voicestudio.md` §4: una conversación empieza a
 * sonar con el motor de MENOR latencia MEDIDA que tenga la voz de esa persona
 * y esté PERMITIDO en el contexto; «estudio» solo para lectura, doblaje y
 * audiolibros; el mensaje entero suena por UN motor (nunca se parte entre dos).
 * Todo con MEDIDAS FALSAS inyectadas: sin red, disco, reloj, micrófono ni audio.
 */

import { describe, expect, it } from "vitest";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";
import type { CapasPrefs } from "@/lib/modelos/preferencias-capas";
import {
    elegirMotorPrimeraFrase,
    medianaLatencia,
    topeEstudioSegunContexto,
} from "../motor";

/** Medida falsa de «primer-sonido», tal como la guarda `medidas-voz.ts`. */
function m(motor: string, valor: number): MedidaVoz {
    return { neurona: "neurona-1", motor, tipo: "primer-sonido", valor, timestamp: 0 };
}

/** Tres candidatos típicos: uno de clase personal y dos libres. */
const candidatos = [
    { id: "voicemorphic", claseLicencia: "personal" as const, tieneVozDe: true },
    { id: "kokoro", claseLicencia: "libre" as const, tieneVozDe: true },
    { id: "kitten-tts", claseLicencia: "libre" as const, tieneVozDe: true },
];

const capasSinRestriccion: CapasPrefs = {};

describe("elegirMotorPrimeraFrase · menor latencia medida", () => {
    it("gana el permitido con menor mediana de «primer-sonido»", () => {
        const medidas = [m("kokoro", 300), m("kokoro", 100), m("kitten-tts", 200)];
        const e = elegirMotorPrimeraFrase(candidatos, "personal", capasSinRestriccion, medidas);
        expect(e.motor).toBe("kokoro");
        expect(e.latenciaMs).toBe(200); // mediana de [100, 300]
    });

    it("empate de mediana: gana el que llegó primero (orden estable, elección repetible)", () => {
        const medidas = [m("kitten-tts", 250), m("kokoro", 250)];
        const e = elegirMotorPrimeraFrase(candidatos, "personal", capasSinRestriccion, medidas);
        expect(e.motor).toBe("kokoro");
    });

    it("descarta los motores que no tienen la voz de esa persona", () => {
        const soloVozDixa = [
            { id: "kokoro", claseLicencia: "libre" as const, tieneVozDe: true },
            { id: "kitten-tts", claseLicencia: "libre" as const, tieneVozDe: false },
            { id: "voicemorphic", claseLicencia: "personal" as const }, // sin voz: fuera
        ];
        const medidas = [m("kitten-tts", 10), m("kokoro", 500)];
        const e = elegirMotorPrimeraFrase(soloVozDixa, "personal", capasSinRestriccion, medidas);
        expect(e.motor).toBe("kokoro");
        expect(e.latenciaMs).toBe(500);
    });
});

describe("elegirMotorPrimeraFrase · la licencia manda antes que la velocidad", () => {
    it("en grupo un motor «personal» queda fuera aunque sea el más rápido", () => {
        const medidas = [m("voicemorphic", 50), m("kitten-tts", 400)];
        const e = elegirMotorPrimeraFrase(candidatos, "grupo", capasSinRestriccion, medidas);
        expect(e.motor).not.toBe("voicemorphic");
        expect(e.motor).toBe("kitten-tts"); // único libre medido
    });

    it("en comercial rige lo mismo: nada no comercial como opción por defecto", () => {
        const medidas = [m("voicemorphic", 1), m("kitten-tts", 400)];
        const e = elegirMotorPrimeraFrase(candidatos, "comercial", capasSinRestriccion, medidas);
        expect(e.motor).toBe("kitten-tts");
    });

    it("una «condicionada» sin su capa no suena aunque cumpla su condición", () => {
        const conSupertonic = [
            ...candidatos,
            { id: "supertonic-3", claseLicencia: "condicionada" as const, condicionCumplida: true, tieneVozDe: true },
        ];
        const medidas = [m("supertonic-3", 60), m("kokoro", 100)];
        const sin = elegirMotorPrimeraFrase(conSupertonic, "personal", capasSinRestriccion, medidas);
        expect(sin.motor).toBe("kokoro");

        const conCapa = elegirMotorPrimeraFrase(
            conSupertonic,
            "personal",
            { grupo: "condicionada" },
            medidas,
        );
        expect(conCapa.motor).toBe("supertonic-3");
        expect(conCapa.latenciaMs).toBe(60);
    });
});

describe("elegirMotorPrimeraFrase · «estudio» solo para lectura, doblaje y audiolibros", () => {
    const estudio = { id: "voicestudio", claseLicencia: "libre" as const, tieneVozDe: true, esEstudio: true };
    const conEstudio = [...candidatos, estudio];
    const medidas = [m("voicestudio", 30), m("kokoro", 100)];

    it("en conversación el motor de estudio no compite", () => {
        const e = elegirMotorPrimeraFrase(conEstudio, "personal", capasSinRestriccion, medidas, "conversacion");
        expect(e.motor).toBe("kokoro");
    });

    it("en aviso tampoco", () => {
        const e = elegirMotorPrimeraFrase(conEstudio, "personal", capasSinRestriccion, medidas, "aviso");
        expect(e.motor).toBe("kokoro");
    });

    it("en lectura larga, doblaje y audiolibros sí corre por estudio", () => {
        for (const uso of ["lectura", "doblaje", "audiolibro"] as const) {
            const e = elegirMotorPrimeraFrase(conEstudio, "personal", capasSinRestriccion, medidas, uso);
            expect(e.motor).toBe("voicestudio");
        }
    });
});

describe("elegirMotorPrimeraFrase · sin base medida no hay promesa de instantánea", () => {
    it("sin medidas devuelvan null y el caller cae al nivel por defecto", () => {
        const e = elegirMotorPrimeraFrase(candidatos, "personal", capasSinRestriccion, []);
        expect(e.motor).toBeNull();
        expect(e.latenciaMs).toBeNull();
    });

    it("una medida de otro tipo no cuenta: solo «primer-sonido»", () => {
        const otras: MedidaVoz[] = [
            { neurona: "neurona-1", motor: "kokoro", tipo: "correccion", valor: 1, timestamp: 0 },
            { neurona: "neurona-1", motor: "kokoro", tipo: "tiempo-real-oido", valor: 20, timestamp: 0 },
        ];
        const e = elegirMotorPrimeraFrase(candidatos, "personal", capasSinRestriccion, otras);
        expect(e.motor).toBeNull();
    });
});

describe("medianaLatencia · la estadística que ordena la elección", () => {
    it("impar: el valor del centro; par: la media de los dos centrales", () => {
        expect(medianaLatencia([m("kokoro", 5), m("kokoro", 1), m("kokoro", 3)], "kokoro")).toBe(3);
        expect(medianaLatencia([m("kokoro", 4), m("kokoro", 2)], "kokoro")).toBe(3);
    });

    it("no mezcla motores ni tipos ajenos, y sin datos devuelve null", () => {
        expect(medianaLatencia([m("kitten-tts", 9), m("kokoro", 7)], "kokoro")).toBe(7);
        expect(medianaLatencia([], "kokoro")).toBeNull();
    });
});

describe("topeEstudioSegunContexto · el tope del nivel según dónde suena", () => {
    it("la lectura larga es el único uso del «estudio» desde el contexto del motor", () => {
        expect(topeEstudioSegunContexto("lectura")).toBeNull();
        expect(topeEstudioSegunContexto("conversacion")).toBe("alta");
        expect(topeEstudioSegunContexto("aviso")).toBe("alta");
        expect(topeEstudioSegunContexto("rito")).toBe("alta");
        expect(topeEstudioSegunContexto("imaginacion")).toBe("alta");
    });
});
