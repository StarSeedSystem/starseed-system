import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import {
  ClicDerechoGlobal,
  enlaceDeElemento,
  esCampoTexto,
  resolverContexto,
} from "../clic-derecho-global";
import { suscribirVariaciones, type DetalleVariaciones } from "../variaciones-bus";

afterEach(() => cleanup());

/** Elemento con clave canónica en el DOM (contrato §2). */
function montarElemento(clave = "widget:reloj", extra: Record<string, string> = {}) {
  const div = document.createElement("div");
  div.setAttribute("data-ss-elemento", clave);
  Object.entries(extra).forEach(([k, v]) => div.setAttribute(k, v));
  document.body.appendChild(div);
  return div;
}

describe("resolverContexto (módulo puro)", () => {
  it("resuelve la clave del elemento sin saber nada del resto", () => {
    const div = montarElemento("fondo:aurora");
    expect(resolverContexto(div, false)).toEqual({ clave: "fondo:aurora", propio: false, navegador: false });
  });

  it("con MAYÚSCULAS o en un elemento con menú propio no entra", () => {
    expect(resolverContexto(montarElemento(), true).navegador).toBe(true);
    const div = montarElemento("widget:reloj", { "data-ss-menu-propio": "" });
    expect(resolverContexto(div, false)).toEqual({ clave: null, propio: true, navegador: false });
  });
});

describe("enlaceDeElemento (módulo puro)", () => {
  it("ancla #elemento con la clave codificada; sin URL no devuelve nada", () => {
    expect(enlaceDeElemento("widget:reloj", { origin: "https://os.example", pathname: "/dashboard" }))
      .toBe("https://os.example/dashboard#elemento=widget%3Areloj");
    expect(enlaceDeElemento("widget:reloj", null)).toBeNull();
  });
});

describe("ClicDerechoGlobal", () => {
  it("clic derecho con clave: menú con las tres entradas y la clave", () => {
    const div = montarElemento("widget:reloj");
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("campo de texto: el menú del navegador sigue al mando (no se apertura ninguno)", () => {
    const input = document.createElement("input");
    const div = montarElemento("widget:reloj");
    div.appendChild(input);
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(input, { clientX: 10, clientY: 12 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(esCampoTexto(input)).toBe(true);
  });

  it("MAYÚSCULAS + clic derecho: menú del navegador, no el del OS", () => {
    const div = montarElemento();
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30, shiftKey: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("elemento con menú propio (data-ss-menu-propio): no hace nada", () => {
    const div = montarElemento("widget:clima", { "data-ss-menu-propio": "" });
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("tecla de menú y MAYÚSCULAS+F10 sobre el foco: abre el menú", () => {
    const div = montarElemento("app:red-mesh");
    div.tabIndex = 0;
    render(<ClicDerechoGlobal />);
    act(() => { div.focus(); });
    fireEvent.keyDown(document, { key: "ContextMenu" });
    expect(screen.getByRole("menuitem", { name: "Variaciones públicas" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => { fireEvent.keyDown(document, { key: "F10", shiftKey: true }); });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("«Variaciones públicas» y «Publicar mi variación» abren la ventana por el bus y cierran el menú", () => {
    const div = montarElemento("widget:reloj");
    const oido: DetalleVariaciones[] = [];
    const baja = suscribirVariaciones((d) => oido.push(d));
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Publicar mi variación" }));
    expect(oido).toEqual([{ clave: "widget:reloj", opciones: { publicar: true } }]);
    expect(screen.queryByRole("menu")).toBeNull();
    // La entrada normal también abre el bus, sin opciones.
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
    expect(oido[1]).toEqual({ clave: "widget:reloj", opciones: {} });
    baja();
  });

  it("«Copiar enlace al elemento» escribe el enlace con el portapapeles inyectado", () => {
    const div = montarElemento("widget:reloj");
    const portapapeles = { writeText: vi.fn<(t: string) => Promise<void>>().mockResolvedValue(undefined) };
    render(<ClicDerechoGlobal portapapeles={portapapeles} />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Copiar enlace al elemento" }));
    const escrito = portapapeles.writeText.mock.calls[0]?.[0] ?? "";
    expect(escrito).toContain("#elemento=widget%3Areloj");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clic fuera y Escape cierran el menú", () => {
    const div = montarElemento();
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(div, { clientX: 40, clientY: 30 });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
