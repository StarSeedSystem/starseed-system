// src/lib/aurora/voz-starseed/__tests__/licencia-voz.test.ts
// Pruebas de `motoresPermitidos`: qué motores de voz pueden sonar en cada
// contexto. Comprobación pura, sin red, disco ni audio, del contrato
// `architecture/voz-voicestudio.md` §4: una condicionada solo entra si
// `condicionCumplida === true`, lo personal no sale del contexto personal
// por omisión y el piso libre nunca se pierde.

import { describe, it, expect } from "vitest";
import { motoresPermitidos } from "../licencia-voz";
import type { MotorInfo } from "../licencia-voz";

/** Cuatro motores reales del catálogo, con sus clases de licencia. */
const MOTORES: MotorInfo[] = [
    { id: "omnivoice", claseLicencia: "personal" },
    { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
    { id: "kokoro", claseLicencia: "libre" },
    { id: "indextts", claseLicencia: "condicionada" },
];

const CONTEXTO_NO_PERSONAL = ["grupo", "comunidad", "publico", "comercial"] as const;

function ids(permitidos: MotorInfo[]): string[] {
    return permitidos.map((m) => m.id);
}

function motivoDe(excluidos: { id: string; motivo: string }[], id: string): string | undefined {
    return excluidos.find((e) => e.id === id)?.motivo;
}

describe("motoresPermitidos en el contexto personal", () => {
    it("con persona personal y comunidad condicionada: entran personal, condicionada cumplida y libre", () => {
        const r = motoresPermitidos(MOTORES, "personal", {
            persona: "personal",
            comunidad: "condicionada",
        });
        expect(ids(r.permitidos)).toEqual(["omnivoice", "supertonic", "kokoro"]);
        expect(r.excluidos).toEqual([
            { id: "indextts", motivo: "Condición de uso no cumplida" },
        ]);
    });

    it("con persona personal sin capa condicionada: la condicionada no entra ni cumplida", () => {
        const r = motoresPermitidos(MOTORES, "personal", { persona: "personal" });
        expect(ids(r.permitidos)).toEqual(["omnivoice", "kokoro"]);
        expect(motivoDe(r.excluidos, "supertonic")).toBe(
            "licencia condicionada sin autorización en este contexto"
        );
    });

    it("sin capas: solo libre, nunca la clase personal por defecto", () => {
        const r = motoresPermitidos(MOTORES, "personal", {});
        expect(ids(r.permitidos)).toEqual(["kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe(
            "las capas activas no autorizan pesos de uso personal"
        );
    });

    it("la capa neurona libre quita los pesos personales aunque la persona los pida", () => {
        const r = motoresPermitidos(MOTORES, "personal", {
            persona: "personal",
            neurona: "libre",
        });
        expect(ids(r.permitidos)).toEqual(["kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe(
            "la capa de la neurona no admite pesos de uso personal"
        );
    });

    it("la capa neurona condicionada conserva la condicionada cumplida y quita lo personal", () => {
        const r = motoresPermitidos(MOTORES, "personal", {
            persona: "personal",
            comunidad: "condicionada",
            neurona: "condicionada",
        });
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe(
            "la capa de la neurona no admite pesos de uso personal"
        );
        expect(motivoDe(r.excluidos, "indextts")).toBe("Condición de uso no cumplida");
    });
});

describe("motoresPermitidos fuera del contexto personal", () => {
    it("grupo: libres y condicionadas cumplidas; nada personal", () => {
        const r = motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" });
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
        expect(motivoDe(r.excluidos, "indextts")).toBe("Condición de uso no cumplida");
    });

    it("comunidad: libres y condicionadas cumplidas; nada personal", () => {
        const r = motoresPermitidos(MOTORES, "comunidad", { comunidad: "condicionada" });
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
    });

    it("publico: libres y condicionadas cumplidas; nada personal", () => {
        const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivoDe(r.excluidos, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
    });

    it("comercial se comporta igual que público, incluso con capa persona personal", () => {
        const capas = { persona: "personal", comunidad: "condicionada" } as const;
        const comercial = motoresPermitidos(MOTORES, "comercial", capas);
        const publico = motoresPermitidos(MOTORES, "publico", capas);
        expect(comercial).toEqual(publico);
        expect(ids(comercial.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivoDe(comercial.excluidos, "omnivoice")).toBe(
            "pesos no comerciales: solo uso personal"
        );
    });

    it("sin capas en grupo, comunidad, público y comercial: solo libre", () => {
        for (const contexto of CONTEXTO_NO_PERSONAL) {
            const r = motoresPermitidos(MOTORES, contexto, {});
            expect(ids(r.permitidos)).toEqual(["kokoro"]);
            expect(motivoDe(r.excluidos, "omnivoice")).toBe(
                "pesos no comerciales: solo uso personal"
            );
        }
    });

    it("la capa neurona restrictiva quita la condicionada aunque la comunidad la autorice", () => {
        const r = motoresPermitidos(MOTORES, "publico", {
            comunidad: "condicionada",
            neurona: "libre",
        });
        expect(ids(r.permitidos)).toEqual(["kokoro"]);
        expect(motivoDe(r.excluidos, "supertonic")).toBe(
            "licencia condicionada sin autorización en este contexto"
        );
    });
});

describe("motoresPermitidos: condición y determinismo", () => {
    it("condicionada sin condicionCumplida true siempre queda fuera, aunque la capa la autorice", () => {
        const r = motoresPermitidos(
            [
                { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
                { id: "indextts", claseLicencia: "condicionada" },
                { id: "indextts-falsa", claseLicencia: "condicionada", condicionCumplida: false },
            ],
            "grupo",
            { grupo: "condicionada" }
        );
        expect(ids(r.permitidos)).toEqual(["supertonic"]);
        expect(motivoDe(r.excluidos, "indextts")).toBe("Condición de uso no cumplida");
        expect(motivoDe(r.excluidos, "indextts-falsa")).toBe("Condición de uso no cumplida");
    });

    it("es determinista y conserva el orden de entrada", () => {
        const capas = { persona: "personal", comunidad: "condicionada" } as const;
        const a = motoresPermitidos(MOTORES, "personal", capas);
        const b = motoresPermitidos(MOTORES, "personal", capas);
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
        const inversos = motoresPermitidos([...MOTORES].reverse(), "personal", capas);
        expect(ids(inversos.permitidos)).toEqual(["kokoro", "supertonic", "omnivoice"]);
        expect(inversos.excluidos).toEqual(a.excluidos);
    });

    it("vacío: entra vacío y sale vacío en los cinco contextos", () => {
        for (const contexto of ["personal", ...CONTEXTO_NO_PERSONAL] as const) {
            const r = motoresPermitidos([], contexto, {});
            expect(r.permitidos).toEqual([]);
            expect(r.excluidos).toEqual([]);
        }
    });
});
