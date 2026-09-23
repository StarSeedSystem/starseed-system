import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
    CLAVE_VOZ_RT,
    FRASE_PRUEBA_VOZ_RT,
    SelectorVozRT,
} from "../selector-voz-rt";

const voces = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"];
const fetchSimulado = vi.fn<typeof fetch>();
const reproducir = vi.fn(() => Promise.resolve());
const crearUrl = vi.fn(() => "blob:voz-prueba");

class AudioFalso {
    constructor(readonly src: string) {}
    addEventListener(): void {}
    play = reproducir;
}

function json(datos: unknown, ok = true): Response {
    return { ok, json: vi.fn().mockResolvedValue(datos) } as unknown as Response;
}

function audio(): Response {
    return { ok: true, blob: vi.fn().mockResolvedValue(new Blob(["wav"])) } as unknown as Response;
}

beforeEach(() => {
    window.localStorage.clear();
    fetchSimulado.mockReset();
    reproducir.mockClear();
    crearUrl.mockClear();
    vi.stubGlobal("fetch", fetchSimulado);
    vi.stubGlobal("Audio", AudioFalso);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: crearUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("SelectorVozRT", () => {
    it("carga y muestra las diez voces con sus etiquetas", async () => {
        fetchSimulado.mockResolvedValueOnce(json({ listo: true, voces }));

        render(<SelectorVozRT />);

        expect(await screen.findByText("Femenina 1")).toBeInTheDocument();
        expect(screen.getByText("Masculina 5")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /^Probar / })).toHaveLength(10);
        expect(fetchSimulado).toHaveBeenCalledWith(
            "/api/voz-rt/status",
            expect.objectContaining({ cache: "no-store" }),
        );
    });

    it("guarda la voz elegida para la conversación", async () => {
        fetchSimulado.mockResolvedValueOnce(json({ listo: true, voces }));
        render(<SelectorVozRT />);
        await screen.findByText("Masculina 3");

        fireEvent.click(screen.getByRole("button", { name: "Usar Masculina 3" }));

        expect(window.localStorage.getItem(CLAVE_VOZ_RT)).toBe("M3");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Masculina 3 será la voz de las conversaciones.",
        );
    });

    it("pide la muestra indicada y reproduce el audio devuelto", async () => {
        fetchSimulado
            .mockResolvedValueOnce(json({ listo: true, voces }))
            .mockResolvedValueOnce(audio());
        render(<SelectorVozRT />);
        await screen.findByText("Femenina 2");

        fireEvent.click(screen.getByRole("button", { name: "Probar Femenina 2" }));

        await waitFor(() => expect(reproducir).toHaveBeenCalledOnce());
        expect(fetchSimulado).toHaveBeenNthCalledWith(2, "/api/voz-rt/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texto: FRASE_PRUEBA_VOZ_RT, voz: "F2" }),
        });
        expect(crearUrl).toHaveBeenCalledOnce();
    });

    it("avisa en una línea cuando el servidor no está disponible", async () => {
        fetchSimulado.mockRejectedValueOnce(new Error("sin conexión"));

        render(<SelectorVozRT />);

        expect(await screen.findByRole("status")).toHaveTextContent(
            "El servidor de voz en vivo no está disponible.",
        );
        expect(screen.queryByRole("button", { name: /^Probar / })).not.toBeInTheDocument();
    });
});
