// @vitest-environment node
/**
 * SUP0611A (05-11): el director de lanzamientos escribe `lanzamientos-estado.json` por fases.
 * En «esperando-lista» solo trae {fase, detalle, t, tono, pendientes}: sin `medios`, la ruta
 * respondía 500 («Cannot read properties of undefined (reading 'web')», 42 veces en el
 * registro de Genesis) y el panel «Versiones» se quedaba sin datos. Y «Pausar» escribía
 * `pausada` dentro del estado del director (que nadie leía) en vez de pedírselo.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mando/guardian", () => ({
    guardianMando: vi.fn(async () => null),
}));

import { estadoVacio, filasDeMedios, normalizarEstado } from "@/lib/mando/lanzamientos";
import type { LanzamientoEstado } from "@/lib/mando/lanzamientos-tipos";
import { GET, POST } from "../route";

/** Lo que el director escribió de verdad el 05-11 a las 23:38. */
const PARCIAL_DEL_DIRECTOR = {
    detalle: "la lista no ha terminado: 2 tarea(s)",
    t: 1793943518.9462552,
    tono: "normal",
    fase: "esperando-lista",
    pendientes: ["VER1105D", "VER1105G"],
};

describe("normalizarEstado (pura)", () => {
    it("completa el estado por fases del director sin perder lo suyo", () => {
        const e = normalizarEstado(PARCIAL_DEL_DIRECTOR, "0.3.0") as LanzamientoEstado & { pendientes?: string[]; t?: number };
        expect(e.fase).toBe("esperando-lista");
        expect(e.detalle).toBe("la lista no ha terminado: 2 tarea(s)");
        expect(e.version).toBe("0.3.0");
        expect(e.medios).toEqual({});
        expect(e.pasos).toEqual([]);
        expect(e.jobs).toEqual([]);
        expect(e.historial).toEqual([]);
        expect(e.pausado).toBe(false);
        expect(e.pendientes).toEqual(["VER1105D", "VER1105G"]);
        expect(e.t).toBe(1793943518.9462552);
    });

    it("lo que no es un objeto da el estado vacío", () => {
        for (const basura of [null, undefined, "texto", 3, ["a"]]) {
            expect(normalizarEstado(basura, "0.3.0")).toEqual(estadoVacio("0.3.0"));
        }
    });

    it("cada campo con otro tipo vuelve a su valor por defecto; los buenos se quedan", () => {
        const e = normalizarEstado(
            {
                fase: 7,
                version: "0.4.0",
                pasos: "no",
                pausado: "sí",
                run_url: null,
                release_url: "https://example.org/r",
                medios: {
                    macos: { estado: "atascado", faltan: ["StarSeed.dmg", 3], pequenos: "x" },
                    linux: "roto",
                },
            },
            "0.3.0",
        );
        expect(e.fase).toBe("esperando-lista");
        expect(e.version).toBe("0.4.0");
        expect(e.pasos).toEqual([]);
        expect(e.pausado).toBe(false);
        expect("run_url" in e).toBe(false);
        expect(e.release_url).toBe("https://example.org/r");
        expect(e.medios.macos).toEqual({ estado: "atascado", faltan: ["StarSeed.dmg"], pequenos: [] });
        expect(e.medios.linux).toEqual({ estado: "no-disponible", faltan: [], pequenos: [] });
        expect(normalizarEstado({ pausado: true }, "0.3.0").pausado).toBe(true);
    });
});

describe("filasDeMedios con un estado sin normalizar", () => {
    it("no revienta sin `medios` (el TypeError de 'web')", () => {
        const filas = filasDeMedios(PARCIAL_DEL_DIRECTOR as unknown as LanzamientoEstado, "0.3.0");
        expect(filas).toHaveLength(9);
        expect(filas.every((f) => f.estado === "no-disponible" && f.detalle === "Al día")).toBe(true);
        expect(filas[0].id).toBe("web");
    });

    it("un medio a medias (sin `faltan`) tampoco la rompe", () => {
        const estado = { ...estadoVacio("0.3.0"), medios: { macos: { estado: "listo" } } } as unknown as LanzamientoEstado;
        const macos = filasDeMedios(estado, "0.3.0").find((f) => f.id === "macos");
        expect(macos?.estado).toBe("listo");
        expect(macos?.detalle).toBe("Al día");
    });
});

describe("/api/mando/lanzamientos con el estado por fases", () => {
    let home: string;
    let homeAntes: string | undefined;
    const produccion = () => path.join(home, ".starseed", "produccion");

    beforeEach(() => {
        homeAntes = process.env.HOME;
        home = mkdtempSync(path.join(os.tmpdir(), "lanzamientos-1106-"));
        process.env.HOME = home;
        mkdirSync(produccion(), { recursive: true });
        writeFileSync(path.join(produccion(), "lanzamientos-estado.json"), JSON.stringify(PARCIAL_DEL_DIRECTOR));
    });

    afterEach(() => {
        if (homeAntes === undefined) delete process.env.HOME;
        else process.env.HOME = homeAntes;
        rmSync(home, { recursive: true, force: true });
    });

    it("GET responde 200 con las 9 filas y el estado completado", async () => {
        expect(os.homedir()).toBe(home);
        const r = await GET(new Request("http://127.0.0.1:9002/api/mando/lanzamientos"));
        expect(r.status).toBe(200);
        const cuerpo = (await r.json()) as { estado: LanzamientoEstado & { pendientes?: string[] }; filas: unknown[] };
        expect(cuerpo.filas).toHaveLength(9);
        expect(cuerpo.estado.medios).toEqual({});
        expect(cuerpo.estado.pendientes).toEqual(["VER1105D", "VER1105G"]);
        expect(cuerpo.estado.pausado).toBe(false);
    });

    it("«Pausar» se lo pide al director y no toca su estado", async () => {
        const antes = readFileSync(path.join(produccion(), "lanzamientos-estado.json"), "utf-8");
        const r = await POST(
            new Request("http://127.0.0.1:9002/api/mando/lanzamientos", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accion: "pausar" }),
            }),
        );
        expect(r.status).toBe(200);
        expect(((await r.json()) as { pausada: boolean }).pausada).toBe(true);
        const peticion = path.join(produccion(), "lanzamientos-peticion.json");
        expect(existsSync(peticion)).toBe(true);
        expect(JSON.parse(readFileSync(peticion, "utf-8"))).toMatchObject({ accion: "pausar", quien: "genesis" });
        expect(readFileSync(path.join(produccion(), "lanzamientos-estado.json"), "utf-8")).toBe(antes);
    });
});
