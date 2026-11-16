import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SelectorFuente } from "../selector-fuente";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";

const onCambiar = vi.fn();

function renderSelector(props: Partial<{
    pedida: FuentePedida;
    real: "accesibilidad" | "proyeccion" | null;
    aviso: string | null;
}> = {}) {
    return render(
        <SelectorFuente
            pedida={props.pedida ?? "auto"}
            real={props.real ?? null}
            aviso={props.aviso ?? null}
            onCambiar={onCambiar}
        />
    );
}

beforeEach(() => {
    onCambiar.mockClear();
});

describe("RST1116A · SelectorFuente", () => {
    it("renderiza las dos opciones: Automática y Fluida (proyección)", () => {
        renderSelector();
        expect(screen.getByRole("radiogroup")).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Automática" })).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toBeTruthy();
    });

    it("marca la opción según `pedida`", () => {
        renderSelector({ pedida: "auto" });
        expect(screen.getByRole("radio", { name: "Automática" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).not.toBeChecked();

        onCambiar.mockClear();
        renderSelector({ pedida: "proyeccion" });
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Automática" })).not.toBeChecked();
    });

    it("elegir una opción llama a onCambiar con el valor", () => {
        renderSelector({ pedida: "auto" });
        fireEvent.click(screen.getByRole("radio", { name: "Fluida (proyección)" }));
        expect(onCambiar).toHaveBeenCalledOnce();
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");

        onCambiar.mockClear();
        fireEvent.click(screen.getByRole("radio", { name: "Automática" }));
        expect(onCambiar).toHaveBeenCalledWith("auto");
    });

    it("muestra el rótulo de la fuente real con rotuloFuente(real)", () => {
        renderSelector({ real: "accesibilidad" });
        expect(screen.getByText("Pantalla por accesibilidad")).toBeTruthy();

        renderSelector({ real: "proyeccion" });
        expect(screen.getByText("Pantalla fluida (proyección)")).toBeTruthy();

        renderSelector({ real: null });
        expect(screen.getByText("Pantalla: aún sin fuente")).toBeTruthy();
    });

    it("si pedida es proyección pero real es accesibilidad, muestra el aviso en role=status", () => {
        renderSelector({ pedida: "proyeccion", real: "accesibilidad" });
        const aviso = screen.getByRole("status");
        expect(aviso).toBeTruthy();
        expect(aviso.textContent).toContain("Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad");
    });

    it("si hay aviso propuesto, lo muestra en role=status", () => {
        renderSelector({ aviso: "Aviso personalizado" });
        expect(screen.getByRole("status").textContent).toBe("Aviso personalizado");
    });

    it("la opción Fluida tiene el texto de ayuda", () => {
        renderSelector();
        const fluida = screen.getByRole("radio", { name: "Fluida (proyección)" });
        expect(fluida).toHaveAttribute("aria-describedby");
        const ayudaId = fluida.getAttribute("aria-describedby");
        expect(ayudaId).toBeTruthy();
        const ayuda = document.getElementById(ayudaId!);
        expect(ayuda).toBeTruthy();
        expect(ayuda!.textContent).toContain("Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca");
    });

    it("teclado: flechas cambian de opción y llaman a onCambiar", () => {
        const { rerender } = renderSelector({ pedida: "auto" });
        const radioAuto = screen.getByRole("radio", { name: "Automática" });
        const radioFluida = screen.getByRole("radio", { name: "Fluida (proyección)" });

        radioAuto.focus();
        act(() => {
            fireEvent.keyDown(radioAuto, { key: "ArrowRight" });
        });
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");

        onCambiar.mockClear();
        // simular que el padre actualiza pedida tras onCambiar
        rerender(
            <SelectorFuente
                pedida="proyeccion"
                real={null}
                aviso={null}
                onCambiar={onCambiar}
            />
        );
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toBeChecked();

        const radioFluidaNew = screen.getByRole("radio", { name: "Fluida (proyección)" });
        radioFluidaNew.focus();
        act(() => {
            fireEvent.keyDown(radioFluidaNew, { key: "ArrowLeft" });
        });
        expect(onCambiar).toHaveBeenCalledWith("auto");
    });

    it("los botones de radio tienen objetivo táctil de 44 px (el label contenedor)", () => {
        renderSelector();
        const radioAuto = screen.getByRole("radio", { name: "Automática" });
        const radioFluida = screen.getByRole("radio", { name: "Fluida (proyección)" });
        const labelAuto = radioAuto.closest("label") as HTMLElement;
        const labelFluida = radioFluida.closest("label") as HTMLElement;
        expect(labelAuto).toBeTruthy();
        expect(labelFluida).toBeTruthy();
        const estiloAuto = window.getComputedStyle(labelAuto!);
        const estiloFluida = window.getComputedStyle(labelFluida!);
        expect(parseInt(estiloAuto.minHeight, 10)).toBeGreaterThanOrEqual(44);
        expect(parseInt(estiloAuto.minWidth, 10)).toBeGreaterThanOrEqual(44);
        expect(parseInt(estiloFluida.minHeight, 10)).toBeGreaterThanOrEqual(44);
        expect(parseInt(estiloFluida.minWidth, 10)).toBeGreaterThanOrEqual(44);
    });

    it("no contiene la palabra «Mando» en texto visible", () => {
        renderSelector({ pedida: "proyeccion", real: "accesibilidad", aviso: "texto de prueba" });
        const todo = screen.getByRole("radiogroup").textContent ?? "";
        expect(todo.toLowerCase()).not.toContain("mando");
    });

    it("textos en español con acentos", () => {
        renderSelector({ real: "accesibilidad" });
        expect(screen.getByText("Automática")).toBeTruthy();
        expect(screen.getByText("Fluida (proyección)")).toBeTruthy();
        expect(screen.getByText("Pantalla por accesibilidad")).toBeTruthy();
    });
});