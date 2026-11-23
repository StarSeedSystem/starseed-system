import { afterEach, describe, expect, it } from "vitest";
import { crearPuenteTauri, estadoIndicadorNativo, partirErrorNativo, prepararIndicadorNativo } from "../nativo";

afterEach(() => {
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
});

function tauri(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) {
    (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

describe("IND1115F · lo que dice Rust al negar la sesión", () => {
    it("parte el código y sus pares, y descarta lo que no tiene forma", () => {
        expect(partirErrorNativo("sin-indicador-nativo falta=notificaciones,superposicion paso=permisos tras=0")).toEqual({
            motivo: "sin-indicador-nativo",
            detalle: { falta: "notificaciones,superposicion", paso: "permisos", tras: "0" },
        });
        expect(partirErrorNativo("sin-indicador-nativo")).toEqual({ motivo: "sin-indicador-nativo" });
        expect(partirErrorNativo(new Error("interruptor-nativo-apagado"))).toEqual({ motivo: "interruptor-nativo-apagado" });
        expect(partirErrorNativo("sin-indicador-nativo falta=<script>").motivo).toBe("nativo-fallo");
        expect(partirErrorNativo({}).motivo).toBe("nativo-fallo");
    });

    it("el puente devuelve el detalle al abrir y no abre sin indicador", async () => {
        tauri(async () => {
            throw "sin-indicador-nativo falta=superposicion paso=primer-plano error=superposicion:sin-permiso tras=4000";
        });
        const r = await crearPuenteTauri().abrir("de", "Mac", "controlar");
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("sin-indicador-nativo");
        expect(r.detalle?.falta).toBe("superposicion");
        expect(r.detalle?.error).toBe("superposicion:sin-permiso");
    });

    it("FSG1116 · A2: el puente manda a Rust la orden firmada junto a lo demás", async () => {
        const vistos: Array<Record<string, unknown> | undefined> = [];
        tauri(async (_cmd, args) => {
            vistos.push(args);
            return "c".repeat(32);
        });
        const sobre = { v: 1, carga: "abc", firma: "def" };
        expect(await crearPuenteTauri().abrir("de", "Mac", "ver", null, sobre)).toEqual({ ok: true, token: "c".repeat(32) });
        expect(vistos[0]).toEqual({ de: "de", fin: null, nombre: "Mac", nivel: "ver", sobre: { v: 1, carga: "abc", firma: "def" } });
    });

    it("lee el estado del indicador con el último rechazo; fuera de la app, null", async () => {
        expect(await estadoIndicadorNativo()).toBeNull();
        tauri(async () => ({ indicador_posible: false, falta: ["notificaciones", 3], ultimo_rechazo: { hace_ms: 5, falta: ["notificaciones"], paso: "permisos", error: "", tras_ms: 0 } }));
        expect(await estadoIndicadorNativo()).toEqual({
            indicadorPosible: false,
            falta: ["notificaciones"],
            ultimoRechazo: { haceMs: 5, falta: ["notificaciones"], paso: "permisos", error: "", trasMs: 0 },
        });
    });

    it("cada botón pide su cosa a Rust (y sin cosa, como antes)", async () => {
        const llamadas: Array<[string, unknown]> = [];
        tauri(async (cmd, args) => {
            llamadas.push([cmd, args]);
            return { indicador_posible: false, falta: [] };
        });
        await prepararIndicadorNativo("superposicion");
        await prepararIndicadorNativo();
        expect(llamadas).toEqual([
            ["control_neuronas_preparar", { que: "superposicion" }],
            ["control_neuronas_preparar", undefined],
        ]);
    });
});
