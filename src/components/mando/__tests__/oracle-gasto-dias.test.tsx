import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OracleGastoDias } from "../oracle-gasto-dias";

describe("OracleGastoDias", () => {
  it("renderiza nada cuando dias está vacío", () => {
    const { container } = render(<OracleGastoDias dias={[]} moneda="MXN" />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza barras y líneas correctamente con datos", () => {
    const dias = [
      { dia: "01/10", coste: 0 },
      { dia: "02/10", coste: 0.5 },
      { dia: "03/10", coste: 0 },
    ];
    const { container } = render(<OracleGastoDias dias={dias} moneda="MXN" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // Should have 3 elements: line, rect, line
    const elements = svg?.children;
    expect(elements?.length).toBe(3);
    // First and third should be line (for cost 0)
    expect(elements?.[0].tagName).toBe("line");
    expect(elements?.[2].tagName).toBe("line");
    // Middle should be rect
    expect(elements?.[1].tagName).toBe("rect");
    // Check aria-label
    expect(svg).toHaveAttribute(
      "aria-label",
      "Gasto de Oracle por día: máximo 0,50 MXN; hoy 0,00 MXN"
    );
  });
});