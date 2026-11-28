// @vitest-environment-options {"url": "http://127.0.0.1:47610/genesis"}
/**
 * ConsolaMetaGenesis dentro de /genesis: monta MetaGenesisAutonoma junto con MetaGenesisRemoto
 * para que sea operable en cualquier neurona, Oracle A1 y entornos dev/prod aun sin la Mac.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/metagenesis/accesos", () => ({
    miAccesoMetaGenesis: async () => ({ miembro: true, dueno: true }),
}));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => ({
        ok: true,
        estado: {
            modo: "bus",
            lider: "oracle-a1",
            termino: 4,
            autonomia: true,
            nodos: [
                {
                    nodo: "oracle-a1",
                    medio: "oracle-a1",
                    etiqueta: "Oracle A1 (24/7)",
                    modo: "real",
                    vivo: true,
                    lider: true,
                    hace_ms: 10_000,
                    puntos: 1500,
                    orquestadores: ["cola-a1"],
                    caidos: [],
                    disco_gb: 80,
                    ram_libre_mb: 10_000,
                    trabajo: {},
                    enCurso: [],
                    contenedor: null,
                },
            ],
            medidores: {},
            decisiones: [],
            ordenes: [],
            fotoHaceMs: 10_000,
            liderSeco: false,
        },
    }),
    enviarOrden: async () => ({ ok: true, clave: "k", modo: "bus" }),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));
vi.mock("@/lib/metagenesis/motor", () => ({
    proveedorTokenDeLaSesion: () => async () => "token-prueba",
    leerMotor: async () => ({ ok: true, fila: null }),
    sondearMotor: async () => ({ ok: false, tipo: "sin-respuesta" }),
}));
vi.mock("@/lib/mando/guardia-fetch", () => ({
    ponerModoRemoto: () => {},
    fetchSinGuardia: () => fetch,
}));
vi.mock("@/components/mando/centro-mando", () => ({
    CentroMando: () => <div data-testid="centro-mando-stub" />,
}));
vi.mock("@/components/mando/crear-enjambre", () => ({
    CrearEnjambre: () => <div data-testid="crear-enjambre-stub" />,
}));

import { AppearanceProvider } from "@/context/appearance-context";
import { ConsolaMetaGenesis } from "../consola-metagenesis";

describe("ConsolaMetaGenesis", () => {
    afterEach(() => cleanup());

    it("muestra la consola autónoma y sus medios activos aun sin la Mac encendida", async () => {
        render(
            <AppearanceProvider>
                <ConsolaMetaGenesis />
            </AppearanceProvider>,
        );
        expect(await screen.findByTestId("metagenesis-autonoma")).toBeInTheDocument();
        expect(await screen.findByTestId("mg-medios-desarrollo")).toBeInTheDocument();
        expect(await screen.findByText(/MetaGenesis sigue operando arriba desde esta neurona/)).toBeInTheDocument();
    });
});
