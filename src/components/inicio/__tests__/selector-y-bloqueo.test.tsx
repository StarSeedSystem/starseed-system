import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { width: 120, height: 120, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("@/lib/bloqueo/passkey-registro", () => ({ biometriaDisponible: async () => false, registrarPasskey: vi.fn() }));

import { SelectorPantallaInicial } from "../selector-pantalla-inicial";
import { ConfigurarBloqueo } from "@/components/bloqueo/configurar-bloqueo";
import { leerPreferencias } from "@/lib/inicio/pantalla-inicial";
import { leerConfigBloqueo } from "@/lib/bloqueo/politica-bloqueo";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("SelectorPantallaInicial", () => {
    it("elegir «Escritorios» lo guarda para el perfil; el buscador filtra páginas", () => {
        const onGuardado = vi.fn();
        render(<SelectorPantallaInicial ambito="perfil" id="p1" onGuardado={onGuardado} />);
        fireEvent.click(screen.getByRole("radio", { name: /Escritorios/ }));
        expect(leerPreferencias().perfiles.p1).toEqual({ tipo: "escritorios" });
        expect(onGuardado).toHaveBeenCalledWith({ tipo: "escritorios" });
        fireEvent.click(screen.getByRole("radio", { name: /Otra página/ }));
        fireEvent.change(screen.getByLabelText("Buscar una página"), { target: { value: "genesis" } });
        expect(screen.getByRole("button", { name: "Genesis" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Biblioteca" })).toBeNull();
    });
});

describe("ConfigurarBloqueo", () => {
    it("PIN repetido distinto da error; PIN válido guarda el método; sin biometría queda deshabilitada", async () => {
        render(<ConfigurarBloqueo neuronaId="n1" nombreNeurona="Mac" />);
        await act(async () => { await Promise.resolve(); });
        expect((screen.getByRole("radio", { name: /Huella o rostro/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("radio", { name: /PIN/ }));
        fireEvent.change(screen.getByPlaceholderText(/^PIN \(4/), { target: { value: "1234" } });
        fireEvent.change(screen.getByLabelText("Repite el PIN"), { target: { value: "9999" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); });
        expect(screen.getByRole("alert").textContent).toMatch(/no coinciden/);
        fireEvent.change(screen.getByLabelText("Repite el PIN"), { target: { value: "1234" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar" })); await new Promise((r) => setTimeout(r, 1500)); });
        expect(leerConfigBloqueo("n1").metodo).toBe("pin");
    }, 15000);
});
