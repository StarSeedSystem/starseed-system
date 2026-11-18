import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  MenuTexto,
  abreMenuTexto,
  establecerPaginaTraducida,
  esEditable,
  registrarEntradaMenuTexto,
  type ContextoMenuTexto,
} from "../menu-texto";

function clickPrimerMenu() {
  fireEvent.click(screen.getByRole("menuitem"));
}

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
  establecerPaginaTraducida(false);
  document.body.textContent = "";
});

describe("MenuTexto · campos editables", () => {
  it("abre en editable con selección no vacía y ctx.editable es true", () => {
    const vistas: ContextoMenuTexto[] = [];
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: (c) => vistas.push(c) });
    render(<MenuTexto />);
    const input = document.createElement("input");
    input.type = "text";
    input.value = "texto seleccionado";
    input.setSelectionRange(0, 5);
    document.body.append(input);
    input.focus();
    fireEvent.contextMenu(input);
    expect(screen.getByRole("menu", { name: "Menú del texto" })).toBeInTheDocument();
    clickPrimerMenu();
    expect(vistas[0].editable).toBe(true);
    expect(vistas[0].seleccionEditable?.texto).toBe("texto");
  });

  it("no abre en editable sin selección", () => {
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: () => {} });
    render(<MenuTexto />);
    const input = document.createElement("input");
    input.type = "text";
    input.value = "sin selección";
    document.body.append(input);
    input.focus();
    fireEvent.contextMenu(input);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("no abre en type=password aunque haya selección", () => {
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: () => {} });
    render(<MenuTexto />);
    const input = document.createElement("input");
    input.type = "password";
    input.value = "secreto";
    input.setSelectionRange(0, 3);
    document.body.append(input);
    input.focus();
    fireEvent.contextMenu(input);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ctx.editable es false en elementos no editables", () => {
    const vistas: ContextoMenuTexto[] = [];
    registrar({ id: "traducir", etiqueta: "Traducir selección", ejecutar: (c) => vistas.push(c) });
    render(<MenuTexto />);
    fireEvent.contextMenu(destino());
    clickPrimerMenu();
    expect(vistas[0].editable).toBe(false);
  });

  it("abreMenuTexto respeta selección en editable y rechaza password", () => {
    const inputTexto = document.createElement("input");
    inputTexto.type = "text";
    const inputPass = document.createElement("input");
    inputPass.type = "password";
    const p = document.createElement("p");
    p.textContent = "texto";
    expect(abreMenuTexto({}, inputTexto, true, true)).toBe(true);
    expect(abreMenuTexto({}, inputTexto, true, false)).toBe(false);
    expect(abreMenuTexto({}, inputPass, true, true)).toBe(false);
    expect(abreMenuTexto({}, p, true, false)).toBe(true);
    expect(abreMenuTexto({}, p, false, false)).toBe(false);
  });

  it("entradas con visible que usa ctx.editable se filtran correctamente", () => {
    const vistas: ContextoMenuTexto[] = [];
    registrar({
      id: "reemplazar",
      etiqueta: "Reemplazar por la traducción",
      visible: (c) => c.editable && c.seleccionEditable !== null,
      ejecutar: (c) => vistas.push(c),
    });
    registrar({ id: "traducir", etiqueta: "Traducir selección", visible: () => true, ejecutar: () => {} });
    render(<MenuTexto />);
    const input = document.createElement("input");
    input.type = "text";
    input.value = "seleccionado";
    input.setSelectionRange(0, 5);
    document.body.append(input);
    input.focus();
    fireEvent.contextMenu(input);
    expect(screen.getByRole("menuitem", { name: "Reemplazar por la traducción" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeInTheDocument();
  });
});