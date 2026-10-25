import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelOrbe } from "../panel-orbe";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

const base = {
  forma: "merkaba" as const,
  fijada: null,
  estilo: "sobria" as const,
  alElegirForma: () => {},
  alElegirEstilo: () => {},
  alAbrirLienzo: () => {},
  alApagar: () => {},
  alCerrar: () => {},
};

describe("PanelOrbe en pantallas chicas", () => {
  afterEach(cleanup);

  it("bajo 640 px se vuelve hoja inferior fija dentro de la pantalla", () => {
    render(<PanelOrbe {...base} lado={{ horizontal: "derecha", vertical: "abajo" }} />);
    const panel = screen.getByRole("dialog", { name: "Protomolécula" });
    for (const c of ["max-sm:fixed", "max-sm:inset-x-3", "max-sm:w-auto", "max-sm:overflow-y-auto"]) {
      expect(panel.className).toContain(c);
    }
  });

  it("en pantallas anchas sigue junto a la orbe, del lado que toca", () => {
    render(<PanelOrbe {...base} lado={{ horizontal: "izquierda", vertical: "arriba" }} />);
    const panel = screen.getByRole("dialog", { name: "Protomolécula" });
    expect(panel.className).toContain("right-full");
    expect(panel.className).toContain("bottom-0");
  });
});
