// Prueba de la tarjeta de opciones (IMG1011J · contrato §6). Render en jsdom: la componente
// es visual; la conducta comprobable es lo que pinta y lo que responde al elegir (sin red).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/lib/library-store", () => ({ saveResource: vi.fn() }));

import { saveResource } from "@/lib/library-store";
import { TarjetaImagenes } from "../tarjeta-imagenes";
import type { GaleriaImagenes } from "@/ai/astraura/media/proveedor-neuronas";

const guardarEnBiblioteca = vi.mocked(saveResource);

const op = (mas: Partial<GaleriaImagenes["opciones"][number]> = {}) => ({
  url: "blob:opcion-a", modelo: "SD-Turbo", capa: "navegador" as const, semilla: 3,
  licencia: "Stability AI", uso: "condicionado" as const, atribucion: "", segundos: 0.8, ...mas,
});

const galeria = (opciones: GaleriaImagenes["opciones"], descartes: string[] = []): GaleriaImagenes =>
  ({ ok: true, opciones, descartes });

describe("TarjetaImagenes", () => {
  beforeEach(() => {
    cleanup();
    guardarEnBiblioteca.mockClear();
  });

  it("sin galería (o sin ninguna opción con url) no pinta nada", () => {
    const { container: a } = render(<TarjetaImagenes galeria={null} />);
    expect(a.querySelector("section")).toBeNull();
    const { container: b } = render(<TarjetaImagenes galeria={galeria([{ ...op(), url: undefined }])} />);
    expect(b.querySelector("section")).toBeNull();
  });

  it("enseña cada opción con su capa, modelo, semilla y licencia, y los descartes lo explican", () => {
    render(
      <TarjetaImagenes
        galeria={galeria(
          [op(), op({ url: "blob:opcion-b", modelo: null, capa: "web-gratis", licencia: "gratis", semilla: 9, segundos: 2 })],
          ["Flux: no cabe en esta neurona."],
        )}
      />,
    );
    expect(screen.getByText(/La pestaña \(WebGPU\) · SD-Turbo/)).toBeTruthy();
    expect(screen.getByText(/Web gratis$/)).toBeTruthy();
    expect(screen.getByText("Licencia: Stability AI")).toBeTruthy();
    expect(screen.getByText("Licencia: gratis")).toBeTruthy();
    expect(screen.getByText("Semilla 9 · 2 s")).toBeTruthy();
    expect(screen.getByText(/Lo que se descartó y por qué \(1\)/)).toBeTruthy();
    expect(screen.getByText("Flux: no cabe en esta neurona.")).toBeTruthy();
  });

  it("«Elegir» solo aparece con callback y al pulsarlo entrega la url de la opción", () => {
    const elegir = vi.fn();
    render(<TarjetaImagenes galeria={galeria([op()])} alUsar={elegir} />);
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
    expect(elegir).toHaveBeenCalledOnce();
    expect(elegir.mock.calls[0][1].modelo).toBe("SD-Turbo");
    expect(screen.queryByRole("button", { name: "Elegir" })).toBeTruthy();
  });

  it("sin callback no hay «Elegir», y «Guardar» lleva la imagen a la Biblioteca", () => {
    render(<TarjetaImagenes galeria={galeria([op()])} />);
    expect(screen.queryByRole("button", { name: "Elegir" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(guardarEnBiblioteca).toHaveBeenCalledOnce();
    expect(guardarEnBiblioteca.mock.calls[0][0].url).toBe("blob:opcion-a");
    expect(screen.getByRole("button", { name: "Guardada" })).toBeTruthy();
  });

  it("un error de la galería se enseña, no se esconde", () => {
    render(<TarjetaImagenes galeria={{ ok: true, opciones: [op()], descartes: [], error: "Una opción falló" }} />);
    expect(screen.getByText("Una opción falló")).toBeTruthy();
  });
});
