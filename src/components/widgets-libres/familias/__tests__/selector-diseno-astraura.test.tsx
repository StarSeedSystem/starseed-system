import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorDisenoAstraura } from "../selector-diseno-astraura";

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe("SelectorDisenoAstraura", () => {
  it("renderiza el botón 'Diseño' con icono", () => {
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

  it("cierra el panel con Escape", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    expect(screen.getByRole("dialog", { name: /diseño/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /diseño/i })).not.toBeInTheDocument();
  });

  it("muestra las cinco opciones: Automático + cuatro diseños", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const opciones = screen.getAllByRole("radio");
    expect(opciones).toHaveLength(5);
    expect(screen.getByRole("radio", { name: /auto/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /mínimo/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /conversación/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /acciones/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /voz/i })).toBeInTheDocument();
  });

  it("marca la opción correspondiente al valor actual", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioVoz = screen.getByRole("radio", { name: /voz/i });
    expect(radioVoz).toBeChecked();
  });

  it("navega con flechas ↑↓ entre las opciones", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioAuto = screen.getByRole("radio", { name: /auto/i });
    expect(radioAuto).toHaveFocus();
    fireEvent.keyDown(radioAuto, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: /mínimo/i })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: /mínimo/i }), { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: /conversación/i })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: /conversación/i }), { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: /mínimo/i })).toHaveFocus();
  });

  it("elige con Enter y cierra el panel", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioVoz = screen.getByRole("radio", { name: /voz/i });
    fireEvent.keyDown(radioVoz, { key: "Enter" });
    expect(onCambiar).toHaveBeenCalledWith("voz");
    expect(screen.queryByRole("dialog", { name: /diseño/i })).not.toBeInTheDocument();
  });

  it("elige con Espacio y cierra el panel", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioAcciones = screen.getByRole("radio", { name: /acciones/i });
    fireEvent.keyDown(radioAcciones, { key: " " });
    expect(onCambiar).toHaveBeenCalledWith("acciones");
    expect(screen.queryByRole("dialog", { name: /diseño/i })).not.toBeInTheDocument();
  });

  it("Escape no cambia la selección", () => {
    const onCambiar = vi.fn();
    render(<SelectorDisenoAstraura valor="auto" onCambiar={onCambiar} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioVoz = screen.getByRole("radio", { name: /voz/i });
    fireEvent.keyDown(radioVoz, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /diseño/i })).not.toBeInTheDocument();
  });

  it("con degradado=true muestra la nota de estado", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={true} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const nota = screen.getByRole("status", { name: /aviso de tamaño degradado/i });
    expect(nota).toBeInTheDocument();
    expect(nota).toHaveTextContent(/se muestra el diseño mínimo/i);
  });

  it("con degradado=false no muestra la nota de estado", () => {
    render(<SelectorDisenoAstraura valor="voz" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    expect(screen.queryByRole("status", { name: /aviso de tamaño degradado/i })).not.toBeInTheDocument();
  });

  it("el foco vuelve al botón al cerrar el panel", async () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    fireEvent.keyDown(document, { key: "Escape" });
    // El Popover de Radix maneja el foco asíncronamente
    await waitFor(() => expect(boton).toHaveFocus());
  });

  it("cada opción tiene su descripción en aria-describedby", () => {
    render(<SelectorDisenoAstraura valor="auto" onCambiar={vi.fn()} degradado={false} />);
    const boton = screen.getByRole("button", { name: /diseño/i });
    fireEvent.click(boton);
    const radioMinimo = screen.getByRole("radio", { name: /mínimo/i });
    expect(radioMinimo).toHaveAttribute("aria-describedby");
    const descId = radioMinimo.getAttribute("aria-describedby");
    const descripcion = document.getElementById(descId!);
    expect(descripcion).toBeInTheDocument();
    expect(descripcion).toHaveTextContent(/solo la forma/i);
  });
});