/**
 * Pruebas de «Aliviar memoria» (Ola 1010 · Conserje).
 * `execFile`/`ps` se espía vía `vi.hoisted` con `vi.mock`; el filesystem se
 * aísla en un tmpdir que suplanta a `os.homedir()` para que la detección de
 * DriveFS viva solo aquí. Español para consistencia con el resto de tests.
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
    psSalidaArgs: "",
    psSalidaPidStatComm: "",
}));

vi.mock("node:child_process", () => ({
    execFile: (bin: string, args: string[], _o: unknown, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) => {
        ctx.espia.push({ binario: bin, args });
        const r = ctx.respuestas.get(bin)?.(args);
        if (r && "lanzar" in r) return cb(r.lanzar, { stdout: "", stderr: "" });
        if (r && "stdout" in r) return cb(null, { stdout: r.stdout, stderr: r.stderr ?? "" });
        if (bin === "pgrep" && ctx.pgrepSinNada) return cb(new Error("exit 1"), { stdout: "", stderr: "" });
        if (bin === "ps") {
            const key = args.join(" ");
            if (key === "-axo args=") cb(null, { stdout: ctx.psSalidaArgs, stderr: "" });
            if (key === "-axo pid=,stat=,comm=") {
                if (ctx.psSalidaPidStatComm.includes("49217 T")) {
                    cb(null, {
                        stdout: "49217 T /home/runner/.llama/server/llama-server\n12345 S /home/runner/.llama/server/llama-server\n67890 T /home/runner/.tts/tts-server\n11111 S /home/runner/.tts/tts-server",
                        stderr: ""
                    });
                } else {
                    cb(null, { stdout: "", stderr: "" });
                }
            }
        } else cb(null, { stdout: "", stderr: "" });
    },
    spawn: () => ({ unref: () => undefined, pid: 123 }),
    kill: (pid: number, signal: string) => undefined,
}));

vi.mock("node:fetch", () => ({
    default: (url: string, init?: { method: string; signal?: AbortSignal }) => {
        if (url.includes("/api/bitnet/dormir")) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({}),
            } as Response);
        }
        if (url.includes("/api/bitnet/estado")) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ dormido: true }),
            } as Response);
        }
        if (url.includes("/ceder")) {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ cedidos: 3 }),
            } as Response);
        }
        return Promise.reject(new Error("sin respuesta"));
    },
}));

import { aliviarMemoria, detectarDrive, driveCorriendo, motoresParados } from "../almacenamiento";

let homeFalso = "";
beforeEach(async () => {
    ctx.espia.length = 0;
    ctx.respuestas.clear();
    ctx.pgrepSinNada = true;
    homeFalso = await mkdtemp(path.join(tmpdir(), "starseed-almacenamiento-"));
    vi.spyOn(os, "homedir").mockReturnValue(homeFalso);
});
afterEach(async () => {
    vi.spyOn(os, "homedir").mockRestore();
    await rm(homeFalso, { recursive: true, force: true });
});

/** Configura un entorno de `ps -axo args=` simulado. */
function configurarPsSalida(salida: string) {
    ctx.psSalidaArgs = salida;
}

/** Configura un entorno de `ps -axo pid=,stat=,comm=` simulado. */
function configurarPsPidStatComm(salida: string) {
    ctx.psSalidaPidStatComm = salida;
}

/** Crea `Library/CloudStorage/GoogleDrive-cuenta/` dentro del `homeFalso`. */
async function montarDrive(): Promise<string> {
    const base = path.join(homeFalso, "Library", "CloudStorage", "GoogleDrive-cuenta@dominio.com");
    await mkdir(base, { recursive: true });
    return base;
}

describe("driveCorriendo (función pura)", () => {
    it("devuelve true si `args` incluye Google Drive", () => {
        expect(driveCorriendo("123 /usr/bin/osascript \"Google Drive\"")).toBe(true);
        expect(driveCorriendo("456 \"DriveFS\" foo")).toBe(true);
    });
    it("devuelve false si no incluye ninguno", () => {
        expect(driveCorriendo("999 /usr/bin/otros foo")).toBe(false);
        expect(driveCorriendo("")).toBe(false);
        expect(driveCorriendo("\n\n\n")).toBe(false);
    });
});

describe("motoresParados (función pura)", () => {
    it("detecta un motor parado T llama-server", () => {
        const ps = "49217 T /home/runner/.llama/server/llama-server\n" +
                   "12345 S /home/runner/.llama/server/llama-server\n" +
                   "67890 T /home/runner/.tts/tts-server\n" +
                   "11111 S /home/runner/.tts/tts-server";
        expect(motoresParados(ps)).toEqual([49217, 67890]);
    });
    it("no detecta motores vivos (S)", () => {
        const ps = "12345 S /home/runner/.llama/server/llama-server\n" +
                   "67890 S /home/runner/.tts/tts-server";
        expect(motoresParados(ps)).toEqual([]);
    });
    it("ignora procesos no motores", () => {
        const ps = "1 T otros\n2 T /usr/bin/otros\n3 T /home/runner/.llama/server/otros";
        expect(motoresParados(ps)).toEqual([]);
    });
    it("maneja ps vacío/nulo", () => {
        expect(motoresParados("")).toEqual([]);
        expect(motoresParados("\n\n\n")).toEqual([]);
    });
});

describe("detectarDrive (cabeza de maniobra)", () => {
    it("devuelve false si no hay Drive montado", async () => {
        configurarPsSalida("999 /usr/bin/otros foo");
        const r = await detectarDrive();
        expect(r.montado).toBe(false);
        expect(r.ruta).toBeNull();
        expect(r.espejo).toBeNull();
        expect(r.motivo).toBeUndefined();
    });
    it("devuelve false con motivo si el Drive está montado pero no corre la app", async () => {
        configurarPsSalida("");
        await montarDrive();
        const r = await detectarDrive();
        expect(r.montado).toBe(false);
        expect(r.ruta).not.toBeNull();
        expect(r.motivo).toBe("La app Google Drive no está abierta");
    });
    it("devuelve true si el Drive está montado y la app corre", async () => {
        configurarPsSalida("123 \"Google Drive\"");
        await montarDrive();
        const r = await detectarDrive();
        expect(r.montado).toBe(true);
        expect(r.ruta).not.toBeNull();
        expect(r.motivo).toBeUndefined();
        expect(r.espejo).toBeNull();
    });
    it("ignora unidades con paréntesis en el nombre", async () => {
        configurarPsSalida("123 \"Google Drive\"");
        const base = path.join(homeFalso, "Library", "CloudStorage");
        await mkdir(path.join(base, "GoogleDrive-cuenta@dominio.com(parte-2)"), { recursive: true });
        await mkdir(path.join(base, "GoogleDrive-cuenta@dominio.com"), { recursive: true });
        const r = await detectarDrive();
        expect(r.montado).toBe(true);
        expect(r.ruta).toContain("GoogleDrive-cuenta@dominio.com");
        expect(r.ruta).not.toContain("GoogleDrive-cuenta@dominio.com(parte-2)");
    });
});

describe("aliviarMemoria (integral)", () => {
    it("llama a dormir el BitNet y cede la voz; ps vacío no termina motores parados", async () => {
        configurarPsPidStatComm("");
        const r = await aliviarMemoria();
        expect(r.antesMb).toBeGreaterThanOrEqual(0);
        expect(r.despuesMb).toBeGreaterThanOrEqual(0);
        expect(r.liberadoMb).toBeGreaterThanOrEqual(0);
        expect(r.pasos.some((p) => p.que === "Dormir el llama-server BitNet")).toBe(true);
        expect(r.pasos.some((p) => p.que === "Ceder el pool de voz del demonio")).toBe(true);
        expect(r.pasos.some((p) => p.que === "Terminar motores parados por el guardia")).toBe(false);
    });
    it("llama a dormir el BitNet y cede la voz; detecta motores parados, no los termina", async () => {
        configurarPsPidStatComm("49217 T /home/runner/.llama/server/llama-server\n" +
                               "67890 T /home/runner/.tts/tts-server");
        const r = await aliviarMemoria();
        expect(r.antesMb).toBeGreaterThanOrEqual(0);
        expect(r.despuesMb).toBeGreaterThanOrEqual(0);
        expect(r.liberadoMb).toBeGreaterThanOrEqual(0);
        expect(r.pasos.some((p) => p.que === "Dormir el llama-server BitNet")).toBe(true);
        expect(r.pasos.some((p) => p.que === "Ceder el pool de voz del demonio")).toBe(true);
        expect(r.pasos.some((p) => p.que === "Terminar motores parados por el guardia")).toBe(true);
        expect(r.pasos.find((p) => p.que === "Terminar motores parados por el guardia")!.detalle.includes("2 de 2"));
    });
});
