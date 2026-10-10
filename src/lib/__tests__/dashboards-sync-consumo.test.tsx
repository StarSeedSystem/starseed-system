/**
 * CON1010 (2026-10-10): el respaldo de tableros mandaba `merge_user_prefs` cada 30 s por pestaña con
 * `savedAt: Date.now()` — 3.389 peticiones el 10-10, casi todas idénticas. Estas pruebas fallan con
 * el código anterior (6 subidas en 2,5 min sin tocar nada) y pasan con el arreglo (1).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const merge = vi.fn(async (_patch: Record<string, unknown>, _opts?: unknown) => ({ ok: true, atomic: true }));
const oyentesAuth = new Set<(ev: string, s: { user?: { id: string } } | null) => void>();

vi.mock("@/lib/sync/user-prefs", async () => {
    const real = await vi.importActual<typeof import("@/lib/sync/user-prefs")>("@/lib/sync/user-prefs");
    return { ...real, mergeUserPrefs: (p: Record<string, unknown>, o?: unknown) => merge(p, o) };
});
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: (cb: (ev: string, s: { user?: { id: string } } | null) => void) => {
                oyentesAuth.add(cb);
                return { data: { subscription: { unsubscribe: () => oyentesAuth.delete(cb) } } };
            },
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }),
}));

import { CLAVE_RESPALDO_TABLEROS, RESUBIDA_SEGURIDAD_MS, respaldarTableros, useDashboardsBackup } from "../dashboards-sync";

const TABLEROS = JSON.stringify([{ id: "d1", nombre: "Principal" }]);

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-10T20:00:00Z") });
    localStorage.clear();
    localStorage.setItem("starseed_dashboards", TABLEROS);
    localStorage.setItem("starseed_widgets", JSON.stringify([{ id: "w1" }]));
    merge.mockClear();
    oyentesAuth.clear();
});
afterEach(() => {
    vi.useRealTimers();
});

async function avanzar(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe("respaldo de tableros sin peticiones repetidas", () => {
    it("una pestaña abierta 5 minutos sin tocar los tableros sube el respaldo UNA vez", async () => {
        const { unmount } = renderHook(() => useDashboardsBackup());
        await avanzar(5 * 60_000);
        expect(merge).toHaveBeenCalledTimes(1);
        unmount();
    });

    it("los ecos de sesión (volver a la pestaña, renovar token) no vuelven a subir", async () => {
        const { unmount } = renderHook(() => useDashboardsBackup());
        await avanzar(2_000);
        for (const ev of ["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "SIGNED_IN"]) {
            for (const o of Array.from(oyentesAuth)) o(ev, { user: { id: "u1" } });
            await avanzar(2_000);
        }
        expect(merge).toHaveBeenCalledTimes(1);
        unmount();
    });

    it("un cambio REAL de los tableros sí se sube, con su nueva fecha", async () => {
        const { unmount } = renderHook(() => useDashboardsBackup());
        await avanzar(2_000);
        expect(merge).toHaveBeenCalledTimes(1);
        const primera = (merge.mock.calls[0][0] as { dashboards: { savedAt: number } }).dashboards.savedAt;
        localStorage.setItem("starseed_dashboards", JSON.stringify([{ id: "d1" }, { id: "d2" }]));
        await avanzar(31_000);
        expect(merge).toHaveBeenCalledTimes(2);
        const segunda = (merge.mock.calls[1][0] as { dashboards: { savedAt: number } }).dashboards.savedAt;
        expect(segunda).toBeGreaterThan(primera);
        unmount();
    });

    it("dos pestañas del mismo aparato comparten el registro: la segunda no repite la subida", async () => {
        expect(await respaldarTableros("u1")).toBe("subido");
        expect(await respaldarTableros("u1")).toBe("sin-cambios");
        expect(merge).toHaveBeenCalledTimes(1);
        expect(JSON.parse(localStorage.getItem(CLAVE_RESPALDO_TABLEROS) ?? "{}").h).toBeTruthy();
    });

    it("re-subida de seguridad como mucho cada 6 h aunque nada cambie", async () => {
        expect(await respaldarTableros("u1")).toBe("subido");
        vi.advanceTimersByTime(RESUBIDA_SEGURIDAD_MS + 1);
        expect(await respaldarTableros("u1")).toBe("subido");
        expect(merge).toHaveBeenCalledTimes(2);
        // Misma fecha de contenido: el respaldo es idéntico, solo se re-asegura.
        const a = (merge.mock.calls[0][0] as { dashboards: { savedAt: number } }).dashboards.savedAt;
        const b = (merge.mock.calls[1][0] as { dashboards: { savedAt: number } }).dashboards.savedAt;
        expect(b).toBe(a);
    });

    it("si la subida falla, se reintenta en la próxima vuelta (no queda marcada como hecha)", async () => {
        merge.mockResolvedValueOnce({ ok: false, atomic: true } as never);
        expect(await respaldarTableros("u1")).toBe("fallo");
        expect(await respaldarTableros("u1")).toBe("subido");
    });
});
