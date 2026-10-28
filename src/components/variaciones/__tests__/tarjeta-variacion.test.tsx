import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TarjetaVariacion, type AccionesTarjeta, type VariacionTarjeta } from "../tarjeta-variacion";

afterEach(cleanup);

const base: VariacionTarjeta = {
  id: "v1", titulo: "Cristal suave", descripcion: "Suaviza el cristal del widget", licencia: "MIT",
  valoracionMedia: 4, valoracionCount: 2,
};

/** Acciones que graban cada paso y su deshacer, sin red ni disco. */
function crearAcciones(): AccionesTarjeta & { pasos: string[] } {
  const pasos: string[] = [];
  return {
    pasos,
    probar: () => { pasos.push("probar"); return () => { pasos.push("deshacer-probar"); }; },
    aplicar: () => { pasos.push("aplicar"); return () => { pasos.push("deshacer-aplicar"); }; },
    guardar: () => { pasos.push("guardar"); },
    compartir: () => { pasos.push("compartir"); },
  };
}

describe("TarjetaVariacion", () => {
  it("pinta licencia, valoración y la etiqueta de código con su vista previa aislada", () => {
    render(<TarjetaVariacion variacion={{ ...base, requiereAislamiento: true, version: "1.1.0" }} acciones={crearAcciones()} htmlPrevia="<p>hola</p>" />);
    expect(screen.getByText("Código · aislado")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText(/4\.0 \(2\)/)).toBeTruthy();
    const marco = screen.getByTitle("Vista previa aislada: Cristal suave");
    expect(marco.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("muestra la vista previa inyectada del adaptador cuando la familia la da", () => {
    render(<TarjetaVariacion variacion={base} acciones={crearAcciones()} vistaPrevia={<span lang="es">Paleta aurora</span>} />);
    expect(screen.getByText("Paleta aurora")).toBeTruthy();
  });

  it("«Probar» aplica en vivo y el segundo clic deshace", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={base} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: /^Probar$/ }));
    expect(a.pasos).toEqual(["probar"]);
    fireEvent.click(screen.getByRole("button", { name: /^Deshacer probar$/ }));
    expect(a.pasos).toEqual(["probar", "deshacer-probar"]);
  });

  it("«Probar» se deshace solo, al cerrar la tarjeta", () => {
    const a = crearAcciones();
    const { unmount } = render(<TarjetaVariacion variacion={base} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: /^Probar$/ }));
    expect(a.pasos).toEqual(["probar"]);
    unmount();
    expect(a.pasos).toEqual(["probar", "deshacer-probar"]);
  });

  it("«Aplicar» deja deshacer visible y deshacer devuelve la tarjeta a «Aplicar»", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={base} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: /^Aplicar$/ }));
    expect(a.pasos).toEqual(["aplicar"]);
    fireEvent.click(screen.getByRole("button", { name: /^Deshacer$/ }));
    expect(a.pasos).toEqual(["aplicar", "deshacer-aplicar"]);
    expect(screen.getByRole("button", { name: /^Aplicar$/ })).toBeTruthy();
  });

  it("las de código piden confirmación antes de probar, y confirman sin repetir el paso", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={{ ...base, requiereAislamiento: true }} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: /^Probar$/ }));
    expect(a.pasos).toEqual([]); // aún nada se ejecuta
    expect(screen.getByRole("alertdialog", { name: "Confirmar código aislado" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y abrir aislado" }));
    expect(a.pasos).toEqual(["probar"]);
  });

  it("«Aplicar» de código también pasa por la confirmación", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={{ ...base, requiereAislamiento: true }} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: /^Aplicar$/ }));
    expect(a.pasos).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(a.pasos).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /^Aplicar$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y abrir aislado" }));
    expect(a.pasos).toEqual(["aplicar"]);
  });

  it("«Ver origen» solo para https con rel seguro, y la cadena de origen se referencia", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={{ ...base, enlaceOrigen: "https://ejemplo.test/origen", deVariacion: "v0" }} acciones={a} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar en la Biblioteca" }));
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
    expect(a.pasos).toEqual(["guardar", "compartir"]);
    expect(screen.getByRole("link", { name: /Ver origen/ }).getAttribute("href")).toBe("https://ejemplo.test/origen");
    expect(screen.getByRole("link", { name: /Ver origen/ }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(/Deriva de v0/)).toBeTruthy();
  });

  it("un enlace de origen no https no se pinta como enlazable", () => {
    const a = crearAcciones();
    render(<TarjetaVariacion variacion={{ ...base, enlaceOrigen: "http://inseguro.test/x" }} acciones={a} />);
    expect(screen.queryByRole("link", { name: /Ver origen/ })).toBeNull();
    expect(screen.queryByText("Ver origen")).toBeNull();
    expect(a.pasos).toEqual([]); // sin pasos: la tarjeta de un enlace inseguro no ejecuta nada sola
  });
});
});
