import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Radar de malla con el estado REAL que publica el
// motor único de la malla (solo lectura, cero peticiones propias).
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let estado: any = { misDispositivos: [], cercanas: [], loading: true };
vi.mock("@/lib/network/malla-neuronas", () => ({ useMallaNeuronasEstado: () => estado }));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { MeshRadarWidget, resumenMalla } from "../mesh-radar-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#94a3b8", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

const vivo = {
    loading: false,
    misDispositivos: [
        { neuronId: "n1", nombre: "Mac de Alex", plataforma: "macOS", tipo: "laptop", online: true, esEsteDispositivo: true, enlace: { estado: "sin-vinculo" } },
        { neuronId: "n2", nombre: "Móvil", plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "conectado", ruta: { clase: "misma-red-local", rttMs: 12.4, tipoLocal: null, tipoRemoto: null, protocolo: "udp", bytesEnviados: 0, bytesRecibidos: 0, medidoEn: 0 } } },
        { neuronId: "n3", nombre: "Servidor casa", plataforma: "Linux", tipo: "server", online: false, esEsteDispositivo: false, enlace: { estado: "fallido", motivo: "sin respuesta" } },
    ],
    cercanas: [{ deviceId: "x1", etiqueta: "Neurona de la Sangha", detectadaHaceMs: 5 * 60_000, ofreceInternetPublico: true }],
};

beforeEach(() => { estado = vivo; });
afterEach(() => { cleanup(); });

describe("malla (puros)", () => {
    it("resume tus enlaces y las cercanas", () => {
        expect(resumenMalla(vivo as any)).toEqual({ mias: 3, enlazadas: 1, enLinea: 1, cercanas: 1, fallidas: 1 });
    });
});

describe("Radar de malla", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("pinta tu malla real en %s", async (clase) => {
        render(enMarco(clase, <MeshRadarWidget />));
        expect((await screen.findAllByLabelText(/1 de 2 neuronas tuyas enlazadas; 1 neurona cercana/)).length).toBeGreaterThan(0);
    });
    it("en l enseña ruta, latencia y el motivo del fallo", async () => {
        render(enMarco("l", <MeshRadarWidget />));
        expect(await screen.findByText(/misma red local · 12 ms/)).toBeInTheDocument();
        expect(screen.getByText(/fallo de enlace · sin respuesta/)).toBeInTheDocument();
        expect(screen.getAllByText("Neurona de la Sangha").length).toBeGreaterThan(0);
    });
    it("cargando: lo dice sin inventar; vacío: solo este dispositivo", async () => {
        estado = { misDispositivos: [], cercanas: [], loading: true };
        const { unmount } = render(enMarco("m", <MeshRadarWidget />));
        expect(await screen.findByText(/Buscando tu malla…/)).toBeInTheDocument();
        unmount();
        estado = { misDispositivos: [vivo.misDispositivos[0]], cercanas: [], loading: false };
        render(enMarco("m", <MeshRadarWidget />));
        expect(await screen.findByText("Solo este dispositivo, por ahora")).toBeInTheDocument();
    });
});
