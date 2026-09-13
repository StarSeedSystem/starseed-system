import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AjustesDirector } from "../ajustes-director";
import { DEFAULTS, type ConfigDirector } from "@/lib/mando/director-config";

const CONFIG_PRUEBA: ConfigDirector = {
    ...DEFAULTS,
    trabajadores: 9,
    escalada: { ...DEFAULTS.escalada, tope_haiku_dia: 33 },
};

const fetchOriginal = globalThis.fetch;

/** Sustituye `globalThis.fetch`: GET de config responde con `CONFIG_PRUEBA`, cualquier otra ruta 404. */
function instalarFetchDePrueba(): void {
    globalThis.fetch = (async (entrada: RequestInfo | URL) => {
        const url = typeof entrada === "string" ? entrada : entrada.toString();
        if (url.endsWith("/api/mando/director/config")) {
            return new Response(JSON.stringify({ config: CONFIG_PRUEBA, pausado: false, origen: "archivo", actualizadoEn: "" }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;
}

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

describe("AjustesDirector", () => {
    it("pinta los valores devueltos por el GET (trabajadores=9, tope_haiku_dia=33)", async () => {
        instalarFetchDePrueba();
        const { container } = render(<AjustesDirector />);

        await waitFor(() => {
            expect(container.querySelector<HTMLInputElement>("#campo-trabajadores")?.value).toBe("9");
        });
        expect(container.querySelector<HTMLInputElement>("#campo-tope_haiku_dia")?.value).toBe("33");
    });

    it("con trabajadores=-1, «Guardar» queda deshabilitado y aparece un mensaje de error", async () => {
        instalarFetchDePrueba();
        const { container } = render(<AjustesDirector />);

        await waitFor(() => {
            expect(container.querySelector<HTMLInputElement>("#campo-trabajadores")?.value).toBe("9");
        });

        const botonGuardar = screen.getByRole("button", { name: /Guardar/ });
        expect(botonGuardar).not.toBeDisabled();

        const campoTrabajadores = container.querySelector<HTMLInputElement>("#campo-trabajadores")!;
        fireEvent.change(campoTrabajadores, { target: { value: "-1" } });

        expect(botonGuardar).toBeDisabled();
        expect(screen.getByText(/'trabajadores' debe ser un entero/)).toBeInTheDocument();
    });
});
