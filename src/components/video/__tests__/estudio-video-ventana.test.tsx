/**
 * StarSeed OS · Prueba de la ventana «Estudio de vídeo» (ola 1018K).
 * Solo funciones puras + Testing Library, sin red, sin navegador real y sin procesos.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RespuestaLocal } from "@/lib/protomolecula/servicio-local";
import { EstudioVideoVentana, extraerClips, ordenDe, traeGsap } from "../estudio-video-ventana";

const COMPOSICION = `<div class="clip" id="titulo" data-start="0" data-duration="3" data-track-index="0"><h1>hola</h1></div>`;
const CON_GSAP = `<script>gsap.to(".clip", {x: 10})</script><div class="clip" id="a" data-duration="2"></div>`;

function respuesta(ok: boolean): RespuestaLocal {
  return { ok, status: ok ? 200 : 504, headers: { get: () => null }, body: null, text: async () => "" };
}

afterEach(cleanup);

describe("extraerClips", () => {
  it("lee tiempo y pista de los atributos data-* de los clips", () => {
    expect(extraerClips(COMPOSICION)).toEqual([{ id: "titulo", empieza: 0, duracion: 3, pista: 0 }]);
  });

  it("devuelve una lista vacía si no hay composición ni clips", () => {
    expect(extraerClips("")).toEqual([]);
    expect(extraerClips("<p>sin clips</p>")).toEqual([]);
  });
});

describe("traeGsap", () => {
  it("detecta GSAP y no se confunde con una composición limpia", () => {
    expect(traeGsap(CON_GSAP)).toBe(true);
    expect(traeGsap(COMPOSICION)).toBe(false);
  });
});

describe("ordenDe", () => {
  it("el texto va como setText y la duración como atributo data-duration", () => {
    expect(ordenDe("titulo", "textContent", "hola", 1)).toEqual({
      type: "setText", target: "titulo", value: "hola",
    });
    expect(ordenDe("titulo", "data-duration", 4, 2)).toEqual({
      type: "setAttribute", target: "titulo", name: "data-duration", value: "4",
    });
  });
});

describe("EstudioVideoVentana", () => {
  it("sin servicio local: mensaje claro y botón «Abrir en otra neurona»", async () => {
    await act(async () => {
      render(<EstudioVideoVentana codigo={COMPOSICION} comprobar={async () => respuesta(false)} />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("estudio-video").textContent).toContain("Sin servicio HyperFrames");
    });
    expect(screen.getByTestId("abrir-otra-neurona").textContent).toContain("Abrir en otra neurona");
  });

  it("con servicio: línea de tiempo, selección y emisión de órdenes", async () => {
    const ordenes: string[] = [];
    await act(async () => {
      render(
        <EstudioVideoVentana
          codigo={COMPOSICION}
          comprobar={async () => respuesta(true)}
          emitirOrden={(o) => ordenes.push(o.type)}
        />,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("linea-tiempo")).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/titulo/));
    const texto = screen.getByTestId("prop-texto") as HTMLInputElement;
    fireEvent.change(texto, { target: { value: "otra cosa" } });
    fireEvent.click(screen.getByTestId("aplicar-texto"));
    fireEvent.click(screen.getByTestId("aplicar-duracion"));
    expect(ordenes).toContain("setText");
    expect(ordenes).toContain("setAttribute");
    expect(screen.getByTestId("ordenes").textContent).toContain("Última orden");
  });

  it("con GSAP: aviso visible y botones de edición desactivados", async () => {
    await act(async () => {
      render(<EstudioVideoVentana codigo={CON_GSAP} comprobar={async () => respuesta(true)} />);
    });
    await waitFor(() => {
      expect(screen.getByTestId("aviso-gsap")).toBeTruthy();
    });
    expect(screen.getByTestId("aplicar-texto")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("aplicar-duracion")).toHaveProperty("disabled", true);
  });
});
