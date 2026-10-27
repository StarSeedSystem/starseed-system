import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoutersMallaPanel } from "../routers-malla-panel";

describe("RoutersMallaPanel", () => {
  it("añadir un router de operador muestra 'bloqueado-operador'", () => {
    render(<RoutersMallaPanel tabla={[]} />);
    fireEvent.change(screen.getByPlaceholderText("fabricante"), { target: { value: "Movistar" } });
    fireEvent.change(screen.getByPlaceholderText("modelo"), { target: { value: "HGU" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Comprobar"));
    expect(screen.getByText(/bloqueado-operador/)).toBeTruthy();
  });
});
