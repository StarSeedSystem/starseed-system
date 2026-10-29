/**
 * HFR1018K · Prueba de la ventana «Estudio de vídeo».
 * Sin red, sin navegador real y sin procesos: la disponibilidad del servicio y el
 * envío de órdenes se inyectan. Solo funciones puras exportadas y el componente.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capasDeComposicion,
  duracionTotal,
  idDeComposicion,
  ordenesDeEdicion,
  EstudioVideoVentana,
} from "../estudio-video-ventana";

const SIN_GSAP = `<div data-composition-id="main"><div id="fondo" class="clip" data-start="0" data-duration="3" data-track-index="0">fondo</div><div id="titulo" class="clip" data-start="1" data-duration="2" data-track-index="1">Hola</div></div>`;
const CON_GSAP = `${SIN_GSAP}<script>gsap.to("#titulo", { opacity: 0 });</script>`;

afterEach(() => { cleanup(); });

describe("estudio de vídeo · funciones puras", () => {
  it("lee las capas de los atributos data-* de la composición", () => {
    expect(capasDeComposicion(SIN_GSAP)).toEqual([
      { id: "fondo", texto: "fondo", inicio: 0, duracion: 3, pista: 0 },
      { id: "titulo", texto: "Hola", inicio: 1, duracion: 2, pista: 1 },
    ]);
    expect(capasDeComposicion("")).toEqual([]);
  });

  it("dura lo que tarda la capa más larga, y el id sale de data-composition-id", () => {
    const capas = capasDeComposicion(SIN_GSAP);
    expect(duracionTotal(capas)).toBe(3);
    expect(idDeComposicion(SIN_GSAP)).toBe("main");
    expect(idDeComposicion("")).toBeNull();
  });

  it("emite las órdenes mínimas: setText solo si cambió el texto, setTiming solo si cambiaron los tiempos", () => {
    const capa = { id: "titulo", texto: "Hola", inicio: 1, duracion: 2, pista: 1 };
    expect(ordenesDeEdicion(capa, "Hola", 1, 2)).toEqual([]);
    expect(ordenesDeEdicion(capa, "Adiós", 1, 2)).toEqual([{ type: "setText", target: "titulo", value: "Adiós" }]);
    expect(ordenesDeEdicion(capa, "Adiós", 0.5, 4)).toEqual([
      { type: "setText", target: "titulo", value: "Adiós" },
      { type: "setTiming", target: "titulo", start: 0.5, duration: 4 },
    ]);
  });
});

describe("estudio de vídeo · sin servicio", () => {
  it("lo dice con claridad y el botón «Abrir en otra neurona» llama al que lo trae", async () => {
    const alAbrirEnOtraNeurona = vi.fn();
    render(<EstudioVideoVentana htmlComposicion={SIN_GSAP} hayServicio={() => false} alAbrirEnOtraNeurona={alAbrirEnOtraNeurona} />);
    expect((await screen.findByTestId("sin-servicio")).textContent).toContain("El servicio HyperFrames no está en esta neurona");
    fireEvent.click(screen.getByRole("button", { name: "Abrir en otra neurona" }));
    expect(alAbrirEnOtraNeurona).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("vista-previa")).toBeNull();
  });

  it("mientras comprueba no ofrece nada falso", async () => {
    render(<EstudioVideoVentana htmlComposicion={SIN_GSAP} hayServicio={() => new Promise(() => {})} />);
    expect(await screen.findByTestId("comprobando-servicio")).toBeTruthy();
  });
});

describe("estudio de vídeo · con servicio", () => {
  it("prepara el reproductor gestado por el servicio y enseña la línea de tiempo con las capas", async () => {
    render(<EstudioVideoVentana htmlComposicion={SIN_GSAP} hayServicio={() => true} origenServicio="http://localhost:4490" />);
    expect(await screen.findByTestId("lista-capas")).toBeTruthy();
    const reproductor = (await screen.findByTestId("vista-previa")).querySelector("hyperframes-player");
    expect(reproductor?.getAttribute("src")).toBe("http://localhost:4490/vista/main");
    expect(screen.getByRole("button", { name: /Capa fondo · 0 s, 3 s/ })).toBeTruthy();
  });

  it("el panel de propiedades emite las órdenes del SDK", async () => {
    const alOrdenar = vi.fn();
    render(<EstudioVideoVentana htmlComposicion={SIN_GSAP} hayServicio={() => true} alOrdenar={alOrdenar} />);
    await screen.findByTestId("lista-capas");
    fireEvent.click(screen.getByRole("button", { name: /Capa titulo/ }));
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Adiós" } });
    fireEvent.change(screen.getByLabelText("Inicio (s)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Duración (s)"), { target: { value: "5" } });
    await waitFor(() => fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" })));
    expect(alOrdenar).toHaveBeenCalledWith([
      { type: "setText", target: "titulo", value: "Adiós" },
      { type: "setTiming", target: "titulo", start: 2, duration: 5 },
    ]);
  });
});

describe("estudio de vídeo · aviso GSAP", () => {
  it("avisa con el motivo de licencia cuando la composición trae GSAP, y no avisa sin él", () => {
    render(<EstudioVideoVentana htmlComposicion={CON_GSAP} hayServicio={() => false} />);
    const aviso = screen.getByTestId("aviso-gsap");
    expect(aviso.textContent).toContain("GSAP");
    expect(aviso.textContent.toLowerCase()).toContain("licencia");
    cleanup();
    render(<EstudioVideoVentana htmlComposicion={SIN_GSAP} hayServicio={() => false} />);
    expect(screen.queryByTestId("aviso-gsap")).toBeNull();
  });
});
