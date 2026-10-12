import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OracleGastoDias } from "../oracle-gasto-dias";

describe("OracleGastoDias", () => {
  it("renders nothing when dias is empty", () => {
    render(<OracleGastoDias dias={[]} moneda="MXN" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders svg with correct aria-label and three elements for three days", () => {
    const dias = [
      { dia: "2026-10-01", coste: 0 },
      { dia: "2026-10-02", coste: 0.5 },
      { dia: "2026-10-03", coste: 0 },
    ];
    render(<OracleGastoDias dias={dias} moneda="MXN" />);

    const svg = screen.getByRole("img");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute(
      "aria-label",
      "Gasto de Oracle por día: máximo 0,50 MXN; hoy 0,00 MXN"
    );

    // Check that there are three graphical elements (either rect or line)
    const elements = svg.querySelectorAll("rect, line");
    expect(elements).toHaveLength(3);
  });
});