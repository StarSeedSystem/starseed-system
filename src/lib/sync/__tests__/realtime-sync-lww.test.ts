// @vitest-environment jsdom
/**
 * Escritorio que «se reinicia constantemente» (2026-09-26): tras subir el cambio de T1, una
 * edición hecha mientras volaba la petición (T2) veía su marca rebajada a T1 y el eco de
 * postgres_changes (empate) volvía a poner el valor viejo. Además, el parche de `setItem`
 * por asignación no funciona en navegadores que siguen WebIDL (Firefox/Safari, jsdom).
 */
import { afterAll, expect, test, vi } from "vitest";

let pgCallback: ((p: { new?: Record<string, unknown> }) => void) | null = null;
let resolveMerge: ((v: { ok: boolean; atomic: boolean }) => void) | null = null;
const mergedPatches: Record<string, unknown>[] = [];

vi.mock("@/utils/supabase/client", () => {
    const chan: Record<string, unknown> = {};
    Object.assign(chan, {
        on: (tipo: string, _f: unknown, cb: (p: { new?: Record<string, unknown> }) => void) => {
            if (tipo === "postgres_changes") pgCallback = cb;
            return chan;
        },
        subscribe: () => chan,
        send: async () => ({}),
    });
    const client = {
        auth: {
            getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
            getUser: async () => ({ data: { user: { id: "u1" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { prefs: {} }, error: null }) }) }) }),
        channel: () => chan,
        removeChannel: () => {},
    };
    return { createClient: () => client };
});
vi.mock("@/lib/sync/user-prefs", () => ({
    mergeUserPrefs: (patch: Record<string, unknown>) => {
        mergedPatches.push(patch);
        return new Promise((r) => {
            resolveMerge = r as (v: { ok: boolean; atomic: boolean }) => void;
        });
    },
}));

const K = "starseed.cursorfx.v1"; // clave sincronizada con la cuenta
const META = "starseed.sync.meta.v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(() => {
    localStorage.clear();
});

test("el parche de setItem funciona también donde la asignación no parchea (prototipo)", async () => {
    const rs = await import("@/lib/sync/realtime-sync");
    await rs.startRealtimeSync();
    await sleep(50);
    localStorage.setItem(K, JSON.stringify({ v: "cero" }));
    expect(localStorage.getItem("setItem")).toBeNull();
    await sleep(900);
    expect(mergedPatches.length).toBeGreaterThan(0);
    resolveMerge?.({ ok: true, atomic: true });
    await sleep(20);
});

test("una edición hecha mientras vuela el push NO se pierde con el eco (LWW sin retroceso)", async () => {
    expect(pgCallback).toBeTruthy();
    localStorage.setItem(K, JSON.stringify({ v: "A" })); // edición 1 (T1)
    await sleep(900); // debounce 800 ms → push en vuelo
    const t1 = (mergedPatches.at(-1)!.__meta as Record<string, number>)[K];

    await sleep(5);
    localStorage.setItem(K, JSON.stringify({ v: "B" })); // edición 2 (T2 > T1) durante el push
    const durante = JSON.parse(localStorage.getItem(META)!)[K];
    expect(durante).toBeGreaterThan(t1);

    resolveMerge!({ ok: true, atomic: true });
    await sleep(10);
    expect(JSON.parse(localStorage.getItem(META)!)[K]).toBe(durante); // la marca no retrocede

    // Eco de la escritura de A, con jsonb reordenado.
    pgCallback!({ new: { prefs: { [K]: { v: "A" }, __meta: { [K]: t1 } } } });
    expect(JSON.parse(localStorage.getItem(K)!).v).toBe("B");

    // Un empate exacto (eco de lo propio) tampoco reescribe.
    pgCallback!({ new: { prefs: { [K]: { v: "otra" }, __meta: { [K]: durante } } } });
    expect(JSON.parse(localStorage.getItem(K)!).v).toBe("B");
});
