import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { FranjaDescargaOs } from "../franja-descarga-os";
import { AppearanceProvider } from "@/context/appearance-context";
import {
  OS_FECHA,
  OS_VERSION,
  formatearFechaBuild,
} from "@/lib/version/os-release";

describe("FranjaDescargaOs", () => {
  it("muestra la versión canónica y abre Información y versiones", () => {
    let aperturas = 0;
    const vista = render(
      <AppearanceProvider>
        <FranjaDescargaOs onAbrirFicha={() => { aperturas += 1; }} />
      </AppearanceProvider>,
    );
    const franja = screen.getByTestId("franja-descarga-os");

    expect(franja.textContent).toContain(OS_VERSION);
    expect(franja.textContent).toContain(formatearFechaBuild(OS_FECHA));
    expect(franja.textContent).not.toContain("2026.07.01");

    const boton = screen.getByRole("button", {
      name: "Información y versiones",
    });
    fireEvent.click(boton);
    expect(aperturas).toBe(1);

    vista.unmount();
  });
});
