// @vitest-environment jsdom
/**
 * Pruebas de DOM de la tarjeta de opciones de imagen (IMG1011C-parte 1).
 * Contrato: architecture/astraura-imagenes.md §6. Sin red y sin GPU: la tarjeta
 * recibe las opciones hechas por props (el camino incrustable en chat, agente y
 * bot) y solo se comprueba su salida: rejilla, procedencia, licencia,
 * atribución, acciones, ampliación y estados.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import type { PeticionImagen } from "@/lib/imagenes/plan";
import { TarjetaImagenes, type OpcionTarjeta } from "../tarjeta-imagenes";

const SD = MODELOS_IMAGEN.find((m) => m.id === "sd-turbo") ?? MODELOS_IMAGEN[0];
const OPCION_A: OpcionTarjeta = { capa: "dispositivo", modelo: SD, motor: "sdcpp", cuantizacion: "q4", semilla: 1, motivo: "Cabe en tu aparato a 4 bits." };
const OPCION_B: OpcionTarjeta = { capa: "web-gratis", modelo: null, motor: "pollinations", cuantizacion: "nativa", semilla: 7, motivo: "Sale gratis por la web.", url: "https://img.ejemplo/uno.png", elegida: true };

describe("TarjetaImagenes · rejilla de opciones", () => {
  afterEach(cleanup);

  it("muestra modelo, dónde se hizo, licencia y atribución de cada opción", () => {
    render(<TarjetaImagenes opciones={[OPCION_A, OPCION_B]} />);
    const rejilla = screen.getByRole("region", { name: "Opciones de imagen" });
    expect(within(rejilla).getByText(SD.nombre)).toBeTruthy();
    expect(within(rejilla).getByText("Tu aparato")).toBeTruthy();
    expect(within(rejilla).getByText("La web (gratis)")).toBeTruthy();
    expect(within(rejilla).getAllByText(/Licencia:/).length).toBe(2);
    const atribucion = within(rejilla).getByRole("link", { name: /Repositorio/ }) as HTMLAnchorElement;
    expect(atribucion.href.startsWith("https://huggingface.co/")).toBe(true);
  });

  it("marca la opción elegida y pasa la elegida a quien la montó al darle a Elegir", () => {
    const recibir = vi.fn();
    render(<TarjetaImagenes opciones={[OPCION_A, OPCION_B]} onElegir={recibir} />);
    fireEvent.click(screen.getByRole("button", { name: /Elegir la opción 1/ }));
    expect(recibir.mock.calls.length).toBe(1);
    expect(recibir.mock.calls[0]?.[0]).toEqual(OPCION_A);
    const ficha = screen.getByRole("article", { name: /Opción 2 de 2/ });
    expect(ficha.className).toContain("ring-2");
  });

  it("desactiva Ampliar sin archivo y con archivo abre el diálogo con licencia y Cerrar", () => {
    render(<TarjetaImagenes opciones={[OPCION_A, OPCION_B]} />);
    expect((screen.getByRole("button", { name: /Ampliar la opción 1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ampliar la opción 2/ }));
    const dialogo = screen.getByRole("dialog", { name: /Imagen ampliada/ });
    expect(within(dialogo).getByText(/Licencia:/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cerrar la ampliación" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respeta prefers-reduced-motion (sin transiciones en los botones) y ofrece la referencia para 3D", () => {
    render(<TarjetaImagenes opciones={[OPCION_A]} />);
    expect(screen.getByRole("button", { name: /Elegir la opción 1/ }).className).toContain("motion-reduce:transition-none");
    expect(screen.getByRole("button", { name: /Usar como referencia para 3D/ })).toBeTruthy();
  });
});

describe("TarjetaImagenes · camino de planificación propia", () => {
  afterEach(cleanup);

  it("sin opciones ni petición pide la petición; con petición reparte por capas sin red", async () => {
    const { rerender } = render(<TarjetaImagenes />);
    expect(await screen.findByText(/Aún no hay opciones/)).toBeTruthy();

    const peticion: PeticionImagen = { opciones: 2, prioridad: "rapidez", comercial: false, necesita: ["texto-a-imagen"], conReferencia: false, permisoRemoto: true, permitirDePago: false };
    rerender(<TarjetaImagenes peticion={peticion} />);
    expect(await screen.findByRole("region", { name: "Opciones de imagen" })).toBeTruthy();
  });
});
