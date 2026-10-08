import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { EstacionesEntidad } from "../estaciones-entidad";
import * as datos from "@/lib/estaciones/datos";

vi.spyOn(datos, "listarEstaciones").mockResolvedValue([]);

const wrap = (ui: React.ReactNode) => <AppearanceProvider>{ui}</AppearanceProvider>;

describe("EstacionesEntidad · básicos", () => {
  it("renderiza sin error", async () => {
    const { container } = render(wrap(<EstacionesEntidad slug="grupo-test" puedePublicar={false} />));
    await waitFor(() => expect(container.querySelector("h3")).toBeTruthy());
  });
});
