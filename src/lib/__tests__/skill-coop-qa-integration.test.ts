/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Skill coop-qa — Prueba de integración de la skill
 * ---------------------------------------------------------------------------
 * Verifica que la skill coop-qa está documentada correctamente y lista para
 * que el enjambre la use. No prueba lógica de salas (eso está en salas-sala.test.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SKILL_ROOT = ".agent/skills/coop-qa";

describe("skill coop-qa · integración en el repo", () => {
    it("existe el archivo SKILL.md con name y description", () => {
        const path = join(SKILL_ROOT, "SKILL.md");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("name: coop-qa");
        expect(content).toContain("description:");
        expect(content.length).toBeGreaterThan(100);
    });

    it("existe el archivo LEEME-StarSeed.md con contexto de la copia", () => {
        const path = join(SKILL_ROOT, "LEEME-StarSeed.md");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("cranebeaker/coop-anything");
        expect(content).toContain("MIT");
        expect(content).toContain("Protomolécula");
    });

    it("existe el archivo LICENSE (MIT)", () => {
        const path = join(SKILL_ROOT, "LICENSE");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("MIT License");
        expect(content).toContain("cranebeaker");
    });

    it("existe el archivo README.md con documentación completa de uso", () => {
        const path = join(SKILL_ROOT, "README.md");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        // Secciones obligatorias
        expect(content).toContain("## Propósito");
        expect(content).toContain("## Cuándo usar esta skill");
        expect(content).toContain("## Conceptos clave");
        expect(content).toContain("## Cómo invocar la skill desde una tarea del enjambre");
        expect(content).toContain("## Ejemplo completo");
        expect(content).toContain("## Gemelo de mutación");
        expect(content).toContain("## Reglas de oro");
        expect(content).toContain("## Ejecución en el enjambre");
        expect(content).toContain("## Integración con el flujo de trabajo");
        expect(content).toContain("## Referencias");
        expect(content).toContain("## Licencia");
        // Contenido específico de StarSeed OS
        expect(content).toContain("Protomolécula");
        expect(content).toContain("vitest");
        expect(content).toContain("relevo_eventos");
        expect(content).toContain("Maggasukha");
    });

    it("existe el playbook de referencia automated-qa.md", () => {
        const path = join(SKILL_ROOT, "referencias", "automated-qa.md");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("Policy");
        expect(content).toContain("mutation twins");
        // El playbook original está en inglés; "mutación" aparece en la traducción del README
    });

    it("existe el ejemplo de uso en ejemplos/sala-coop-qa.test.ts", () => {
        const path = join(SKILL_ROOT, "ejemplos", "sala-coop-qa.test.ts");
        expect(existsSync(path)).toBe(true);
        const content = readFileSync(path, "utf-8");
        // Estructura de test vitest (después del bloque de comentario inicial)
        expect(content).toContain("import { describe, it, expect, beforeEach, vi } from \"vitest\"");
        expect(content).toContain("from \"@/lib/salas/sala\"");
        // Suites principales
        expect(content).toContain("coop-qa · pizarra · matriz de roles");
        expect(content).toContain("coop-qa · pizarra · elección de transporte");
        expect(content).toContain("coop-qa · pizarra · capacidades por tipo");
        expect(content).toContain("coop-qa · pizarra · gemelo de mutación");
        // Helpers de prueba
        expect(content).toContain("function sala(");
        expect(content).toContain("function alcance(");
        // Aserciones clave
        expect(content).toContain("puedeVer");
        expect(content).toContain("puedeEditar");
        expect(content).toContain("puedeInvitar");
        expect(content).toContain("rolDe");
        expect(content).toContain("elegirTransporte");
        expect(content).toContain("CAPACIDADES_POR_TIPO");
        expect(content).toContain("admiteCapacidad");
    });

    it("el ejemplo importa tipos y funciones del contrato puro de salas", () => {
        const path = join(SKILL_ROOT, "ejemplos", "sala-coop-qa.test.ts");
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("type Sala");
        expect(content).toContain("type TipoSala");
        expect(content).toContain("type Alcanzabilidad");
    });

    it("el README referencia la skill hermana coop-sync-testing", () => {
        const path = join(SKILL_ROOT, "README.md");
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("coop-sync-testing");
        expect(content).toContain("chaos box");
        expect(content).toContain("flight recorder");
        expect(content).toContain("fuzzer");
    });

    it("el README documenta la regla de las tres puertas (tsc, vitest, next build)", () => {
        const path = join(SKILL_ROOT, "README.md");
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("tsc");
        expect(content).toContain("vitest");
        expect(content).toContain("tres puertas");
        expect(content).toContain("puertas en verde");
    });

    it("el README usa terminología correcta: Genesis, Maggasukha, Protomolécula", () => {
        const path = join(SKILL_ROOT, "README.md");
        const content = readFileSync(path, "utf-8");
        expect(content).toContain("Genesis");
        expect(content).toContain("Maggasukha");
        expect(content).toContain("Protomolécula");
        // No debe usar términos antiguos
        expect(content).not.toContain("Puente de Mando");
        expect(content).not.toContain("Centro de Mando");
        expect(content).not.toMatch(/\bMando\b(?![a-z])/); // "Mando" solo como parte de Genesis
    });
});

describe("skill coop-qa · ejemplo ejecutable (validación sintáctica)", () => {
    it("el archivo de ejemplo no tiene errores de sintaxis TypeScript obvios", () => {
        const path = join(SKILL_ROOT, "ejemplos", "sala-coop-qa.test.ts");
        const content = readFileSync(path, "utf-8");
        // Verificaciones básicas de sintaxis
        expect(content).not.toContain("any");
        expect(content).not.toContain("@ts-ignore");
        expect(content).not.toContain("@ts-expect-error");
        // Imports correctos
        expect(content.match(/import \{/g)?.length).toBeGreaterThan(0);
        expect(content).toContain("from \"vitest\"");
        // Describe/it balanceados
        const describeCount = (content.match(/describe\(/g) || []).length;
        const itCount = (content.match(/it\(/g) || []).length;
        expect(describeCount).toBeGreaterThan(0);
        expect(itCount).toBeGreaterThan(describeCount);
    });
});