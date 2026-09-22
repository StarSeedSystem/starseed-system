import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { leerLatidos, leerProgreso, leerCanal } from "../director-fuentes";

describe("director-fuentes", () => {
    let raiz: string;

    beforeAll(() => {
        raiz = mkdtempSync(path.join(tmpdir(), "director-fuentes-"));
        const olas = path.join(raiz, "starseed_memory_root", "olas");
        const mando = path.join(raiz, "starseed_memory_root", "mando");
        mkdirSync(olas, { recursive: true });
        mkdirSync(mando, { recursive: true });

        writeFileSync(
            path.join(olas, "latidos-p318.json"),
            JSON.stringify({
                t: 1_800_000_100,
                cola: "p318",
                tareas: {
                    p318B: { fase: "escribiendo", avance: 1_800_000_000, bytes: 120, modelo: "nim/kimi-k3", intento: 1 },
                    sinFase: { avance: 1_800_000_000 },
                },
            }),
        );

        writeFileSync(
            path.join(olas, "progreso.json"),
            JSON.stringify({
                p318A: { estado: "commit", nota: "listo" },
                p318B: { estado: "bloqueada", depende_de: ["p318A"] },
            }),
        );

        writeFileSync(
            path.join(mando, "canal.jsonl"),
            [
                JSON.stringify({ t: "2026-09-13T10:00:00Z", epoch: 1_800_000_000, quien: "director", tipo: "aviso", texto: "hola" }),
                "esto no es json en absoluto {",
                JSON.stringify({ quien: "vigilante", texto: "otro mensaje" }),
            ].join("\n"),
        );
    });

    afterAll(() => {
        rmSync(raiz, { recursive: true, force: true });
    });

    it("leerLatidos lee las tareas con fase y avance, descartando las incompletas", async () => {
        const latidos = await leerLatidos(raiz);
        expect(latidos).toHaveLength(1);
        expect(latidos[0].tareas?.p318B).toEqual({
            fase: "escribiendo", avance: 1_800_000_000, bytes: 120, modelo: "nim/kimi-k3", intento: 1,
        });
        expect(latidos[0].tareas && "sinFase" in latidos[0].tareas).toBe(false);
    });

    it("leerLatidos devuelve vacío si la carpeta de olas no existe", async () => {
        const vacio = await leerLatidos(path.join(raiz, "no-existe"));
        expect(vacio).toEqual([]);
    });

    it("leerProgreso normaliza estado, nota y dependencias", async () => {
        const progreso = await leerProgreso(raiz);
        expect(progreso.p318A?.estado).toBe("commit");
        expect(progreso.p318A?.nota).toBe("listo");
        expect(progreso.p318B?.estado).toBe("bloqueada");
        expect(progreso.p318B?.depende_de).toEqual(["p318A"]);
    });

    it("leerCanal ignora la línea malformada y conserva las válidas en orden", async () => {
        const canal = await leerCanal(raiz, 60);
        expect(canal).toHaveLength(2);
        expect(canal[0]).toEqual({ quien: "director", texto: "hola", hora: 1_800_000_000 });
        expect(canal[1]).toEqual({ quien: "vigilante", texto: "otro mensaje", hora: undefined });
    });

    it("leerCanal devuelve vacío si el archivo no existe", async () => {
        const canal = await leerCanal(path.join(raiz, "no-existe"));
        expect(canal).toEqual([]);
    });

    it("leerLatidos descarta archivos más antiguos que 15 minutos e incluye solo los vivos", async () => {
        const olasTmp = mkdtempSync(path.join(tmpdir(), "latidos-vivos-"));
        const olas = path.join(olasTmp, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });

        const ahora = Math.floor(Date.now() / 1000);
        const hace2Dias = new Date((ahora - 172800) * 1000);
        const ahoraDate = new Date(ahora * 1000);

        const formatoLocal = (d: Date): string => {
            const año = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, "0");
            const dia = String(d.getDate()).padStart(2, "0");
            const horas = String(d.getHours()).padStart(2, "0");
            const mins = String(d.getMinutes()).padStart(2, "0");
            const segs = String(d.getSeconds()).padStart(2, "0");
            return `${año}-${mes}-${dia} ${horas}:${mins}:${segs}`;
        };

        writeFileSync(
            path.join(olas, "latidos-viejo.json"),
            JSON.stringify({
                t: formatoLocal(hace2Dias),
                tareas: { tarea1: { fase: "escribiendo", avance: 1000, bytes: 50, modelo: "nim/test", intento: 1 } },
            }),
        );

        writeFileSync(
            path.join(olas, "latidos-vivo.json"),
            JSON.stringify({
                t: formatoLocal(ahoraDate),
                tareas: { tarea2: { fase: "revisando", avance: 2000, bytes: 100, modelo: "xkiro/test", intento: 2 } },
            }),
        );

        const latidos = await leerLatidos(olasTmp, ahora);
        expect(latidos).toHaveLength(1);
        expect(latidos[0].tareas?.tarea1).toBeUndefined();
        expect(latidos[0].tareas?.tarea2).toEqual({
            fase: "revisando", avance: 2000, bytes: 100, modelo: "xkiro/test", intento: 2,
        });

        rmSync(olasTmp, { recursive: true, force: true });
    });
});
