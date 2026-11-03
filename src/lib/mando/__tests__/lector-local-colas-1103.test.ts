import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("leerColas recuerda las colas que no cambiaron (1103 · R)", () => {
    it("lee, vuelve a leer igual y ve el cambio cuando la cola cambia", async () => {
        const raiz = mkdtempSync(path.join(tmpdir(), "colas-1103-"));
        const olas = path.join(raiz, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const cola = path.join(olas, "cola-a.json");
        writeFileSync(cola, JSON.stringify([{ id: "A1", titulo: "uno", archivos: ["x.ts"], prompt: "p" }]));
        vi.resetModules();
        process.env.STARSEED_ROOT = raiz;
        const { leerColas } = await import("../lector-local");
        const primera = await leerColas();
        expect(primera.map((t) => t.id)).toEqual(["A1"]);
        primera[0].titulo = "tocada por quien llama";
        const segunda = await leerColas();
        expect(segunda.map((t) => t.id)).toEqual(["A1"]);
        expect(segunda[0].titulo).toBe("uno");
        writeFileSync(cola, JSON.stringify([{ id: "A1", titulo: "uno" }, { id: "A2", titulo: "dos" }]));
        const futuro = new Date(Date.now() + 5000);
        utimesSync(cola, futuro, futuro);
        const tercera = await leerColas();
        expect(tercera.map((t) => t.id)).toEqual(["A1", "A2"]);
        delete process.env.STARSEED_ROOT;
    });
});
