import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ClicDerechoGlobal, abreMenuPropio, enlaceElemento, copiarEnlace } from "../clic-derecho-global";
import { ETIQUETA_VARIACIONES } from "../accion-variaciones";
import { VARIACIONES_ABRIR_EVENTO, type DetalleVariaciones } from "../variaciones-bus";

// ═══════════════════════════════════════════════════════════════════════════
// Ola 1019N: anfitrión GLOBAL del clic derecho de variaciones. Núcleo puro
// (decisión, enlace y portapapeles) + integración del componente en jsdom.
// ═══════════════════════════════════════════════════════════════════════════

/** Registro de aperturas del bus, escuchando en window como el anfitrión real. */
const REGISTRO: DetalleVariaciones[] = [];
const oyente = (e: Event) => {
  const d = (e as CustomEvent<DetalleVariaciones>).detail;
  if (d) REGISTRO.push(d);
};
const escucharWindow = () => {
  window.addEventListener(VARIACIONES_ABRIR_EVENTO, oyente);
  return () => window.removeEventListener(VARIACIONES_ABRIR_EVENTO, oyente);
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  REGISTRO.length = 0;
});

/** Nudo DOM con un hijo; lo devuelve para probar decisiones puras. */
function conNudo(html: string): { raiz: HTMLElement; hijo: Element } {
  const raiz = document.createElement("div");
  raiz.innerHTML = html;
  document.body.appendChild(raiz);
  const hijo = raiz.firstElementChild as Element;
  return { raiz, hijo };
}
describe("abreMenuPropio (puro)", () => {
  it("abre con una clave de elemento declarada en el objetivo o un antepasado", () => {
    const { hijo } = conNudo("<span data-ss-elemento='widget:clima'>clima</span>");
    expect(abreMenuPropio({}, hijo)).toBe(true);
    const { raiz } = conNudo("<div data-ss-elemento='fondo:aurora'><p>texto</p></div>");
    expect(abreMenuPropio({}, raiz.querySelector("p") as Element)).toBe(true);
  });

  it("no abre sin clave, con Mayúsculas, con el evento ya atendido o en campos de texto", () => {
    const { hijo } = conNudo("<span>sin clave</span>");
    expect(abreMenuPropio({}, hijo)).toBe(false);
    const { hijo: diana } = conNudo("<span data-ss-elemento='widget:clima'>clima</span>");
    expect(abreMenuPropio({ shiftKey: true }, diana)).toBe(false);
    expect(abreMenuPropio({ defaultPrevented: true }, diana)).toBe(false);
    expect(abreMenuPropio({ defaultPrevented: true, shiftKey: true }, diana)).toBe(false);
  });

  it("no abre en editables ni sobre un menú propio o el menú del texto", () => {
    const { hijo: caja } = conNudo("<input type='text' />");
    expect(abreMenuPropio({}, caja)).toBe(false);
    const { hijo: sobreMenu } = conNudo(
      "<div data-ss-menu-propio=''><button data-ss-elemento='app:notas'>x</button></div>",
    );
    expect(abreMenuPropio({}, sobreMenu.querySelector("button") as Element)).toBe(false);
    const { hijo: sobreTexto } = conNudo(
      "<div data-menu-texto=''><button data-ss-elemento='app:notas'>x</button></div>",
    );
    expect(abreMenuPropio({}, sobreTexto.querySelector("button") as Element)).toBe(false);
  });
});

describe("enlaceElemento y copiarEnlace (puros)", () => {
  it("el enlace lleva la clave como TIPO y no datos privados", () => {
    expect(enlaceElemento("widget:clima", "https://starseed-os.vercel.app/network?x=1")).toBe(
      "https://starseed-os.vercel.app/network?x=1&elemento=widget%3Aclima",
    );
  });

  it("copia con el portapapeles inyectado", async () => {
    const escritas: string[] = [];
    const ok = await copiarEnlace("hola", { writeText: async (t) => { escritas.push(t); } });
    expect(ok).toBe(true);
    expect(escritas).toEqual(["hola"]);
  });

  it("sin portapapeles, o si el portapapeles rechaza, devuelve false sin lanzar", async () => {
    expect(await copiarEnlace("hola", undefined)).toBe(false);
    const rechazo = { writeText: async () => { throw new Error("denegado"); } };
    expect(await copiarEnlace("hola", rechazo)).toBe(false);
  });
});
function escena() {
  render(
    <div>
      <span data-ss-elemento="widget:clima" data-testid="diana">Clima</span>
      <span data-testid="sin-clave">sin clave</span>
      <ClicDerechoGlobal />
    </div>,
  );
}

/** Contextmenu cancelable, con preventDefault aplicado antes si se pide. */
function clicDerecho(diana: HTMLElement, opciones: { shiftKey?: boolean; prevenida?: boolean } = {}) {
  const e = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    shiftKey: opciones.shiftKey ?? false,
  });
  if (opciones.prevenida) e.preventDefault();
  act(() => { diana.dispatchEvent(e); });
}

describe("ClicDerechoGlobal · integración", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("con clic derecho sobre un elemento con clave muestra las 3 entradas y role=menu", () => {
    escena();
    clicDerecho(screen.getByTestId("diana"));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menu").closest("[data-ss-menu-propio]")).toBeTruthy();
    for (const etiqueta of ["Variaciones públicas", "Publicar mi variación", "Copiar enlace al elemento"]) {
      expect(screen.getByRole("menuitem", { name: etiqueta })).toBeTruthy();
    }
  });

  it("sin clave no abre nada y con Mayúsculas deja el menú del navegador", () => {
    escena();
    fireEvent.contextMenu(screen.getByTestId("sin-clave"));
    expect(screen.queryByRole("menu")).toBeNull();
    const diana = screen.getByTestId("diana");
    clicDerecho(diana, { shiftKey: true, prevenida: false });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("deja paso a quien ya atendió el evento (menú propio o del texto)", () => {
    escena();
    clicDerecho(screen.getByTestId("diana"), { prevenida: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("las entradas abren la ventana por el bus con la clave y sin datos privados", () => {
    const baja = escucharWindow();
    escena();
    const diana = screen.getByTestId("diana");
    clicDerecho(diana);
    fireEvent.click(screen.getByRole("menuitem", { name: "Variaciones públicas" }));
    clicDerecho(diana);
    fireEvent.click(screen.getByRole("menuitem", { name: "Publicar mi variación" }));
    expect(REGISTRO).toEqual([
      { clave: "widget:clima", opciones: {} },
      { clave: "widget:clima", opciones: { publicar: true } },
    ]);
    baja();
  });

  it("clic fuera y scroll cierran; se puede reabrir", () => {
    escena();
    const diana = screen.getByTestId("diana");
    clicDerecho(diana);
    expect(screen.getByRole("menu")).toBeTruthy();
    act(() => { fireEvent.pointerDown(document.body); });
    expect(screen.queryByRole("menu")).toBeNull();
    clicDerecho(diana);
    act(() => { fireEvent.scroll(document); });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("tecleando la tecla de menú o Mayúsculas+F10 se abre; la F10 sola no ataja", () => {
    escena();
    const diana = screen.getByTestId("diana");
    const tecla = (opts: KeyboardEventInit) => act(() => { fireEvent.keyDown(diana, opts); });
    const fuera = () => act(() => { fireEvent.pointerDown(document.body); });
    tecla({ key: "ContextMenu" });
    expect(screen.getByRole("menu")).toBeTruthy();
    fuera();
    tecla({ key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
    fuera();
    tecla({ key: "F10" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("la pulsación larga de ~500 ms abre sin mover el dedo; desplazarse la cancela", () => {
    escena();
    const diana = screen.getByTestId("diana");
    const toque = (tipo: "touchstart" | "touchmove", x: number, y: number) =>
      act(() => {
        const toques = { touches: [{ clientX: x, clientY: y }] };
        if (tipo === "touchstart") fireEvent.touchStart(diana, toques);
        else fireEvent.touchMove(diana, toques);
      });
    vi.useFakeTimers();
    toque("touchstart", 40, 40);
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByRole("menu")).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("menu")).toBeTruthy();
    act(() => { fireEvent.pointerDown(document.body); });
    toque("touchstart", 40, 40);
    toque("touchmove", 60, 40);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

