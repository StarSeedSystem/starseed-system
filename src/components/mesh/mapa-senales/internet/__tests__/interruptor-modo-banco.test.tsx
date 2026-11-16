import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InterruptorModoBanco } from "../interruptor-modo-banco";

describe("InterruptorModoBanco", () => {
  const mockTextos = {
    bancoTitulo: "Modo banco",
    bancoAyuda: "Ayuda del modo banco",
    quedaHoy: (mb: number) => `Quedan ${mb} MB hoy`,
    agotadoHoy: "Datos agotados hoy",
  };

  it("renderiza etiqueta y ayuda", () => {
    render(<InterruptorModoBanco activo={false} onCambiar={() => {}} textos={mockTextos} restanteHoyMb={null} />);
    expect(screen.getByText("Modo banco")).toBeInTheDocument();
    expect(screen.getByText("Ayuda del modo banco")).toBeInTheDocument();
  });

  it("cambia al presionar (Espacio)", () => {
    const onCambiar = vi.fn();
    render(<InterruptorModoBanco activo={false} onCambiar={onCambiar} textos={mockTextos} restanteHoyMb={null} />);
    const switchEl = screen.getByRole("switch");
    fireEvent.click(switchEl);
    expect(onCambiar).toHaveBeenCalledWith(true);
  });

  it("muestra datos restantes cuando está activo", () => {
    render(<InterruptorModoBanco activo={true} onCambiar={() => {}} textos={mockTextos} restanteHoyMb={100} />);
    expect(screen.getByText("Quedan 100 MB hoy")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("muestra estado agotado cuando está activo y MB es 0", () => {
    render(<InterruptorModoBanco activo={true} onCambiar={() => {}} textos={mockTextos} restanteHoyMb={0} />);
    expect(screen.getByText("Datos agotados hoy")).toBeInTheDocument();
  });

  it("no muestra datos restantes si está inactivo", () => {
    render(<InterruptorModoBanco activo={false} onCambiar={() => {}} textos={mockTextos} restanteHoyMb={100} />);
    expect(screen.queryByText("Quedan 100 MB hoy")).not.toBeInTheDocument();
  });
});
