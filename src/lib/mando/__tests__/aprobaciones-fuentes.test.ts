import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { leerAprobaciones, descripcionDe, ramaYShaDe, parseNumstat } from "@/lib/mando/aprobaciones-fuentes";

let raiz = "";

async function ponerOlas(archivos: Record<string, unknown>) {
    const olas = path.join(raiz, "starseed_memory_root", "olas");
    await mkdir(olas, { recursive: true });
    for (const [nombre, contenido] of Object.entries(archivos)) {
        await writeFile(path.join(olas, nombre), typeof contenido === "string" ? contenido : JSON.stringify(contenido));
    }
}

beforeEach(async () => {
    raiz = await mkdtemp(path.join(tmpdir(), "aprb-fuentes-"));
});
afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
});

describe("leerAprobaciones", () => {
    it("una tarea en la puerta sale con título y descripción de su cola", async () => {
        await ponerOlas({
            "progreso.json": {
                p320Bb: {
                    estado: "esperando_aprobacion",
                    nota: "rama ola/p320Bb (abc1234) lista · revisión ok",
                    t: "2026-09-20 10:00:00",
                    revisor: "respondio",
                    motivo_vb: "pedido por la cola: aprobacion=true",
                    faltan: [],
                },
            },
            "cola-p320.json": [{
                id: "p320Bb",
                titulo: "Fuentes de aprobaciones",
                prompt: "Lee progreso y colas. Rellena las fichas. Con git show.",
            }],
        });
        const fichas = await leerAprobaciones(raiz, Date.parse("2026-09-20T10:30:00"));
        expect(fichas).toHaveLength(1);
        const f = fichas[0];
        expect(f.titulo).toBe("Fuentes de aprobaciones");
        expect(f.descripcion).toBe("Lee progreso y colas. Rellena las fichas.");
        expect(f.rama).toBe("ola/p320Bb");
        expect(f.sha).toBe("abc1234");
        expect(f.minutosEsperando).toBe(30);
        expect(f.veredicto.verde).toBe(true);
    });

    it("sin ficha en ninguna cola sale con el texto de respaldo", async () => {
        await ponerOlas({
            "progreso.json": { x9: { estado: "esperando_aprobacion", nota: "rama ola/x9 (def5678) lista" } },
            "cola-p320.json": [{ id: "otra", titulo: "Otra", prompt: "Nada que ver." }],
        });
        const fichas = await leerAprobaciones(raiz, Date.now());
        expect(fichas[0].titulo).toBe("x9");
        expect(fichas[0].descripcion).toBe("Sin ficha en las colas: tarea creada sobre la marcha.");
    });

    it("las colas cola-auto-* se ignoran", async () => {
        await ponerOlas({
            "progreso.json": { a1: { estado: "esperando_aprobacion" } },
            "cola-auto-0920-100000.json": [{ id: "a1", titulo: "No debería verse", prompt: "Nada." }],
        });
        const fichas = await leerAprobaciones(raiz, Date.now());
        expect(fichas[0].titulo).toBe("a1");
    });

    it("nota sin rama cae al respaldo ola/<id> y git falla sin tumbar la ficha", async () => {
        await ponerOlas({
            "progreso.json": { zz1: { estado: "esperando_aprobacion", nota: "esto no es una nota de rama" } },
        });
        const fichas = await leerAprobaciones(raiz, Date.now());
        expect(fichas[0].rama).toBe("ola/zz1");
        expect(fichas[0].sha).toBe("");
        expect(fichas[0].archivos).toEqual([]);
    });

    it("progreso.json ilegible devuelve [] sin lanzar", async () => {
        await ponerOlas({ "progreso.json": "{no es json" });
        await expect(leerAprobaciones(raiz, Date.now())).resolves.toEqual([]);
    });

    it("los dependientes se detectan desde depende_de", async () => {
        await ponerOlas({
            "progreso.json": {
                a: { estado: "esperando_aprobacion" },
                b: { estado: "bloqueada", depende_de: ["a"] },
                c: { estado: "listo", depende_de: ["b", "a"] },
                d: { estado: "listo", depende_de: ["b"] },
            },
        });
        const fichas = await leerAprobaciones(raiz, Date.now());
        expect(fichas).toHaveLength(1);
        expect(fichas[0].dependientes.sort()).toEqual(["b", "c"]);
    });
});

describe("descripcionDe", () => {
    it("toma las dos primeras frases", () => {
        expect(descripcionDe("Uno. Dos. Tres.")).toBe("Uno. Dos.");
    });
    it("recorta a 320 sin partir palabras", () => {
        const largo = `${"palabra ".repeat(40)}fin final`;
        const d = descripcionDe(largo);
        expect(d.length).toBeLessThanOrEqual(320);
        expect(largo.startsWith(d)).toBe(true);
        expect(d).not.toMatch(/ $/);
        expect("palabra".startsWith(d.slice(-7))).toBe(true);
    });
});

describe("ramaYShaDe", () => {
    it("extrae rama y sha de la nota del orquestador", () => {
        expect(ramaYShaDe("rama ola/p320Bb (abc1234) lista · revisión ok", "p320Bb"))
            .toEqual({ rama: "ola/p320Bb", sha: "abc1234" });
    });
    it("sin encaje devuelve el respaldo", () => {
        expect(ramaYShaDe(undefined, "zz1")).toEqual({ rama: "ola/zz1", sha: "" });
        expect(ramaYShaDe("sin rama", "zz1")).toEqual({ rama: "ola/zz1", sha: "" });
    });
});

describe("parseNumstat", () => {
    it("lee líneas mas/menos y cuenta 0 en binarios", () => {
        const archivos = parseNumstat("12\t3\tsrc/a.ts\n-\t-\timg/logo.png\n\n\t\t\n");
        expect(archivos).toEqual([
            { ruta: "src/a.ts", mas: 12, menos: 3 },
            { ruta: "img/logo.png", mas: 0, menos: 0 },
        ]);
    });
});
