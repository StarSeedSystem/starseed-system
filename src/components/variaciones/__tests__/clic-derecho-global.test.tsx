import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ClicDerechoGlobal, ajustarPosicion, enCampoTexto, conMenuPropio, resolverClaveGlobal, enlaceDeElemento } from "../clic-derecho-global";
import { VARIACIONES_ABRIR_EVENTO } from "../variaciones-bus";

// Prueba de los helpers puros y del anfitrión global del clic derecho
// (VPU1019N · §3 y §2 de architecture/variaciones-publicas.md). Sin red: el
// bus de la ventana se escucha con un oyente del propio evento.

interface Apertura { clave?: unknown; opciones?: Record<string, unknown> }
let abiertas: Apertura[] = [];
let desescuchar: (() => void) | null = null;
const escuchar = () => {
  abiertas = [];
  const alAbrir = (e: Event) => abiertas.push(((e as CustomEvent).detail ?? {}) as Apertura);
  window.addEventListener(VARIACIONES_ABRIR_EVENTO, alAbrir);
  desescuchar = () => window.removeEventListener(VARIACIONES_ABRIR_EVENTO, alAbrir);
};
const insertar = (html: string) => { document.body.insertAdjacentHTML("beforeend", html); };

afterEach(() => {
  cleanup();
  if (desescuchar) desescuchar();
  desescuchar = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("helpers puros del clic derecho global", () => {
  it("ajustarPosicion mantiene el menú dentro del viewport", () => {
    expect(ajustarPosicion(5000, 5000, 1000, 800)).toEqual({ x: 762, y: 622 });
    expect(ajustarPosicion(-40, -40, 1000, 800)).toEqual({ x: 8, y: 8 });
    expect(ajustarPosicion(100, 100, 1000, 800)).toEqual({ x: 100, y: 100 });
  });
  it("enCampoTexto y conMenuPropio detectan campo de texto y menú propio", () => {
    insertar('<div><input id="campo"/><div data-ss-menu-propio><p id="libre">hola</p></div></div>');
    expect(enCampoTexto(document.getElementById("campo"))).toBe(true);
    expect(enCampoTexto(document.getElementById("libre"))).toBe(false);
    expect(enCampoTexto(null)).toBe(false);
    expect(conMenuPropio(document.getElementById("libre"))).toBe(true);
  });
  it("resolverClaveGlobal devuelve la clave directa, anidada o deducida", () => {
    insertar('<div data-ss-elemento="widget:clima"><p id="hijo">x</p></div>'
      + '<div data-widget-fn="RelojSencillo"><span id="deducido">x</span></div>'
      + '<div data-ss-elemento="clave invalida"><span id="invalida">x</span></div>');
    expect(resolverClaveGlobal(document.getElementById("hijo"))).toBe("widget:clima");
    expect(resolverClaveGlobal(document.getElementById("deducido"))).toBe("widget:reloj-sencillo");
    expect(resolverClaveGlobal(document.getElementById("invalida"))).toBeNull();
    expect(resolverClaveGlobal(null)).toBeNull();
  });
  it("enlaceDeElemento conserva el origen y añade la clave codificada", () => {
    expect(enlaceDeElemento("widget:clima", "https://os.example/escritorios?a=1"))
      .toBe("https://os.example/escritorios?a=1&elemento=widget%3Aclima");
  });
});

describe("ClicDerechoGlobal · menú global", () => {
  it("clic derecho con clave abre el menú y sus entradas abren la ventana", () => {
    escuchar();
    render(<ClicDerechoGlobal />);
    insertar('<div data-ss-elemento="widget:clima"><button id="objetivo">Clima</button></div>');
    fireEvent.contextMenu(document.getElementById("objetivo")!);
    const entradas = screen.getAllByRole("menuitem");
    expect(entradas.map((b) => b.textContent?.trim())).toEqual(["Variaciones públicas", "Publicar mi variación", "Copiar enlace al elemento"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
    expect(abiertas[0]).toEqual({ clave: "widget:clima", opciones: {} });
    // El menú se cierra al usarlo; se vuelve a abrir para la segunda entrada.
    fireEvent.contextMenu(document.getElementById("objetivo")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Publicar mi variación" }));
    expect(abiertas[1]).toEqual({ clave: "widget:clima", opciones: { publicar: true } });
  });
  it("con menú propio, campo de texto, Mayúsculas o sin clave no abre nada", () => {
    escuchar();
    insertar('<div data-ss-menu-propio><button id="propio">x</button></div>'
      + '<input id="campo"/><div><button id="sinclave">x</button></div>');
    render(<ClicDerechoGlobal />);
    for (const id of ["propio", "campo", "sinclave"]) {
      fireEvent.contextMenu(document.getElementById(id)!);
      expect(screen.queryByRole("menu")).toBeNull();
    }
    insertar('<div data-ss-elemento="widget:clima"><button id="conclave">x</button></div>');
    fireEvent.contextMenu(document.getElementById("conclave")!, { shiftKey: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("tecla de menú y Mayúsculas+F10 abren; Escape cierra", () => {
    escuchar();
    insertar('<div data-ss-elemento="widget:clima"><button id="foco">Clima</button></div>');
    render(<ClicDerechoGlobal />);
    document.getElementById("foco")!.focus();
    fireEvent.keyDown(document.getElementById("foco")!, { key: "ContextMenu" });
    expect(screen.getByRole("menu")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(document.getElementById("foco")!, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).not.toBeNull();
  });
  it("clic fuera del menú lo cierra", () => {
    escuchar();
    insertar('<div data-ss-elemento="widget:clima"><button id="objetivo">Clima</button></div>');
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(document.getElementById("objetivo")!);
    expect(screen.getByRole("menu")).not.toBeNull();
    insertar('<div id="afuera">x</div>');
    fireEvent.pointerDown(document.getElementById("afuera")!);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("pulsación larga abre y el desplazamiento la cancela", () => {
    vi.useFakeTimers();
    escuchar();
    insertar('<div data-ss-elemento="widget:clima"><button id="objetivo">Clima</button></div>');
    render(<ClicDerechoGlobal />);
    const destino = document.getElementById("objetivo")!;
    fireEvent.touchStart(destino, { touches: [{ clientX: 20, clientY: 20 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole("menu")).not.toBeNull();
  });
  it("pulsación con inicio que se desplaza no abre", () => {
    vi.useFakeTimers();
    escuchar();
    insertar('<div data-ss-elemento="widget:clima"><button id="objetivo">Clima</button></div>');
    render(<ClicDerechoGlobal />);
    const destino = document.getElementById("objetivo")!;
    fireEvent.touchStart(destino, { touches: [{ clientX: 20, clientY: 20 }] });
    fireEvent.touchMove(destino, { touches: [{ clientX: 60, clientY: 60 }] });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("«Copiar enlace al elemento» escribe la URL con la clave", async () => {
    const escribir = vi.fn((_texto: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escribir }, configurable: true });
    escuchar();
    insertar('<div data-ss-elemento="widget:clima"><button id="objetivo">Clima</button></div>');
    render(<ClicDerechoGlobal />);
    fireEvent.contextMenu(document.getElementById("objetivo")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Copiar enlace al elemento" }));
    expect(escribir).toHaveBeenCalledTimes(1);
    expect(String(escribir.mock.calls[0][0])).toContain("elemento=widget%3Aclima");
  });
});
