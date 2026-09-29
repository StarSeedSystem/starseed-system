/**
 * `useAviso` sobre `useSyncExternalStore`: el `getSnapshot` DEBE devolver la misma referencia
 * mientras nada cambie, o React entra en bucle («Maximum update depth», el #185 de producción).
 * Aquí se monta el gancho de verdad (también en StrictMode), se cuentan los renders y se
 * comprueba que:
 *  · el render se estabiliza (no hay bucle) con y sin registro;
 *  · marcar OTRO aviso no re-renderiza éste;
 *  · marcar el suyo sí, y llega el valor nuevo;
 *  · una llegada de la cuenta con el mismo contenido (otro orden de claves) no re-renderiza;
 *  · una llegada con contenido distinto sí.
 */
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVISOS_EVENT, AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, marcarAviso, useAviso } from "../avisos-cuenta";

const T0 = 1_800_000_000_000;

let renders = 0;
function Sonda({ id, neurona }: { id: string; neurona?: string }) {
    const s = useAviso(id, { neurona });
    renders++;
    return <div data-testid="estado">{`${s.estado ?? "nada"}:${s.hasta}`}</div>;
}

afterEach(() => {
    cleanup();
});

beforeEach(() => {
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    renders = 0;
});

describe("useAviso", () => {
    it("sin registro: se pinta «nada» y el render se estabiliza (sin bucle #185)", () => {
        const errores = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(<Sonda id="a149" />);
        expect(screen.getByTestId("estado").textContent).toBe("nada:0");
        const trasMontar = renders;
        expect(trasMontar).toBeLessThanOrEqual(2);
        // Dejar pasar el tiempo no cambia nada.
        act(() => {
            window.dispatchEvent(new Event(AVISOS_EVENT));
            window.dispatchEvent(new Event(AVISOS_EVENT));
        });
        expect(renders).toBe(trasMontar); // mismo snapshot ⇒ React no vuelve a renderizar
        expect(errores.mock.calls.some((c) => String(c[0]).includes("Maximum update depth"))).toBe(false);
        errores.mockRestore();
    });

    it("con StrictMode tampoco hay bucle y el valor es el guardado", () => {
        marcarAviso("a149", "luego", { ahora: T0, hastaMs: T0 + 50 });
        render(
            <StrictMode>
                <Sonda id="a149" />
            </StrictMode>,
        );
        expect(screen.getByTestId("estado").textContent).toBe(`luego:${T0 + 50}`);
        const n = renders;
        expect(n).toBeLessThanOrEqual(4);
        act(() => {
            window.dispatchEvent(new Event(AVISOS_EVENT));
        });
        expect(renders).toBe(n);
    });

    it("marcar OTRO aviso no re-renderiza éste; marcar el suyo sí", () => {
        marcarAviso("a", "visto", { ahora: T0 });
        render(<Sonda id="a" />);
        const n = renders;
        act(() => marcarAviso("b", "hecho", { ahora: T0 }));
        expect(renders).toBe(n);
        act(() => marcarAviso("a", "hecho", { ahora: T0 + 10 }));
        expect(renders).toBeGreaterThan(n);
        expect(screen.getByTestId("estado").textContent).toBe("hecho:0");
    });

    it("la cuenta entrega lo MISMO con otro orden de claves: no re-renderiza; entrega algo distinto: sí", () => {
        marcarAviso("a", "visto", { ahora: T0 });
        render(<Sonda id="a" />);
        const n = renders;
        const reg = JSON.parse(localStorage.getItem(AVISOS_KEY)!).ids.a;
        act(() => {
            localStorage.setItem(AVISOS_KEY, JSON.stringify({ porNeurona: {}, ids: { a: { ts: reg.ts, estado: "visto" } }, v: 1 }));
            window.dispatchEvent(new Event(AVISOS_EVENT));
        });
        expect(renders).toBe(n);
        act(() => {
            localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { a: { estado: "hecho", ts: reg.ts + 1 } }, porNeurona: {} }));
            window.dispatchEvent(new Event(AVISOS_EVENT));
        });
        expect(renders).toBeGreaterThan(n);
        expect(screen.getByTestId("estado").textContent).toBe("hecho:0");
    });

    it("el ámbito por neurona se lee por separado", () => {
        marcarAviso("nueva", "luego", { neurona: "n-1", ahora: T0, hastaMs: T0 + 9 });
        render(<Sonda id="nueva" neurona="n-1" />);
        expect(screen.getByTestId("estado").textContent).toBe(`luego:${T0 + 9}`);
    });

    it("reacciona al evento «storage» de otra pestaña", () => {
        render(<Sonda id="a" />);
        expect(screen.getByTestId("estado").textContent).toBe("nada:0");
        act(() => {
            localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { a: { estado: "visto", ts: 5 } }, porNeurona: {} }));
            window.dispatchEvent(new StorageEvent("storage", { key: AVISOS_KEY }));
        });
        expect(screen.getByTestId("estado").textContent).toBe("visto:0");
    });
});
