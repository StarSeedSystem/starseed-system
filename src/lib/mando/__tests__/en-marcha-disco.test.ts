// @vitest-environment node
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leerCarrilDeDisco, leerPuertaDeDisco, leerUltimoLogDeLaPuerta } from "../en-marcha-disco";

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "med1111e-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

const VERDE = "picks: ['opus1106/A']\nmomento seguro: True\nok opus1106/A 1234567890\nvitest 0 [' Test Files  2 passed (2)', '      Tests  9 passed (9)']\ntsc 0 []\nprecarga-sw.mjs sale 0 ['x']\nárbol tras el script: []\n";
const EN_CURSO = "picks: ['opus1106/B']\nmomento seguro: True\nok opus1106/B 1234567891\n";
const poner = async (nombre: string, texto: string, segundosAtras: number) => {
    const f = path.join(dir, nombre);
    await writeFile(f, texto);
    const t = new Date(Date.now() - segundosAtras * 1000);
    await utimes(f, t, t);
};

describe("leerCarrilDeDisco", () => {
    it("lee el registro real del carril sin el prompt ni los archivos", async () => {
        const c = path.join(dir, "starseed_memory_root", "olas", "carril-claude");
        await mkdir(c, { recursive: true });
        await writeFile(path.join(c, "registro.json"), JSON.stringify({ latido: "2026-11-11T01:27:18.598346-06:00", tareas: [{ id: "MED1111E", titulo: "t", prompt: "SECRETO", archivos: ["/Users/a"], estado: "en_curso", desde: "2026-11-11T01:22:03.183077-06:00" }] }));
        const l = await leerCarrilDeDisco(dir);
        expect(l?.tareas[0]).toMatchObject({ id: "MED1111E", estado: "en_curso" });
        expect(JSON.stringify(l)).not.toContain("SECRETO");
        expect(l?.latidoMs).toBe(Date.parse("2026-11-11T07:27:18.598Z"));
    });
    it("sin archivo o con basura: null, sin lanzar", async () => {
        expect(await leerCarrilDeDisco(dir)).toBeNull();
        const c = path.join(dir, "starseed_memory_root", "olas", "carril-claude");
        await mkdir(c, { recursive: true });
        await writeFile(path.join(c, "registro.json"), "{no es json");
        expect(await leerCarrilDeDisco(dir)).toBeNull();
    });
});

describe("la puerta de disco", () => {
    it("toma el log aplicar-*.log más NUEVO, no el último por nombre", async () => {
        await poner("aplicar-1111z.log", VERDE, 3600);
        await poner("aplicar-1111a.log", EN_CURSO, 30);
        await poner("otra-cosa.log", "x", 1);
        const e = await leerUltimoLogDeLaPuerta(dir);
        expect(e).toMatchObject({ nombre: "1111a", ramas: ["opus1106/B"], paso: "pruebas", resultado: "en_curso" });
    });
    it("carpeta inexistente o sin logs: null", async () => {
        expect(await leerUltimoLogDeLaPuerta(path.join(dir, "no"))).toBeNull();
        expect(await leerUltimoLogDeLaPuerta(dir)).toBeNull();
    });
    it("el estado escrito por la puerta gana al log que ya existe, y el log cubre la puerta que no lo escribe", async () => {
        await poner("aplicar-1.log", VERDE, 7200);
        const estado = path.join(dir, "puerta-estado.json");
        await writeFile(estado, JSON.stringify({ nombre: "2", ramas: ["opus1106/C"], paso: "tipos", inicio: new Date(Date.now() - 600_000).toISOString(), actualizado: new Date(Date.now() - 60_000).toISOString(), resultado: "en_curso" }));
        expect(await leerPuertaDeDisco(estado, dir)).toMatchObject({ origen: "estado", nombre: "2", paso: "tipos" });
        // Sin archivo de estado: el log.
        expect(await leerPuertaDeDisco(path.join(dir, "no.json"), dir)).toMatchObject({ origen: "log", resultado: "verde" });
        // Un estado de ayer y un log de ahora: gana el log (la puerta de hoy aún no escribe estado).
        await writeFile(estado, JSON.stringify({ nombre: "viejo", ramas: [], paso: "terminado", resultado: "verde", fin: new Date(Date.now() - 86_400_000).toISOString(), actualizado: new Date(Date.now() - 86_400_000).toISOString() }));
        await poner("aplicar-2.log", EN_CURSO, 20);
        expect((await leerPuertaDeDisco(estado, dir))?.origen).toBe("log");
    });
    it("estado ilegible y sin logs: null", async () => {
        const estado = path.join(dir, "puerta-estado.json");
        await writeFile(estado, "{roto");
        expect(await leerPuertaDeDisco(estado, dir)).toBeNull();
    });
});
