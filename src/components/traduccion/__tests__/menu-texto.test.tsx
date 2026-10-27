import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MenuTexto, registrarEntradaMenuTexto, type EntradaMenuTexto } from "@/components/traduccion/menu-texto";

// Pruebas del menú del clic derecho sobre texto (TRD1020E · contrato
// architecture/repos-libreria-1020d.md §4): abre sobre texto, no abre en campos
// editables ni con Mayúsculas ni ya atendido, enseña las entradas del registro
// compartido que su `visible` deja ver y funciona con teclado.

const BAJAS: (() => void)[] = [];
/** Registra una entrada de prueba (etiqueta = id) y apunta su baja para retirarla tras cada prueba. */
function vigiar(id: string, opciones: Partial<Pick<EntradaMenuTexto, "ejecutar" | "visible">> = {}): EntradaMenuTexto["ejecutar"] {
  const ejecutar = opciones.ejecutar ?? vi.fn();
  BAJAS.push(registrarEntradaMenuTexto({ id, etiqueta: id, ...opciones, ejecutar }));
  return ejecutar;
}

/** Monta la escena de prueba: su contenido y el menú global, que se abre en el puntero. */
function montar(mirable: React.ReactNode) {
  return render(<>{mirable}<MenuTexto /></>);
}

const Clic = (objeto: HTMLElement, extras: Partial<MouseEventInit> = {}) =>
  fireEvent.contextMenu(objeto, { clientX: 24, clientY: 40, ...extras });

afterEach(() => {
  while (BAJAS.length) BAJAS.pop()?.(); cleanup();
});

describe("MenuTexto · apertura", () => {
  it("abre sobre texto, en el puntero; al elegirla ejecuta con su contexto y se cierra", () => {
    const ejecutar = vigiar("Traducir selección");
    montar(<p id="parrafo">Texto de la página</p>);
    Clic(screen.getByText("Texto de la página"));
    const menu = screen.getByRole("menu", { name: "Acciones de texto" });
    expect(menu.style.left).toBe("24px"); // se abre donde se clica (jsdom, sin recorte en el borde)
    expect(screen.getByRole("menuitem", { name: "Traducir selección" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Traducir selección" }));
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ seleccion: "", bloque: "Texto de la página", paginaTraducida: false }),
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("no abre en campos editables, sin texto debajo, con Mayúsculas ni si ya viene atendido", () => {
    vigiar("Traducir selección");
    montar(
      <>
        <input aria-label="Cuaderno" />
        <div contentEditable>Escribe aquí</div>
        <div aria-label="Rincón vacío" />
        <p>Texto sin prisa</p>
      </>,
    );
    const sinMenu = () => expect(screen.queryByRole("menu")).toBeNull();

    Clic(screen.getByLabelText("Cuaderno")); // campo editable
    sinMenu();
    Clic(screen.getByLabelText("Rincón vacío")); // sin texto debajo no es «sobre texto»
    sinMenu();
    Clic(screen.getByText("Texto sin prisa"), { shiftKey: true }); // Mayúsculas: menú del navegador
    sinMenu();
    const atendido = (e: Event) => e.preventDefault(); // ya atendido por otra capa: el navegador decide
    document.addEventListener("contextmenu", atendido);
    try {
      Clic(screen.getByText("Texto sin prisa"));
    } finally {
      document.removeEventListener("contextmenu", atendido);
    }
    sinMenu();
  });

  it("solo enseña las entradas que su visible deja ver, y ctx lleva si la página está traducida", () => {
    const verOriginal = vigiar("Ver original", { visible: (c) => c.paginaTraducida });
    const esteParrafo = vigiar("Traducir este párrafo");
    montar(<p>Texto de la página</p>);
    Clic(screen.getByText("Texto de la página"));
    expect(screen.queryByRole("menuitem", { name: "Ver original" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Traducir este párrafo" })).toBeTruthy();

    fireEvent(window, new CustomEvent("starseed:traduccion-pagina", { detail: { traducida: true } }));
    Clic(screen.getByText("Texto de la página"));
    expect(screen.getByRole("menuitem", { name: "Ver original" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Ver original" }));
    expect(verOriginal).toHaveBeenCalledWith(expect.objectContaining({ paginaTraducida: true }));
    expect(esteParrafo).not.toHaveBeenCalled();
  });

  it("el contexto lleva la selección del momento del clic", () => {
    const ejecutar = vigiar("Traducir selección");
    montar(<p>Texto de la página</p>);
    const parrafo = screen.getByText("Texto de la página") as HTMLElement;
    const rango = document.createRange();
    rango.selectNodeContents(parrafo.firstChild ?? parrafo);
    rango.setEnd(parrafo.firstChild ?? parrafo, 5); // «Texto»
    window.getSelection()?.addRange(rango);
    Clic(parrafo);
    fireEvent.click(screen.getByRole("menuitem", { name: "Traducir selección" }));
    expect(ejecutar).toHaveBeenCalledWith(expect.objectContaining({ seleccion: "Texto" }));
  });
});

describe("MenuTexto · teclado", () => {
  it("el foco entra al primero al abrir, flechas recorren con eco y Escape cierra", () => {
    vigiar("Traducir selección");
    vigiar("Traducir este párrafo");
    vigiar("Traducir toda la página");
    montar(<p>Texto de la página</p>);
    Clic(screen.getByText("Texto de la página"));
    expect(document.activeElement?.textContent).toBe("Traducir selección");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Traducir este párrafo");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Traducir selección");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" }); // con eco hasta el último
    expect(document.activeElement?.textContent).toBe("Traducir toda la página");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
