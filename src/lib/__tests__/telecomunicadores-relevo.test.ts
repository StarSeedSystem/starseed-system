/**
 * Tests de `candidatosDeModelo` (Ola 287 · T3 · 2026-09-08): el relevo en cadena
 * del telecomunicador no se queda mudo ante un 429 — elige modelo según la salud
 * de la flota, saltando proveedores caídos o sin cupo y nunca repitiendo
 * proveedor. Solo prueba la función PURA, sin tocar disco ni red (vitest
 * `globals: false` no admite parchear módulos de Node, por eso ni `vi.mock` ni
 * rutas del App Router).
 */
import { describe, it, expect } from "vitest";
import { candidatosDeModelo } from "../canales/telecomunicadores";

/** Marca de tiempo reciente (hace 1 minuto) en el formato del supervisor. */
function tReciente(): string {
    const f = new Date(Date.now() - 60_000);
    const dos = (n: number): string => String(n).padStart(2, "0");
    return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())} ${dos(f.getHours())}:${dos(f.getMinutes())}:${dos(f.getSeconds())}`;
}

/** Entrada de salud de un proveedor con clave presente (para que quede «activo»). */
function prov(estado: string, t: string): Record<string, unknown> {
    return {
        estado,
        t,
        claves: { claves: [{ var: "K", medio: "proceso", huella: "abc" }] },
    };
}

/** Salud con los cuatro proveedores rápidos vivos. */
function saludViva(): Record<string, unknown> {
    const t = tReciente();
    return {
        groq: prov("vivo", t),
        nim: prov("vivo", t),
        xkiro: prov("vivo", t),
        llm7: prov("vivo", t),
    };
}

describe("candidatosDeModelo (Ola 287 · T3 · relevo en cadena)", () => {
    it("con nim caído, ningún candidato empieza por nim/", () => {
        const salud = saludViva();
        salud.nim = prov("caido", tReciente());
        const candidatos = candidatosDeModelo(salud);
        expect(candidatos.length).toBeGreaterThan(0);
        for (const id of candidatos) {
            expect(id.startsWith("nim/")).toBe(false);
        }
    });

    it("con todos activos, devuelve 4 proveedores distintos y groq el primero", () => {
        const candidatos = candidatosDeModelo(saludViva());
        expect(candidatos).toHaveLength(4);
        const proveedores = candidatos.map((id) => id.split("/")[0]);
        expect(new Set(proveedores).size).toBe(4);
        expect(candidatos[0]).toBe("groq/openai/gpt-oss-120b");
    });

    it("con un preferido de proveedor activo, ese va primero", () => {
        const preferido = "nim/deepseek-ai/deepseek-v4-flash-0731";
        const candidatos = candidatosDeModelo(saludViva(), preferido);
        expect(candidatos[0]).toBe(preferido);
    });

    it("un preferido de proveedor caído no entra y se salta ese proveedor", () => {
        const salud = saludViva();
        salud.nim = prov("caido", tReciente());
        const candidatos = candidatosDeModelo(salud, "nim/deepseek-ai/deepseek-v4-flash-0731");
        expect(candidatos.some((id) => id.startsWith("nim/"))).toBe(false);
        expect(candidatos).toContain("groq/openai/gpt-oss-120b");
    });
});