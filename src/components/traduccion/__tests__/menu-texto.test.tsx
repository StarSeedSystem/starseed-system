import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  MenuTextoGlobal,
  acoplarPuntoMenu,
  declararPaginaTraducida,
  menuDebeAbrir,
  registrarEntradaMenuTexto,
} from "../menu-texto";

function montar() {
  return render(
    <div>
      <MenuTextoGlobal />
      <p data-bloque-texto="seccion">Párrafo de prueba</p>
      <input aria-label="Campo" />
    </div>,
  );
}

function abrirSobreTexto() {
  fireEvent.contextMenu(screen.getByText("Párrafo de prueba"));
}

/** Evento contextmenu con `defaultPrevented` ya puesto (el caso «ya atendido»). */
function clicDerechoAtendido(): void {
  const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  evento.preventDefault();
  screen.getByText("Párrafo de prueba").dispatchEvent(evento);
}

/** Registra y recuerda cómo quitarla: el listado es compartido entre pruebas. */
const desregistrar: Array<() => void> = [];
function registrar(entrada: Parameters<typeof registrarEntradaMenuTexto>[0]) {
  desregistrar.push(registrarEntradaMenuTexto(entrada));
}

afterEach(() => {
  cleanup();
  while (desregistrar.length) desregistrar.pop()?.();
});

describe("menuDebeAbrir", () => {
  it("devuelve false si el evento ya viene atendido, con Mayúsculas o en editable", () => {
    const objetivo = document.createElement("p");
    expect(menuDebeAbrir({ defaultPrevented: true, shiftKey: false }, objetivo)).toBe(false);
    expect(menuDebeAbrir({ defaultPrevented: false, shiftKey: true }, objetivo)).toBe(false);
    expect(menuDebeAbrir({ defaultPrevented: false, shiftKey: false }, null)).toBe(false);
    const campo = document.createElement("input");
    expect(menuDebeAbrir({ defaultPrevented: false, shiftKey: false }, campo)).toBe(false);
  });

  it("devuelve true sobre texto normal", () => {
    const objetivo = document.createElement("p");
    expect(menuDebeAbrir({ defaultPrevented: false, shiftKey: false }, objetivo)).toBe(true);
  });
});

describe("acoplarPuntoMenu", () => {
  it("recorta el punto para que el menú no salga de la ventana", () => {
    const dentro = acoplarPuntoMenu(10, 10, 2, { interiorAncho: 1000, interiorAlto: 800 });
    expect(dentro).toEqual({ x: 10, y: 10 });
    const borde = acoplarPuntoMenu(990, 790, 3, { interiorAncho: 1000, interiorAlto: 800 });
    expect(borde.x).toBe(1000 - 224 - 8);
    expect(borde.y).toBeLessThanOrEqual(800 - 8 - 3 * 44);
  });
});

describe("MenuTextoGlobal", () => {
  it("abre sobre texto y ejecuta una entrada registrada, cerrando el menú", async () => {
    const ejecutar = vi.fn();
    registrar({ id: "prueba-abrir", etiqueta: "Traducir selección", ejecutar });
    montar();
    abrirSobreTexto();
    const menu = await screen.findByRole("menu", { name: "Acciones sobre el texto" });
    expect(menu).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Traducir selección/ }));
    await waitFor(() => expect(ejecutar).toHaveBeenCalledTimes(1));
    expect(ejecutar.mock.calls[0][0]).toHaveProperty("paginaTraducida", false);
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Acciones sobre el texto" })).toBeNull());
  });

  it("no abre en campos editables, con Mayúsculas ni si el evento ya vino atendido", () => {
    registrar({ id: "prueba-navegador", etiqueta: "Traducir selección", ejecutar: vi.fn() });
    montar();
    fireEvent.contextMenu(screen.getByLabelText("Campo"));
    fireEvent.contextMenu(screen.getByText("Párrafo de prueba"), { shiftKey: true });
    clicDerechoAtendido();
    expect(screen.queryByRole("menu", { name: "Acciones sobre el texto" })).toBeNull();
  });

  it("respeta visible(ctx): la entrada oculta no aparece hasta que la página está traducida", async () => {
    registrar({
      id: "prueba-visible",
      etiqueta: "Ver original",
      visible: (ctx) => ctx.paginaTraducida,
      ejecutar: vi.fn(),
    });
    registrar({
      id: "prueba-visible-2",
      etiqueta: "Traducir párrafo",
      visible: (ctx) => !ctx.paginaTraducida,
      ejecutar: vi.fn(),
    });
    montar();
    abrirSobreTexto();
    expect(await screen.findByRole("menu", { name: "Acciones sobre el texto" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ver original" })).toBeNull();
    cleanup();
    declararPaginaTraducida(true);
    montar();
    abrirSobreTexto();
    expect(await screen.findByRole("menuitem", { name: "Ver original" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Traducir párrafo" })).toBeNull();
    declararPaginaTraducida(false);
  });

  it("registrarEntradaMenuTexto es idempotente por id (una sola entrada en el menú)", async () => {
    const ejecutar = vi.fn();
    registrar({ id: "prueba-unico", etiqueta: "Variaciones públicas", ejecutar });
    registrar({ id: "prueba-unico", etiqueta: "Variaciones públicas", ejecutar });
    montar();
    abrirSobreTexto();
    const items = await screen.findAllByRole("menuitem", { name: "Variaciones públicas" });
    expect(items).toHaveLength(1);
  });

  it("teclado: flechas mueven el foco entre entradas y Escape cierra", async () => {
    registrar({ id: "prueba-teclado-1", etiqueta: "Traducir selección", ejecutar: vi.fn() });
    registrar({ id: "prueba-teclado-2", etiqueta: "Variaciones públicas", ejecutar: vi.fn() });
    montar();
    abrirSobreTexto();
    const primero = await screen.findByRole("menuitem", { name: "Traducir selección" });
    await waitFor(() => expect(primero).toHaveFocus());
    const segundo = screen.getByRole("menuitem", { name: "Variaciones públicas" });
    fireEvent.keyDown(primero, { key: "ArrowDown" });
    expect(segundo).toHaveFocus();
    fireEvent.keyDown(segundo, { key: "ArrowUp" });
    expect(primero).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu", { name: "Acciones sobre el texto" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("un clic fuera del menú lo cierra", async () => {
    registrar({ id: "prueba-fuera", etiqueta: "Traducir selección", ejecutar: vi.fn() });
    montar();
    abrirSobreTexto();
    await screen.findByRole("menu", { name: "Acciones sobre el texto" });
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

});
