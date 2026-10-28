// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterMallaPanel } from "@/components/network/routers-malla-panel";

describe("RouterMallaPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("añade un router y muestra 'bloqueado-operador' para router de operador", async () => {
    const user = userEvent.setup();
    render(<RouterMallaPanel />);
    
    await user.type(screen.getAllByPlaceholderText("fabricante")[0], "Movistar");
    await user.type(screen.getAllByPlaceholderText("modelo")[0], "HGU");
    await user.click(screen.getAllByLabelText("Es del operador")[0]);
    await user.click(screen.getAllByText("Añadir router")[0]);
    
    await waitFor(() => {
      expect(screen.getByText("bloqueado-operador")).toBeInTheDocument();
    });
  });
});
