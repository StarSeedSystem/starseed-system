/**
 * HFR1018K · Pruebas del estudio de vídeo: la lógica pura (capas y órdenes al SDK)
 * y la ventana SIN RED REAL (la petición al servicio va inyectada y simulada).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plantillaStarSeed } from "@/lib/video-html/plantilla";
import {
  EstudioVideoVentana,
  capasDeComposicion,
  edicionDePropiedad,
  ordenTiempos,
  type PropsVentanaVideo,
} from "../estudio-video-ventana";

afterEach(cleanup);

/* ── La composición de prueba: la plantilla StarSeed (CSS, sin GSAP) ── */
const COMPOSICION = plantillaStarSeed({ ancho: 1280, alto: 720, duracion: 3, titulo: "StarSeed", fondo: "#08040f", acento: "#00F0FF" });
const CON_GSAP = `<div data-composition-id="main" data-start="0" data-duration="2"><div id="a" class="clip" data-start="0" data-duration="2" data-track-index="0"></div><script>gsap.to("#a", { opacity: 1 });</script></div>`;
/** Salud del servicio, con `ok` inyectado. */
const servicio = (ok: boolean, pedido = vi.fn()) => pedido.mockImplementation(() =>
  ok ? Promise.resolve({ ok: true }) : Promise.reject(new Error("caído")));

describe("estudio de vídeo · lógica pura", () => {
  it("capas: lee id, pista, inicio y duración de los data-* y ordena por pista", () => {
    const capas = capasDeComposicion(COMPOSICION);
    expect(capas.map((c) => c.id)).toEqual(["fondo", "titulo", "acento"]);
    expect(capas[2]).toMatchObject({ pista: 2, inicio: 0.5, duracion: 2.5 });
  });

  it("texto: Operación del OS (origen «mano») y orden setText del SDK", () => {
    const e = edicionDePropiedad("titulo", "textContent", "Hola", 7);
    expect(e.operacion).toMatchObject({
      origen: "mano",
      accion: { tipo: "exacta", valor: "Hola" },
      objetivo: { atomoId: "video-html", parametroId: "titulo::textContent" },
    });
    expect(e.orden).toEqual({ type: "setText", target: "titulo", value: "Hola" });
  });

  it("color: setStyle del SDK; y tiempos: setTiming directo", () => {
    expect(edicionDePropiedad("titulo", "style.color", "#00F0FF", 1).orden)
      .toEqual({ type: "setStyle", target: "titulo", styles: { color: "#00F0FF" } });
    expect(ordenTiempos("fondo", 0, 3)).toEqual({ type: "setTiming", target: "fondo", start: 0, duration: 3 });
  });
});

describe("estudio de vídeo · ventana", () => {
  it("sin servicio: mensaje claro y botón «Abrir en otra neurona» que avisa", async () => {
    const alAbrirEnOtraNeurona = vi.fn();
    render(<EstudioVideoVentana pedir={vi.fn().mockRejectedValue(new Error("caído"))} alAbrirEnOtraNeurona={alAbrirEnOtraNeurona} />);
    const panel = await screen.findByTestId("sin-servicio");
    expect(within(panel).getByText(/no responde en esta neurona/i)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Abrir en otra neurona" }));
    expect(alAbrirEnOtraNeurona).toHaveBeenCalledTimes(1);
  });

  it("con servicio vivo y composición: reproductor servido por el servicio local, con su /vista", async () => {
    const { container } = render(<EstudioVideoVentana composicion={COMPOSICION} pedir={servicio(true)} />);
    await waitFor(() => expect(screen.getByTestId("estado-servicio").textContent).toContain("Servicio vivo"));
    const player = container.querySelector("hyperframes-player");
    expect(player).toBeTruthy();
    expect(player?.getAttribute("src")).toBe("http://127.0.0.1:4490/vista/main");
    expect(screen.queryByTestId("aviso-gsap")).toBeNull();
  });

  it("aviso GSAP: la composición se reproduce, pero la animación no se edita (licencia)", async () => {
    render(<EstudioVideoVentana composicion={CON_GSAP} pedir={servicio(true)} />);
    const aviso = await screen.findByTestId("aviso-gsap");
    expect(aviso.textContent).toContain("GSAP");
  });

  it("sin composición: lo dice sin dejar a nadie en un bucle", async () => {
    render(<EstudioVideoVentana pedir={servicio(true)} />);
    expect(await screen.findByTestId("sin-composicion")).toBeTruthy();
  });

  it("capas y panel: elegir «titulo», escribir texto, color e inicio y aplicar emite las órdenes", async () => {
    const alOrden = vi.fn();
    render(<EstudioVideoVentana composicion={COMPOSICION} pedir={servicio(true)} alOrden={alOrden} reloj={() => 5} />);
    fireEvent.click(await screen.findByTestId("capa-titulo"));
    const panel = screen.getByTestId("panel-propiedades");
    expect(panel.textContent).toContain("Propiedades de «titulo»");
    fireEvent.change(within(panel).getByTestId("prop-texto"), { target: { value: "Hola" } });
    fireEvent.change(within(panel).getByTestId("prop-color"), { target: { value: "#39FF14" } });
    fireEvent.change(within(panel).getByTestId("prop-inicio"), { target: { value: "1" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar cambios" }));
    const ordenes = alOrden.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(ordenes).toContainEqual({ type: "setText", target: "titulo", value: "Hola" });
    expect(ordenes).toContainEqual({ type: "setStyle", target: "titulo", styles: { color: "#39FF14" } });
    expect(ordenes).toContainEqual({ type: "setTiming", target: "titulo", start: 1, duration: 3 });
    // Texto y color traen su Operación del OS; los tiempos solo la orden del SDK.
    const conOperacion = alOrden.mock.calls.filter((c) => c[1]);
    expect(conOperacion.map((c) => (c[0] as { type: string }).type)).toEqual(["setText", "setStyle"]);
    expect(conOperacion[0][1]).toMatchObject({ origen: "mano", t: 5 });
  });

  it("todo lo clicable lleva cursor-pointer y objetivo táctil de 44 px", async () => {
    render(<EstudioVideoVentana composicion={COMPOSICION} pedir={servicio(true)} alOrden={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("capa-titulo"));
    await screen.findByTestId("panel-propiedades");
    for (const b of screen.getAllByRole("button")) {
      expect(b.className, b.textContent ?? "").toContain("cursor-pointer");
      expect(b.className).toContain("min-h-[44px]");
    }
  });
});
