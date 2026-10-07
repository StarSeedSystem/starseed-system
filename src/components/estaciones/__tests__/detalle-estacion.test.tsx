import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Estacion } from "@/lib/estaciones/tipos";

const datos = vi.hoisted(() => ({ obtener: vi.fn() }));
const internas = vi.hoisted(() => ({ listar: vi.fn() }));

vi.mock("@/lib/estaciones/datos", () => ({
    obtenerEstacion: datos.obtener,
}));
vi.mock("@/lib/estaciones/internas", () => ({
    estacionesInternas: internas.listar,
}));

import { DetalleEstacion } from "../detalle-estacion";

function base(): Estacion {
    return {
        id: "est-1", owner_id: "u1", ambito_tipo: "persona", entidad_ref: null,
        titulo: "Radio libre", descripcion: "Música libre en directo.",
        tipo: "audio", fuente: "enlace", enlace: "https://radio.ejemplo.fm/stream",
        formato: "", imagen: null, idioma: "es", categorias: [], licencia: "propia-abierta",
        visibilidad: "publica", empieza_en: null, termina_en: null,
        ultimo_latido: new Date().toISOString(), pausada: false, en_malla: false,
        espectadores: 7, created_at: "", updated_at: "",
    } as Estacion;
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("<DetalleEstacion />", () => {
    beforeEach(() => { internas.listar.mockResolvedValue([]); });

    it("carga la estación y aplica ReproductorEstacion (audio nativo con barra compacta)", async () => {
        datos.obtener.mockResolvedValue(base());
        const { container } = render(<DetalleEstacion id="est-1" />);
        await waitFor(() => expect(screen.getByText("Radio libre")).toBeTruthy());
        const audio = container.querySelector("audio");
        expect(audio?.getAttribute("src")).toBe("https://radio.ejemplo.fm/stream");
        expect(screen.getByTestId("barra-audio")).toBeTruthy();
        expect(screen.getByText(/7 espectadores/)).toBeTruthy();
    });

    it("reserva interna: si la tabla no la tiene, busca en las fuentes internas", async () => {
        datos.obtener.mockResolvedValue(null);
        internas.listar.mockResolvedValue([base()]);
        render(<DetalleEstacion id="est-1" />);
        await waitFor(() => expect(screen.getByText("Radio libre")).toBeTruthy());
    });

    it("id desconocido: avisa y ofrece volver al directorio", async () => {
        datos.obtener.mockResolvedValue(null);
        render(<DetalleEstacion id="no-esta" />);
        await waitFor(() => expect(screen.getByText(/ya no existe/)).toBeTruthy());
        expect(screen.getByText(/Volver al directorio/).getAttribute("href")).toBe("/estaciones");
    });
});
