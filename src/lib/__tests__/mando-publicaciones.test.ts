/**
 * Pruebas del servidor de publicaciones del Mando (Ola 274 · 2026-09-07).
 *
 * - `interpretarLog` debe leer cabecera + shortstat de cada commit (ola, tarea,
 *   título y conteos), y tratar un commit sin shortstat como 0/0/0.
 * - `publicar` jamás toca git fuera de la Mac de Alex: sin `STARSEED_LOCAL=1`
 *   devuelve `{ ok: false }` sin lanzar ningún proceso (se mockea child_process).
 * - La confirmación escrita es obligatoria y `hasta` solo acepta un sha completo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
    execFile: mockExecFile,
}));

import { argumentosPublicacion, interpretarLog, publicar } from "@/lib/mando/publicaciones";

const LOG_EJEMPLO = [
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\ta1b2c3d\t2026-09-07T10:00:00+00:00\tAlex\tOla 265 · Forja fase 3: efectos y tomas · H1: Cadena de efectos",
    " 3 files changed, 120 insertions(+), 4 deletions(-)",
    "b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\tb1b2c3d\t2026-09-06T09:00:00+00:00\tAlex\tMerge branch 'main' of origin",
    "",
].join("\n");

describe("interpretarLog", () => {
    it("lee ola, tarea, título y conteos del shortstat", () => {
        const commits = interpretarLog(LOG_EJEMPLO);
        expect(commits).toHaveLength(2);
        expect(commits[0]).toMatchObject({
            sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
            corto: "a1b2c3d",
            ola: 265,
            tarea: "H1",
            titulo: "Cadena de efectos",
            archivos: 3,
            mas: 120,
            menos: 4,
            autor: "Alex",
        });
        // El merge sin shortstat queda a cero y sin ola/tarea.
        expect(commits[1]).toMatchObject({ ola: null, tarea: null, archivos: 0, mas: 0, menos: 0 });
    });
});

describe("argumentosPublicacion", () => {
    const base = {
        desde: "a".repeat(40),
        hasta: "b".repeat(40),
        rama: "main",
        id: "pub-20260907-154506",
    };

    it("producción empuja el corte a la rama remota sin ref temporal", () => {
        const r = argumentosPublicacion({ ...base, modo: "produccion", esHead: false });
        expect(r).toEqual({
            args: ["push", "origin", `${base.hasta}:refs/heads/main`],
            refTemporal: null,
        });
    });

    it("vista previa usa --force-with-lease a la rama del Mando", () => {
        const r = argumentosPublicacion({ ...base, modo: "vista-previa", esHead: false });
        expect(r.args).toEqual(["push", "--force-with-lease", "origin", `${base.hasta}:refs/heads/vista-previa/mando`]);
        expect(r.refTemporal).toBeNull();
    });

    it("paquete con HEAD empaqueta <desde>..<rama> sin ref temporal", () => {
        const r = argumentosPublicacion({ ...base, modo: "paquete", esHead: true });
        expect(r.args).toEqual(["bundle", "create", ".transfer/mando-pub-20260907-154506.bundle", `${base.desde}..main`]);
        expect(r.refTemporal).toBeNull();
    });

    it("paquete con corte parcial pide una ref temporal refs/publicar/<id>", () => {
        const r = argumentosPublicacion({ ...base, modo: "paquete", esHead: false });
        expect(r.args).toEqual(["bundle", "create", ".transfer/mando-pub-20260907-154506.bundle", `${base.desde}..refs/publicar/${base.id}`]);
        expect(r.refTemporal).toBe(`refs/publicar/${base.id}`);
    });
});

describe("publicar (puertas)", () => {
    beforeEach(() => {
        mockExecFile.mockReset();
        delete process.env.STARSEED_LOCAL;
    });

    it("sin STARSEED_LOCAL=1 no publica ni toca git", async () => {
        const r = await publicar({ repo: "os", modo: "produccion", confirmacion: "PUBLICAR", quien: "test" });
        expect(r.ok).toBe(false);
        expect(r.error).toContain("Mac de Alex");
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("confirmación distinta de PUBLICAR es rechazada sin tocar git", async () => {
        process.env.STARSEED_LOCAL = "1";
        const r = await publicar({ repo: "os", modo: "produccion", confirmacion: "vale", quien: "test" });
        expect(r.ok).toBe(false);
        expect(r.error).toContain("PUBLICAR");
        expect(mockExecFile).not.toHaveBeenCalled();
    });

    it("hasta con formato inválido es rechazado sin tocar git", async () => {
        process.env.STARSEED_LOCAL = "1";
        // Para llegar a la puerta de `hasta`, leerPendientes debe funcionar: se
        // simula un repo con un remoto y un commit pendiente.
        const respuestas: Record<string, string> = {
            "rev-parse --abbrev-ref HEAD": "main\n",
            "rev-parse --abbrev-ref @{u}": "origin/main\n",
            "rev-parse @{u}": `${"0".repeat(40)}\n`,
            "show -s --format=%aI @{u}": "2026-09-06T09:00:00+00:00\n",
            "rev-list --left-right --count @{u}...HEAD": "0\t1\n",
            "remote get-url origin": "git@github.com:StarSeedSystem/starseed-system.git\n",
            "status --porcelain -uall": "",
        };
        mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb?: unknown) => {
            const clave = (args as string[]).join(" ");
            const salida = clave.startsWith("log") ? LOG_EJEMPLO : (respuestas[clave] ?? "");
            const callback = typeof cb === "function" ? (cb as (e: Error | null, r: { stdout: string; stderr: string }) => void) : null;
            if (callback) callback(null, { stdout: salida, stderr: "" });
            return {};
        });
        const r = await publicar({ repo: "os", modo: "produccion", hasta: "abc123", confirmacion: "PUBLICAR", quien: "test" });
        expect(r.ok).toBe(false);
        expect(r.error).toContain("40 caracteres");
    });
});
