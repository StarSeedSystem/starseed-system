// @vitest-environment jsdom
/**
 * BotonesLlamada — botones redondos de la cabecera del chat. Las acciones van mockeadas.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    empezar: vi.fn(async () => true),
    minimizar: vi.fn(),
    activa: null as null | { hiloId: string; motor: { cerrada: boolean } },
}));

vi.mock("@/lib/llamadas/acciones", () => ({
    empezarLlamada: h.empezar,
    minimizarLlamada: h.minimizar,
}));

vi.mock("@/lib/llamadas/store", () => ({
    useLlamadas: () => ({ activa: h.activa, timbres: [], hosts: 1 }),
}));

import { BotonesLlamada } from "@/components/llamadas/botones-llamada";

beforeEach(() => {
    h.empezar.mockClear();
    h.minimizar.mockClear();
    h.activa = null;
});

afterEach(() => cleanup());

describe("BotonesLlamada", () => {
    it("voz y vídeo como botones redondos accesibles", () => {
        render(<BotonesLlamada hiloId="h1" miembros={["a", "b"]} titulo="Ana" />);
        const voz = screen.getByRole("button", { name: "Llamada de voz" });
        const video = screen.getByRole("button", { name: "Videollamada" });
        expect(voz).toHaveClass("ss-redondo", "cursor-pointer");
        expect(video).toHaveClass("ss-redondo");
        expect(screen.getByRole("button", { name: /salas VR y AR/ })).toBeInTheDocument();
        fireEvent.click(video);
        expect(h.empezar).toHaveBeenCalledWith({ hiloId: "h1", tipo: "video", titulo: "Ana", miembros: ["a", "b"] });
    });

    it("compacto: un solo botón «Llamar»", () => {
        render(<BotonesLlamada hiloId="h1" miembros={["a", "b"]} titulo="Ana" compacto />);
        expect(screen.getByRole("button", { name: /Llamar: elegir tipo de llamada/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Videollamada" })).toBeNull();
    });

    it("con una llamada de este chat en marcha ofrece volver a ella", () => {
        h.activa = { hiloId: "h1", motor: { cerrada: false } };
        render(<BotonesLlamada hiloId="h1" miembros={["a", "b"]} titulo="Ana" />);
        fireEvent.click(screen.getByRole("button", { name: "Volver a la llamada en curso" }));
        expect(h.minimizar).toHaveBeenCalledWith(false);
        expect(screen.getByText("Volver a la llamada")).toBeInTheDocument();
    });
});
