import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectorDisenoAstraura } from "../selector-diseno-astraura";

afterEach(() => {
  cleanup();
});

describe("SelectorDisenoAstraura", () => {
  it("renderiza el botón «Diseño» con icono", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    expect(boton).toBeInTheDocument();
    expect(boton).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("abre el panel al hacer clic en el botón", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const panel = screen.getByRole("dialog", { name: /diseño/i });
    expect(panel).toBeInTheDocument();
  });

  it("muestra las cinco opciones: Automático + cuatro diseños", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radiogroup = screen.getByRole("radiogroup");
    expect(radiogroup).toBeInTheDocument();
    const opciones = [
      "Automático (según el tamaño y el aparato)",
      "Mínimo",
      "Conversación",
      "Acciones",
      "Voz",
    ];
    opciones.forEach((nombre) => {
      expect(screen.getByRole("radio", { name: nombre })).toBeInTheDocument();
    });
  });

  it("marca la opción seleccionada según el valor", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    expect(screen.getByRole("radio", { name: "Voz", checked: true })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Automático (según el tamaño y el aparato)", checked: false })).toBeInTheDocument();
  });

  it("las descripciones sirven como aria-describedby", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: "Mínimo" });
    const idDescripcion = radioMinimo.getAttribute("aria-describedby");
    expect(idDescripcion).toBeTruthy();
    const descripcion = screen.getById(idDescripcion!);
    expect(descripcion).toHaveTextContent("Solo la forma, el estado y una línea para preguntar");
  });

  it("flechas ↑↓ mueven la selección", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioAuto = screen.getByRole("radio", { name: "Automático (según el tamaño y el aparato)" });
    expect(radioAuto).toHaveFocus();
    fireEvent.keyDown(radioAuto, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "Mínimo" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Mínimo" }), { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "Conversación" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Conversación" }), { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: "Mínimo" })).toHaveFocus();
  });

  it("Enter elige la opción, llama a onCambiar y cierra el panel", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioAcciones = screen.getByRole("radio", { name: "Acciones" });
    fireEvent.keyDown(radioAcciones, { key: "ArrowDown" }); // Mínimo -> Conversación -> Acciones
    fireEvent.keyDown(screen.getByRole("radio", { name: "Conversación" }), { key: "ArrowDown" });
    fireEvent.keyDown(radioAcciones, { key: "Enter" });
    expect(onCambiar).toHaveBeenCalledWith("acciones");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Espacio elige la opción, llama a onCambiar y cierra el panel", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: "Mínimo" });
    fireEvent.keyDown(radioMinimo, { key: "ArrowDown" });
    fireEvent.keyDown(radioMinimo, { key: " " });
    expect(onCambiar).toHaveBeenCalledWith("minimo");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape cierra el panel sin cambiar la selección", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: "Mínimo" });
    fireEvent.keyDown(radioMinimo, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "Mínimo" }), { key: "Escape" });
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it("con degradado=true muestra la nota de estado", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={true} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const nota = screen.getByRole("status", { name: /este tamaño es pequeño/i });
    expect(nota).toBeInTheDocument();
    expect(nota).toHaveTextContent("Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.");
  });

  it("con degradado=false no muestra la nota de estado", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    expect(screen.queryByRole("status", { name: /este tamaño es pequeño/i })).not.toBeInTheDocument();
  });

  it("el foco vuelve al botón al cerrar con Enter", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: "Mínimo" });
    fireEvent.keyDown(radioMinimo, { key: "ArrowDown" });
    fireEvent.keyDown(radioMinimo, { key: "Enter" });
    expect(boton).toHaveFocus();
  });

  it("el foco vuelve al botón al cerrar con Espacio", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: "Mínimo" });
    fireEvent.keyDown(radioMinimo, { key: "ArrowDown" });
    fireEvent.keyDown(radioMinimo, { key: " " });
    expect(boton).toHaveFocus();
  });

  it("click fuera del panel lo cierra", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    fireEvent.click(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});