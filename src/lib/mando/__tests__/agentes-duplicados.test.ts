import { describe, it, expect } from "vitest";
import { listaAgentes, resumenAgentes } from "../director-datos";
import type { LatidoEntrada } from "../director-datos";
import { leerLatidos } from "../director-fuentes";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const AHORA = 1_800_000_000;

// `t` en formato local "YYYY-MM-DD HH:MM:SS" a partir de un epoch en segundos,
// para reflejar la misma forma que produce el orquestador (`parsearFechaLocal`).
const formatoLocal = (epoch: number): string => {
    const d = new Date(epoch * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

describe("agentes duplicados (p320N): deduplicación por id", () => {
    describe("listaAgentes", () => {
        it("dos latidos frescos con el mismo id p320A → lo trae UNA vez, con el avance más reciente", () => {
            const latidos = [
                { tareas: { p320A: { fase: "escribiendo", avance: AHORA - 500, modelo: "nim/kimi-k3", bytes: 1000, intento: 1 } } },
                { tareas: { p320A: { fase: "escribiendo", avance: AHORA - 10, modelo: "xkiro/qwen", bytes: 2048, intento: 2 } } },
            ];
            const r = listaAgentes(latidos, AHORA);
            expect(r).toHaveLength(1);
            expect(r[0].id).toBe("p320A");
            expect(r[0].modelo).toBe("xkiro/qwen"); // la entrada viva es la de avance más reciente
            expect(r[0].intento).toBe(2);
            expect(r[0].kb).toBe(2);
        });

        it("el resumen cuenta 1 agente, no 2", () => {
            // las claves duplicadas en un literal colapsan: usamos dos latidos para forzar el caso
            const dosLatidos = [
                { tareas: { p320A: { fase: "escribiendo", avance: AHORA - 500 } } },
                { tareas: { p320A: { fase: "escribiendo", avance: AHORA - 10 } } },
            ];
            const r = resumenAgentes(dosLatidos, AHORA);
            expect(r.vivos).toBe(1);
            expect(r.porFase.escribiendo).toBe(1);
        });

        it("dos colas distintas con ids distintos siguen saliendo las dos", () => {
            const latidos: LatidoEntrada[] = [
                { tareas: { p320A: { fase: "escribiendo", avance: AHORA - 10 } } },
                { tareas: { p320B: { fase: "escribiendo", avance: AHORA - 20 } } },
            ];
            const ids = listaAgentes(latidos, AHORA).map((a) => a.id).sort();
            expect(ids).toEqual(["p320A", "p320B"]);
        });

        it("lista vacía → resumen en ceros", () => {
            const r = resumenAgentes([], AHORA);
            expect(r.vivos).toBe(0);
            expect(r.colgados).toBe(0);
            expect(r.esperandoAprobacion).toBe(0);
            expect(r.porFase).toEqual({});
        });
    });

    describe("leerLatidos (deduplicación por cola)", () => {
        it("dos ficheros de la MISMA cola → solo cuenta el más nuevo", async () => {
            const raiz = mkdtempSync(path.join(tmpdir(), "duplicados-cola-"));
            const olas = path.join(raiz, "starseed_memory_root", "olas");
            mkdirSync(olas, { recursive: true });

            writeFileSync(path.join(olas, "latidos-cola-auto-0913-183200.json"), JSON.stringify({
                t: formatoLocal(AHORA - 600),
                tareas: { p320A: { fase: "escribiendo", avance: AHORA - 600, modelo: "nim/a" } },
            }));
            writeFileSync(path.join(olas, "latidos-cola-auto-0913-193908.json"), JSON.stringify({
                t: formatoLocal(AHORA),
                tareas: { p320A: { fase: "escribiendo", avance: AHORA - 10, modelo: "xkiro/b" } },
            }));

            const latidos = await leerLatidos(raiz, AHORA);
            expect(latidos).toHaveLength(1);
            expect(latidos[0].tareas?.p320A?.modelo).toBe("xkiro/b");

            rmSync(raiz, { recursive: true, force: true });
        });

        it("dos colas distintas con ids distintos salen las dos", async () => {
            const raiz = mkdtempSync(path.join(tmpdir(), "duplicados-2colas-"));
            const olas = path.join(raiz, "starseed_memory_root", "olas");
            mkdirSync(olas, { recursive: true });

            writeFileSync(path.join(olas, "latidos-cola-A.json"), JSON.stringify({
                t: formatoLocal(AHORA), tareas: { a: { fase: "escribiendo", avance: AHORA - 10 } },
            }));
            writeFileSync(path.join(olas, "latidos-cola-B.json"), JSON.stringify({
                t: formatoLocal(AHORA), tareas: { b: { fase: "escribiendo", avance: AHORA - 20 } },
            }));

            const latidos = await leerLatidos(raiz, AHORA);
            expect(latidos).toHaveLength(2);

            rmSync(raiz, { recursive: true, force: true });
        });

        it("un latido viejo (>900 s) se descarta aunque sea el único de su cola", async () => {
            const raiz = mkdtempSync(path.join(tmpdir(), "duplicados-viejo-"));
            const olas = path.join(raiz, "starseed_memory_root", "olas");
            mkdirSync(olas, { recursive: true });

            writeFileSync(path.join(olas, "latidos-cola-unica.json"), JSON.stringify({
                t: formatoLocal(AHORA - 901),
                tareas: { a: { fase: "escribiendo", avance: AHORA - 1000 } },
            }));

            const latidos = await leerLatidos(raiz, AHORA);
            expect(latidos).toHaveLength(0);

            rmSync(raiz, { recursive: true, force: true });
        });
    });
});