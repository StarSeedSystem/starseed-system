// @vitest-environment jsdom
// Panel «Licencia de los motores por contexto» (Ola 1018V, tarea L).
// Todo lo que prueba son funciones puras exportadas + el render del
// panel, sin red, sin disco y sin procesos.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
    ETIQUETA_CLASE,
    fichaLicencia,
    motivoLicencia,
    textoEstadoVoicestudio,
    VozLicencias,
    type ContextoVoz,
} from "@/components/astraura/voz-licencias";
import { MOTORES_VOZ } from "@/lib/aurora/catalogo-voces";

afterEach(cleanup);

describe("motivoLicencia (pura)", () => {
    it("un motor libre suena en todos los contextos sin motivo", () => {
        const contextos: ContextoVoz[] = ["personal", "grupo", "comunidad", "publico", "comercial"];
        for (const c of contextos) {
            expect(motivoLicencia("libre", c, false)).toBeNull();
            expect(motivoLicencia("libre", c, true)).toBeNull();
        }
    });

    it("un motor personal suena solo en contexto personal", () => {
        expect(motivoLicencia("personal", "personal", false)).toBeNull();
        for (const c of ["grupo", "comunidad", "publico", "comercial"] as ContextoVoz[]) {
            const motivo = motivoLicencia("personal", c, false);
            expect(motivo).not.toBeNull();
            expect(motivo ?? "").toMatch(/no comercial|personal/i);
        }
    });

    it("una condicionada suena solo si su condición consta cumplida", () => {
        for (const c of ["personal", "grupo", "comunidad", "publico", "comercial"] as ContextoVoz[]) {
            expect(motivoLicencia("condicionada", c, false)).toBe("condición de uso no cumplida");
            expect(motivoLicencia("condicionada", c, true)).toBeNull();
        }
    });

    it("el panel usa los motivos del elector puro de licencia", () => {
        expect(motivoLicencia("personal", "comercial", false)).toBe("pesos no comerciales: solo uso personal");
        expect(motivoLicencia("personal", "publico", false)).toBe("pesos no comerciales: solo uso personal");
        expect(motivoLicencia("personal", "personal", false)).toBeNull();
        expect(motivoLicencia("libre", "comercial", false)).toBeNull();
    });
});

describe("fichaLicencia (pura)", () => {
    const landing = MOTORES_VOZ.find((m) => m.id === "voicemorphic");
    it("cada ficha lleva etiqueta según su clase", () => {
        expect(ETIQUETA_CLASE.libre).toBe("Libre");
        expect(ETIQUETA_CLASE.condicionada).toBe("Con condiciones");
        expect(ETIQUETA_CLASE.personal).toBe("Solo personal");
    });

    it("regla dura: ningún motor personal suena fuera del contexto personal", () => {
        for (const c of ["grupo", "comunidad", "publico", "comercial"] as ContextoVoz[]) {
            for (const m of MOTORES_VOZ.filter((x) => x.claseLicencia === "personal")) {
                const fila = fichaLicencia(m, c);
                expect(fila.suena).toBe(false);
                expect(fila.motivo).toBe("pesos no comerciales: solo uso personal");
            }
        }
        expect(fichaLicencia(landing!, "personal").suena).toBe(true);
    });

    it("una condicionada cumplida suena en los cinco contextos y sin cumplir no", () => {
        const supertonic = MOTORES_VOZ.find((m) => m.id === "supertonic");
        const condicionada = supertonic ?? {
            ...MOTORES_VOZ[0],
            id: "condicionada-prueba",
            claseLicencia: "condicionada" as const,
        };
        for (const c of ["personal", "grupo", "comunidad", "publico", "comercial"] as ContextoVoz[]) {
            expect(fichaLicencia(condicionada, c, true).suena).toBe(true);
            expect(fichaLicencia(condicionada, c, false).motivo).toBe("condición de uso no cumplida");
        }
    });

    it("VoiceStudio que no responde en la neurona no suena, con su motivo", () => {
        const studio = MOTORES_VOZ.find((m) => m.id === "voicestudio");
        const fila = fichaLicencia(studio!, "personal", false, "no-detectado");
        expect(fila.suena).toBe(false);
        expect(fila.motivo ?? "").toMatch(/neurona/);
        expect(fichaLicencia(studio!, "personal", false, "vivo").suena).toBe(true);
    });
});

describe("textoEstadoVoicestudio (pura)", () => {
    it("dice lo que sabe de cada estado, en español", () => {
        expect(textoEstadoVoicestudio("vivo")).toMatch(/vivo/);
        expect(textoEstadoVoicestudio("no-detectado")).toMatch(/no responde/i);
        expect(textoEstadoVoicestudio("sin-comprobar")).toMatch(/sin comprobar/i);
    });
});

describe("VozLicencias (render)", () => {
    it("en contexto comercial muestra VoiceMorphic como Solo personal con motivo", () => {
        render(<VozLicencias contexto="comercial" estadoVoicestudio="no-detectado" />);
        expect(screen.getByText(/VoiceMorphic/)).toBeTruthy();
        const motivos = screen.getAllByText(/pesos no comerciales: solo uso personal/);
        expect(motivos.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/Licencia de los motores/)).toBeTruthy();
    });

    it("en contexto personal la voz nativa suena y nunca pone el motivo", () => {
        render(<VozLicencias contexto="personal" />);
        const fila = screen.getByText(/VoiceMorphic/).closest("div")!;
        expect(fila.textContent).not.toMatch(/no comercial/);
        expect(screen.getByText(/sin comprobar/i)).toBeTruthy();
    });
});
