// @vitest-environment-options {"url": "https://starseed-os.vercel.app/metagenesis"}
/**
 * ColmenaBotones — botones por nodo: desconectar, contenedor e instalar trabajador.
 * Se muestra dependiendo del estado del nodo: trabajo en curso, contenedor activo,
 * y si tiene trabajador o no.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { EstadoAutonomo } from "@/lib/metagenesis/remoto-nodos";
import type { NodoVista, AccionOrden } from "@/lib/metagenesis/remoto-nodos";
import { within } from "@testing-library/react";

const AHORA = Date.now();

const enviarOrden = vi.fn(async (accion: string, nodo: string) => ({ ok: true, clave: "nonce-1", modo: "bus" }));

vi.mock("@/lib/metagenesis/accesos", () => ({
    miAccesoMetaGenesis: async () => ({ miembro: true, dueno: false }),
}));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({
    leerEstadoAutonomo: async () => null,
    enviarOrden: (...a: unknown[]) => Promise.resolve({ ok: true, clave: "nonce-1", modo: "bus" }),
}));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));

import { AppearanceProvider } from "@/context/appearance-context";
import { ColmenaBotones } from "../colmena-botones";

function nodoVistaPrueba(extra: Partial<NodoVista> = {}): NodoVista {
    return {
        nodo: "oracle-a1-bbbbbb",
        medio: "oracle-a1",
        etiqueta: "Oracle A1 (24/7)",
        modo: "real",
        vivo: true,
        lider: true,
        hace_ms: 40_000,
        puntos: 1250,
        orquestadores: ["cola-relevo-x"],
        caidos: [],
        disco_gb: 80,
        ram_libre_mb: 9000,
        trabajo: {},
        enCurso: [],
        contenedor: null,
        ...extra,
    };
}

function pintar(nodo: NodoVista) {
    return render(
        <AppearanceProvider>
            <ColmenaBotones
                nodo={nodo}
                enVuelo={false}
                mandarOrden={async (accion: AccionOrden, nodo?: string) => {
                    await enviarOrden(accion, nodo!);
                }}
            />
        </AppearanceProvider>,
    );
}

describe("ColmenaBotones", () => {
    beforeEach(() => {
        enviarOrden.mockClear();
    });
    afterEach(() => cleanup());

    it("muestra el botón de desconectar cuando hay trabajo en curso", async () => {
        const nodoConTrabajo = nodoVistaPrueba({
            enCurso: [
                {
                    id: "task-1",
                    fase: "escribiendo",
                    punto: {
                        rama: "main",
                        sha: "abc123",
                        t: Date.now() - 5 * 60_000,
                    },
                },
            ],
        });
        pintar(nodoConTrabajo);
        const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-desconectar");
        expect(botonDesconectar).toBeInTheDocument();
        expect(botonDesconectar).toHaveTextContent("Desconectar");
        expect(botonDesconectar).not.toBeDisabled();
        expect(botonDesconectar).toHaveAttribute(
            "title",
            "Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
        );
    });

    it("muestra el botón de usar como contenedor cuando el nodo puede ser contenedor", async () => {
        const nodoConContenedor = nodoVistaPrueba({
            contenedor: {
                activo: false,
                agentes: 2,
                apto: true,
                motivo: "Listo para trabajar",
            },
        });
        pintar(nodoConContenedor);
        const botonContenedor = await screen.findByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-contenedor");
        expect(botonContenedor).toBeInTheDocument();
        expect(botonContenedor).toHaveTextContent("Dejar de usar como contenedor");
        expect(botonContenedor).not.toBeDisabled();
        expect(botonContenedor).toHaveAttribute("title", "Termina lo que lleva y no coge más.");
    });

    it("muestra información de tarea a medias cuando existe", async () => {
        const nodoConTrabajo = nodoVistaPrueba({
            enCurso: [
                {
                    id: "task-1",
                    fase: "escribiendo",
                    punto: {
                        rama: "main",
                        sha: "abc123",
                        t: Date.now() - 5 * 60_000,
                    },
                },
            ],
        });
        pintar(nodoConTrabajo);
        const tiempoInfo = await screen.findByText(/Último punto hace 5 min/);
        expect(tiempoInfo).toBeInTheDocument();
    });

    it("muestra el botón de instalar trabajador cuando el nodo no tiene trabajador", async () => {
        const nodoSinTrabajador = nodoVistaPrueba({
            trabajo: {},
        });
        pintar(nodoSinTrabajador);
        const botonInstalarTrabajador = await screen.findByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-trabajador");
        expect(botonInstalarTrabajador).toBeInTheDocument();
        expect(botonInstalarTrabajador).toHaveTextContent("Instalar trabajador");
        expect(botonInstalarTrabajador).not.toBeDisabled();
        expect(botonInstalarTrabajador).toHaveAttribute("title", "Instala un trabajador (agente) en este contenedor.");
    });

    it("envía orden desconectar al hacer clic en el botón", async () => {
        const nodoConTrabajo = nodoVistaPrueba({
            enCurso: [
                {
                    id: "task-1",
                    fase: "escribiendo",
                    punto: {
                        rama: "main",
                        sha: "abc123",
                        t: Date.now() - 5 * 60_000,
                    },
                },
            ],
        });
        pintar(nodoConTrabajo);
        const botonDesconectar = await screen.findByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-desconectar");
        fireEvent.click(botonDesconectar);
        await waitFor(() => {
            expect(enviarOrden).toHaveBeenCalledWith("desconectar", "oracle-a1-bbbbbb");
        });
    });

    it("envía orden contenedor al hacer clic en el botón", async () => {
        const nodoConContenedor = nodoVistaPrueba({
            contenedor: {
                activo: false,
                agentes: 2,
                apto: true,
                motivo: "Listo para trabajar",
            },
        });
        pintar(nodoConContenedor);
        const botonContenedor = await screen.findByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-contenedor");
        fireEvent.click(botonContenedor);
        await waitFor(() => {
            expect(enviarOrden).toHaveBeenCalledWith("contenedor", "oracle-a1-bbbbbb");
        });
    });

    it("desactiva el botón de desconectar cuando no hay trabajo en curso", async () => {
        const nodoSinTrabajo = nodoVistaPrueba({
            enCurso: [],
            trabajo: {},
        });
        pintar(nodoSinTrabajo);
        expect(screen.queryByTestId("mg-nodo-oracle-oracle-a1-bbbbbb-desconectar")).not.toBeInTheDocument();
    });
});
