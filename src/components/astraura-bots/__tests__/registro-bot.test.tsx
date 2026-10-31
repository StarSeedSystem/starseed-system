"use client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, className, size }: { children: React.ReactNode; onClick?: () => void; className?: string; size?: string }) => (
    <button onClick={onClick} className={className} data-size={size}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import { RegistroBot } from "../registro-bot";

const entradasPrueba = [
  {
    id: "entry-1",
    at: Date.now() - 120000,
    quien: "Bot de Prueba",
    tipo: "aplicada" as const,
    accion: "navegar(/library)",
    motivo: "El bot quiere acceder a la biblioteca",
    reversible: true,
  },
];

describe("RegistroBot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("muestra el título del registro", () => {
    const { container } = render(
      <RegistroBot
        entradas={[]}
        onUndo={() => {}}
      />
    );

    const titulo = container.querySelector("h3");
    expect(titulo?.textContent).toBe("Registro de actividad");
  });

  it("muestra las entradas cuando hay datos", () => {
    const { container } = render(
      <RegistroBot
        entradas={entradasPrueba}
        onUndo={() => {}}
      />
    );

    expect(screen.getByText("Bot de Prueba")).toBeTruthy();
    expect(screen.getByText("navegar(/library)")).toBeTruthy();

    const entradas = container.querySelectorAll(".p-4.rounded");
    expect(entradas.length).toBe(1);
  });

  it("llama a onUndo cuando se hace clic en el botón deshacer", () => {
    const onUndoMock = vi.fn();
    const { container } = render(
      <RegistroBot
        entradas={entradasPrueba}
        onUndo={onUndoMock}
      />
    );

    const boton = container.querySelector("button");
    expect(boton).toBeTruthy();
    expect(boton?.textContent).toBe("Deshacer");

    fireEvent.click(boton as Element);

    expect(onUndoMock).toHaveBeenCalledTimes(1);
    expect(onUndoMock).toHaveBeenCalledWith("entry-1");
  });
});