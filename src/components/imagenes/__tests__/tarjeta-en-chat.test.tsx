// @vitest-environment jsdom
/**
 * Prueba de DOM de la tarjeta en el chat (IMG1011J). Sin red ni GPU: la tarjeta
 * real no se mockea de aquí a los datos, solo TarjetaImagenes y el hook — aquí se
 * comprueba lo que hace el embudo: abre con el evento, no abre sin prompt y cierra.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TarjetaEnChat, { NOMBRE_EVENTO_IMAGENES, peticionDeEvento } from "../tarjeta-en-chat";

vi.mock("@/lib/imagenes/adaptadores/use-tarjeta-imagenes", () => ({
  PETICION_DEFECTO: { opciones: 4, prioridad: "calidad", comercial: false, necesita: ["texto-a-imagen"], conReferencia: false, permisoRemoto: false, permitirDePago: false },
}));
vi.mock("../tarjeta-imagenes", () => ({
  TarjetaImagenes: (props: { peticion?: { prompt?: string } }) => (
    <p data-testid="tarjeta">tarjeta con «{props.peticion?.prompt ?? "nada"}</p>
  ),
}));

describe("peticionDeEvento", () => {
  it("devuelve la petición con el prompt del detalle", () => {
    const p = peticionDeEvento({ prompt: "  un bosque de cristal " });
    expect(p?.prompt).toBe("un bosque de cristal");
    expect(p?.opciones).toBe(4);
    expect(p?.permitirDePago).toBe(false);
  });

  it("sin prompt usable no hay tarjeta (no inventa peticiones)", () => {
    expect(peticionDeEvento(undefined)).toBeNull();
    expect(peticionDeEvento({})).toBeNull();
    expect(peticionDeEvento({ prompt: "   " })).toBeNull();
    expect(peticionDeEvento({ prompt: 7 })).toBeNull();
  });
});

describe("TarjetaEnChat", () => {
  afterEach(cleanup);

  it("sin evento no pinta nada; al llegar el evento abre la tarjeta con el prompt", async () => {
    const { container } = render(<TarjetaEnChat />);
    expect(container.querySelector("[data-testid='tarjeta']")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(NOMBRE_EVENTO_IMAGENES, { detail: { prompt: "un bosque" } }));
    });
    expect(screen.getByTestId("tarjeta").textContent).toContain("un bosque");
    expect(screen.getByRole("button", { name: "Cerrar la tarjeta de opciones de imagen" })).toBeTruthy();
  });

  it("con «Cerrar» se va y con un evento sin prompt no se cambia nada", async () => {
    render(<TarjetaEnChat />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(NOMBRE_EVENTO_IMAGENES, { detail: { prompt: "otra idea" } }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar la tarjeta de opciones de imagen" }));
    expect(screen.queryByTestId("tarjeta")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(NOMBRE_EVENTO_IMAGENES, { detail: { prompt: 0 } }));
    });
    expect(screen.queryByTestId("tarjeta")).toBeNull();
  });
});
