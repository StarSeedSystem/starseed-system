import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

interface PizarraDePrueba { id: string; name: string; createdAt: number; updatedAt: number; isPublic: boolean; widgets: unknown[]; theme: string }

const tablero = vi.hoisted(() => ({
  boards: [] as PizarraDePrueba[],
  createBoard: vi.fn(),
  deleteBoard: vi.fn(),
  setActiveBoard: vi.fn(),
  activeBoardId: null as string | null,
}));
vi.mock("@/context/board-context", () => ({ useBoardSystem: () => tablero }));

import { ContenidoHorizon } from "../../contenido-horizon";
import { ACCIONES_CREAR, DESTINOS_PUBLICACION, LIENZO_UNIVERSAL } from "../datos";

const pizarra = (id: string, name: string, updatedAt: number, widgets = 0): PizarraDePrueba => ({
  id, name, createdAt: updatedAt, updatedAt, isPublic: false, widgets: Array.from({ length: widgets }), theme: "glass",
});

describe("Cortina Horizon · Centro de Creación", () => {
  const ir = vi.fn();
  const abrirEditor = vi.fn();
  const abrirFragua = vi.fn();
  const abrirPizarra = vi.fn();
  const montar = () => render(<ContenidoHorizon ir={ir} abrirEditor={abrirEditor} abrirFragua={abrirFragua} abrirPizarra={abrirPizarra} />);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    tablero.boards = [];
  });
  afterEach(() => cleanup());

  it("cabecera: «Centro de Creación», el logo para la coreografía y «Abrir página completa» → /crear", () => {
    const { container } = montar();
    expect(screen.getByRole("heading", { level: 2, name: "Centro de Creación" })).toBeTruthy();
    expect(container.querySelector('[data-ss-coreo="logo"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Abrir página completa/ }));
    expect(ir).toHaveBeenCalledWith("/crear");
  });

  it("la tarjeta de la Protomolécula va arriba, antes que Crear", () => {
    montar();
    const tarjeta = screen.getByTestId("tarjeta-protomolecula");
    const crear = screen.getByRole("button", { name: "Crear" });
    expect(tarjeta.compareDocumentPosition(crear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el Lienzo Universal abre /crear?area=lienzo", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(LIENZO_UNIVERSAL.rotulo) }));
    expect(ir).toHaveBeenCalledWith("/crear?area=lienzo");
  });

  it("cada acción rápida lleva a su ruta o a su evento", () => {
    montar();
    const rejilla = within(screen.getByRole("list", { name: "Acciones rápidas de creación" }));
    for (const a of ACCIONES_CREAR) {
      vi.clearAllMocks();
      fireEvent.click(rejilla.getByRole("button", { name: new RegExp(a.rotulo) }));
      if (a.destino.tipo === "ruta") expect(ir).toHaveBeenCalledWith(a.destino.href);
      else if (a.destino.tipo === "editor") expect(abrirEditor).toHaveBeenCalledTimes(1);
      else expect(abrirFragua).toHaveBeenCalledTimes(1);
    }
    expect(ACCIONES_CREAR.length).toBe(8);
  });

  it("los cuatro destinos de publicación abren /crear?area=publicar&dest=…", () => {
    montar();
    const zona = within(screen.getByRole("list", { name: "Destinos de publicación" }));
    for (const d of DESTINOS_PUBLICACION) {
      vi.clearAllMocks();
      fireEvent.click(zona.getByRole("button", { name: new RegExp(d.rotulo) }));
      expect(ir).toHaveBeenCalledWith(d.href);
    }
  });

  it("sin pizarras: aviso y «Crear la primera» crea y la abre", () => {
    montar();
    expect(screen.getByText("Aún no hay pizarras.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crear la primera" }));
    expect(tablero.createBoard).toHaveBeenCalledWith("Nueva Pizarra 1");
    expect(abrirPizarra).toHaveBeenCalledWith();
  });

  it("«Nueva» crea y abre; «Nube» lleva a /pizarras", () => {
    tablero.boards = [pizarra("a", "Ideas", 1_000)];
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Nueva/ }));
    expect(tablero.createBoard).toHaveBeenCalledWith("Nueva Pizarra 2");
    expect(abrirPizarra).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Nube/ }));
    expect(ir).toHaveBeenCalledWith("/pizarras");
  });

  it("abre una pizarra por su fila y dice cuántos elementos tiene", () => {
    tablero.boards = [pizarra("a", "Ideas", 2_000, 3), pizarra("b", "Plan", 1_000, 1)];
    montar();
    expect(screen.getByText(/3 elementos/)).toBeTruthy();
    expect(screen.getByText(/1 elemento$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir la pizarra Plan" }));
    expect(abrirPizarra).toHaveBeenCalledWith("b");
  });

  it("borrar pide confirmación en la fila: cancelar no borra, confirmar sí", () => {
    tablero.boards = [pizarra("a", "Ideas", 2_000)];
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Borrar la pizarra Ideas" }));
    expect(tablero.deleteBoard).not.toHaveBeenCalled();
    expect(screen.getByText("¿Borrar «Ideas»?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(tablero.deleteBoard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Borrar la pizarra Ideas" }));
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(tablero.deleteBoard).toHaveBeenCalledWith("a");
  });

  it("con pocas pizarras no hay buscador; con muchas, busca y ordena", () => {
    tablero.boards = [pizarra("a", "Ideas", 1), pizarra("b", "Plan", 2), pizarra("c", "Zeta", 3)];
    const { unmount } = montar();
    expect(screen.queryByRole("searchbox")).toBeNull();
    unmount();

    tablero.boards = [
      pizarra("a", "Zeta", 6), pizarra("b", "Mapa", 5), pizarra("c", "Álbum", 4), pizarra("d", "Plan", 3), pizarra("e", "Ideas", 2), pizarra("f", "Mapa mental", 1),
    ];
    montar();
    const nombres = () => screen.getAllByRole("button", { name: /^Abrir la pizarra/ }).map((b) => b.getAttribute("aria-label")?.replace("Abrir la pizarra ", ""));
    expect(nombres()).toEqual(["Zeta", "Mapa", "Álbum", "Plan", "Ideas", "Mapa mental"]); // recientes primero
    fireEvent.click(screen.getByRole("button", { name: /Ordenadas por recientes/ }));
    expect(nombres()).toEqual(["Álbum", "Ideas", "Mapa", "Mapa mental", "Plan", "Zeta"]); // A–Z
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "mapa" } });
    expect(nombres()).toEqual(["Mapa", "Mapa mental"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nada" } });
    expect(screen.getByText("Ninguna pizarra se llama así.")).toBeTruthy();
  });

  it("las secciones se pliegan (útil en móvil) y el pie «Cerrar» con su pista sigue ahí", () => {
    montar();
    const crear = screen.getByRole("button", { name: "Crear" });
    expect(crear.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(crear);
    expect(crear.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Acciones rápidas de creación" })).toBeNull();
    const cerrar = screen.getByRole("button", { name: /Cerrar/ });
    expect(cerrar.textContent).toMatch(/desliza/);
  });
});
