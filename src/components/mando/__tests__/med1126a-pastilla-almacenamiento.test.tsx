/**
 * MED1126A: el medidor «almacenamiento» se abre con datos simulados de los nodos
 * (Mac, Maggabox interno y externo, A1, Drive) y enseña una fila por nodo con su
 * libre, su total y su rol. La pastilla del pulso que lo abre vive en
 * `centro-mando.tsx` (parte 1) y no se monta aquí: esta prueba cubre lo que
 * recibe al pulsarla.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelMedidor } from "@/components/mando/medidor-abrible";
import {
    detalleDeMedidor,
    filasDeAlmacenamiento,
    leerNodosAlmacenamiento,
    resumenDeAlmacenamiento,
    type DatosMedidores,
    type DetalleMedidor,
} from "@/lib/mando/medidores";

const crudo = {
    nodos: [
        { nodoId: "mac-alex", medio: "mac", discoLibreGb: 13, discoTotalGb: 228.3 },
        {
            nodoId: "maggabox-interno",
            medio: "linux",
            discoLibreGb: 397,
            discoTotalGb: 453,
            rol: "principal",
        },
        {
            nodoId: "maggabox-externo",
            medio: "linux",
            discoLibreGb: 120,
            discoTotalGb: 900,
            rol: "secundario: respaldos y datos no fundamentales",
        },
        { nodoId: "oracle-a1", medio: "nube", discoLibreGb: 9.1 },
        { nodoId: "drive", medio: "drive", usoGb: 0, discoTotalGb: 2048 },
        { nodoId: "sin-dato", medio: "linux" },
    ],
};

const nodos = leerNodosAlmacenamiento(crudo);

describe("medidor almacenamiento · datos simulados", () => {
    it("descarta el nodo sin ninguna cifra y conserva el resto", () => {
        expect(nodos.map((n) => n.id)).not.toContain("sin-dato");
        expect(nodos).toHaveLength(5);
    });

    it("Maggabox interno y externo salen como filas propias con su rol", () => {
        const filas = filasDeAlmacenamiento(nodos);
        const magga = filas.filter((f) => f.titulo === "Maggabox");
        expect(magga).toHaveLength(2);
        expect(magga.find((f) => f.id === "maggabox-interno")?.detalle?.rol).toBe("principal");
        expect(magga.find((f) => f.id === "maggabox-externo")?.porque).toContain("secundario");
    });

    it("el resumen nombra a la Maggabox con su libre", () => {
        expect(resumenDeAlmacenamiento(nodos)).toContain("Maggabox (397 GB de 453 GB)");
    });

    it("sin nodos el resumen dice «sin dato»", () => {
        expect(resumenDeAlmacenamiento([])).toBe("sin dato");
    });

    it("detalleDeMedidor('almacenamiento') arma la ventana con una fila por nodo", () => {
        const d = { almacenamiento: { nodos } } as unknown as DatosMedidores;
        const detalle = detalleDeMedidor("almacenamiento", d);
        expect(detalle.titulo).toBe("Almacenamiento");
        expect(detalle.filas).toHaveLength(5);
    });
});

describe("PanelMedidor abre el medidor almacenamiento", () => {
    const fetchOriginal = globalThis.fetch;
    const detalle: DetalleMedidor = {
        clave: "almacenamiento",
        titulo: "Almacenamiento",
        resumen: resumenDeAlmacenamiento(nodos),
        filas: filasDeAlmacenamiento(nodos),
        acciones: [],
        vacio: "Ningún nodo declara disco libre.",
    };

    beforeEach(() => {
        globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
            const url = String(entrada);
            if (url.includes("/api/mando/comprobar")) {
                return new Response(JSON.stringify({ comprobacion: null }), { status: 200 });
            }
            return new Response(JSON.stringify({ detalle }), { status: 200 });
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        cleanup();
        globalThis.fetch = fetchOriginal;
    });

    it("pinta la lista de nodos con la Maggabox interna y la externa", async () => {
        render(<PanelMedidor clave="almacenamiento" alCerrar={() => undefined} />);
        const lista = await screen.findByTestId("medidor-almacenamiento");
        expect(within(lista).getAllByText("Maggabox")).toHaveLength(2);
        expect(within(lista).getByText("Mac")).toBeInTheDocument();
        expect(within(lista).getByText("A1")).toBeInTheDocument();
        expect(within(lista).getByText("Drive")).toBeInTheDocument();
    });
});
