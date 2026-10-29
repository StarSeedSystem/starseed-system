import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ClicDerechoGlobal, enlaceDeElemento, claveDelObjetivo } from "../clic-derecho-global";
import { suscribirVariaciones } from "../variaciones-bus";

/** Monta el anfitrión y un elemento con clave para los clics. */
function montar(extra: Record<string, string> = {}) {
  render(
    <>
      <ClicDerechoGlobal />
      <div data-ss-elemento="widget:clima" data-testid="clima" tabIndex={0} {...extra}>
        Clima
      </div>
    </>,
  );
  return screen.getByTestId("clima");
}

const hayMenu = () => screen.queryByText("Variaciones públicas") !== null;

describe("ClicDerechoGlobal · Ola 1019V", () => {
  afterEach(() => cleanup());

  it("clic derecho en un elemento con clave abre el menú con las tres entradas", () => {
    const clima = montar();
    fireEvent.contextMenu(clima, { clientX: 30, clientY: 60 });
    expect(hayMenu()).toBeTruthy();
    expect(screen.queryByText("Publicar mi variación")).toBeTruthy();
    expect(screen.queryByText("Copiar enlace al elemento")).toBeTruthy();
  });

  it("el menú sale en la posición del puntero y clicable con cursor-pointer", () => {
    const clima = montar();
    fireEvent.contextMenu(clima, { clientX: 30, clientY: 60 });
    const boton = screen.getByText("Variaciones públicas");
    expect(boton.className).toContain("cursor-pointer");
    const estilo = boton.parentElement?.getAttribute("style") ?? "";
    expect(estilo).toContain("left: 30px");
    expect(estilo).toContain("top: 60px");
  });

  it("elemento con menú propio (data-ss-menu-propio) no muestra nada", () => {
    const clima = montar({ "data-ss-menu-propio": "" });
    fireEvent.contextMenu(clima);
    expect(hayMenu()).not.toBeTruthy();
  });

  it("Mayúsculas + clic derecho siempre deja el menú del navegador", () => {
    const clima = montar();
    fireEvent.contextMenu(clima, { shiftKey: true });
    expect(hayMenu()).not.toBeTruthy();
  });

  it("campo de texto: sin Mayúsculas tampoco muestra el menú", () => {
    montar();
    const campo = document.createElement("input");
    campo.setAttribute("data-ss-elemento", "widget:clima");
    document.body.appendChild(campo);
    fireEvent.contextMenu(campo);
    document.body.removeChild(campo);
    expect(hayMenu()).not.toBeTruthy();
  });

  it("«Variaciones públicas» abre la ventana por el bus con la clave", () => {
    const vistas: string[] = [];
    const baja = suscribirVariaciones((d) => vistas.push(d.clave));
    const clima = montar();
    fireEvent.contextMenu(clima);
    fireEvent.click(screen.getByText("Variaciones públicas"));
    baja();
    expect(vistas).toEqual(["widget:clima"]);
    expect(hayMenu()).not.toBeTruthy();
  });

  it("«Publicar mi variación» abre el bus con publicar: true", () => {
    const vistas: { clave: string; opciones: { publicar?: boolean } }[] = [];
    const baja = suscribirVariaciones((d) => vistas.push(d));
    const clima = montar();
    fireEvent.contextMenu(clima);
    fireEvent.click(screen.getByText("Publicar mi variación"));
    baja();
    cleanup();
    expect(vistas[0]?.clave).toBe("widget:clima");
    expect(vistas[0]?.opciones?.publicar).toBe(true);
  });

  it("«Copiar enlace al elemento» copia `baseSinAnclaje#clave`", () => {
    const escritos: string[] = [];
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: (t: string) => { escritos.push(t); } },
      configurable: true,
    });
    const clima = montar();
    fireEvent.contextMenu(clima);
    fireEvent.click(screen.getByText("Copiar enlace al elemento"));
    expect(escritos).toEqual([`${window.location.origin}${window.location.pathname}#widget:clima`]);
  });

  it("Escape y un clic fuera del menú lo cierran", () => {
    const clima = montar();
    fireEvent.contextMenu(clima);
    expect(hayMenu()).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(hayMenu()).not.toBeTruthy();
    fireEvent.contextMenu(clima);
    expect(hayMenu()).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(hayMenu()).not.toBeTruthy();
  });

  it("teclado: la tecla de menú y Mayúsculas+F10 lo abren sobre el foco", () => {
    const clima = montar();
    clima.focus();
    expect(document.activeElement).toBe(clima);
    fireEvent.keyDown(document, { key: "Menu" });
    expect(hayMenu()).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "F10", shiftKey: true });
    expect(hayMenu()).toBeTruthy();
  });

  it("teclado sin clave (nada con foco que la tenga) no muestra nada", () => {
    montar();
    (document.activeElement as HTMLElement | null)?.blur?.();
    fireEvent.keyDown(document, { key: "Menu" });
    expect(hayMenu()).not.toBeTruthy();
  });

  it("pulsación larga táctil (~500 ms) abre el menú", async () => {
    const clima = montar();
    fireEvent.touchStart(clima, { touches: [{ clientX: 8, clientY: 8 }] });
    await waitFor(() => expect(hayMenu()).toBeTruthy(), { timeout: 4000 });
  });

  it("mover el dedo (más de la margen) cancela la pulsación larga", async () => {
    const clima = montar();
    fireEvent.touchStart(clima, { touches: [{ clientX: 8, clientY: 8 }] });
    fireEvent.touchMove(clima, { touches: [{ clientX: 200, clientY: 8 }] });
    await new Promise((r) => setTimeout(r, 700));
    expect(hayMenu()).not.toBeTruthy();
  });

  it("purezas: enlaceDeElemento y claveDelObjetivo (menú propio fuera)", () => {
    expect(enlaceDeElemento("widget:clima", "https://starseed-os.vercel.app/red-mesh#x")).toBe(
      "https://starseed-os.vercel.app/red-mesh#widget:clima",
    );
    const propio = document.createElement("div");
    propio.setAttribute("data-ss-menu-propio", "");
    propio.setAttribute("data-ss-elemento", "widget:clima");
    expect(claveDelObjetivo(propio)).not.toBeTruthy();
    const suelto = document.createElement("div");
    expect(claveDelObjetivo(suelto)).not.toBeTruthy();
  });
});
