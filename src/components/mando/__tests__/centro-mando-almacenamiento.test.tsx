import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const detalleAlmacenamiento: DetalleMedidor = {
    clave: "almacenamiento",
    titulo: "Almacenamiento",
    resumen: "Nodos con disco libre: Mac (13 GB), Maggabox (397 GB), A1 (9.1 GB)",
    filas: [
        { id: "mac-local", titulo: "Mac", estado: "bajo", porque: "13 GB de 228 GB libres", detalle: { discoLibres: 13, discoTotalGb: 228, origen: "mac", almacen: [] }, acciones: [] },
        { id: "maggabox:interno", titulo: "Maggabox · interno (principal)", estado: "libre", porque: "397 GB de 453 GB libres", detalle: { discoLibres: 397, discoTotalGb: 453, origen: "linux", almacen: ["/"] }, acciones: [] },
        { id: "maggabox:disco-externo", titulo: "Maggabox · disco externo (secundario)", estado: "libre", porque: "418 GB de 500 GB libres", detalle: { discoLibres: 418, discoTotalGb: 500, origen: "linux", almacen: ["/srv/starseed-almacen"] }, acciones: [] },
        { id: "a1-oracle", titulo: "A1", estado: "libre", porque: "9.1 GB libres", detalle: { discoLibres: 9.1, origen: "nube", almacen: [] }, acciones: [] },
        { id: "drive", titulo: "Drive", estado: "libre", porque: "StarSeed usa 0 GB de 2048 GB", detalle: { usoGb: 0, discoTotalGb: 2048, origen: "nube", almacen: [] }, acciones: [] },
    ],
    acciones: [],
};

const fetchSimulado = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    if (url.includes("clave=almacenamiento")) {
        return new Response(JSON.stringify({ detalle: detalleAlmacenamiento }), { status: 200 });
    }
    if (url.includes("claves=")) {
        return new Response(JSON.stringify({ detalles: {} }), { status: 200 });
    }
    if (url.includes("/api/mando/estado")) {
        return new Response(
            JSON.stringify({
                olas: [],
                latidos: [],
                fila: [],
                uso: [],
                enjambres: [],
                repo: { sinPush: 0 },
                relevo: { eventos: [] },
                cuentas: {
                    ola: null,
                    integradas: 0,
                    enCurso: 0,
                    fallidas: 0,
                    pendientes: 0,
                    ultimas: { olas: 0, integradas: 0, esperandoAprobacion: 0 },
                },
            }),
            { status: 200 },
        );
    }
    throw new Error("sin datos en esta prueba");
});

vi.stubGlobal("fetch", fetchSimulado);

const { CentroMando } = await import("../centro-mando");

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

describe("MED1126A · pastilla de almacenamiento en el pulso", () => {
    it("aparece con los datos de la Maggabox y abre el medidor al pulsarla", async () => {
        render(
            <AppearanceProvider>
                <CentroMando />
            </AppearanceProvider>,
        );

        const pastilla = await screen.findByRole("button", { name: /Nodos y almacenamiento/i });
        expect(pastilla).toHaveTextContent("Maggabox 397 GB libres");
        expect(pastilla).toHaveTextContent(/Mac 13 GB/);

        fireEvent.click(pastilla);

        expect(await screen.findByTestId("medidor-almacenamiento")).toBeInTheDocument();
    });
});
