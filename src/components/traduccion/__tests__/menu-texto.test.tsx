/**
 * Pruebas del menú global del clic derecho sobre texto (Ola 1020U · TRD1020E).
 * Cada prueba limpia el registro para no arrastrar entradas a la siguiente.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  MenuTextoGlobal,
  esObjetivoEditable,
  posicionMenu,
  prepararContexto,
  reiniciarEntradasMenuTexto,
  registrarEntradaMenuTexto,
} from "../menu-texto";

afterEach(() => {
  cleanup();
  document.getElementById("pagina")?.remove();
});
beforeEach(reiniciarEntradasMenuTexto);

/** Monta el anfitrión y una página de mentira: párrafo e input de la misma raíz. */
function montar() {
  render(<MenuTextoGlobal />);
  const plataforma = document.createElement("div");
  plataforma.innerHTML = '<div id="pagina"><p id="parrafo">párrafo que se usa</p><input id="campo" /></div>';
  document.body.appendChild(plataforma);
  return plataforma;
}

function abrirEn(id: string, opciones?: { shiftKey?: boolean; preventDefault?: boolean }) {
  const objetivo = document.getElementById(id)!;
  const evento = new MouseEvent("contextmenu", {
    bubbles: true, cancelable: true, shiftKey: opciones?.shiftKey ?? false,
  });
  if (opciones?.preventDefault) evento.preventDefault();
  objetivo.dispatchEvent(evento);
  return evento;
}

describe("helpers puros", () => {
  it("esObjetivoEditable reconoce campos y contenido editable", () => {
    document.body.innerHTML = '<input id="a" /><div id="b" contenteditable="true"></div><p id="c">buenos días</p>';
    expect(esObjetivoEditable(document.getElementById("a"))).toBe(true);
    expect(esObjetivoEditable(document.getElementById("b"))).toBe(true);
    expect(esObjetivoEditable(document.getElementById("c"))).toBe(false);
    expect(esObjetivoEditable(null)).toBe(false);
  });

  it("prepararContexto limpia espacios y limita a 280", () => {
    const largo = "abcd ".repeat(80);
    const ctx = prepararContexto(`   ${largo}  `, "\n   texto   del   bloque  \n", true);
    expect(ctx.seleccion).toHaveLength(280);
    expect(ctx.bloque).toBe("texto del bloque");
    expect(ctx.paginaTraducida).toBe(true);
    expect(prepararContexto("", null, false)).toEqual({ seleccion: "", bloque: null, paginaTraducida: false });
  });

  it("posicionMenu sujeta dentro de la ventana", () => {
    expect(posicionMenu(0, 0, { innerWidth: 800, innerHeight: 600 })).toEqual({ x: 8, y: 8 });
    expect(posicionMenu(799, 599, { innerWidth: 800, innerHeight: 600 })).toEqual({ x: 610, y: 542 });
    expect(posicionMenu(400, 300, { innerWidth: 800, innerHeight: 600 })).toEqual({ x: 400, y: 300 });
  });
});

describe("MenuTextoGlobal", () => {
  let soloId = 0;
  const SOLA_ = () => ({ id: `otra-${(soloId += 1)}`, etiqueta: "Traducir selección", ejecutar: () => {} });

  it("abre sobre texto con las entradas registradas y las ejecuta con su ctx", () => {
    let recibido = "";
    registrarEntradaMenuTexto({
      id: "traducir",
      etiqueta: "Traducir selección",
      ejecutar: (ctx) => { recibido = ctx.seleccion; },
    });
    registrarEntradaMenuTexto({
      id: "pagin",
      etiqueta: "Traducir toda la página",
      ejecutar: () => {},
    });
    montar();
    abrirEn("parrafo");
    const menu = screen.getByRole("menu", { name: "Menú del texto" });
    expect(menu).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeVisible();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    screen.getByRole("menuitem", { name: "Traducir selección" }).click();
    expect(recibido).toBe("párrafo que se usa");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("no abre en campos editables, con Mayúsculas ni si el evento ya viene atendido", () => {
    registrarEntradaMenuTexto({ id: "x", etiqueta: "Siempre", ejecutar: () => {} });
    montar();
    abrirEn("campo");
    abrirEn("parrafo", { shiftKey: true });
    abrirEn("parrafo", { preventDefault: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("sin entradas visibles no abre su menú (manda el navegador)", () => {
    montar();
    abrirEn("parrafo");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("respeta las entradas que no se ven en un contexto", () => {
    registrarEntradaMenuTexto({
      id: "pocas",
      etiqueta: "Solo con selección",
      visible: (ctx) => ctx.seleccion.length > 0,
      ejecutar: () => {},
    });
    montar();
    abrirEn("parrafo");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("el registro se actualiza sin duplicar y se reordena la última versión", () => {
    registrarEntradaMenuTexto(SOLA_());
    registrarEntradaMenuTexto({ ...SOLA_(), etiqueta: "Traducir con Astraura" });
    montar();
    abrirEn("parrafo");
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Traducir con Astraura" })).toBeVisible();
  });

  it("el teclado entra con foco en la primera entrada, se mueve con flechas y cierra con Escape", () => {
    registrarEntradaMenuTexto({ id: "uno", etiqueta: "Entrada uno", ejecutar: () => {} });
    registrarEntradaMenuTexto({ id: "dos", etiqueta: "Entrada dos", ejecutar: () => {} });
    montar();
    abrirEn("parrafo");
    const menu = screen.getByRole("menu", { name: "Menú del texto" });
    expect(document.activeElement?.getAttribute("data-id-entrada")).toBe("uno");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-id-entrada")).toBe("dos");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("data-id-entrada")).toBe("uno");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("un clic fuera cierra el menú", () => {
    registrarEntradaMenuTexto(SOLA_());
    montar();
    abrirEn("parrafo");
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.pointerDown(document.getElementById("pagina")!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
