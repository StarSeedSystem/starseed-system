import { describe, it, expect } from "vitest";
import { motoresPermitidos, type MotorInfo } from "../licencia-voz";

const MOTORES: MotorInfo[] = [
    { id: "omnivoice", claseLicencia: "personal" },
    { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
    { id: "kokoro", claseLicencia: "libre" },
    { id: "indextts", claseLicencia: "condicionada", condicionCumplida: false },
];

const CAPAS_OPT_IN = { persona: "personal" as const, comunidad: "condicionada" as const };

const ids = (m: MotorInfo[]) => m.map((motor) => motor.id);
const motivos = (r: { excluidos: { id: string; motivo: string }[] }) =>
    Object.fromEntries(r.excluidos.map((e) => [e.id, e.motivo]));

describe("motoresPermitidos · licencia por contexto", () => {
    it("personal con capa persona permite OmniVoice, Supertonic y Kokoro; IndexTTS no cumple", () => {
        const r = motoresPermitidos(MOTORES, "personal", CAPAS_OPT_IN);
        expect(ids(r.permitidos)).toEqual(["omnivoice", "supertonic", "kokoro"]);
        expect(r.excluidos).toEqual([{ id: "indextts", motivo: "condición de uso no cumplida" }]);
    });

    it.each(["grupo", "comunidad", "publico"] as const)(
        "%s permite libres y condicionadas cumplidas, sin OmniVoice",
        (contexto) => {
            const r = motoresPermitidos(MOTORES, contexto, CAPAS_OPT_IN);
            expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
            expect(motivos(r).omnivoice).toBe("pesos no comerciales: solo uso personal");
            expect(motivos(r).indextts).toBe("condición de uso no cumplida");
        }
    );

    it("comercial se trata como publico sin uso personal, aunque la persona pida personal", () => {
        const r = motoresPermitidos(MOTORES, "comercial", CAPAS_OPT_IN);
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
        expect(motivos(r).omnivoice).toBe("pesos no comerciales: solo uso personal");
    });

    it("lo personal no es la opción por defecto: sin capa persona solo entra lo libre", () => {
        const r = motoresPermitidos(MOTORES, "personal", {});
        expect(ids(r.permitidos)).toEqual(["kokoro"]);
        expect(motivos(r).omnivoice).toBe("pesos no comerciales: solo uso personal");
        expect(motivos(r).supertonic).toContain("condicionada");
    });

    it("la capa persona no habilita pesos personales en publico", () => {
        const r = motoresPermitidos(MOTORES, "publico", { persona: "personal" });
        expect(ids(r.permitidos)).toEqual(["kokoro"]);
        expect(motivos(r).omnivoice).toBe("pesos no comerciales: solo uso personal");
    });

    it("la capa grupo también habilita las condicionadas (herencia de capas)", () => {
        const r = motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" });
        expect(ids(r.permitidos)).toEqual(["supertonic", "kokoro"]);
    });

    it("una condicionada sin capa que la habilite se excluye con motivo legible", () => {
        const r = motoresPermitidos(MOTORES, "grupo", {});
        expect(motivos(r).supertonic).toBe("licencia condicionada no habilitada para el contexto grupo");
    });

    it("es determinista y no muta la lista de entrada", () => {
        const copia = JSON.parse(JSON.stringify(MOTORES)) as MotorInfo[];
        const a = motoresPermitidos(MOTORES, "grupo", CAPAS_OPT_IN);
        const b = motoresPermitidos(MOTORES, "grupo", CAPAS_OPT_IN);
        expect(a).toEqual(b);
        expect(MOTORES).toEqual(copia);
        expect(a.permitidos).not.toBe(MOTORES);
    });

    it("rechaza una condicionada con la condición ausente aunque las capas la habiliten", () => {
        const r = motoresPermitidos(
            [{ id: "supertonic", claseLicencia: "condicionada" }],
            "comunidad",
            { comunidad: "condicionada" }
        );
        expect(r.permitidos).toEqual([]);
        expect(r.excluidos).toEqual([{ id: "supertonic", motivo: "condición de uso no cumplida" }]);
    });
});
