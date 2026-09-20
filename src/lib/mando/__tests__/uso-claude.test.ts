import { describe, expect, it } from "vitest";

import { resumirSesionesClaude, sumarUso } from "@/lib/mando/uso-claude";

const conUsage = (o: Record<string, number>) =>
    JSON.stringify({ type: "assistant", message: { role: "assistant", usage: {
        input_tokens: o.input ?? 0,
        output_tokens: o.output ?? 0,
        cache_read_input_tokens: o.cache_read ?? 0,
        cache_creation_input_tokens: o.cache_creation ?? 0,
    } } });

describe("sumarUso", () => {
    it("suma tres líneas (una rota, una sin usage, una con usage) y da totales y % correctos", () => {
        const lineas = [
            "{esto no es json",
            JSON.stringify({ type: "user", message: { role: "user", content: "hola" } }),
            conUsage({ input: 100, output: 20, cache_read: 750, cache_creation: 150 }),
        ];
        const t = sumarUso(lineas);
        expect(t.input).toBe(100);
        expect(t.output).toBe(20);
        expect(t.cache_read).toBe(750);
        expect(t.cache_creation).toBe(150);
        expect(t.turnos).toBe(1);
        expect(t.relectura_pct).toBe(75);
    });

    it("sin uso: todo a cero y relectura 0", () => {
        const t = sumarUso(["", "{}", "   "]);
        expect(t).toEqual({ input: 0, output: 0, cache_read: 0, cache_creation: 0, turnos: 0, relectura_pct: 0 });
    });

    it("cuenta varios turnos con usage", () => {
        const t = sumarUso([
            conUsage({ input: 10, output: 5 }),
            conUsage({ input: 30, output: 5, cache_read: 60 }),
        ]);
        expect(t.turnos).toBe(2);
        expect(t.input).toBe(40);
        expect(t.output).toBe(10);
        expect(t.relectura_pct).toBe(60);
    });
});

describe("resumirSesionesClaude", () => {
    it("con raíz inexistente devuelve disponible:false", async () => {
        const r = await resumirSesionesClaude("/no/existe/desde-luego-mu1-352");
        expect(r.disponible).toBe(false);
        expect(r.sesiones).toEqual([]);
        expect(r.total.total).toBe(0);
    });

    it("el resumen nunca contiene rutas absolutas del disco", async () => {
        const r = await resumirSesionesClaude();
        expect(JSON.stringify(r)).not.toContain("/Users/");
    });
});
