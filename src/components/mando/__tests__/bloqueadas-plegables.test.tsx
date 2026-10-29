/**
 * UIG1029C: «Bloqueadas y rechazadas» por causa, cada causa en su sección plegable
 * con su número y la acción automática que la trata; «Cerrar lista» arriba; la misma
 * vista en el medidor y en Ramificación.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { BloqueadasGrupos, agruparPorCausa } from "@/components/mando/bloqueadas-grupos";
import { SeccionBloqueadasReintentos } from "@/components/mando/ramificacion-agentes";
import type { DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";

const filas: FilaMedidor[] = [
    { id: "A1", titulo: "dependencia uno", estado: "bloqueada", porque: "dependencia no integrada: Z1", grupo: "atascada", acciones: [] },
    { id: "A2", titulo: "dependencia dos", estado: "bloqueada", porque: "dependencia no integrada: Z1", grupo: "atascada", acciones: [] },
    { id: "A3", titulo: "dependencia tres", estado: "bloqueada", porque: "dependencia no integrada: Z1", grupo: "atascada", acciones: [] },
    { id: "F1", titulo: "falla de tipos", estado: "fallo_tsc", porque: "la rehace F1b (en_curso)", grupo: "sin-resolver", acciones: [] },
    { id: "F2", titulo: "no tocó nada", estado: "rechazada", porque: "rechazada sin decisión de nadie y sin sucesora: no tocó sus archivos", grupo: "sin-resolver", acciones: [] },
];

const detalle: DetalleMedidor = {
    clave: "bloqueadas",
    titulo: "Bloqueadas",
    resumen: "5 paradas por causa",
    filas,
    acciones: [],
};

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

describe("agruparPorCausa", () => {
    it("agrupa por causa, la más numerosa primero y con la acción automática", () => {
        const grupos = agruparPorCausa(filas);
        expect(grupos.map((g) => g.causa)).toEqual([
            "dependencia no integrada: Z1",
            "en reparación por una sucesora",
            "rechazada sin decisión de nadie y sin sucesora: no tocó sus archivos",
        ]);
        expect(grupos[0].filas.map((f) => f.id)).toEqual(["A1", "A2", "A3"]);
        expect(grupos[1].automatica).toBe("la rehace F1b");
        expect(grupos[2].automatica).toBeUndefined();
    });

    it("junta varias reparaciones bajo su causa y las cuenta", () => {
        const grupos = agruparPorCausa([
            { id: "X1", titulo: "x1", porque: "la rehace X1b (pendiente)", acciones: [] },
            { id: "X2", titulo: "x2", porque: "la rehace X2b (en_curso)", acciones: [] },
        ]);
        expect(grupos).toHaveLength(1);
        expect(grupos[0].causa).toBe("en reparación por una sucesora");
        expect(grupos[0].automatica).toBe("2 reparaciones automáticas en marcha");
    });
});

describe("Bloqueadas y rechazadas plegables", () => {
    it("una sección por causa: la mayor abierta, las demás cerradas con su número y su auto", () => {
        render(<BloqueadasGrupos detalle={detalle} />);
        const top = screen.getByRole("region", { name: "Lista por causa" });
        expect(within(top).getAllByRole("button", { name: /Cerrar lista/ })[0]).toBeInTheDocument();

        const mayor = screen.getByRole("region", { name: "dependencia no integrada: Z1" });
        expect(within(mayor).getByText("3")).toBeInTheDocument();
        expect(within(mayor).getByText("dependencia uno")).toBeInTheDocument();

        const repara = screen.getByRole("region", { name: "en reparación por una sucesora" });
        expect(within(repara).getByRole("button", { name: /Abrir lista/ })).toBeInTheDocument();
        expect(within(repara).getByText(/auto: la rehace F1b/)).toBeInTheDocument();
        expect(within(repara).getByText(/1 tarea · F1/)).toBeInTheDocument();

        const rechazo = screen.getByRole("region", { name: /rechazada sin decisión/ });
        expect(within(rechazo).getByText(/1 tarea · F2/)).toBeInTheDocument();
    });

    it("«Cerrar lista» arriba pliega todas las causas y deja el resumen", () => {
        render(<BloqueadasGrupos detalle={detalle} />);
        const botones = screen.getAllByRole("button", { name: /Cerrar lista/ });
        fireEvent.click(botones[0]);
        expect(screen.queryByTestId("bloqueadas-atascadas")).not.toBeInTheDocument();
        expect(screen.getByText("5 paradas por causa")).toBeInTheDocument();
    });

    it("el medidor y Ramificación pintan la misma vista por causa", () => {
        const primera = render(<BloqueadasGrupos detalle={detalle} />);
        expect(screen.getByRole("region", { name: "Lista por causa" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "dependencia no integrada: Z1" })).toBeInTheDocument();
        primera.unmount();

        render(<SeccionBloqueadasReintentos olas={[]} onVer={() => {}} onHecho={() => {}} detalle={detalle} />);
        const seccion = screen.getByTestId("seccion-bloqueadas-reintentos");
        expect(within(seccion).getByRole("region", { name: "Lista por causa" })).toBeInTheDocument();
        expect(within(seccion).getByRole("region", { name: "dependencia no integrada: Z1" })).toHaveTextContent("dependencia uno");
    });
});
