import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SKILL_PATH = path.join(__dirname, "..", "..", "..", ".agent", "skills", "awesome-design-md", "SKILL.md");

function leerSkill(): string {
    return readFileSync(SKILL_PATH, "utf8");
}

function tieneSeccionUso(texto: string): boolean {
    return /^##\s+Uso\s*$/im.test(texto);
}

function tieneEjemploModoA(texto: string): boolean {
    return /Modo\s*A.*leer\s+referencias/i.test(texto) && /ejemplo/i.test(texto);
}

function tieneEjemploModoB(texto: string): boolean {
    return /Modo\s*B.*escribir.*DESIGN\.md/i.test(texto) && /ejemplo/i.test(texto);
}

function tieneReferenciaIndice(texto: string): boolean {
    return /INDICE\.md/i.test(texto);
}

function tieneReferenciaFormatos(texto: string): boolean {
    return /ejemplo-formato/i.test(texto);
}

describe("awesome-design-md skill tiene sección de uso completa", () => {
    it("el archivo SKILL.md existe y es legible", () => {
        const contenido = leerSkill();
        expect(contenido.length).toBeGreaterThan(100);
    });

    it("tiene una sección ## Uso", () => {
        const contenido = leerSkill();
        expect(tieneSeccionUso(contenido), "Falta sección '## Uso' en SKILL.md").toBe(true);
    });

    it("la sección de uso incluye ejemplo para Modo A (leer referencias)", () => {
        const contenido = leerSkill();
        expect(tieneEjemploModoA(contenido), "Falta ejemplo de Modo A en la sección de uso").toBe(true);
    });

    it("la sección de uso incluye ejemplo para Modo B (escribir DESIGN.md)", () => {
        const contenido = leerSkill();
        expect(tieneEjemploModoB(contenido), "Falta ejemplo de Modo B en la sección de uso").toBe(true);
    });

    it("la sección de uso referencia INDICE.md para elegir marcas", () => {
        const contenido = leerSkill();
        expect(tieneReferenciaIndice(contenido), "Falta referencia a INDICE.md en la sección de uso").toBe(true);
    });

    it("la sección de uso referencia los formatos de ejemplo", () => {
        const contenido = leerSkill();
        expect(tieneReferenciaFormatos(contenido), "Falta referencia a ejemplo-formato/ en la sección de uso").toBe(true);
    });
});

describe("funciones puras de validación", () => {
    it("tieneSeccionUso detecta correctamente", () => {
        expect(tieneSeccionUso("## Uso\nalgo")).toBe(true);
        expect(tieneSeccionUso("## uso\nalgo")).toBe(true);
        expect(tieneSeccionUso("## USO\nalgo")).toBe(true);
        expect(tieneSeccionUso("### Uso\nalgo")).toBe(false);
        expect(tieneSeccionUso("Uso\nalgo")).toBe(false);
    });

    it("tieneEjemploModoA detecta correctamente", () => {
        expect(tieneEjemploModoA("Modo A: leer referencias\nEjemplo: ...")).toBe(true);
        expect(tieneEjemploModoA("modo a: LEER REFERENCIAS\nejemplo: ...")).toBe(true);
        expect(tieneEjemploModoA("Modo A: leer referencias")).toBe(false);
        expect(tieneEjemploModoA("Ejemplo: ...")).toBe(false);
    });

    it("tieneEjemploModoB detecta correctamente", () => {
        expect(tieneEjemploModoB("Modo B: escribir DESIGN.md\nEjemplo: ...")).toBe(true);
        expect(tieneEjemploModoB("modo b: ESCRIBIR design.md\nejemplo: ...")).toBe(true);
        expect(tieneEjemploModoB("Modo B: escribir DESIGN.md")).toBe(false);
        expect(tieneEjemploModoB("Ejemplo: ...")).toBe(false);
    });

    it("tieneReferenciaIndice detecta correctamente", () => {
        expect(tieneReferenciaIndice("consulta INDICE.md")).toBe(true);
        expect(tieneReferenciaIndice("indice.md")).toBe(true);
        expect(tieneReferenciaIndice("consulta el índice")).toBe(false);
    });

    it("tieneReferenciaFormatos detecta correctamente", () => {
        expect(tieneReferenciaFormatos("mira en ejemplo-formato/")).toBe(true);
        expect(tieneReferenciaFormatos("EJEMPLO-FORMATO/")).toBe(true);
        expect(tieneReferenciaFormatos("formato de ejemplo")).toBe(false);
    });
});