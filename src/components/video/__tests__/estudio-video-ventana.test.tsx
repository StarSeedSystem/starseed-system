// Estudio de vídeo (Ola 1018H · tarea K): pruebas NO red y NO procesos.
// El servicio se INYECTA con la prop `servicio` para que el efecto de sondeo nunca se ejecute.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { avisoGsap, EstudioVideoVentana, parsearClips } from "../estudio-video-ventana";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";

afterEach(cleanup);

const COMPOSICION =
  '<div data-composition-id="main" data-no-timeline>' +
  '<div id="fondo" class="clip" data-start="0" data-duration="12" data-track-index="0">Fondo</div>' +
  '<div id="titulo" class="clip" data-start="0" data-duration="12" data-track-index="1">Hola Studio</div>' +
  '<div id="acento" class="clip" data-start="0.5" data-duration="11.5" data-track-index="2">Filo</div>' +
  "</div>";

describe("Piezas puras del estudio de vídeo", () => {
  it("parsearClips lee capas y línea de tiempo de los data-*", () => {
    expect(parsearClips(COMPOSICION)).toEqual([
      { id: "fondo", texto: "Fondo", start: 0, duracion: 12, pista: 0 },
      { id: "titulo", texto: "Hola Studio", start: 0, duracion: 12, pista: 1 },
      { id: "acento", texto: "Filo", start: 0.5, duracion: 11.5, pista: 2 },
    ]);
  });

  it("avisoGsap: avisa si trae GSAP y calla si la animación es CSS", () => {
    expect(avisoGsap('<div><script>gsap.to(".x", { x: 1 })</script></div>')).toMatch(/GSAP/);
    expect(avisoGsap('<style>@keyframes gira { from { opacity: 0 } }</style>')).toBe("");
  });
});

describe("EstudioVideoVentana", () => {
  it("muestra las capas con su pista y su línea de tiempo", () => {
    render(<EstudioVideoVentana servicio="vivo" html={COMPOSICION} />);
    expect(screen.getByText("Hola Studio")).toBeTruthy();
    expect(screen.getByText(/pista 2/).textContent).toContain("0.5s");
  });

  it("selecciona una capa y emite la orden setText del panel de propiedades", async () => {
    const ordenes: SdkOrder[] = [];
    render(<EstudioVideoVentana servicio="vivo" html={COMPOSICION} alOrdenar={(o) => ordenes.push(o)} />);
    await userEvent.click(screen.getByText("titulo"));
    fireEvent.change(screen.getByLabelText("Texto del clip"), { target: { value: "Hola Mundo" } });
    await userEvent.click(screen.getByRole("button", { name: "Aplicar texto" }));
    expect(ordenes).toEqual([{ type: "setText", target: "#titulo", value: "Hola Mundo" }]);
  });

  it("emite setTiming con los tiempos editados del clip", async () => {
    const ordenes: SdkOrder[] = [];
    render(<EstudioVideoVentana servicio="vivo" html={COMPOSICION} alOrdenar={(o) => ordenes.push(o)} />);
    await userEvent.click(screen.getByText("acento"));
    fireEvent.change(screen.getByLabelText("Empieza (segundos)"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Dura (segundos)"), { target: { value: "3" } });
    await userEvent.click(screen.getByRole("button", { name: "Aplicar tiempos" }));
    expect(ordenes).toEqual([{ type: "setTiming", target: "#acento", start: 1.5, duration: 3 }]);
  });

  it("con servicio vivo monta <hyperframes-player> apuntando a la composición servida", () => {
    const { container } = render(<EstudioVideoVentana servicio="vivo" html={COMPOSICION} urlVista="http://127.0.0.1:4490/vista/main" />);
    const reproductor = container.querySelector("hyperframes-player");
    expect(reproductor?.getAttribute("src")).toBe("http://127.0.0.1:4490/vista/main");
  });

  it("sin servicio: mensaje claro y botón «Abrir en otra neurona»", async () => {
    let abierto = false;
    render(<EstudioVideoVentana servicio="apagado" abrirOtraNeurona={() => { abierto = true; }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/No hay servicio de vídeo HyperFrames/);
    await userEvent.click(screen.getByRole("button", { name: "Abrir en otra neurona" }));
    expect(abierto).toBe(true);
  });

  it("avisa con role=alert cuando la composición trae GSAP", () => {
    render(<EstudioVideoVentana servicio="vivo" html={COMPOSICION + '<script>gsap.to("#fondo", { opacity: 1 })</script>'} />);
    expect(screen.getByRole("alert").textContent).toMatch(/GSAP/);
  });

  it("sin composición: vacío honesto en capas y en vista previa", () => {
    render(<EstudioVideoVentana servicio="vivo" />);
    expect(screen.getByText("Aún no hay capas en la composición.")).toBeTruthy();
    expect(screen.getByText(/Aún no hay composición/)).toBeTruthy();
  });
});
