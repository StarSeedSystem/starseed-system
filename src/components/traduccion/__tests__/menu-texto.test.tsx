import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  MenuTexto,
  abreMenuTexto,
  establecerPaginaTraducida,
  esEditable,
  entradasVisibles,
  posicionMenu,
  registrarEntradaMenuTexto,
  type ContextoMenuTexto,
} from "../menu-texto";

const quitarEntradas: Array<() => void> = [];
function registrar(entrada: Parameters<typeof registrarEntradaMenuTexto>[0]) {
  quitarEntradas.push(registrarEntradaMenuTexto(entrada));
}
function destino() {
  const p = document.createElement("p");
  p.textContent = "Trama viva del texto";
  document.body.append(p);
  return p;
}

afterEach(() => {
  cleanup();
  while (quitarEntradas.length > 0) quitarEntradas.pop()?.();
  // Limpiar entradas registradas al final del archivo si es necesario
  // o asegurarse de que cada test las registre y limpie correctamente.
  establecerPaginaTraducida(false);
  document.body.textContent = "";
});

describe("MenuTexto", () => {
  it("abre sobre texto, enseña las entradas y ejecuta con el ctx", () => {
    // Limpiar entradas existentes registradas en el archivo principal
    while (quitarEntradas.length > 0) quitarEntradas.pop()?.();
    const vistas: ContextoMenuTexto[] = [];
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: (c) => vistas.push(c) });
    render(<MenuTexto />);
    fireEvent.contextMenu(destino());
    expect(screen.getByRole("menu", { name: "Menú del texto" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Traducir selección" }));
    expect(vistas).toHaveLength(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("no abre en campos editables, con Mayúsculas ni si el navegador ya atendió", () => {
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: () => {} });
    render(<MenuTexto />);
    const campo = document.createElement("input");
    document.body.append(campo);
    fireEvent.contextMenu(campo);
    fireEvent.contextMenu(destino(), { shiftKey: true });
    // «Ya atendido» no se lleva en el init del evento: se simula con preventDefault real.
    const atendido = createEvent.contextMenu(destino());
    atendido.preventDefault();
    fireEvent(destino(), atendido);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clic fuera y Escape cierran, y las flechas mueven el foco", () => {
    registrar({ id: "uno", etiqueta: "Traducir toda la página", ejecutar: () => {} });
    registrar({ id: "dos", etiqueta: "Ver original", ejecutar: () => {} });
    render(<MenuTexto />);
    fireEvent.contextMenu(destino());
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toHaveTextContent("Traducir toda la página");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toHaveTextContent("Ver original");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toHaveTextContent("Traducir toda la página");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.contextMenu(destino());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("el ctx dice si la página está traducida y las entradas se filtran", () => {
    const vistas: ContextoMenuTexto[] = [];
    registrar({
      id: "ver-original",
      etiqueta: "Ver original",
      visible: (c) => c.paginaTraducida,
      ejecutar: (c) => vistas.push(c),
    });
    render(<MenuTexto />);
    const p = destino();
    fireEvent.contextMenu(p);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    establecerPaginaTraducida(true);
    fireEvent.contextMenu(p);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(vistas[0].paginaTraducida).toBe(true);
  });

  it("las piezas puras deciden el disparo, el campo editable y la esquina", () => {
    const p = destino();
    expect(abreMenuTexto({ shiftKey: true }, p, true)).toBe(false);
    expect(abreMenuTexto({}, p, true)).toBe(true);
    expect(abreMenuTexto({}, p, false)).toBe(false);
    expect(abreMenuTexto({}, null, true)).toBe(false);
    expect(esEditable(p)).toBe(false);
    expect(esEditable(document.createElement("textarea"))).toBe(true);
    expect(posicionMenu(50, 50, 224, 100, { ancho: 300, alto: 200 })).toEqual({ izquierda: 50, arriba: 50 });
    expect(posicionMenu(2800, 1900, 224, 100, { ancho: 300, alto: 200 })).toEqual({ izquierda: 68, arriba: 92 });
    const lista = [
      { id: "a", etiqueta: "A", ejecutar: () => {} },
      { id: "b", etiqueta: "B", visible: () => false, ejecutar: () => {} },
      { id: "c", etiqueta: "C", visible: () => true, ejecutar: () => {} },
    ];
    expect(entradasVisibles(lista, { seleccion: "", objetivo: null, paginaTraducida: false }).map((e) => e.id)).toEqual([
      "a",
      "c",
    ]);
  });
});
