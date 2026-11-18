import { describe, it, expect } from "vitest";
import { mapearClaves } from "../mapear";

describe("mapearClaves", () => {
    const fuenteObjeto = {
        "Guardar": "Guardar",
        "Cancelar": "Cancelar",
        "menu.save": "Guardar",
        "menu.cancel": "Cancelar",
        "Editar todo": "Editar todo",
        "Eliminar": "Eliminar",
    };

    const fuenteArray = ["Guardar", "Cancelar", "Editar todo", "Eliminar"];

    it("casa claves exactas", () => {
        const importadas = { Guardar: "Save", Cancelar: "Cancel" };
        const resultado = mapearClaves(importadas, fuenteObjeto);
        expect(resultado.casadas).toBe(2);
        expect(resultado.porcentaje).toBe(100);
        expect(resultado.sinCasar).toEqual([]);
        expect(resultado.entradas.Guardar).toBe("Save");
    });

    it("casa claves con espacios distintos", () => {
        const importadas = { "Guardar cambios": "Save changes" };
        const fuente = { "Guardar cambios": "Guardar cambios" };
        const resultado = mapearClaves(importadas, fuente);
        expect(resultado.casadas).toBe(1);
        expect(resultado.porcentaje).toBe(100);
    });

    it("casa por valor fuente ignorando mayúsculas y puntuación final", () => {
        const importadas = { "btn.save": "Guardar" };
        const fuente = { "Guardar": "Guardar." };
        const resultado = mapearClaves(importadas, fuente);
        expect(resultado.casadas).toBe(1);
        expect(resultado.porcentaje).toBe(100);
    });

    it("casa por identificador (menu.save -> Guardar)", () => {
        const importadas = { "menu.save": "Save" };
        const resultado = mapearClaves(importadas, fuenteObjeto);
        expect(resultado.casadas).toBe(1);
        expect(resultado.porcentaje).toBe(100);
    });

    it("no casa 'Guardar' con 'Guardar todo' (sin difuso)", () => {
        const importadas = { Guardar: "Save" };
        const fuente = { "Guardar todo": "Guardar todo" };
        const resultado = mapearClaves(importadas, fuente);
        expect(resultado.casadas).toBe(0);
        expect(resultado.porcentaje).toBe(0);
        expect(resultado.sinCasar).toContain("Guardar");
    });

    it("porcentaje correcto con mezcla", () => {
        const importadas = { Guardar: "Save", Cancelar: "Cancel", Desconocido: "Unknown" };
        const resultado = mapearClaves(importadas, fuenteObjeto);
        expect(resultado.casadas).toBe(2);
        expect(resultado.porcentaje).toBe(67);
        expect(resultado.sinCasar).toContain("Desconocido");
    });

    it("vacío devuelve ceros", () => {
        const resultado = mapearClaves({}, fuenteObjeto);
        expect(resultado.casadas).toBe(0);
        expect(resultado.porcentaje).toBe(0);
        expect(resultado.sinCasar).toEqual([]);
        expect(resultado.entradas).toEqual({});
    });

    it("funciona con fuente como array de strings", () => {
        const importadas = { Guardar: "Save", Desconocido: "Unknown" };
        const resultado = mapearClaves(importadas, fuenteArray);
        expect(resultado.casadas).toBe(1);
        expect(resultado.porcentaje).toBe(50);
    });

    it("limita sinCasar a 200", () => {
        const muchas: Record<string, string> = {};
        for (let i = 0; i < 250; i++) {
            muchas[`clave${i}`] = `valor${i}`;
        }
        const resultado = mapearClaves(muchas, {});
        expect(resultado.sinCasar.length).toBe(200);
    });

    it("casa por valor fuente ignorando mayúsculas y puntuación", () => {
        const importadas = { "btn.ok": "Aceptar" };
        const fuente = { "Aceptar": "ACEPTAR!" };
        const resultado = mapearClaves(importadas, fuente);
        expect(resultado.casadas).toBe(1);
    });
});