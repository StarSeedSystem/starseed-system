/** SelloCifradoVista (CIF1108A): candado «cifrado», «cifrando…» y aviso «sin cifrar»; sin enlace, nada. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SelloCifradoVista } from "@/components/neurons/sello-cifrado";

describe("SelloCifradoVista", () => {
  it("no pinta nada sin enlace directo", () => {
    const { container } = render(<SelloCifradoVista estado={null} />);
    expect(container.firstChild).toBeNull();
  });
  it("cifrado, pendiente y sin cifrar", () => {
    const { rerender } = render(<SelloCifradoVista estado="cifrado" />);
    expect(screen.getByTestId("sello-cifrado").textContent).toBe("cifrado");
    rerender(<SelloCifradoVista estado="pendiente" />);
    expect(screen.getByTestId("sello-cifrado").textContent).toBe("cifrando…");
    rerender(<SelloCifradoVista estado="sin-cifrar" />);
    const el = screen.getByTestId("sello-cifrado");
    expect(el.textContent).toBe("sin cifrar");
    expect(el.getAttribute("title")).toMatch(/Exigir cifrado/);
    expect(el.className).toMatch(/amber/);
  });
});
