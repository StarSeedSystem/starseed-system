import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MontajeIdioma } from "../montaje-idioma";

describe("MontajeIdioma", () => {
  it("se monta sin errores", () => {
    const { container } = render(<MontajeIdioma />);
    expect(container).toBeEmptyDOMElement();
  });
});
