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

describe("guardia de las lecturas del Mando · tope, cola y salud", () => {
    it("con muchas lecturas distintas, como mucho maxEnVuelo a la vez y el resto espera turno", async () => {
        const { f, llamadas, pendientes } = fetchLento();
        const g = crearFetchGuardado(f, { maxEnVuelo: 2, maxCola: 10 });
        const vueltas = ["a", "b", "c", "d"].map((k) => g(`/api/mando/medidores?clave=${k}`));
        expect(llamadas).toHaveBeenCalledTimes(2);
        expect(g.salud()).toMatchObject({ enVuelo: 2, enCola: 2 });
        pendientes[0]!.resolver(new Response("1"));
        await vueltas[0];
        await Promise.resolve();
        expect(llamadas).toHaveBeenCalledTimes(3);
    });

    it("si la cola se llena, la lectura más vieja que esperaba se descarta y cuenta como fallo", async () => {
        const { f } = fetchLento();
        const g = crearFetchGuardado(f, { maxEnVuelo: 1, maxCola: 2 });
        void g("/api/mando/uno");
        const vieja = g("/api/mando/dos");
        void g("/api/mando/tres");
        void g("/api/mando/cuatro");
        await expect(vieja).rejects.toMatchObject({ name: "AbortError" });
        expect(g.salud()).toMatchObject({ enCola: 2, descartadas: 1 });
        expect(g.salud().fallosSeguidos).toBeGreaterThanOrEqual(1);
    });

    it("lleva la salud: un éxito pone a cero los fallos seguidos y apunta la hora", async () => {
        let t = 1000;
        const f = vi.fn(async (input: RequestInfo | URL) =>
            String(input).includes("mal") ? Promise.reject(new TypeError("Failed to fetch")) : new Response("ok"),
        ) as unknown as typeof fetch;
        const g = crearFetchGuardado(f, { ahora: () => t });
        await expect(g("/api/mando/mal")).rejects.toBeInstanceOf(TypeError);
        await expect(g("/api/mando/mal")).rejects.toBeInstanceOf(TypeError);
        expect(g.salud().fallosSeguidos).toBe(2);
        t = 5000;
        await g("/api/mando/bien");
        expect(g.salud()).toMatchObject({ fallosSeguidos: 0, ultimoExito: 5000 });
    });

    it("reiniciar suelta lo que está en vuelo y vacía la cola", async () => {
        const { f, pendientes } = fetchLento();
        const g = crearFetchGuardado(f, { maxEnVuelo: 1, maxCola: 5 });
        const enVuelo = g("/api/mando/a");
        const enCola = g("/api/mando/b");
        g.reiniciar("prueba");
        await expect(enVuelo).rejects.toBeDefined();
        await expect(enCola).rejects.toMatchObject({ name: "AbortError" });
        expect(pendientes[0]!.signal?.aborted).toBe(true);
        expect(g.salud()).toMatchObject({ enCola: 0, fallosSeguidos: 0 });
    });
});
