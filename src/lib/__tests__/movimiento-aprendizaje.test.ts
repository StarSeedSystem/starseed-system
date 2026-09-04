import { beforeEach, describe, expect, it } from "vitest";

import {
    CLAVE_PERFILES_MOVIMIENTO,
    TOPE_MAX,
    TOPE_MIN,
    aplicarPerfil,
    gestoDesdeTexto,
    perfilDe,
    registrarUso,
    resumenParaModelo,
} from "../avatares/movimiento/aprendizaje";
import type { Gesto } from "../avatares/movimiento/motor";

class LocalStorageFalso {
    private datos = new Map<string, string>();
    getItem(k: string): string | null {
        return this.datos.get(k) ?? null;
    }
    setItem(k: string, v: string): void {
        this.datos.set(k, v);
    }
    removeItem(k: string): void {
        this.datos.delete(k);
    }
    clear(): void {
        this.datos.clear();
    }
}
(globalThis as unknown as { localStorage: LocalStorageFalso }).localStorage =
    new LocalStorageFalso();

beforeEach(() => {
    localStorage.clear();
});

describe("registrarUso", () => {
    it("«interrumpido» baja la amplitud y la mantiene dentro de los topes", () => {
        const antes = perfilDe("voz-prudente").amplitud;
        let despues = registrarUso("voz-prudente", { tipo: "interrumpido", gesto: "saludo amplio" });
        expect(despues.amplitud).toBeLessThan(antes);

        for (let i = 0; i < 500; i++) {
            despues = registrarUso("voz-prudente", { tipo: "interrumpido", gesto: "saludo amplio" });
        }
        expect(despues.amplitud).toBeGreaterThanOrEqual(TOPE_MIN);
        expect(despues.amplitud).toBeLessThanOrEqual(TOPE_MAX);
        expect(despues.ritmo).toBeGreaterThanOrEqual(TOPE_MIN);
        expect(despues.expresividad).toBeGreaterThanOrEqual(TOPE_MIN);
    });

    it("«gustado» sube la amplitud y se mantiene dentro de los topes", () => {
        const antes = perfilDe("voz-efusiva").amplitud;
        let despues = registrarUso("voz-efusiva", { tipo: "gustado", gesto: "baile corto" });
        expect(despues.amplitud).toBeGreaterThan(antes);

        for (let i = 0; i < 500; i++) {
            despues = registrarUso("voz-efusiva", { tipo: "gustado", gesto: "baile corto" });
        }
        expect(despues.amplitud).toBeLessThanOrEqual(TOPE_MAX);
        expect(despues.amplitud).toBeGreaterThanOrEqual(TOPE_MIN);
        expect(despues.ritmo).toBeLessThanOrEqual(TOPE_MAX);
        expect(despues.expresividad).toBeLessThanOrEqual(TOPE_MAX);
    });

    it("el perfil persiste en localStorage y se recupera al leerlo de nuevo", () => {
        registrarUso("memoria", { tipo: "gustado", gesto: "asentir" });
        registrarUso("memoria", { tipo: "interrumpido", gesto: "giro largo" });

        const crudo = localStorage.getItem(CLAVE_PERFILES_MOVIMIENTO);
        expect(crudo).toBeTruthy();

        const perfil = perfilDe("memoria");
        expect(perfil.personalidadId).toBe("memoria");
        expect(perfil.muestras).toBe(2);
        expect(perfil.preferencias.asentir).toBeGreaterThan(0);
        expect(perfil.preferencias["giro largo"]).toBeLessThan(0);
        expect(typeof perfil.actualizado).toBe("string");
    });
});

describe("aplicarPerfil", () => {
    it("con un perfil recién creado no altera el gesto", () => {
        const gesto: Gesto = {
            prompt: "levantar una mano despacio",
            emocion: "curiosidad",
            energia: 0.7,
            duracionMs: 1800,
        };
        const perfil = perfilDe("sin-aprendizaje");
        expect(perfil.muestras).toBe(0);

        expect(aplicarPerfil(gesto, perfil)).toEqual(gesto);
    });
});

describe("gestoDesdeTexto y resumenParaModelo", () => {
    it("gestoDesdeTexto recorta y nunca devuelve un prompt vacío", () => {
        expect(gestoDesdeTexto("   ").prompt.length).toBeGreaterThan(0);
        expect(gestoDesdeTexto("x".repeat(500)).prompt.length).toBeLessThanOrEqual(160);
    });

    it("el resumen describe el estilo aprendido tras registrar señales", () => {
        registrarUso("para-modelo", { tipo: "gustado", gesto: "camuflaje lento" });
        const resumen = resumenParaModelo("para-modelo");
        expect(resumen).toContain("para-modelo");
        expect(resumen).toContain("Estilo de movimiento");
    });
});
