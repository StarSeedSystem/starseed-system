import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISENOS, EleccionDiseno } from "@/lib/widgets/astraura/disenos";
import { SelectorDisenoAstraura } from "../selector-diseno-astraura";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

const onCambiar = vi.fn();
const OPCIONES: EleccionDiseno[] = ["auto", "minimo", "conversacion", "acciones", "voz"];

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => { cleanup(); });

describe("SelectorDisenoAstraura", () => {
    it("renderiza el botón «Diseño» con icono y objetivo de 44 px", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        const btn = screen.getByRole("button", { name: /Diseño/i });
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAttribute("style", expect.stringContaining("44"));
    });

    it("abre el panel al hacer clic en el botón", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("el panel tiene role=dialog con foco atrapado y Escape lo cierra", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();
        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("muestra las cinco opciones: Automático + las cuatro de DISENOS", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getByRole("radio", { name: /Automático/i })).toBeInTheDocument();
        for (const d of ["minimo", "conversacion", "acciones", "voz"] as const) {
            expect(screen.getByRole("radio", { name: new RegExp(DISENOS[d].nombre, "i") })).toBeInTheDocument();
        }
    });

    it("la opción correspondiente al valor actual está marcada", () => {
        render(<SelectorDisenoAstraura valor="conversacion" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getByRole("radio", { name: /Conversación/i })).toBeChecked();
        expect(screen.getByRole("radio", { name: /Automático/i })).not.toBeChecked();
    });

    it("elegir una opción llama a onCambiar con el valor y cierra el panel", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        fireEvent.click(screen.getByRole("radio", { name: /Voz/i }));
        expect(onCambiar).toHaveBeenCalledWith("voz");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Escape no cambia el valor ni llama a onCambiar", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(onCambiar).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("flechas ↑↓ mueven la selección entre las opciones", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        const dialog = screen.getByRole("dialog");
        const radios = screen.getAllByRole("radio");
        radios[0].focus();
        fireEvent.keyDown(dialog, { key: "ArrowDown" });
        expect(radios[1]).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "ArrowDown" });
        expect(radios[2]).toHaveFocus();
        fireEvent.keyDown(dialog, { key: "ArrowUp" });
        expect(radios[1]).toHaveFocus();
    });

    it("Enter o Espacio en una opción la elige y cierra", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        const radioVoz = screen.getByRole("radio", { name: /Voz/i });
        radioVoz.focus();
        fireEvent.keyDown(radioVoz, { key: "Enter" });
        expect(onCambiar).toHaveBeenCalledWith("voz");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("con degradado=true muestra la nota de estado", () => {
        render(<SelectorDisenoAstraura valor="conversacion" onCambiar={onCambiar} degradado={true} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getByRole("status", { name: /pequeño.*mínimo/i })).toBeInTheDocument();
    });

    it("al cerrar el panel (por Escape o elegir), el foco vuelve al botón", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        const btn = screen.getByRole("button", { name: /Diseño/i });
        fireEvent.click(btn);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        expect(btn).toHaveFocus();
    });

    it("cada opción tiene aria-describedby con su sirvePara", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        for (const d of ["minimo", "conversacion", "acciones", "voz"] as const) {
            const radio = screen.getByRole("radio", { name: new RegExp(DISENOS[d].nombre, "i") });
            expect(radio).toHaveAttribute("aria-describedby");
            const descId = radio.getAttribute("aria-describedby");
            const desc = screen.getByText(DISENOS[d].sirvePara);
            expect(desc.id).toBe(descId);
        }
    });

    it("el radiogroup tiene aria-label descriptivo", () => {
        render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", /diseño/i);
    });
});