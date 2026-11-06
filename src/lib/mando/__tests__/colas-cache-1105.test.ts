// @vitest-environment node
/**
 * SUP0511Cb (05-11): `leerColasCompletas` leía e interpretaba TODAS las `cola-*.json` en cada
 * llamada (~23 MB por llamada en el montón de Genesis). Ahora guarda cada cola interpretada con
 * su `mtimeMs` y `size` y solo relee lo que cambió. Las colas de la prueba van en el `olas/` del
 * STARSEED_ROOT temporal de vitest.config.ts y solo se miran las suyas (`prueba-1105-*`).
 */
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (orig) => {
    const real = await orig<typeof import("node:fs/promises")>();
    return { ...real, readFile: vi.fn(real.readFile) };
});
vi.mock("@/lib/mando/bus-remoto", async (orig) => ({
    ...(await orig<typeof import("@/lib/mando/bus-remoto")>()),
    filasRecientes: vi.fn(async () => []),
}));

import { readFile } from "node:fs/promises";
import { leerColasCompletas, type ColaCompleta } from "@/lib/mando/colas";
import { raizDelProyecto } from "@/lib/mando/raiz";

const olas = () => path.join(raizDelProyecto(), "starseed_memory_root", "olas");
const creadas = new Set<string>();

function escribirCola(n: number, contenido: unknown, mtime?: Date): string {
    const ruta = path.join(olas(), `cola-prueba-1105-${n}.json`);
    writeFileSync(ruta, typeof contenido === "string" ? contenido : JSON.stringify({ tareas: contenido }));
    if (mtime) utimesSync(ruta, mtime, mtime);
    creadas.add(ruta);
    return ruta;
}
const tarea = (id: string) => ({ id, titulo: `t ${id}`, prompt: "p", archivos: ["src/a.ts"], depende: [] as string[] });
const mias = (colas: ColaCompleta[]) => colas.filter((c) => c.nombre.startsWith("prueba-1105-"));
const una = async (n: number) => mias(await leerColasCompletas()).find((c) => c.nombre === `prueba-1105-${n}`);
const lecturasDe = (ruta: string) => vi.mocked(readFile).mock.calls.filter((c) => String(c[0]) === ruta).length;

beforeEach(() => {
    mkdirSync(olas(), { recursive: true });
    vi.mocked(readFile).mockClear();
});
afterEach(() => {
    for (const r of creadas) rmSync(r, { force: true });
    creadas.clear();
});

describe("leerColasCompletas · caché por mtime y size", () => {
    it("(a) dos llamadas seguidas sin cambios: la segunda no vuelve a leer esas colas", async () => {
        const r1 = escribirCola(1, [tarea("A1")]);
        const r2 = escribirCola(2, [tarea("B1"), tarea("B2")]);
        const primera = mias(await leerColasCompletas());
        expect(primera.map((c) => c.nombre).sort()).toEqual(["prueba-1105-1", "prueba-1105-2"]);
        expect(lecturasDe(r1)).toBe(1);
        expect(lecturasDe(r2)).toBe(1);
        vi.mocked(readFile).mockClear();
        const segunda = mias(await leerColasCompletas());
        expect(lecturasDe(r1)).toBe(0);
        expect(lecturasDe(r2)).toBe(0);
        expect(segunda).toEqual(primera);
    });

    it("(b) una cola reescrita (otra hora) se relee y devuelve lo nuevo, también con el mismo tamaño", async () => {
        const ruta = escribirCola(3, [tarea("C1")], new Date("2026-11-05T10:00:00Z"));
        expect((await una(3))?.tareas.map((t) => t.id)).toEqual(["C1"]);
        escribirCola(3, [tarea("C9")], new Date("2026-11-05T11:00:00Z"));
        vi.mocked(readFile).mockClear();
        const c = await una(3);
        expect(lecturasDe(ruta)).toBe(1);
        expect(c?.tareas.map((t) => t.id)).toEqual(["C9"]);
        expect(c?.modificada).toBe("2026-11-05T11:00:00.000Z");
        escribirCola(3, [tarea("C9"), tarea("C10")], new Date("2026-11-05T12:00:00Z"));
        expect((await una(3))?.tareas.map((t) => t.id)).toEqual(["C9", "C10"]);
    });

    it("(c) mutar lo devuelto no cambia lo que devuelve la siguiente llamada", async () => {
        escribirCola(4, [tarea("D1")]);
        const primera = await una(4);
        expect(primera).toBeDefined();
        primera!.tareas.push({ ...primera!.tareas[0], id: "INTRUSA" });
        primera!.tareas[0].archivos.push("src/intrusa.ts");
        primera!.tareas[0].depende.push("OTRA");
        primera!.nombre = "cambiada";
        const otra = await una(4);
        expect(otra?.tareas.map((t) => t.id)).toEqual(["D1"]);
        expect(otra?.tareas[0].archivos).toEqual(["src/a.ts"]);
        expect(otra?.tareas[0].depende).toEqual([]);
    });

    it("(d) una cola quitada del directorio desaparece del resultado", async () => {
        const ruta = escribirCola(5, [tarea("E1")]);
        expect(await una(5)).toBeDefined();
        rmSync(ruta);
        expect(await una(5)).toBeUndefined();
    });

    it("(e) una cola ilegible se salta y no se guarda: al arreglarla aparece", async () => {
        const ruta = escribirCola(6, "{ esto no es json", new Date("2026-11-05T10:00:00Z"));
        expect(await una(6)).toBeUndefined();
        vi.mocked(readFile).mockClear();
        expect(await una(6)).toBeUndefined();
        expect(lecturasDe(ruta)).toBe(1);
        escribirCola(6, [tarea("F1")], new Date("2026-11-05T10:05:00Z"));
        expect((await una(6))?.tareas.map((t) => t.id)).toEqual(["F1"]);
    });
});
