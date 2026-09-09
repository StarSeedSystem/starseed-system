import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { MarcoWidget, estadoDeMarco, type MarcoWidgetProps } from "../kit/marco-widget";

// ── utilidades ────────────────────────────────────────────────────
// Monta el marco con los mínimos defaults para centrar cada bloque
// en su estado (el mismo "arranque" que los tests del repo: vitest +
// @testing-library/react + jsdom vía environmentMatchGlobs).
function montar(props: Partial<MarcoWidgetProps> = {}) {
    return render(
        <MarcoWidget titulo="Mi widget" categoria="social" {...props}>
            <p>Contenido real del widget</p>
        </MarcoWidget>,
    );
}

const marco = () => screen.getByTestId("marco-widget");

afterEach(() => {
    cleanup();
});

// ── contrato de estado ────────────────────────────────────────────
describe("MarcoWidget · estado resuelto", () => {
    it("sin nada especial queda listo", () => {
        montar();
        expect(marco()).toHaveAttribute("data-estado", "listo");
    });

    it("el error prevalece sobre la carga y lo vacío", () => {
        montar({ error: new Error("boom"), cargando: true, vacio: true });
        expect(marco()).toHaveAttribute("data-estado", "error");
    });

    it("la carga manda sobre lo vacío", () => {
        montar({ cargando: true, vacio: true });
        expect(marco()).toHaveAttribute("data-estado", "cargando");
    });

    it("vacio:true sin error ni carga deja el marco en vacío", () => {
        montar({ vacio: true });
        expect(marco()).toHaveAttribute("data-estado", "vacio");
    });

    it("estadoDeMarco expone la misma precedencia sin montar el DOM", () => {
        expect(estadoDeMarco({ titulo: "t", categoria: "social", children: null })).toBe("listo");
        expect(
            estadoDeMarco({ titulo: "t", categoria: "social", children: null, error: new Error("x"), cargando: true }),
        ).toBe("error");
        expect(estadoDeMarco({ titulo: "t", categoria: "social", children: null, cargando: true })).toBe("cargando");
        expect(estadoDeMarco({ titulo: "t", categoria: "social", children: null, vacio: true })).toBe("vacio");
    });
});

// ── accesibilidad del contenedor ──────────────────────────────────
describe("MarcoWidget · accesibilidad", () => {
    it("es una región con el aria-label del título", () => {
        montar();
        expect(marco()).toHaveAttribute("role", "region");
        expect(marco()).toHaveAttribute("aria-label", "Mi widget");
    });

    it("pinta el título visible en la cabecera", () => {
        montar();
        expect(screen.getByText("Mi widget")).toBeInTheDocument();
    });

    it("pinta las acciones de cabecera cuando las hay (y no cuando no)", () => {
        const { rerender } = montar({
            acciones: <button type="button">Configurar</button>,
        });
        expect(screen.getByRole("button", { name: "Configurar" })).toBeInTheDocument();

        rerender(
            <MarcoWidget titulo="Mi widget" categoria="social">
                <p>Contenido real del widget</p>
            </MarcoWidget>,
        );
        expect(screen.queryByRole("button", { name: "Configurar" })).not.toBeInTheDocument();
    });
});

// ── cargando ─────────────────────────────────────────────────────
describe("MarcoWidget · cargando", () => {
    it("pinta esqueleto con la forma del contenido (no un spinner suelto) y aria-busy", () => {
        montar({ cargando: true });
        const m = marco();
        expect(m).toHaveAttribute("data-estado", "cargando");
        expect(m).toHaveAttribute("aria-busy", "true");
        // WidgetSkeleton (variant="list") son filas animate-pulse, no un spinner:
        expect(m.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
        expect(m.querySelector(".animate-spin")).toBeNull();
    });

    it("no muestra el contenido real mientras carga", () => {
        montar({ cargando: true });
        expect(screen.queryByText("Contenido real del widget")).not.toBeInTheDocument();
    });
});

// ── vacío ────────────────────────────────────────────────────────
describe("MarcoWidget · vacío", () => {
    it("pinta el título y la ayuda de mensajeVacio de la categoría", () => {
        montar({ vacio: true });
        // social → "Aún no hay actividad en tu círculo"
        expect(screen.getByText("Aún no hay actividad en tu círculo")).toBeInTheDocument();
        // La ayuda de la categoría viaja con el título (mismo mensaje).
        expect(
            screen.getByText("Conecta con personas o comunidades y comparte tu primera creación para que aparezca aquí."),
        ).toBeInTheDocument();
    });

    it("una categoría desconocida no rompe: cae al mensaje genérico", () => {
        montar({ vacio: true, categoria: "categoria-inexistente" });
        expect(screen.getByText("Todavía no hay nada que mostrar aquí")).toBeInTheDocument();
    });

    it("no muestra el contenido real cuando está vacío", () => {
        montar({ vacio: true });
        expect(screen.queryByText("Contenido real del widget")).not.toBeInTheDocument();
    });
});

// ── error ────────────────────────────────────────────────────────
describe("MarcoWidget · error", () => {
    it("pinta el mensaje de mensajeError en un role=status", () => {
        montar({ error: new TypeError("Failed to fetch") });
        expect(marco()).toHaveAttribute("data-estado", "error");
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("No pudimos conectar con la fuente");
    });

    it("error reintentable + callback pinta Reintentar y llama al callback al pulsarlo", async () => {
        const onReintentar = vi.fn();
        const user = userEvent.setup();
        montar({ error: new TypeError("Failed to fetch"), onReintentar });
        const btn = screen.getByRole("button", { name: /reintentar/i });
        await user.click(btn);
        expect(onReintentar).toHaveBeenCalledTimes(1);
    });

    it("error NO reintentable (permiso denegado) no pinta el botón: ofrecerlo sería mentir", () => {
        montar({ error: new Error("Permission denied"), onReintentar: () => {} });
        expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    });

    it("error reintentable sin callback tampoco pinta el botón", () => {
        montar({ error: new TypeError("Failed to fetch") });
        expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    });

    it("no muestra el contenido real cuando hay error", () => {
        montar({ error: new Error("boom") });
        expect(screen.queryByText("Contenido real del widget")).not.toBeInTheDocument();
    });
});

// ── listo ────────────────────────────────────────────────────────
describe("MarcoWidget · listo", () => {
    it("pinta el children tal cual, sin recortar su layout", () => {
        const { container } = render(
            <MarcoWidget titulo="W" categoria="social">
                <div data-testid="hijo" style={{ width: "100%", height: "100%" }} />
            </MarcoWidget>,
        );
        const hijo = screen.getByTestId("hijo");
        // El hijo vive directo en un contenedor flex-1 del marco (sin
        // envolturas intermedias que estorben el layout del widget).
        expect(hijo.parentElement).toBe(container.querySelector('[data-estado="listo"] > div:last-child'));
    });

    it("aria-busy solo se declara en la carga, no en el resto de estados", () => {
        montar();
        expect(marco()).not.toHaveAttribute("aria-busy");
        cleanup();
        montar({ error: new Error("boom") });
        expect(marco()).not.toHaveAttribute("aria-busy");
        cleanup();
        montar({ vacio: true });
        expect(marco()).not.toHaveAttribute("aria-busy");
    });
});
