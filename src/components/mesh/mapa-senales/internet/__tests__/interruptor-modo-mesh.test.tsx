import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InterruptorModoMesh } from "../interruptor-modo-mesh";

const textos = {
  meshTitulo: "Mesh Mode",
  meshAyuda: "Help mesh",
  meshSinLimite: "No limit",
  meshConLimite: (mb: number) => `${mb} MB` ,
  audMiCuenta: "My account",
  audEntidad: "Entity",
  audPublico: "Public",
  mb: "MB",
  gb: "GB",
};

describe("InterruptorModoMesh", () => {
  it("renders switch with correct label", () => {
    const valor = { mesh: false, limiteMeshMb: null };
    const { container } = render(<InterruptorModoMesh audiencia="mi-cuenta" valor={valor} onCambiar={() => {}} textos={textos} />);
    expect(screen.getByRole("switch", { name: "My account" })).toBeInTheDocument();
    expect(screen.getByText("Mesh Mode")).toBeInTheDocument();
  });

  it("toggles the switch calling onCambiar", () => {
    const valor = { mesh: false, limiteMeshMb: null };
    const cb = vi.fn();
    render(<InterruptorModoMesh audiencia="entidad" valor={valor} onCambiar={cb} textos={textos} />);
    const switchEl = screen.getByRole("switch", { name: "Entity" });
    fireEvent.click(switchEl);
    expect(cb).toHaveBeenCalledWith({ mesh: true, limiteMeshMb: null });
  });

  it("shows radios when switch is on and manages limit", () => {
    const valor = { mesh: true, limiteMeshMb: null };
    const cb = vi.fn();
    const { container } = render(<InterruptorModoMesh audiencia="publico" valor={valor} onCambiar={cb} textos={textos} />);
    expect(screen.getByText("No limit")).toBeInTheDocument();
    expect(screen.getByText("0 MB")).toBeInTheDocument(); // initial con limite null uses 0 MB display
    const radioLimit = container.querySelector('input[value="con-limite"]') as HTMLElement;
    fireEvent.click(radioLimit);
    expect(cb).toHaveBeenCalledWith({ mesh: true, limiteMeshMb: 1024 });
  });
});
