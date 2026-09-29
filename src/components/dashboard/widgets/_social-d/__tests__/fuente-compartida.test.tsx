import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useFuenteCompartida, _reiniciarFuentesParaPruebas, CADENCIA_MINIMA_MS } from "../fuente-compartida";

let lecturas = 0;
async function cargar() {
    lecturas += 1;
    return { datos: [1, 2, 3] };
}

function Uso({ n }: { n: number }) {
    const f = useFuenteCompartida<number[]>("prueba:compartida", cargar, { intervaloMs: 1000 });
    return <span data-testid={`u${n}`}>{f.cargando ? "cargando" : `${f.datos?.length ?? 0}`}</span>;
}

beforeEach(() => { _reiniciarFuentesParaPruebas(); lecturas = 0; });
afterEach(() => cleanup());

describe("fuente compartida", () => {
    it("tres instancias, UNA lectura; y nunca menos de 5 min de cadencia", async () => {
        render(<><Uso n={1} /><Uso n={2} /><Uso n={3} /></>);
        await waitFor(() => expect(screen.getByTestId("u3")).toHaveTextContent("3"));
        expect(screen.getByTestId("u1")).toHaveTextContent("3");
        expect(lecturas).toBe(1);
        expect(CADENCIA_MINIMA_MS).toBe(300_000);
    });
    it("al volver a montar pinta lo último sin volver a leer si no caducó", async () => {
        const { unmount } = render(<Uso n={1} />);
        await waitFor(() => expect(screen.getByTestId("u1")).toHaveTextContent("3"));
        unmount();
        render(<Uso n={2} />);
        expect(screen.getByTestId("u2")).toHaveTextContent("3");
        await new Promise((r) => setTimeout(r, 20));
        expect(lecturas).toBe(1);
    });
});
