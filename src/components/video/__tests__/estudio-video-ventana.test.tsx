/**
 * Pruebas del estudio de vídeo (HFR1018K) — funciones puras y render con Testing Library:
 * sin red (sondear y aplicarOrdenes inyectados), sin navegador real y sin procesos.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EstudioVideoVentana, extraerClips, ordenesDeBorrador, type BorradorClip } from "../estudio-video-ventana";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

const COMPOSICION = `<div><div class="clip" id="titulo" data-name="Título" data-start="0" data-duration="3" data-track-index="0">Hola</div>` +
  `<span class="clip extra" data-name="Sub" data-start="2" data-duration="2" data-track-index="1"></span></div>`;
const CON_GSAP = `<div><div class="clip" id="a" data-start="0" data-duration="1" data-track-index="0"></div><script>gsap.to("a", {})</script></div>`;
const CLIP = extraerClips(COMPOSICION)[0];
const vivo = () => Promise.resolve({ vivo: true, motivo: "«HyperFrames» responde." });
const muerto = (motivo: string) => Promise.resolve({ vivo: false, motivo });
const widget = (pre: Record<string, unknown>): DashboardWidget =>
  ({ id: "w", dashboard_id: "d", widget_type: "PROTOMOLECULA", layout: { x: 0, y: 0, w: 3, h: 3, i: "w" }, settings: pre, created_at: "" });

afterEach(cleanup);

describe("extraerClips (puro)", () => {
  it("lee id, nombre, inicio, duración y pista de los atributos data-*, y ordena por inicio", () => {
    expect(extraerClips(COMPOSICION)).toEqual([
      { id: "titulo", etiqueta: "Título", inicio: 0, duracion: 3, pista: 0 },
      { id: "clip-2", etiqueta: "Sub", inicio: 2, duracion: 2, pista: 1 },
    ]);
  });
  it("una composición sin clips queda vacía", () => {
    expect(extraerClips("<p>sin vídeo</p>")).toEqual([]);
  });
});

describe("ordenesDeBorrador (puro)", () => {
  const borrador = (p: Partial<BorradorClip>): BorradorClip =>
    ({ texto: CLIP.etiqueta, inicio: String(CLIP.inicio), duracion: String(CLIP.duracion), pista: String(CLIP.pista), ...p });
  it("no ordena nada si el borrador es igual al clip", () => {
    expect(ordenesDeBorrador(CLIP, borrador({}))).toEqual([]);
  });
  it("crea setText, setTiming y setAttribute según el campo que cambia", () => {
    expect(ordenesDeBorrador(CLIP, borrador({ texto: "Adiós" }))).toEqual([{ type: "setText", target: "titulo", value: "Adiós" }]);
    expect(ordenesDeBorrador(CLIP, borrador({ inicio: "1", duracion: "4" }))).toEqual([{ type: "setTiming", target: "titulo", start: 1, duration: 4 }]);
    expect(ordenesDeBorrador(CLIP, borrador({ pista: "2" }))).toEqual([{ type: "setAttribute", target: "titulo", name: "data-track-index", value: "2" }]);
  });
});

describe("Estudio de vídeo (widget)", () => {
  it("sin composición invita a crear el átomo de vídeo", async () => {
    render(<EstudioVideoVentana widget={widget({})} sondear={vivo} />);
    expect(await screen.findByText(/Crea un átomo «vídeo-html»/)).toBeTruthy();
  });

  it("lee la composición de widget.settings.composicion y lista los clips", async () => {
    render(<EstudioVideoVentana widget={widget({ composicion: COMPOSICION })} sondear={vivo} />);
    expect((await screen.findByRole("group", { name: "Línea de tiempo" })).querySelectorAll("button").length).toBe(2);
    expect(screen.getByRole("button", { name: "Clip Título" })).toBeTruthy();
  });

  it("con servicio vivo sirve la vista previa a <hyperframes-player> del servicio local", async () => {
    const { container } = render(<EstudioVideoVentana composicion={COMPOSICION} sondear={vivo} />);
    await screen.findByRole("group", { name: "Línea de tiempo" });
    expect(container.querySelector("hyperframes-player")?.getAttribute("src")).toBe("http://127.0.0.1:4490/vista/titulo");
  });

  it("sin servicio da un mensaje claro y el botón «Abrir en otra neurona»", async () => {
    const abrir = vi.fn();
    const { container } = render(
      <EstudioVideoVentana composicion={COMPOSICION} sondear={() => muerto("El servicio «hyperframes» no responde en esta neurona.")} abrirEnOtraNeurona={abrir} />,
    );
    expect(await screen.findByText(/no responde en esta neurona/)).toBeTruthy();
    expect(container.querySelector("hyperframes-player")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir en otra neurona" }));
    expect(abrir).toHaveBeenCalledOnce();
  });

  it("avisa cuando la composición trae GSAP", async () => {
    render(<EstudioVideoVentana composicion={CON_GSAP} sondear={vivo} />);
    expect(await screen.findByText(/usa GSAP/)).toBeTruthy();
  });

  it("sin GSAP no avisa", async () => {
    render(<EstudioVideoVentana composicion={COMPOSICION} sondear={vivo} />);
    await screen.findByRole("group", { name: "Línea de tiempo" });
    expect(screen.queryByText(/usa GSAP/)).toBeNull();
  });

  it("el panel de propiedades emite las órdenes del SDK al aplicar", async () => {
    const aplicarOrdenes = vi.fn(async () => {});
    const { container } = render(<EstudioVideoVentana composicion={COMPOSICION} sondear={vivo} aplicarOrdenes={aplicarOrdenes} />);
    fireEvent.click(await screen.findByRole("button", { name: "Clip Sub" }));
    expect(await screen.findByText(/Propiedades de «Sub»/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Inicio (s)"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Aplicar"));
    await waitFor(() => expect(aplicarOrdenes).toHaveBeenCalledWith([{ type: "setTiming", target: "clip-2", start: 5, duration: 2 }]));
    expect(container.querySelector("hyperframes-player")).toBeTruthy();
  });
});
