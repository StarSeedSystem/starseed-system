// @vitest-environment jsdom
/**
 * Tarjeta de opciones de imagen (IMG1011C): rejilla sin solaparse, licencia y atribución a la vista, y
 * acciones honestas. Sin red, sin disco: puros clics de la persona sobre el despiece y sus botones.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TarjetaImagenes, etiquetaCapa, etiquetaMotor, etiquetaUso, usoDe, atribucionDe, type OpcionTarjeta } from "../tarjeta-imagenes";
import type { ModeloImagen } from "@/lib/imagenes/modelos";

const modelo = (sobre: Partial<ModeloImagen> = {}): ModeloImagen => ({
  id: "flux-schnell", nombre: "FLUX.1 [schnell]", gama: "alta", vramGB: 6, ramGB: 8,
  motores: ["sdcpp", "comfyui", "diffusers", "a1111-forge"], licencia: "Apache-2.0", uso: "libre",
  gated: true, pasos: 4, resolucion: 1024, capacidades: ["texto-a-imagen", "rapido"], hf: "black-forest-labs/FLUX.1-schnell",
  ...sobre,
});
const opcion = (sobre: Partial<OpcionTarjeta> = {}): OpcionTarjeta => ({
  capa: "malla", neuronaId: "a1", modelo: modelo(), motor: "sdcpp", cuantizacion: "q8",
  semilla: 42, motivo: "Cabe cuantizado a 8 bits.", ...sobre,
});

afterEach(cleanup);

describe("etiquetas puras de la tarjeta", () => {
  it("dice dónde se hizo cada opción, nombrando la neurona de la malla", () => {
    expect(etiquetaCapa(opcion())).toBe("la malla · a1");
    expect(etiquetaCapa(opcion({ capa: "dispositivo", neuronaId: "pc-escritorio" }))).toBe("tu aparato");
    expect(etiquetaCapa(opcion({ capa: "web-gratis", neuronaId: undefined, modelo: null, motor: "pollinations" }))).toBe("la web (gratis)");
  });
  it("nombra el motor real o el servicio, y no se inventa licencias donde no hay modelo", () => {
    expect(etiquetaMotor(opcion())).toContain("stable-diffusion.cpp");
    expect(etiquetaMotor(opcion({ motor: "pollinations", modelo: null }))).toContain("Pollinations");
    expect(usoDe(opcion({ modelo: null }))).toBeNull();
    expect(etiquetaUso("no-comercial")).toBe("no comercial");
  });
  it("cada opción lleva su atribución: el repo de Hugging Face o la web gratis", () => {
    expect(atribucionDe(opcion())).toBe("black-forest-labs/FLUX.1-schnell");
    expect(atribucionDe(opcion({ modelo: null, motor: "pollinations" }))).toBe("https://pollinations.ai");
  });
});

describe("la tarjeta en la rejilla", () => {
  it("enseña modelo, dónde, licencia, atribución, uso y semilla de cada opción", () => {
    render(<TarjetaImagenes opciones={[opcion()]} />);
    expect(screen.getByText("FLUX.1 [schnell]")).toBeTruthy();
    expect(screen.getByText(/la malla · a1/)).toBeTruthy();
    expect(screen.getByText("Apache-2.0")).toBeTruthy();
    expect(screen.getByText("black-forest-labs/FLUX.1-schnell")).toBeTruthy();
    expect(screen.getByText("uso libre")).toBeTruthy();
    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getByText("8 bits", { exact: false })).toBeTruthy();
  });
  it("en vacío y en carga no inventa opciones; el plan honesto deja los descartes a la vista", () => {
    render(<TarjetaImagenes opciones={[]} descartes={["SD 1.5: no cabe en a1."]} />);
    expect(screen.getByText(/Nada que mostrar todavía/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Por qué no hay más opciones/));
    expect(screen.getByText("SD 1.5: no cabe en a1.")).toBeTruthy();
    cleanup();
    render(<TarjetaImagenes opciones={[]} cargando />);
    expect(screen.getByText(/Preparando opciones/)).toBeTruthy();
  });
});

describe("las siete acciones del contrato §6", () => {
  it("llama a cada callback de su opción; guardar tiene el de la Biblioteca por defecto", () => {
    const acciones = { elegir: vi.fn(), variar: vi.fn(), editar: vi.fn(), ampliar: vi.fn(), referencia3d: vi.fn(), guardar: vi.fn(), publicar: vi.fn() };
    const hecha = opcion({ estado: "hecha", url: "https://biblioteca/imagen.png" });
    const { unmount } = render(<TarjetaImagenes opciones={[hecha]} acciones={acciones} />);
    fireEvent.click(screen.getByRole("button", { name: "Elegir esta opción" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Ampliar la imagen" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Editar en la Protomolécula" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar en la Biblioteca" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar como referencia para 3D" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear borrador de publicación" }));
    fireEvent.click(screen.getByRole("button", { name: "Variar esta opción" }));
    expect(acciones.elegir).toHaveBeenCalledTimes(1);
    expect(acciones.variar).toHaveBeenCalledTimes(1);
    expect(acciones.editar).toHaveBeenCalledTimes(1);
    expect(acciones.ampliar).toHaveBeenCalledTimes(1);
    expect(acciones.referencia3d).toHaveBeenCalledWith(hecha);
    expect(acciones.publicar).toHaveBeenCalledWith(hecha);
    expect(acciones.guardar).toHaveBeenCalledTimes(1);
    unmount();
  });
  it("es honesta: lo no cableado o sin imagen se deshabilita diciendo el porqué", () => {
    render(<TarjetaImagenes opciones={[opcion()]} />);
    const editar = screen.getByRole("button", { name: /Editar en la Protomolécula \(no disponible/ });
    expect(editar.hasAttribute("disabled")).toBe(true);
    expect(editar.getAttribute("title")).toContain("Primero se genera");
    const biblioteca = screen.getByRole("button", { name: /Guardar en la Biblioteca/ });
    expect(biblioteca.hasAttribute("disabled")).toBe(true);
    const elegir = screen.getByRole("button", { name: /Elegir esta opción \(no disponible/ });
    expect(elegir.getAttribute("title")).toContain("falta el cableado");
  });
  it("amplia con el despiece interno si nadie pasa su propio visor", () => {
    const hecha = opcion({ estado: "hecha", url: "https://biblioteca/imagen.png" });
    render(<TarjetaImagenes opciones={[hecha]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ampliar la imagen" }));
    expect(screen.getByRole("dialog", { name: /Imagen ampliada: FLUX.1/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
