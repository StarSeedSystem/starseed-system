// @vitest-environment jsdom
/**
 * La guardia se sigue encontrando aunque otro envuelva `fetch` encima (2026-10-05: el indicador
 * de carga global pone su contador después, y la autocuración de la página no la veía).
 */
import { describe, expect, it, vi } from "vitest";

describe("guardia instalada en la página", () => {
    it("guardiaInstalada la devuelve aunque otro envoltorio esté encima, y sigue compartiendo", async () => {
        const original = vi.fn(async () => new Response("ok"));
        window.fetch = original as unknown as typeof fetch;
        const { instalarGuardiaFetchMando, guardiaInstalada } = await import("../guardia-fetch");
        instalarGuardiaFetchMando();
        const debajo = window.fetch;
        window.fetch = ((i: RequestInfo | URL, init?: RequestInit) => debajo(i, init)) as typeof fetch; // el contador
        expect(guardiaInstalada()).not.toBeNull();
        expect(typeof guardiaInstalada()!.salud).toBe("function");
        await Promise.all([window.fetch("/api/mando/estado"), window.fetch("/api/mando/estado")]);
        expect(original).toHaveBeenCalledTimes(1);
        instalarGuardiaFetchMando();
        expect((window as unknown as Record<string, unknown>).__starseedGuardiaMando).toBe(guardiaInstalada());
    });
});
