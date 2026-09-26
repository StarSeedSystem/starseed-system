// @vitest-environment jsdom
/**
 * Escritorios del perfil (2026-09-26): al arrancar ya no se pisa un doc local más nuevo con
 * el de la nube, un cambio remoto más viejo se ignora, y uno más nuevo se aplica SIN
 * volver a subirlo (antes rebotaba A→B→A entre neuronas cada ~1,5 s).
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

let remoteCb: ((c: { self: boolean; value: unknown }) => void) | null = null;
const setCalls: unknown[] = [];
let nubeInicial: unknown = null;

vi.mock("@/lib/sync/entity-state", () => ({
    deviceId: () => "devB",
    getEntityState: async () => (nubeInicial ? { value: nubeInicial, rev: 1 } : null),
    setEntityState: async (_r: unknown, _k: string, v: unknown) => {
        setCalls.push(v);
        return null;
    },
    subscribeEntityState: (_r: unknown, _k: string, cb: (c: { self: boolean; value: unknown }) => void) => {
        remoteCb = cb;
        return () => {};
    },
}));
vi.mock("@/lib/profiles/profiles", () => ({
    activeProfileId: () => "p1",
    PROFILE_ACTIVE_EVENT: "starseed:profile",
    getDefaultProfile: async () => ({ id: "p1" }),
}));
vi.mock("@/lib/sync/shared-desktop-space", () => ({ hasOpenSpace: () => false, SPACE_TOGGLE_EVENT: "x" }));
vi.mock("@/lib/sync/sync-profiles-config", () => ({ shouldSyncKey: () => true }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

const K = "starseed.desktops.v1";
const doc = (name: string, savedAt: number) => ({
    desktops: [{ id: "d1", name, icons: [], windows: [] }],
    activeId: "d1",
    snap: true,
    savedAt,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nombreLocal = () => JSON.parse(localStorage.getItem(K)!).desktops[0].name;

beforeEach(() => {
    setCalls.length = 0;
    remoteCb = null;
});

test("arranque: un doc local más nuevo no se pisa con el de la nube y se sube", async () => {
    const { useProfileDesktopsSync } = await import("@/lib/sync/profile-desktops");
    nubeInicial = doc("nube-vieja", 1);
    localStorage.setItem(K, JSON.stringify(doc("local-nuevo", 999)));
    const { unmount } = renderHook(() => useProfileDesktopsSync());
    await sleep(60);
    expect(nombreLocal()).toBe("local-nuevo");
    expect(setCalls.length).toBe(1); // el local (más nuevo) se sube como verdad
    unmount();
});

test("vivo: remoto más viejo se ignora; remoto más nuevo se aplica y NO se re-sube", async () => {
    const { useProfileDesktopsSync } = await import("@/lib/sync/profile-desktops");
    nubeInicial = doc("nube", 1000);
    localStorage.setItem(K, JSON.stringify(doc("local", 999)));
    const { unmount } = renderHook(() => useProfileDesktopsSync());
    await sleep(60);
    expect(nombreLocal()).toBe("nube"); // la nube era más nueva
    const antes = setCalls.length;

    remoteCb!({ self: false, value: doc("de-A-viejo", 5) });
    expect(nombreLocal()).toBe("nube");

    remoteCb!({ self: false, value: doc("de-A-nuevo", 2000) });
    expect(nombreLocal()).toBe("de-A-nuevo");
    await sleep(1700); // más que el debounce de subida (1,5 s)
    expect(setCalls.slice(antes).map((v) => (v as { desktops: { name: string }[] }).desktops[0].name)).toEqual([]);
    unmount();
});
