/**
 * Pruebas de las ventanas plegables de Genesis (UIG1029D).
 *
 * Se monta <CentroMando /> con `fetch` sin red (toda lectura cae): los paneles
 * quedan en su estado vacío honesto y lo único bajo prueba es el armazón:
 * cada panel vive en una SeccionPlegable con id `genesis.<pestana>.<panel>`,
 * la primera visita deja abierto el primero de la pestaña y la barra de
 * pestañas manda «Plegar todo / Desplegar todo» a las ventanas visibles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
// La barra de pestañas de Genesis lee la apariencia del OS: vive en su proveedor.
import { AppearanceProvider } from "@/context/appearance-context";

// Toda la red cae en estas pruebas: sin procesos, sin disco, sin respuestas.
const sinRed = vi.fn(async () => {
    throw new Error("sin red en las pruebas");
});

// El módulo instala su guardia de lecturas al importarse (envuelve window.fetch
// EN LA IMPORTACIÓN): se pisa el fetch antes de que el módulo llegue.
vi.stubGlobal("fetch", sinRed);
const { CentroMando, idPlegable } = await import("../centro-mando");

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

/** Genesis entero montado en pruebas, con su proveedor de apariencia. */
function MandoEnPruebas() {
    return (
        <AppearanceProvider>
            <CentroMando />
        </AppearanceProvider>
    );
}

/** Quita el sufijo «-contenido» del aria-controls para volver al id de la ventana. */
function contenderado(idAriaControls: string): string {
    return idAriaControls.replace(/-contenido$/, "");
}

describe("Ventanas plegables de Genesis (UIG1029D)", () => {
    it("el id de una ventana es estable: genesis.<pestana>.<panel>", () => {
        expect(idPlegable("procesos", "procesos")).toBe("genesis.procesos.procesos");
        expect(idPlegable("capas-red", "capas-red")).toBe("genesis.capas-red.capas-red");
        expect(idPlegable("procesos", "procesos")).toBe(idPlegable("procesos", "procesos"));
    });

    it("cada panel de la pestaña visible vive en una ventana con su id estable", () => {
        render(<MandoEnPruebas />);
        const ids = screen
            .getAllByRole("button", { name: /lista/ })
            .map((b) => b.getAttribute("aria-controls") ?? "");
        const deProcesos = ids.filter((id) => id.startsWith("genesis.procesos."));
        // No escapa ninguna ventana de la pestaña y ninguna comparte id.
        expect(deProcesos.length).toBe(ids.length);
        expect(new Set(deProcesos).size).toBe(deProcesos.length);
        // El primero de la pestaña ya está abierto a la primera visita.
        expect(document.getElementById("genesis.procesos.procesos-contenido")).not.toBeNull();
        expect(document.getElementById("genesis.procesos.suenos-contenido")).not.toBeNull();
    });

    it("«Plegar todo» cierra las ventanas de la pestaña visible y «Desplegar todo» las abre", () => {
        render(<MandoEnPruebas />);
        const boton = screen.getByTestId("boton-plegar-todo");
        expect(boton).toHaveTextContent("Plegar todo");

        fireEvent.click(boton);
        expect(boton).toHaveTextContent("Desplegar todo");
        expect(document.getElementById("genesis.procesos.procesos-contenido")).toBeNull();
        expect(document.getElementById("genesis.procesos.suenos-contenido")).toBeNull();

        fireEvent.click(boton);
        expect(boton).toHaveTextContent("Plegar todo");
        expect(document.getElementById("genesis.procesos.procesos-contenido")).not.toBeNull();
        expect(document.getElementById("genesis.procesos.suenos-contenido")).not.toBeNull();
    });

    it("cerrar una ventana a mano queda recordado si Genesis se vuelve a montar", () => {
        const primera = render(<MandoEnPruebas />);
        const cerrar = screen.getAllByRole("button", { name: "Cerrar lista" })[0];
        const idVentana = contenderado(cerrar.getAttribute("aria-controls") ?? "");
        expect(idVentana).toMatch(/^genesis\.procesos\./);

        fireEvent.click(cerrar);
        primera.unmount();

        render(<MandoEnPruebas />);
        expect(document.getElementById(idVentana)).toBeNull();
        expect(window.localStorage.getItem(`starseed.seccion-plegable.${idVentana}`)).toBe("cerrada");
    });
});
