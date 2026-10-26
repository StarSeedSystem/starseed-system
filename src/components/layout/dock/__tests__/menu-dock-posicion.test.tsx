/**
 * Menú de un icono del dock: SIEMPRE `position: fixed` en línea. `.glass-edge` (globals.css) pone `position: relative`
 * y le ganaba a la clase `fixed` de Tailwind: el menú se quedaba relativo al dock y medio fuera de la pantalla
 * (visto en localhost:9002 el 2026-10-26).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenuDockItem from "../menu-dock-item";

afterEach(cleanup);

describe("MenuDockItem · posición", () => {
  it("el panel lleva position: fixed en línea y se abre por encima del dock", () => {
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const item = { id: "perfil", label: "Perfil", iconKey: "user", path: "/profile", color: "#fff", enabled: true, origin: "preset" } as never;
    render(
      <MenuDockItem
        item={item}
        ancla={{ top: 820, left: 100, width: 56, height: 56 } as never}
        carpetas={[]}
        pathname="/dashboard"
        navegar={vi.fn()}
        alCerrar={vi.fn()}
        alQuitar={vi.fn()}
        alMover={vi.fn()}
        alMeterEnCarpeta={vi.fn()}
        alSacarDeCarpeta={vi.fn()}
      />,
    );
    const panel = document.querySelector<HTMLElement>("[data-dock-menu]");
    expect(panel).not.toBeNull();
    expect(panel!.style.position).toBe("fixed");
    expect(panel!.style.bottom).not.toBe(""); // cerca del borde de abajo: se abre hacia arriba
  });
});
