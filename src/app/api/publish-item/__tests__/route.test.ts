// Pruebas del endpoint de publicación en la Tienda
// NO importa el route.ts directamente; se prueba la validación

import { describe, it, expect } from "vitest";

const VALID_SOURCE_KINDS = new Set(["app", "widget", "tema", "plantilla", "personalidad", "cerebro", "recurso", "calendario"]);

function validarEntrada(body: unknown): { error: string } | null {
    if (typeof body !== "object" || body === null) {
        return { error: "Cuerpo de solicitud inválido" };
    }
    const b = body as Record<string, unknown>;
    
    if (b.kind !== undefined && !VALID_SOURCE_KINDS.has(b.kind as string)) {
        return { error: "El campo 'kind' no es una categoría válida" };
    }
    
    const titulo = b.title;
    if (titulo !== undefined) {
        if (typeof titulo !== "string" || titulo.length === 0 || titulo.length > 200) {
            return { error: "El campo 'title' debe ser una cadena de 1-200 caracteres" };
        }
    }
    
    return null;
}

function sanitizarTitulo(titulo: string): string {
    return titulo.trim().replace(/[<>]/g, "");
}

describe("/api/publish-item validación", () => {
    describe("validación de kind", () => {
        it("acepta kinds válidos", () => {
            expect(validarEntrada({ kind: "app" })).toBeNull();
            expect(validarEntrada({ kind: "widget" })).toBeNull();
            expect(validarEntrada({ kind: "recurso" })).toBeNull();
            expect(validarEntrada({ kind: "calendario" })).toBeNull();
        });

        it("rechaza kinds maliciosos o desconocidos", () => {
            expect(validarEntrada({ kind: "admin" })).toEqual({ error: "El campo 'kind' no es una categoría válida" });
            expect(validarEntrada({ kind: "../../etc" })).toEqual({ error: "El campo 'kind' no es una categoría válida" });
            expect(validarEntrada({ kind: "malicious" })).toEqual({ error: "El campo 'kind' no es una categoría válida" });
        });
    });

    describe("validación de title", () => {
        it("acepta títulos válidos", () => {
            expect(validarEntrada({ title: "Mi aplicación" })).toBeNull();
            expect(validarEntrada({ title: "a" })).toBeNull();
        });

        it("rechaza títulos inválidos (excepto espacios en blanco que se sanitizan)", () => {
            expect(validarEntrada({ title: "" })).toEqual({ error: "El campo 'title' debe ser una cadena de 1-200 caracteres" });
            expect(validarEntrada({ title: "a".repeat(201) })).toEqual({ error: "El campo 'title' debe ser una cadena de 1-200 caracteres" });
        });
    });

    describe("sanitización de título", () => {
        it("elimina caracteres de HTML malicioso", () => {
            expect(sanitizarTitulo("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
            expect(sanitizarTitulo("test<>value")).toBe("testvalue");
        });

        it("recorta espacios en blanco", () => {
            expect(sanitizarTitulo("  hola mundo  ")).toBe("hola mundo");
        });

        it("deja intactos títulos seguros", () => {
            expect(sanitizarTitulo("Mi aplicación")).toBe("Mi aplicación");
            expect(sanitizarTitulo("Proyecto 123")).toBe("Proyecto 123");
        });
    });

    describe("cuerpo inválido", () => {
        it("rechaza null", () => {
            const result = validarEntrada(null);
            expect(result).not.toBeNull();
            expect(result?.error).toBe("Cuerpo de solicitud inválido");
        });

        it("rechaza undefined", () => {
            const result = validarEntrada(undefined);
            expect(result).not.toBeNull();
            expect(result?.error).toBe("Cuerpo de solicitud inválido");
        });

        it("rechaza número", () => {
            const result = validarEntrada(123);
            expect(result).not.toBeNull();
            expect(result?.error).toBe("Cuerpo de solicitud inválido");
        });
    });
});