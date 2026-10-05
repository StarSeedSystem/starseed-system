/**
 * Guardia de las lecturas del Mando (2026-10-05): la pestaña se quedó sin recursos
 * (`ERR_INSUFFICIENT_RESOURCES`) porque cada panel repetía su lectura sin esperar a la anterior.
 */
import { describe, expect, it, vi } from "vitest";
import { crearFetchGuardado, estaGuardado } from "../guardia-fetch";

function fetchLento() {
    const pendientes: Array<{ url: string; signal?: AbortSignal | null; resolver: (r: Response) => void; rechazar: (e: unknown) => void }> = [];
    const f = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolver, rechazar) => {
            const url = String(input);
            init?.signal?.addEventListener("abort", () => rechazar(init.signal!.reason));
            pendientes.push({ url, signal: init?.signal, resolver, rechazar });
        }),
    );
    return { f: f as unknown as typeof fetch, llamadas: f, pendientes };
}

describe("guardia de las lecturas del Mando", () => {
    it("diez vueltas del mismo medidor con la anterior sin volver son UNA petición, y todos leen su cuerpo", async () => {
        const { f, llamadas, pendientes } = fetchLento();
        const g = crearFetchGuardado(f);
        const vueltas = Array.from({ length: 10 }, () => g("/api/mando/medidores?clave=agentes", { cache: "no-store" }));
        expect(llamadas).toHaveBeenCalledTimes(1);
        pendientes[0]!.resolver(new Response(JSON.stringify({ detalle: { filas: [1, 2] } })));
        const cuerpos = await Promise.all(vueltas.map(async (p) => (await p).json()));
        expect(cuerpos.every((c) => c.detalle.filas.length === 2)).toBe(true);
    });

    it("cuando vuelve la lectura, la siguiente vuelta sí pide de nuevo", async () => {
        const { f, llamadas, pendientes } = fetchLento();
        const g = crearFetchGuardado(f);
        const a = g("/api/mando/estado");
        pendientes[0]!.resolver(new Response("{}"));
        await a;
        void g("/api/mando/estado");
        expect(llamadas).toHaveBeenCalledTimes(2);
    });

    it("POST, otras rutas y Request con cabeceras propias pasan intactos", async () => {
        const { f, llamadas } = fetchLento();
        const g = crearFetchGuardado(f);
        void g("/api/mando/reintentar", { method: "POST", body: "{}" });
        void g("/api/mando/reintentar", { method: "POST", body: "{}" });
        void g("/api/otra/cosa");
        void g("/api/otra/cosa");
        void g(new Request("http://localhost/api/mando/estado"));
        expect(llamadas).toHaveBeenCalledTimes(5);
    });

    it("una lectura colgada se corta en el tope y libera el hueco", async () => {
        vi.useFakeTimers();
        try {
            const { f, llamadas } = fetchLento();
            const g = crearFetchGuardado(f, { topeMs: 1000 });
            const a = g("/api/mando/medidores?clave=tokens");
            const fallo = expect(a).rejects.toMatchObject({ name: "TimeoutError" });
            await vi.advanceTimersByTimeAsync(1001);
            await fallo;
            void g("/api/mando/medidores?clave=tokens");
            expect(llamadas).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("si un panel aborta su lectura, los demás que la comparten la siguen recibiendo", async () => {
        const { f, pendientes } = fetchLento();
        const g = crearFetchGuardado(f);
        const control = new AbortController();
        const delQueSeVa = g("/api/mando/ides", { signal: control.signal });
        const delQueSeQueda = g("/api/mando/ides");
        control.abort();
        await expect(delQueSeVa).rejects.toBeDefined();
        expect(pendientes[0]!.signal?.aborted).toBe(false);
        pendientes[0]!.resolver(new Response("ok"));
        expect(await (await delQueSeQueda).text()).toBe("ok");
    });

    it("se marca para no envolverse dos veces", () => {
        const { f } = fetchLento();
        expect(estaGuardado(f)).toBe(false);
        expect(estaGuardado(crearFetchGuardado(f))).toBe(true);
    });
});
