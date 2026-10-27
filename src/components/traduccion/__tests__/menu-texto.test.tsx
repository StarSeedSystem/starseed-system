import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  MenuTexto, _reiniciarMenuTexto, entradasMenuTexto, marcarPaginaTraducida, registrarEntradaMenuTexto, type ContextoMenuTexto,
} from "../menu-texto";

/** Grupo donde caen los contextos que ejecuta la entrada de prueba. */
const vistos: ContextoMenuTexto[] = [];

/** Registro una entrada que apunta lo que el menú le pasa. */
function registrarPrueba(): () => void {
  return registrarEntradaMenuTexto({ id: "prueba", etiqueta: "Traducir la selección", ejecutar: (ctx) => { vistos.push(ctx); } });
}

/** Monto la escena mínima: el menú hospedado, un párrafo con texto y un campo editable. */
function escena(): HTMLParagraphElement {
  render(
    <div>
      <MenuTexto />
      <section>
        <p>Párrafo bajo el puntero</p>
      </section>
      <input aria-label="Campo de escritura" />
    </div>,
  );
  return screen.getByText("Párrafo bajo el puntero");
}

describe("MenuTexto — el menú del clic derecho compartido", () => {
  beforeEach(() => { _reiniciarMenuTexto(); vistos.length = 0; });
  afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); });

  it("se abre sobre un texto, ejecuta la entrada con su contexto y se cierra", async () => {
    registrarPrueba();
    fireEvent.contextMenu(escena());
    await screen.findByRole("menu");
    fireEvent.click(screen.getByRole("menuitem", { name: "Traducir la selección" }));
    expect(vistos.length).toBe(1);
    expect(vistos[0].bloque).toBe("Párrafo bajo el puntero");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("no abre en campos editables, con Mayúsculas ni con el clic ya atendido", () => {
    registrarPrueba(); escena();
    fireEvent.contextMenu(screen.getByRole("textbox"));
    fireEvent.contextMenu(screen.getByText("Párrafo bajo el puntero"), { shiftKey: true });
    const atendido = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    atendido.preventDefault();
    fireEvent(screen.getByText("Párrafo bajo el puntero"), atendido);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("sin entradas visibles para ese contexto no abre; si aparece la hay, sí", async () => {
    registrarEntradaMenuTexto({ id: "solo-traducida", etiqueta: "Revisar la traducción", visible: (ctx) => ctx.paginaTraducida });
    fireEvent.contextMenu(escena());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    marcarPaginaTraducida(true);
    fireEvent.contextMenu(screen.getByText("Párrafo bajo el puntero"));
    await screen.findByRole("menu");
  });

  it("el contexto lleva la selección que haya en la página", async () => {
    registrarPrueba(); const objetivo = escena();
    const rango = document.createRange();
    rango.selectNodeContents(objetivo);
    window.getSelection()?.addRange(rango);
    fireEvent.contextMenu(objetivo);
    await screen.findByRole("menu");
    fireEvent.click(screen.getByRole("menuitem", { name: "Traducir la selección" }));
    expect(vistos[0]?.seleccion).toBe("Párrafo bajo el puntero");
  });

  it("el foco entra por el primer ítem, las flechas lo mueven y Escape cierra", async () => {
    registrarPrueba();
    registrarEntradaMenuTexto({ id: "otra", etiqueta: "Otra acción" });
    escena();
    fireEvent.contextMenu(screen.getByText("Párrafo bajo el puntero"));
    const menu = await screen.findByRole("menu");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[1]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clic fuera del menú lo cierra y dentro no", async () => {
    registrarPrueba(); escena();
    fireEvent.contextMenu(screen.getByText("Párrafo bajo el puntero"));
    const menu = await screen.findByRole("menu");
    fireEvent.pointerDown(menu);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("el registro sustituye por id y quitar() lo elimina", () => {
    const quitar = registrarPrueba();
    expect(entradasMenuTexto().length).toBe(1);
    registrarEntradaMenuTexto({ id: "prueba", etiqueta: "Versión distinta" });
    expect(entradasMenuTexto().length).toBe(1);
    expect(entradasMenuTexto()[0].etiqueta).toBe("Versión distinta");
    quitar();
    expect(entradasMenuTexto().length).toBe(0);
  });

  it("sin texto bajo el puntero tampoco abre", async () => {
    registrarPrueba();
    render(
      <div>
        <MenuTexto />
        <div data-testid="vacio"><span>&nbsp;</span></div>
      </div>,
    );
    fireEvent.contextMenu(screen.getByTestId("vacio"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
