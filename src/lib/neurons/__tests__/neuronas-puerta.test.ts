// @vitest-environment jsdom
/**
 * Neuronas por la puerta de datos del A1 (PDA1012 · fase 2, architecture/puerta-datos-a1.md §7).
 *
 * Estas pruebas fallan si se desconecta la puerta: el latido ligero y la vida de la lista DEBEN
 * pedirse a la puerta, y Supabase solo debe tocarse para el REGISTRO (ficha al abrir y cada 30 min)
 * o cuando la puerta no responde.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fundirVivas, latirNeuronaPorPuerta, vivasDeLaPuerta } from "@/lib/neurons/neuronas-puerta";
import type { PuertaA1, Resultado } from "@/lib/datos/puerta-a1";

const g = vi.hoisted(() => ({
    viaPuerta: "puerta" as "puerta" | "supabase" | "rechazo",
    latidos: [] as { neurona: string; medio?: string }[],
    lecturasVida: 0,
    vidas: [] as { neurona: string; medio: string | null; visto: string; en_linea: boolean; senales: unknown }[],
}));
const db = vi.hoisted(() => ({ updates: 0, upserts: 0, selects: 0, ultimoVisto: "" }));

vi.mock("@/lib/datos/puerta-a1", () => ({
    puertaA1: () => ({
        latirNeurona: async (n: { neurona: string; medio?: string }, respaldo?: () => Promise<unknown>) => {
            if (g.viaPuerta === "puerta") {
                g.latidos.push(n);
                return { via: "puerta", datos: { visto: new Date().toISOString() } };
            }
            if (g.viaPuerta === "rechazo") return { via: "rechazo", datos: null, estado: 401 };
            return { via: "supabase", datos: respaldo ? await respaldo() : null };
        },
        neuronas: async () => {
            g.lecturasVida++;
            if (g.viaPuerta !== "puerta") return { via: "supabase", datos: null };
            return { via: "puerta", datos: { neuronas: g.vidas } };
        },
    }),
}));
vi.mock("@/lib/consumo/lider-pestana", () => ({ esLider: () => true, alCambiarLider: () => () => undefined }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/lib/sync/entity-state", () => ({ deviceId: () => "sync-1" }));
vi.mock("@/ai/astraura/mesh/federation", () => ({ deviceId: () => "dev-1" }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: () => ({
            upsert: async () => {
                db.upserts++;
                return { error: null, status: 201 };
            },
            update: () => ({
                eq: () => ({
                    select: async () => {
                        db.updates++;
                        return { data: [{ id: "x" }], error: null, status: 200 };
                    },
                }),
            }),
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null, status: 200 }) }),
                order: async () => {
                    db.selects++;
                    return {
                        data: [{ id: "n-otra", name: "Otra", kind: "desktop", capabilities: {}, permissions: {}, last_seen_at: db.ultimoVisto }],
                        error: null,
                        status: 200,
                    };
                },
            }),
        }),
    }),
}));

const MIN = 60_000;
let nActual: { _detenerLatidoParaPruebas: () => void } | null = null;

beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("sin red en pruebas");
    }));
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    vi.useFakeTimers();
    vi.resetModules();
    g.viaPuerta = "puerta";
    g.latidos = [];
    g.lecturasVida = 0;
    g.vidas = [];
    db.updates = 0;
    db.upserts = 0;
    db.selects = 0;
    db.ultimoVisto = new Date(Date.now() - 60 * MIN).toISOString();
    localStorage.clear();
});

afterEach(() => {
    nActual?._detenerLatidoParaPruebas();
    nActual = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

async function neuronas() {
    const n = await import("@/lib/neurons/neurons");
    nActual = n;
    return n;
}

describe("fundirVivas (pura)", () => {
    test("la vida más nueva gana; no inventa filas", () => {
        const filas = [
            { id: "a", last_seen_at: "2026-10-11T00:00:00Z" },
            { id: "b", last_seen_at: "2026-10-11T02:00:00Z" },
        ];
        const vivas = new Map([
            ["a", "2026-10-11T01:00:00Z"],
            ["b", "2026-10-11T01:00:00Z"],
            ["c", "2026-10-11T01:00:00Z"],
        ]);
        const r = fundirVivas(filas, vivas);
        expect(r).toHaveLength(2);
        expect(r[0].last_seen_at).toBe("2026-10-11T01:00:00Z");
        expect(r[1].last_seen_at).toBe("2026-10-11T02:00:00Z");
        expect(fundirVivas(filas, null)).toEqual(filas);
    });
});

describe("latirNeuronaPorPuerta / vivasDeLaPuerta", () => {
    test("por la puerta no llama al respaldo de Supabase", async () => {
        const respaldo = vi.fn(async () => ({ fallo: null }));
        const puerta = {
            latirNeurona: vi.fn(async () => ({ via: "puerta", datos: {} }) as Resultado<unknown>),
        } as unknown as Pick<PuertaA1, "latirNeurona">;
        const r = await latirNeuronaPorPuerta({ neurona: "n1", medio: "navegador" }, respaldo, puerta);
        expect(r.via).toBe("puerta");
        expect(respaldo).not.toHaveBeenCalled();
    });

    test("sin puerta, la vida es null (manda Supabase)", async () => {
        const puerta = { neuronas: async () => ({ via: "supabase", datos: null }) } as unknown as Pick<PuertaA1, "neuronas">;
        expect(await vivasDeLaPuerta(puerta)).toBeNull();
    });
});

describe("neurons.ts cableado a la puerta (fase 2)", () => {
    test("el latido ligero va a la puerta y NO actualiza neuron_devices en Supabase", async () => {
        const n = await neuronas();
        await n.ensureThisNeuron();
        await vi.advanceTimersByTimeAsync(0);
        expect(db.upserts).toBe(1); // la ficha completa (registro) sigue yendo a Supabase al abrir
        await vi.advanceTimersByTimeAsync(5 * MIN);
        expect(g.latidos).toHaveLength(1); // el latido ligero, por la puerta
        expect(g.latidos[0].neurona).toBe(n.thisDeviceId());
        expect(db.updates).toBe(0);
        expect(db.upserts).toBe(1);
    });

    test("si la puerta no responde, el latido ligero vuelve a Supabase como antes", async () => {
        g.viaPuerta = "supabase";
        const n = await neuronas();
        await n.ensureThisNeuron();
        await vi.advanceTimersByTimeAsync(5 * MIN);
        expect(g.latidos).toHaveLength(0);
        expect(db.updates).toBe(1);
    });

    test("la lista toma la VIDA de la puerta y relee el registro de Supabase cada 30 min, no cada 5", async () => {
        g.vidas = [{ neurona: "n-otra", medio: "navegador", visto: new Date().toISOString(), en_linea: true, senales: null }];
        const n = await neuronas();
        // La ficha de este aparato sube al abrir (y vacía la caché de la lista): se deja pasar antes de medir.
        await n.ensureThisNeuron();
        await vi.advanceTimersByTimeAsync(0);
        const lista = await n.listNeurons();
        const otra = lista.find((x) => x.id === "n-otra");
        expect(otra?.online).toBe(true); // Supabase decía «hace 60 min»; la puerta, «ahora»
        expect(g.lecturasVida).toBe(1);
        expect(db.selects).toBe(1);
        await vi.advanceTimersByTimeAsync(10 * MIN);
        await n.listNeurons();
        expect(g.lecturasVida).toBe(2); // la vida se vuelve a pedir (sin coste en Supabase)…
        expect(db.selects).toBe(1); // …y el registro sigue en caché
        await vi.advanceTimersByTimeAsync(21 * MIN);
        await n.listNeurons();
        expect(db.selects).toBe(2);
    });

    test("sin puerta, la lista se comporta como antes (registro cada 5 min, online por Supabase)", async () => {
        g.viaPuerta = "supabase";
        const n = await neuronas();
        const lista = await n.listNeurons();
        expect(lista.find((x) => x.id === "n-otra")?.online).toBe(false);
        await vi.advanceTimersByTimeAsync(6 * MIN);
        await n.listNeurons();
        expect(db.selects).toBe(2);
    });
});
