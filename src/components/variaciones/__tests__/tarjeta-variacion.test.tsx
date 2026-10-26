import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  esVariacionCodigo,
  siguienteProceso,
  TarjetaVariacion,
  type EstadoProceso,
  type VariacionTarjeta,
} from "../tarjeta-variacion";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";

afterEach(cleanup);

function variacion(extra: Partial<VariacionTarjeta> = {}): VariacionTarjeta {
  return {
    id: "v1", titulo: "Cristal suave", descripcion: "Un matiz más claro", version: "1.0.0",
    familia: "widget", licencia: "MIT", etiquetas: ["cristal"], creado: new Date("2026-10-01T00:00:00Z"),
    descargas: 3, valoracionMedia: 4.5, valoracionCount: 2, payload: { tono: "claro" }, ...extra,
  };
}

interface DobleAdaptador extends AdaptadorFamilia<unknown> {
  deshacerGuardado: ReturnType<typeof vi.fn>;
}

function adaptador(opciones: { valida?: boolean; vistaPrevia?: boolean } = {}): DobleAdaptador {
  const deshacerGuardado = vi.fn();
  const { valida = true, vistaPrevia: conVista = true } = opciones;
  return {
    familia: "widget", nombre: "Widget", capturar: () => null,
    validar: (p) => (typeof p === "object" && valida ? { ok: true, payload: p } : { ok: false, motivos: ["payload rechazado"] }),
    aplicar: vi.fn(() => ({ deshacer: deshacerGuardado })),
    vistaPrevia: conVista ? () => "Matiz claro" : undefined,
    deshacerGuardado,
  };
}

describe("proceso puro de la tarjeta", () => {
  it("sigue la máquina de estados: probar → prueba, aplicar → aplicada, deshacer → reposo", () => {
    const rutas: [EstadoProceso, "probar" | "aplicar" | "deshacer", EstadoProceso][] = [
      ["reposo", "probar", "prueba"], ["prueba", "aplicar", "aplicada"], ["aplicada", "deshacer", "reposo"],
      ["prueba", "deshacer", "reposo"], ["reposo", "aplicar", "aplicada"], ["prueba", "probar", "prueba"],
    ];
    for (const [estado, accion, esperado] of rutas) {
      expect(siguienteProceso(estado, accion)).toBe(esperado);
    }
  });

  it("detecta variaciones de código por su etiqueta pública, con o sin acento", () => {
    expect(esVariacionCodigo({ etiquetas: ["código"] })).toBe(true);
    expect(esVariacionCodigo({ etiquetas: ["Codigo"] })).toBe(true);
    expect(esVariacionCodigo({ etiquetas: ["cristal"] })).toBe(false);
  });
});

describe("TarjetaVariacion", () => {
  it("muestra título, licencia, versión y valoración sin poder aplicar si falta el adaptador", () => {
    render(<TarjetaVariacion variacion={variacion()} clave="widget:clima" />);
    expect(screen.getByText("Cristal suave")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("4.5 (2)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Probar/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /Aplicar/ })).toBeNull();
  });

  it("muestra otra etiqueta honesta cuando hay adaptador pero el payload no valida", () => {
    render(<TarjetaVariacion variacion={variacion({ payload: "no es objeto" })} clave="widget:clima" adaptador={adaptador({ valida: false })} />);
    expect(screen.getByRole("button", { name: /Probar/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("vista-previa")).toBeNull();
  });

  it("«Probar» aplica en vivo, avisa y deshace al cerrar la prueba con el mismo botón", () => {
    const doble = adaptador();
    render(<TarjetaVariacion variacion={variacion()} clave="widget:clima" adaptador={doble} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(doble.aplicar).toHaveBeenCalledWith("widget:clima", { tono: "claro" });
    expect(screen.getByRole("status", { name: "Proceso" }).textContent).toMatch(/Prueba en vivo/);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar prueba" }));
    expect(doble.deshacerGuardado).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status", { name: "Proceso" })).toBeNull();
  });

  it("desmontar mientras hay prueba en vivo también deshace", () => {
    const doble = adaptador();
    const { unmount } = render(<TarjetaVariacion variacion={variacion()} clave="widget:clima" adaptador={doble} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    unmount();
    expect(doble.deshacerGuardado).toHaveBeenCalledTimes(1);
  });

  it("«Aplicar» queda visible con «Deshacer» a la vista y el deshacer vuelve al reposo", () => {
    const doble = adaptador();
    render(<TarjetaVariacion variacion={variacion()} clave="widget:clima" adaptador={doble} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("status", { name: "Proceso" }).textContent).toMatch(/Aplicada/);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(doble.deshacerGuardado).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeTruthy();
  });

  it("una variación de código sin confirmar inyectado muestra su panel y solo aplica al confirmar", () => {
    const doble = adaptador();
    render(<TarjetaVariacion variacion={variacion({ etiquetas: ["código"], payload: {} })} clave="herramienta:photocraft" adaptador={doble} />);
    expect(screen.getByText(/Variación de código/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(doble.aplicar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(doble.aplicar).toHaveBeenCalledTimes(1);
  });

  it("con confirmar inyectado, el no de la persona no aplica y el sí sí", () => {
    const doble = adaptador();
    const confirmar = vi.fn(() => false);
    const props = { variacion: variacion({ etiquetas: ["código"], payload: {} }), clave: "herramienta:photocraft", adaptador: doble, confirmar };
    const { rerender } = render(<TarjetaVariacion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(confirmar).toHaveBeenCalled();
    expect(doble.aplicar).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);
    rerender(<TarjetaVariacion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(doble.aplicar).toHaveBeenCalledTimes(1);
  });

  it("Guarda en la Biblioteca y Comparte con callbacks inyectados; Ver origen solo con enlace https", () => {
    const alGuardar = vi.fn();
    const alCompartir = vi.fn();
    const props = {
      variacion: variacion({ enlaceExterno: "https://ejemplo.test/origen" }),
      clave: "widget:clima",
      adaptador: adaptador(),
      alGuardarBiblioteca: alGuardar,
      alCompartir: alCompartir,
    };
    render(<TarjetaVariacion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Guardar en la Biblioteca/ }));
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
    fireEvent.click(screen.getByRole("button", { name: /Compartir/ }));
    expect(alCompartir).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
    const enlace = screen.getByRole("link", { name: /Ver origen/ });
    expect(enlace.getAttribute("href")).toBe("https://ejemplo.test/origen");
    expect(enlace.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("no pinta «Ver origen» con un enlace inseguro y con payload sin vista previa", () => {
    render(<TarjetaVariacion variacion={variacion({ enlaceExterno: "http://inseguro.test/x" })} clave="widget:clima" adaptador={adaptador({ vistaPrevia: false })} />);
    expect(screen.queryByRole("link", { name: /Ver origen/ })).toBeNull();
    expect(screen.queryByTestId("vista-previa")).toBeNull();
  });
});
