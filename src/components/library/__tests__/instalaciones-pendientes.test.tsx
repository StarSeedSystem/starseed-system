import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import type { DestinoInstalacion } from "@/lib/instalaciones/destinos";
import type { AccionInstalacion } from "@/lib/instalaciones/plan";

// Estado compartido con los módulos simulados (vi.hoisted: existe antes que los vi.mock).
const est = vi.hoisted(() => ({
    lista: [] as DestinoInstalacion[],
    aviso: null as null | ((ids: string[]) => void),
    sincronizaciones: 0,
    marcados: [] as { id: string; estado: string; extra?: unknown }[],
    acciones: [] as AccionInstalacion[],
}));

vi.mock("@/lib/instalaciones/instalaciones-store", () => ({
    useInstalaciones: () => est.lista,
    sincronizarInstalaciones: async () => {
        est.sincronizaciones += 1;
        return est.lista;
    },
    alPedirInstalacion: (cb: (ids: string[]) => void) => {
        est.aviso = cb;
        return () => {
            est.aviso = null;
        };
    },
    marcarDestino: (id: string, estado: string, extra?: unknown) => {
        est.marcados.push({ id, estado, extra });
    },
}));

vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "yo" }));

vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({
    useDispositivoActual: () => ({ sistema: "android", arquitectura: "arm64" }),
    esAppNativa: () => false,
}));

// La versión viva se sustituye por el respaldo (sin red en las pruebas).
vi.mock("@/lib/apps-oficiales/ultima-version", async () => {
    const real = await vi.importActual<typeof import("@/lib/apps-oficiales/apps-oficiales")>("@/lib/apps-oficiales/apps-oficiales");
    return {
        useUltimaVersion: (id: string) => {
            const app = real.APPS_OFICIALES[id];
            return app
                ? { release: app.respaldo, instalables: real.instalables(app.respaldo.assets), origen: "respaldo", cargando: false }
                : { release: null, instalables: [], origen: "respaldo", cargando: false };
        },
    };
});

vi.mock("@/lib/instalaciones/ejecutar", () => ({
    ejecutarAcciones: (_app: unknown, acciones: AccionInstalacion[]) => {
        est.acciones.push(...acciones);
        return { descargaIniciada: acciones.some((a) => a.tipo === "descargar"), errores: [] };
    },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { InstalacionesPendientes } from "../instalaciones-pendientes";

function pedido(parcial: Partial<DestinoInstalacion> & { id: string }): DestinoInstalacion {
    return {
        appId: "omnifrecuencias",
        appNombre: "Omnifrecuencias",
        tipo: "neurona",
        neuronaId: "yo",
        estado: "pedida",
        pedidaDesde: "MacBook",
        creada: 1,
        actualizada: 1,
        ...parcial,
    };
}

function montar() {
    return render(
        <AppearanceProvider>
            <InstalacionesPendientes />
        </AppearanceProvider>,
    );
}

beforeEach(() => {
    est.lista = [];
    est.aviso = null;
    est.sincronizaciones = 0;
    est.marcados = [];
    est.acciones = [];
});

afterEach(() => cleanup());

describe("InstalacionesPendientes", () => {
    it("sin pedidos para esta neurona no pinta nada, pero sincroniza al montar", async () => {
        est.lista = [pedido({ id: "a", neuronaId: "otra" }), pedido({ id: "b", estado: "descargada" })];
        await act(async () => {
            montar();
        });
        expect(screen.queryByRole("region", { name: /Instalaciones pedidas/ })).toBeNull();
        expect(est.sincronizaciones).toBe(1);
    });

    it("un aviso de la cuenta solo resincroniza si es para ESTA neurona", async () => {
        await act(async () => {
            montar();
        });
        await act(async () => est.aviso?.(["otra"]));
        expect(est.sincronizaciones).toBe(1);
        await act(async () => est.aviso?.(["otra", "yo"]));
        expect(est.sincronizaciones).toBe(2);
    });

    it("muestra «X pidió instalar Y aquí» e «Instalar aquí» sigue el camino de este dispositivo", async () => {
        est.lista = [pedido({ id: "p1", perfilNombre: "Arte" })];
        await act(async () => {
            montar();
        });
        expect(screen.getByRole("region", { name: "Instalaciones pedidas desde otras neuronas" })).toBeTruthy();
        expect(screen.getByText("MacBook pidió instalar Omnifrecuencias aquí")).toBeTruthy();
        expect(screen.getByText(/APK \(Android\).*Perfil: Arte\./)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /Instalar aquí/ }));
        expect(est.acciones.map((a) => a.tipo)).toEqual(["descargar", "anadir-lanzador"]);
        expect(est.acciones[0]).toMatchObject({ archivo: "OmniFrequency.apk", via: "enlace" });
        expect(est.marcados).toEqual([
            {
                id: "p1",
                estado: "descargada",
                extra: { medio: "descarga", archivo: "OmniFrequency.apk", version: "v2.0.0", carpeta: "Descargas del navegador" },
            },
        ]);
    });

    it("«Ahora no» cancela el pedido sin ejecutar nada", async () => {
        est.lista = [pedido({ id: "p2", appId: "cafe", appNombre: "StarSeed Café" })];
        await act(async () => {
            montar();
        });
        expect(screen.getByText(/Se añadirá a tu Lanzador/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Ahora no/ }));
        expect(est.marcados).toEqual([{ id: "p2", estado: "cancelada", extra: undefined }]);
        expect(est.acciones).toEqual([]);
    });

    it("con más de tres pedidos enseña tres tarjetas y cuántos quedan", async () => {
        est.lista = ["1", "2", "3", "4", "5"].map((id) => pedido({ id }));
        await act(async () => {
            montar();
        });
        expect(screen.getAllByRole("button", { name: /Instalar aquí/ })).toHaveLength(3);
        expect(screen.getByText("…y 2 más esperando")).toBeTruthy();
    });
});
