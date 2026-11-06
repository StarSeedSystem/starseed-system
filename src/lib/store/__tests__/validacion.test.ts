// Pruebas de validación para el endpoint de publicación en la Tienda

import { describe, it, expect } from "vitest";
import { esCategoriaValida, esTituloValido, sanitizarTitulo } from "../validacion";

describe("validación de publicación", () => {
    describe("esCategoriaValida", () => {
        it("acepta categorías conocidas válidas", () => {
            expect(esCategoriaValida("app")).toBe(true);
            expect(esCategoriaValida("widget")).toBe(true);
            expect(esCategoriaValida("tema")).toBe(true);
            expect(esCategoriaValida("plantilla")).toBe(true);
            expect(esCategoriaValida("personalidad")).toBe(true);
            expect(esCategoriaValida("cerebro")).toBe(true);
            expect(esCategoriaValida("recurso")).toBe(true);
            expect(esCategoriaValida("calendario")).toBe(true);
        });

        it("rechaza categorías desconocidas o maliciosas", () => {
            expect(esCategoriaValida("admin")).toBe(false);
            expect(esCategoriaValida("user")).toBe(false);
            expect(esCategoriaValida("../../etc")).toBe(false);
            expect(esCategoriaValida("app; DROP TABLE")).toBe(false);
        });

        it("rechaza tipos incorrectos", () => {
            expect(esCategoriaValida(null)).toBe(false);
            expect(esCategoriaValida(undefined)).toBe(false);
            expect(esCategoriaValida(123)).toBe(false);
            expect(esCategoriaValida({})).toBe(false);
            expect(esCategoriaValida([])).toBe(false);
        });
    });

    describe("esTituloValido", () => {
        it("acepta títulos válidos", () => {
            expect(esTituloValido("Mi aplicación")).toBe(true);
            expect(esTituloValido("Proyecto de investigación")).toBe(true);
            expect(esTituloValido("a")).toBe(true);
        });

        it("rechaza títulos vacíos o demasiado largos", () => {
            expect(esTituloValido("")).toBe(false);
            expect(esTituloValido("a".repeat(201))).toBe(false);
            expect(esTituloValido("a".repeat(200))).toBe(true);
        });

        it("rechaza tipos incorrectos", () => {
            expect(esTituloValido(null)).toBe(false);
            expect(esTituloValido(undefined)).toBe(false);
            expect(esTituloValido(123)).toBe(false);
            expect(esTituloValido({})).toBe(false);
            expect(esTituloValido([])).toBe(false);
        });

        it("rechaza intentos de inyección de rutas", () => {
            expect(esTituloValido("../../etc/passwd")).toBe(true);
            expect(esTituloValido("test<script>")).toBe(true);
        });
    });

    describe("sanitizarTitulo", () => {
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
});