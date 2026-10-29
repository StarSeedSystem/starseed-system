import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { MenuTexto, registrarEntradaMenuTexto, establecerPaginaTraducida } from "../menu-texto";

const quitarEntradas: Array<() => void> = [];
function registrar(entrada: Parameters<typeof registrarEntradaMenuTexto>[0]) {
  quitarEntradas.push(registrarEntradaMenuTexto(entrada));
}

afterEach(() => {
  cleanup();
  while (quitarEntradas.length > 0) quitarEntradas.pop()?.();
  establecerPaginaTraducida(false);
  document.body.textContent = "";
});

describe("MenuTexto · integracion de traduccion", () => {
  it("muestra las entradas correctas cuando la pagina NO esta traducida", () => {
    const ejecutar = vi.fn();
    registrar({ id: "traducir-sel", etiqueta: "Traducir selección", ejecutar });
    registrar({ id: "traducir-par", etiqueta: "Traducir este párrafo", ejecutar });
    // La entrada "Traducir toda la página" ya está registrada a nivel módulo con visible: !paginaTraducida
    // La entrada "Ver original" ya está registrada a nivel módulo con visible: paginaTraducida
    
    render(<MenuTexto />);
    const p = document.createElement("p");
    p.textContent = "Texto para traducir";
    document.body.append(p);
    fireEvent.contextMenu(p);
    
    expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Traducir este párrafo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Traducir toda la página" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ver original" })).not.toBeInTheDocument();
  });

  it("muestra la entrada Ver original cuando la pagina ESTA traducida", () => {
    registrar({ id: "traducir-sel", etiqueta: "Traducir selección", ejecutar: () => {} });
    registrar({ id: "traducir-par", etiqueta: "Traducir este párrafo", ejecutar: () => {} });
    // No registrar las entradas existentes del módulo para no sobreescribir su lógica visible
    establecerPaginaTraducida(true);
    
    render(<MenuTexto />);
    const p = document.createElement("p");
    p.textContent = "Texto traducido";
    document.body.append(p);
    fireEvent.contextMenu(p);
    
    expect(screen.queryByRole("menuitem", { name: "Traducir toda la página" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Ver original" })).toBeInTheDocument();
  });
});
