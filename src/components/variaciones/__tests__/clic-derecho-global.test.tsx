import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import {
  ClicDerechoGlobal, acotarPosicion, claveDelObjetivo, enlaceElemento,
  esCampoDeTexto, esTeclaDeMenu, tieneMenuPropio,
} from "../clic-derecho-global";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";

// Pruebas del clic derecho global (Ola 1019V · tarea N, contrato
// architecture/variaciones-publicas.md §3): funciones puras y comportamiento
// del componente en jsdom. Sin red y sin tocar Supabase.

function elemento(html: string): HTMLElement {
  const caja = document.createElement("div");
  caja.innerHTML = html;
  document.body.appendChild(caja);
  return caja.firstElementChild as HTMLElement;
}

function escucharAperturas(): DetalleVariaciones[] {
  const recibidos: DetalleVariaciones[] = [];
  window.addEventListener(VARIACIONES_ABRIR_EVENTO, (e) => {
    const detalle = (e as CustomEvent<DetalleVariaciones | null>).detail;
    if (detalle) recibidos.push(detalle);
  });
  return recibidos;
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
describe("funciones puras del clic derecho", () => {
  it("reconoce los campos donde manda el menú del navegador", () => {
    expect(esCampoDeTexto(elemento("<input />"))).toBe(true);
    expect(esCampoDeTexto(elemento("<textarea></textarea>"))).toBe(true);
    expect(esCampoDeTexto(elemento("<div contenteditable='true'></div>"))).toBe(true);
    expect(esCampoDeTexto(elemento("<div><span>texto</span></div>").firstElementChild)).toBe(false);
  });
  it("respeta los menús propios declarados con data-ss-menu-propio", () => {
    const contenedor = elemento("<div data-ss-menu-propio><button>abrir</button></div>");
    expect(tieneMenuPropio(contenedor)).toBe(true);
    expect(tieneMenuPropio(contenedor.firstElementChild)).toBe(true);
    expect(tieneMenuPropio(elemento("<div></div>"))).toBe(false);
  });
  it("abre con la tecla Menú o Mayúsculas+F10, y no con F10 sola", () => {
    expect(esTeclaDeMenu({ key: "ContextMenu" })).toBe(true);
    expect(esTeclaDeMenu({ key: "F10", shiftKey: true })).toBe(true);
    expect(esTeclaDeMenu({ key: "F10", shiftKey: false })).toBe(false);
    expect(esTeclaDeMenu({ key: "Enter" })).toBe(false);
  });
  it("deduce la clave del elemento o de sus ancestros y descarta las inválidas", () => {
    const contenedor = elemento("<section data-ss-elemento='widget:clima'><span>hoy</span></section>");
    expect(claveDelObjetivo(contenedor.firstElementChild)).toBe("widget:clima");
    expect(claveDelObjetivo(elemento("<div data-ss-elemento='Widget:Clima'></div>"))).toBeNull();
    expect(claveDelObjetivo(document.body)).toBeNull();
  });
  it("compone el enlace del elemento sin query ni anclaje previos", () => {
    expect(enlaceElemento("widget:clima", "https://os.test/x?y=1#z")).toBe(
      "https://os.test/x?elemento=widget%3Aclima",
    );
  });
  it("acota el menú dentro de la ventana", () => {
    expect(acotarPosicion(500, 400, { ancho: 800, alto: 600 })).toEqual({ x: 500, y: 400 });
    expect(acotarPosicion(-50, -50, { ancho: 800, alto: 600 })).toEqual({ x: 8, y: 8 });
    expect(acotarPosicion(9999, 9999, { ancho: 800, alto: 600 })).toEqual({ x: 560, y: 436 });
  });
});

describe("ClicDerechoGlobal en el documento", () => {
  const montar = () => render(<ClicDerechoGlobal />);

  it("abre el menú y «Variaciones públicas» publica por el bus", () => {
    const recibidos = escucharAperturas();
    montar();
    const el = elemento("<div data-ss-elemento='widget:clima'>Clima</div>");
    fireEvent.contextMenu(el, { clientX: 40, clientY: 60 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
    expect(recibidos).toEqual([{ clave: "widget:clima", opciones: {} }]);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("«Publicar mi variación» abre la ventana en modo publicar", () => {
    const recibidos = escucharAperturas();
    montar();
    fireEvent.contextMenu(elemento("<div data-ss-elemento='widget:clima'></div>"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Publicar mi variación" }));
    expect(recibidos).toEqual([{ clave: "widget:clima", opciones: { publicar: true } }]);
  });
  it("no sustituye al navegador con Mayúsculas, en campos ni en menús propios", () => {
    montar();
    fireEvent.contextMenu(elemento("<div data-ss-elemento='widget:clima'></div>"), { shiftKey: true });
    fireEvent.contextMenu(elemento("<input data-ss-elemento='widget:clima' />"));
    fireEvent.contextMenu(elemento("<div data-ss-menu-propio data-ss-elemento='menu:x'></div>"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("abre con Mayúsculas+F10 sobre el elemento enfocado", () => {
    montar();
    const el = elemento("<div tabindex='0' data-ss-elemento='ajuste:radio'></div>");
    el.focus();
    fireEvent.keyDown(document, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("la pulsación larga abre a los 500 ms y se cancela al mover el dedo", () => {
    vi.useFakeTimers();
    try {
      montar();
      const el = elemento("<div data-ss-elemento='fondo:aurora'></div>");
      fireEvent.touchStart(el, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchMove(el, { touches: [{ clientX: 40, clientY: 10 }] });
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.touchStart(el, { touches: [{ clientX: 10, clientY: 10 }] });
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByRole("menu")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
