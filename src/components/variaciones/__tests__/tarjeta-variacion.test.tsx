import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";
import { TarjetaVariacion, documentoAislado, esEnlaceSeguro, type TarjetaVariacionProps, type VariacionTarjeta } from "../tarjeta-variacion";

afterEach(cleanup);
const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

const variacion: VariacionTarjeta = {
  id: "v1", titulo: "Cristal suave", descripcion: "Una variación con efecto cristal", version: "1.0.0",
  familia: "widget", licencia: "MIT", etiquetas: ["cristal", "suave"], valoracionMedia: 4.5,
  valoracionCount: 3, payload: { tema: "cristal" },
};

function falso(over: Partial<AdaptadorFamilia<unknown>> = {}) {
  const deshacer = vi.fn();
  const aplicar = vi.fn(() => ({ deshacer }));
  const adaptador: AdaptadorFamilia<unknown> = {
    familia: "widget", nombre: "Widget", capturar: () => null,
    validar: (p) => ({ ok: true, payload: p }), aplicar, vistaPrevia: (p) => ({ muestra: p }), ...over,
  };
  return { adaptador, aplicar, deshacer };
}

function tarjeta(props: Partial<TarjetaVariacionProps> = {}) {
  return (
    <TarjetaVariacion
      clave="widget:clima" variacion={variacion} adaptador={null}
      guardarSlot={<span>Guardar en la Biblioteca</span>} compartirSlot={<span>Compartir</span>}
      {...props}
    />
  );
}

describe("TarjetaVariacion", () => {
  it("muestra título, descripción, valoración, licencia, etiquetas y versión", () => {
    render(tarjeta());
    expect(screen.getByRole("heading", { level: 4 }).textContent).toBe("Cristal suave");
    expect(screen.getByText("Una variación con efecto cristal")).toBeTruthy();
    expect(screen.getByLabelText("Valoración 4.5 de 5").textContent).toContain("4.5 (3)");
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("cristal")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("Guardar en la Biblioteca")).toBeTruthy();
    expect(screen.getByText("Compartir")).toBeTruthy();
  });

  it("Probar aplica, al repetir deshace y al cerrar la tarjeta deshace la prueba", () => {
    const { adaptador, aplicar, deshacer } = falso();
    const { unmount } = render(tarjeta({ adaptador }));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(aplicar).toHaveBeenCalledWith("widget:clima", { tema: "cristal" });
    fireEvent.click(screen.getByRole("button", { name: /Deshacer prueba/ }));
    expect(deshacer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    unmount();
    expect(deshacer).toHaveBeenCalledTimes(2);
  });

  it("Aplicar deja el deshacer visible y deshacer restaura el estado", () => {
    const { adaptador, deshacer } = falso();
    render(tarjeta({ adaptador }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("button", { name: "Aplicada" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Aplicar" }).hasAttribute("disabled")).toBe(false);
  });

  it("un payload que no valida no se aplica y explica el motivo", () => {
    const { adaptador, aplicar } = falso({ validar: () => ({ ok: false, motivos: ["No es un tema registrado"] }) });
    render(tarjeta({ adaptador }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("No es un tema registrado");
  });

  it("las variaciones de código piden confirmación y solo se abren aisladas", () => {
    const { adaptador, aplicar } = falso();
    render(tarjeta({ adaptador, variacion: { ...variacion, payload: { html: "<h1>Hola</h1>" } } }));
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Esta variación lleva código");
    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.queryByTitle(/Variación aislada/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir aislada" }));
    const marco = screen.getByTitle("Variación aislada de Cristal suave");
    expect(marco.getAttribute("sandbox")).toBe("allow-scripts");
    expect(marco.getAttribute("srcdoc")).toContain("Hola");
  });

  it("Ver origen avisa al manejador y muestra de qué variación deriva", () => {
    const alVerOrigen = vi.fn();
    render(tarjeta({ variacion: { ...variacion, deVariacion: "origen-42" }, alVerOrigen }));
    fireEvent.click(screen.getByRole("button", { name: "Ver origen" }));
    expect(alVerOrigen).toHaveBeenCalledWith("origen-42");
    expect(screen.getByText("Deriva de la variación origen-42")).toBeTruthy();
  });

  it("la vista previa sale del adaptador y sin adaptador lo dice con honestidad", () => {
    const { adaptador } = falso();
    render(tarjeta({ adaptador }));
    fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
    expect(screen.getByText(/muestra/)).toBeTruthy();
    cleanup();
    render(tarjeta());
    fireEvent.click(screen.getByRole("button", { name: /Vista previa/ }));
    expect(screen.getByText("Este adaptador no ofrece vista previa.")).toBeTruthy();
  });
});

describe("ayudantes puros de la tarjeta", () => {
  it("solo acepta enlaces https y rechaza esquemas peligrosos", () => {
    expect(esEnlaceSeguro("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(esEnlaceSeguro("http://inseguro.test")).toBeNull();
    expect(esEnlaceSeguro("javascript:alert(1)")).toBeNull();
    expect(esEnlaceSeguro(undefined)).toBeNull();
  });

  it("envuelve un svg y rechaza payloads sin código", () => {
    expect(documentoAislado({ svg: "<svg></svg>" })).toContain("<!doctype html>");
    expect(documentoAislado({ html: "<p>ok</p>" })).toBe("<p>ok</p>");
    expect(documentoAislado({ tema: "cristal" })).toBeNull();
    expect(documentoAislado(null)).toBeNull();
  });
});
