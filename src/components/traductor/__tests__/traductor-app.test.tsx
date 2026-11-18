import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TraductorApp } from "../traductor-app";
import type { AlcanceMotor, MotorTraduccion } from "@/lib/traduccion/motor";
import { CLAVE_TRADUCCION } from "@/lib/traduccion/preferencias";

function motor(id: string, alcance: AlcanceMotor, salir: (texto: string) => string): MotorTraduccion {
    return { id, alcance, disponible: async () => true, traducir: async (textos) => textos.map(salir) };
}

function guardarPreferencias(perfilId: string, astraura: "nunca" | "preguntar" | "siempre"): void {
    const auto = { paginas: "preguntar", mensajes: "preguntar", publicaciones: "preguntar", agentes: "preguntar", astraura };
    window.localStorage.setItem(CLAVE_TRADUCCION, JSON.stringify({ [perfilId]: { idioma: "es", entiende: ["es"], auto } }));
}

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("TraductorApp", () => {
    it("monta con motores falsos y cambia entre las tres pestañas", async () => {
        render(<TraductorApp motores={[motor("paquete-local", "aparato", (t) => t)]} />);

        expect(await screen.findByTestId("caja-origen")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Texto" })).toHaveAttribute("aria-selected", "true");

        await userEvent.click(screen.getByRole("tab", { name: "Conversación" }));
        expect(screen.getByRole("tabpanel")).toHaveTextContent("Conversación");

        await userEvent.click(screen.getByRole("tab", { name: "Sin internet" }));
        expect(screen.getByRole("tabpanel")).toHaveTextContent("Sin internet");
    });

    it("con modo privado no entra Astraura", async () => {
        const localFn = vi.fn((textos: string[]) => textos.map((t) => `local:${t}`));
        const astrauraFn = vi.fn((textos: string[]) => textos.map((t) => `astraura:${t}`));
        const astrauraDisponible = vi.fn(async () => true);
        const local: MotorTraduccion = { id: "paquete-local", alcance: "aparato", disponible: async () => true, traducir: async (t) => localFn(t) };
        const astraura: MotorTraduccion = { id: "astraura", alcance: "publico", disponible: astrauraDisponible, traducir: async (t) => astrauraFn(t) };

        render(<TraductorApp motores={[local, astraura]} privado />);
        await userEvent.type(await screen.findByTestId("caja-origen"), "hola");
        await userEvent.click(screen.getByTestId("boton-traducir"));

        await waitFor(() => expect(screen.getByTestId("caja-resultado")).toHaveValue("local:hola"));
        expect(localFn).toHaveBeenCalledTimes(1);
        expect(astrauraDisponible).not.toHaveBeenCalled();
        expect(astrauraFn).not.toHaveBeenCalled();
    });

    it("el modo privado también se lee de las preferencias del perfil", async () => {
        guardarPreferencias("ana", "nunca");
        const localFn = vi.fn((textos: string[]) => textos.map((t) => `local:${t}`));
        const astrauraFn = vi.fn((textos: string[]) => textos.map((t) => `astraura:${t}`));
        const astrauraDisponible = vi.fn(async () => true);
        const local: MotorTraduccion = { id: "paquete-local", alcance: "aparato", disponible: async () => false, traducir: async (t) => localFn(t) };
        const astraura: MotorTraduccion = { id: "astraura", alcance: "publico", disponible: astrauraDisponible, traducir: async (t) => astrauraFn(t) };

        render(<TraductorApp motores={[local, astraura]} perfilId="ana" />);
        await userEvent.type(await screen.findByTestId("caja-origen"), "hola");
        await userEvent.click(screen.getByTestId("boton-traducir"));

        await waitFor(() => expect(screen.getByTestId("error-traduccion")).toHaveTextContent("Ningún traductor disponible"));
        expect(localFn).not.toHaveBeenCalled();
        expect(astrauraDisponible).not.toHaveBeenCalled();
        expect(astrauraFn).not.toHaveBeenCalled();
    });
});
