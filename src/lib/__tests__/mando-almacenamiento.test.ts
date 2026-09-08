/**
 * Pruebas de «Drive como almacén grande» (Ola 280 · 2026-09-08 · A6).
 * `execFile` se simula por binario (espía vía `vi.hoisted`); el filesystem se
 * aísla en un tmpdir que suplanta a `os.homedir()` para que la detección de
 * DriveFS viva solo aquí. Comentarios en español por qué del test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import path from "node:path";

interface Llamada { binario: string; args: string[] }
type Respuesta = { stdout: string; stderr?: string } | { lanzar: Error };

const ctx = vi.hoisted(() => ({
    espia: [] as Llamada[],
    respuestas: new Map<string, (args: string[]) => Respuesta>(),
    pgrepSinNada: true,
}));

vi.mock("node:child_process", () => ({
    execFile: (bin: string, args: string[], _o: unknown, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) => {
        ctx.espia.push({ binario: bin, args });
        const r = ctx.respuestas.get(bin)?.(args);
        if (r && "lanzar" in r) return cb(r.lanzar, { stdout: "", stderr: "" });
        if (r && "stdout" in r) return cb(null, { stdout: r.stdout, stderr: r.stderr ?? "" });
        if (bin === "pgrep" && ctx.pgrepSinNada) return cb(new Error("exit 1"), { stdout: "", stderr: "" });
        cb(null, { stdout: "", stderr: "" });
    },
    spawn: () => ({ unref: () => undefined, pid: 123 }),
}));

import { cuotaDrive, moverADrive } from "../mando/almacenamiento";
import { interpretarVistaPrevia } from "../mando/publicaciones";

let homeFalso = "";
beforeEach(async () => {
    ctx.espia.length = 0;
    ctx.respuestas.clear();
    ctx.pgrepSinNada = true;
    homeFalso = await mkdtemp(path.join(tmpdir(), "starseed-drive-"));
    vi.spyOn(os, "homedir").mockReturnValue(homeFalso);
});
afterEach(async () => {
    vi.spyOn(os, "homedir").mockRestore();
    await rm(homeFalso, { recursive: true, force: true });
});
/** Crea `Library/CloudStorage/GoogleDrive-cuenta/` dentro del `homeFalso`. */
async function montarDrive(): Promise<string> {
    const base = path.join(homeFalso, "Library", "CloudStorage", "GoogleDrive-cuenta@dominio.com");
    await mkdir(base, { recursive: true });
    return base;
}

describe("cuotaDrive (Ola 280 · A6)", () => {
    it("interpreta `df -kP`: 1 GB total, 50 % usado → 1 / 0,5 / 0,5 GB", async () => {
        const base = await montarDrive();
        ctx.respuestas.set("df", () => ({
            stdout: ["Filesystem       1024-blocks      Used Available Capacity Mounted on", `${base}     1048576 524288 524288   50%    /test`].join("\n"),
        }));
        const r = await cuotaDrive();
        expect(r).not.toBeNull();
        expect(r!.totalGb).toBeCloseTo(1, 2);
        expect(r!.usadoGb).toBeCloseTo(0.5, 2);
        expect(r!.libreGb).toBeCloseTo(0.5, 2);
    });
    it("devuelve null si DriveFS no está montado", async () => {
        expect(await cuotaDrive()).toBeNull();
        expect(ctx.espia.filter((l) => l.binario === "df")).toEqual([]);
    });
});
describe("moverADrive (Ola 280 · A6)", () => {
    it("rechaza un id fuera de la lista blanca sin tocar nada", async () => {
        const r = await moverADrive("id-inexistente");
        expect(r.ok).toBe(false);
        const tocados = ctx.espia.map((l) => l.binario);
        expect(tocados).not.toContain("rsync");
        expect(tocados).not.toContain("ln");
        expect(tocados).not.toContain("mv");
    });
    it("con verificación fallida: deshace el destino, no enlaza ni borra el origen", async () => {
        const raiz = await mkdtemp(path.join(tmpdir(), "starseed-orig-"));
        const origen = path.join(raiz, ".transfer");
        await mkdir(origen, { recursive: true });
        await writeFile(path.join(origen, "a.txt"), "uno");
        await writeFile(path.join(origen, "b.txt"), "dos");
        // `raizDelProyecto()` lee `STARSEED_ROOT`; lo apuntamos a nuestra raíz.
        process.env.STARSEED_ROOT = raiz;
        try {
            await montarDrive();
            // `find` del origen: 2 archivos; del destino: 3 → conteo distinto → verificarCopia cae.
            let n = 0;
            ctx.respuestas.set("find", () => {
                n += 1;
                return { stdout: n % 2 === 1 ? "a.txt\nb.txt" : "a.txt\nb.txt\nextra.txt" };
            });
            const r = await moverADrive("transfer");
            expect(r.ok).toBe(false);
            expect(r.detalle.toLowerCase()).toContain("verificación");
            // Un único `rm`, con el destino (no el renombrado ni el origen).
            const rms = ctx.espia.filter((l) => l.binario === "rm");
            expect(rms.length).toBe(1);
            expect(rms[0]!.args).toEqual(["-rf", expect.stringContaining("frio/transfer") as unknown as string]);
            // No se llamó `ln` ni `mv`: el origen queda intacto.
            expect(ctx.espia.filter((l) => l.binario === "ln")).toEqual([]);
            expect(ctx.espia.filter((l) => l.binario === "mv")).toEqual([]);
            expect((await readdir(origen)).sort()).toEqual(["a.txt", "b.txt"]);
        } finally {
            delete process.env.STARSEED_ROOT;
            await rm(raiz, { recursive: true, force: true });
        }
    });
});
describe("interpretarVistaPrevia (Ola 280 · A6 · C4, pura)", () => {
    it("mismo commit → al día", () => {
        expect(interpretarVistaPrevia({ buildCommit: "abc", head: "abc" })).toBe(false);
    });
    it("commits distintos → atrasado", () => {
        expect(interpretarVistaPrevia({ buildCommit: "abc", head: "xyz" })).toBe(true);
    });
    it("sin build o sin HEAD → atrasado (no se puede afirmar al día)", () => {
        expect(interpretarVistaPrevia({ buildCommit: null, head: "abc" })).toBe(true);
        expect(interpretarVistaPrevia({ buildCommit: "abc", head: null })).toBe(true);
    });
});
