/**
 * Pruebas de `servidor-astraura.ts` (solo servidor). Sigue el mismo patrón que
 * `mando-almacenamiento.test.ts`: `execFile` se simula por binario (espía vía
 * `vi.hoisted`), `os.homedir()` apunta a un tmpdir y `STARSEED_ROOT` apunta a
 * otro para que el registro de servidores viva solo aquí. `fetch` se simula
 * globalmente para las sondas a Astraura y (opcionalmente) a Supabase.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import path from "node:path";

interface Llamada {
    binario: string;
    args: string[];
}
type Respuesta = { stdout: string } | { lanzar: Error };

const ctx = vi.hoisted(() => ({
    espia: [] as Llamada[],
    respuestas: new Map<string, (args: string[]) => Respuesta>(),
}));

vi.mock("node:child_process", () => ({
    execFile: (
        bin: string,
        args: string[],
        _o: unknown,
        cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
    ) => {
        ctx.espia.push({ binario: bin, args });
        const r = ctx.respuestas.get(bin)?.(args);
        if (r && "lanzar" in r) return cb(r.lanzar, { stdout: "", stderr: "" });
        if (r && "stdout" in r) return cb(null, { stdout: r.stdout, stderr: "" });
        // Binario sin respuesta registrada: simula que no existe (ENOENT),
        // igual que en Linux/CI donde no hay pmset/launchctl.
        return cb(new Error(`ENOENT: ${bin} no encontrado`), { stdout: "", stderr: "" });
    },
}));

import { accionServidor, estadoServidor, huellaCorta } from "@/lib/mando/servidor-astraura";
import { ETIQUETA_DESPIERTO } from "@/lib/mando/servidor-astraura-tipos";

let homeFalso = "";
let raizFalsa = "";
const entornoOriginal = { ...process.env };

/** Respuesta JSON vacía por defecto para cualquier sonda a Astraura/Supabase. */
function fetchPorDefecto() {
    return vi.fn(async (entrada: string | URL) => {
        const url = String(entrada);
        if (url.includes("/api/ping")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
        if (url.includes("/api/bitnet/estado")) {
            return new Response(JSON.stringify({ dormido: true, ultimo_uso_interactivo_hace_s: 500, vivo: false }), {
                status: 200,
            });
        }
        if (url.includes("/api/starseed/processes")) {
            return new Response(
                JSON.stringify({
                    cognition: {
                        calls: 10,
                        real: 8,
                        aplazadas_presupuesto: 1,
                        cedidas_al_chat: 2,
                        fondo: { ciclo: 5, en_curso: false, descansa_s: 30 },
                    },
                }),
                { status: 200 },
            );
        }
        if (url.includes(":8790/health")) return new Response("{}", { status: 200 });
        // Supabase (tunelPublicado): sin fila publicada por defecto.
        if (url.includes("/rest/v1/astraura_state")) return new Response("[]", { status: 200 });
        return new Response("{}", { status: 404 });
    });
}

beforeEach(async () => {
    ctx.espia.length = 0;
    ctx.respuestas.clear();
    homeFalso = await mkdtemp(path.join(tmpdir(), "starseed-servidor-home-"));
    raizFalsa = await mkdtemp(path.join(tmpdir(), "starseed-servidor-raiz-"));
    vi.spyOn(os, "homedir").mockReturnValue(homeFalso);
    process.env.STARSEED_ROOT = raizFalsa;
    // Sin credenciales de Supabase por defecto: `tunelPublicado()` devuelve
    // null sin llegar a hacer ninguna petición de red.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ASTRAURA_CLOUD_URL;
    delete process.env.ASTRAURA_REPO;
    vi.stubGlobal("fetch", fetchPorDefecto());
});

afterEach(async () => {
    vi.spyOn(os, "homedir").mockRestore();
    vi.unstubAllGlobals();
    process.env = { ...entornoOriginal };
    await rm(homeFalso, { recursive: true, force: true });
    await rm(raizFalsa, { recursive: true, force: true });
});

describe("accionServidor — despierto", () => {
    it("activar=true escribe el plist, carga con launchctl y guarda despierto.json", async () => {
        const r = await accionServidor({ accion: "despierto", activar: true });
        expect(r.ok).toBe(true);

        const plist = path.join(homeFalso, "Library", "LaunchAgents", `${ETIQUETA_DESPIERTO}.plist`);
        const contenidoPlist = await readFile(plist, "utf-8");
        expect(contenidoPlist).toContain("caffeinate");
        expect(contenidoPlist).toContain("-i");
        expect(contenidoPlist).toContain("-s");

        const cargaLaunchctl = ctx.espia.find((l) => l.binario === "launchctl" && l.args[0] === "load");
        expect(cargaLaunchctl).toBeDefined();
        expect(cargaLaunchctl!.args).toEqual(["load", "-w", plist]);

        const json = JSON.parse(await readFile(path.join(homeFalso, ".starseed", "despierto.json"), "utf-8")) as {
            activo: boolean;
            desde: number | null;
        };
        expect(json.activo).toBe(true);
        expect(typeof json.desde).toBe("number");
    });

    it("activar=false descarga con launchctl, borra el plist y guarda activo=false", async () => {
        // Primero lo activamos para tener algo que desactivar.
        await accionServidor({ accion: "despierto", activar: true });
        ctx.espia.length = 0;

        const r = await accionServidor({ accion: "despierto", activar: false });
        expect(r.ok).toBe(true);

        const descarga = ctx.espia.find((l) => l.binario === "launchctl" && l.args[0] === "unload");
        expect(descarga).toBeDefined();
        expect(descarga!.args[1]).toBe("-w");

        const borrado = ctx.espia.find((l) => l.binario === "rm");
        expect(borrado).toBeDefined();
        expect(borrado!.args).toContain("-f");

        const json = JSON.parse(await readFile(path.join(homeFalso, ".starseed", "despierto.json"), "utf-8")) as {
            activo: boolean;
            desde: number | null;
        };
        expect(json.activo).toBe(false);
        expect(json.desde).toBeNull();
    });
});

describe("accionServidor — apagar_pantalla", () => {
    it("llama a `pmset displaysleepnow`", async () => {
        ctx.respuestas.set("pmset", () => ({ stdout: "" }));
        const r = await accionServidor({ accion: "apagar_pantalla" });
        expect(r.ok).toBe(true);
        const llamada = ctx.espia.find((l) => l.binario === "pmset" && l.args[0] === "displaysleepnow");
        expect(llamada).toBeDefined();
    });
});

describe("accionServidor — reiniciar", () => {
    it("rechaza com.starseed.mando (nunca se reinicia el propio Genesis)", async () => {
        const r = await accionServidor({ accion: "reiniciar", servicio: "mando" });
        expect(r.ok).toBe(false);
        expect(ctx.espia.some((l) => l.binario === "launchctl" && l.args[0] === "kickstart")).toBe(false);
    });

    it("rechaza una etiqueta desconocida", async () => {
        const r = await accionServidor({ accion: "reiniciar", servicio: "algo-inventado" });
        expect(r.ok).toBe(false);
        expect(ctx.espia.some((l) => l.binario === "launchctl" && l.args[0] === "kickstart")).toBe(false);
    });

    it("una etiqueta de la lista blanca sí lanza kickstart", async () => {
        ctx.respuestas.set("launchctl", () => ({ stdout: "" }));
        const r = await accionServidor({ accion: "reiniciar", servicio: "astraura" });
        expect(r.ok).toBe(true);
        const kickstart = ctx.espia.find((l) => l.binario === "launchctl" && l.args[0] === "kickstart");
        expect(kickstart).toBeDefined();
        expect(kickstart!.args.join(" ")).toContain("com.starseed.astraura");
    });
});

describe("accionServidor — registro de servidores", () => {
    it("servidor_agregar valida y persiste en starseed_memory_root/mando/servidores-astraura.json", async () => {
        const r = await accionServidor({ accion: "servidor_agregar", nombre: "Oracle Always Free", tipo: "oracle", url: "https://140.238.1.2" });
        expect(r.ok).toBe(true);
        expect(r.servidores?.some((s) => "url" in s && s.url === "https://140.238.1.2")).toBe(true);
        // Con un Oracle ya guardado, no debe aparecer la sugerencia «pendiente».
        expect(r.servidores?.some((s) => s.id === "oracle-pendiente")).toBe(false);

        const ruta = path.join(raizFalsa, "starseed_memory_root", "mando", "servidores-astraura.json");
        const guardado = JSON.parse(await readFile(ruta, "utf-8")) as Array<{ url: string }>;
        expect(guardado.some((s) => s.url === "https://140.238.1.2")).toBe(true);
    });

    it("servidor_agregar rechaza una URL inválida sin escribir nada", async () => {
        const r = await accionServidor({ accion: "servidor_agregar", nombre: "x", tipo: "vps", url: "https://ejemplo.com?key=abc" });
        expect(r.ok).toBe(false);
        const ruta = path.join(raizFalsa, "starseed_memory_root", "mando", "servidores-astraura.json");
        await expect(readFile(ruta, "utf-8")).rejects.toThrow();
    });

    it("servidor_quitar no puede quitar esta-mac", async () => {
        const r = await accionServidor({ accion: "servidor_quitar", id: "esta-mac" });
        expect(r.ok).toBe(false);
    });

    it("sin ningún servidor guardado, la lista trae la sugerencia oracle-pendiente", async () => {
        const estado = await estadoServidor();
        expect(estado.servidores.some((s) => s.id === "oracle-pendiente")).toBe(true);
        expect(estado.servidores.some((s) => s.id === "esta-mac")).toBe(true);
    });
});

describe("estadoServidor", () => {
    it("nunca lanza y nunca devuelve la URL cruda del túnel activo", async () => {
        const urlSecreta = "https://un-tunel-bastante-secreto-de-verdad.trycloudflare.com";
        const carpetaBackend = path.join(homeFalso, "Documents", "IA 1.58 bit", "backend", "data");
        await mkdir(carpetaBackend, { recursive: true });
        await writeFile(
            path.join(carpetaBackend, "active_tunnel.json"),
            JSON.stringify({
                active: true,
                url: urlSecreta,
                port: 443,
                lan_ips: ["192.168.1.2"],
                updated_at: Date.now(),
                iso_time: new Date().toISOString(),
                provider: "cloudflare",
            }),
        );

        const estado = await estadoServidor();
        const bruto = JSON.stringify(estado);
        expect(bruto).not.toContain(urlSecreta);
        expect(bruto).not.toContain("trycloudflare.com");
        expect(estado.nube.tunelActivo).toBe(true);
        expect(estado.nube.huella).toBe(huellaCorta(urlSecreta));
        expect(estado.nube.huella).toHaveLength(12);
    });

    it("degrada con gracia cuando pmset/launchctl no existen (Linux/CI): no lanza", async () => {
        await expect(estadoServidor()).resolves.toBeDefined();
        const estado = await estadoServidor();
        expect(estado.energia.reposoSistemaMin).toBeNull();
        expect(estado.energia.despierto).toBe(false);
    });

    it("orquestadorVivo se detecta con `ps -axo args=`, nunca con pgrep -l/-fl ni ps -E", async () => {
        ctx.respuestas.set("ps", (args) => {
            expect(args).toEqual(["-axo", "args="]);
            return { stdout: "node script.js\npython3 /Users/alex/.local/bin/starseed-enjambre.py cola --workers 4\n" };
        });
        const estado = await estadoServidor();
        expect(estado.enjambre.orquestadorVivo).toBe(true);
        expect(ctx.espia.some((l) => l.binario === "pgrep")).toBe(false);
    });

    it("con el backend y BitNet caídos, trae avisos honestos", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("fallo", { status: 500 })),
        );
        const estado = await estadoServidor();
        expect(estado.astraura.backend.ok).toBe(false);
        expect(estado.astraura.llama.ok).toBe(false);
        expect(estado.avisos.some((a) => a.includes("backend de Astraura"))).toBe(true);
        expect(estado.avisos.some((a) => a.includes("BitNet"))).toBe(true);
    });

    it("respeta ASTRAURA_CLOUD_URL como destino de la nube (despliegue-propio)", async () => {
        process.env.ASTRAURA_CLOUD_URL = "https://mi-cloud-run.example.com";
        const estado = await estadoServidor();
        expect(estado.nube.destino).toBe("despliegue-propio");
    });
});
