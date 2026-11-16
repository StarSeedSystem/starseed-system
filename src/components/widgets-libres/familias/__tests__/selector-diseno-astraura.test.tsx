import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectorDisenoAstraura } from "../selector-diseno-astraura";
import { DISENOS } from "@/lib/widgets/astraura/disenos";

describe("SelectorDisenoAstraura", () => {
  it("debería tener las opciones: auto y las definidas en DISENOS", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    fireEvent.click(screen.getByLabelText("Cambiar diseño"));
    expect(screen.getByText(/Automático/)).toBeTruthy();
    Object.values(DISENOS).forEach(d => {
        expect(screen.getByText(d.nombre)).toBeTruthy();
    });
  });

  it("debería llamar a onCambiar con el valor seleccionado", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    fireEvent.click(screen.getByLabelText("Cambiar diseño"));
    fireEvent.click(screen.getByText(DISENOS.minimo.nombre));
    expect(onCambiar).toHaveBeenCalledWith("minimo");
  });

  it("debería mostrar nota de degradado si está activo", () => {
    render(<SelectorDisenoAstraura valor="minimo" onCambiar={vi.fn()} degradado={true} />);
    fireEvent.click(screen.getByLabelText("Cambiar diseño"));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Este tamaño es pequeño/)).toBeTruthy();
  });
});
