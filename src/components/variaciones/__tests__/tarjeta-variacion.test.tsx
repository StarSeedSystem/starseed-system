import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
// Guardar/Compartir tocan la Librería real: aquí van doblados; lo puro se prueba con itemDeGuardado.
vi.mock("@/components/library/save-to-library", () => ({
  SaveToLibrary: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("@/components/sharing/share-to-dialog", () => ({
  ShareToDialog: ({ open, resource }: { open: boolean; resource: { name: string } }) => (open ? <div data-testid="compartir">{resource.name}</div> : null),
}));
import { TarjetaVariacion, itemDeGuardado, type VariacionTarjeta } from "../tarjeta-variacion";
import type { AdaptadorFamilia } from "@/lib/variaciones/familias";

afterEach(cleanup);
function variacion(extra: Partial<VariacionTarjeta> = {}): VariacionTarjeta {
  return {
    id: "u-1", titulo: "Cristal suave", licencia: "MIT", payload: { radio: "grande" }, valoracionMedia: 4.6, valoracionCount: 3, etiquetas: ["cristal"], ...extra,
  };
}
/** Adaptador doblado: cuenta aplicar/deshacer; admite vista previa y payload rechazado. */
function adaptadorDoblado(opciones: { vista?: (p: unknown) => unknown } = {}) {
  const registro = { aplicar: 0, aplicadoCon: [] as unknown[][], deshacer: 0 };
  const adaptador: AdaptadorFamilia<unknown> = {
    familia: "widget", nombre: "doblado", capturar: () => null,
    validar: (payload) => ({ ok: true, payload }),
    aplicar: (clave, payload) => {
      registro.aplicar += 1;
      registro.aplicadoCon.push([clave, payload]);
      return { deshacer: () => { registro.deshacer += 1; } };
    },
    vistaPrevia: opciones.vista,
  };
  return { adaptador, registro };
}
describe("TarjetaVariacion", () => {
  it("pinta los datos, la vista previa del adaptador y deja valorar", () => {
    const alValorar = vi.fn();
    const { adaptador } = adaptadorDoblado({ vista: (p) => `visto: ${JSON.stringify(p)}` });
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion()} adaptador={adaptador} alValorar={alValorar} />);
    expect(screen.getByText("Cristal suave")).toBeTruthy();
    expect(screen.getByText("visto: {\"radio\":\"grande\"}")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("Guardar en la Biblioteca")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Valorar 5 de 5" }));
    expect(alValorar).toHaveBeenCalledWith(5);
  });

  it("Probar aplica en vivo, avisa de la prueba activa y deshace al pulsar de nuevo", () => {
    const { adaptador, registro } = adaptadorDoblado();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion()} adaptador={adaptador} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(registro.aplicar).toBe(1);
    expect(registro.aplicadoCon[0]).toEqual(["widget:clima", { radio: "grande" }]);
    expect(screen.getByRole("button", { name: "Deshacer prueba" })).toBeTruthy();
    expect(screen.getByText(/se deshace al cerrar la ventana/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer prueba" }));
    expect(registro.deshacer).toBe(1);
    expect(screen.getByRole("button", { name: "Probar" })).toBeTruthy();
  });

  it("la prueba activa se deshace sola al cerrar la tarjeta (desmontar)", () => {
    const { adaptador, registro } = adaptadorDoblado();
    const vista = render(<TarjetaVariacion clave="widget:clima" variacion={variacion()} adaptador={adaptador} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    vista.unmount();
    expect(registro.deshacer).toBe(1);
  });

  it("Aplicar registra el uso y muestra un Deshacer visible que repone", () => {
    const alUsar = vi.fn();
    const { adaptador, registro } = adaptadorDoblado();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion()} adaptador={adaptador} alUsar={alUsar} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(registro.aplicar).toBe(1);
    expect(alUsar).toHaveBeenCalledWith("u-1");
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(registro.deshacer).toBe(1);
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeTruthy();
  });

  it("un payload inválido avisa y no llega al adaptador", () => {
    const { adaptador, registro } = adaptadorDoblado();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion({ payload: { password: "cccccc" } })} adaptador={adaptador} />);
    fireEvent.click(screen.getByRole("button", { name: "Probar" }));
    expect(screen.getByRole("alert").textContent).toContain("Privacidad");
    expect(registro.aplicar).toBe(0);
  });

  it("código: pide confirmación y se abre aislado con la orden inyectada", () => {
    const abrirAislado = vi.fn();
    const { adaptador } = adaptadorDoblado();
    const payload = { html: "<b>cristal</b>" };
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion({ payload, codigo: true })} adaptador={adaptador} abrirAislado={abrirAislado} />);
    expect(screen.getByText("Código")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Probar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir aislado" }));
    expect(screen.getByText(/sin acceso a tu sesión/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aislado" }));
    expect(abrirAislado).toHaveBeenCalledWith(payload);
    expect(screen.getByRole("button", { name: "Abrir aislado" })).toBeTruthy();
  });

  it("ver origen va a la variación de la que deriva y Compartir abre su diálogo", () => {
    const alVerOrigen = vi.fn();
    const { adaptador } = adaptadorDoblado();
    render(<TarjetaVariacion clave="widget:clima" variacion={variacion({ deVariacion: "u-0" })} adaptador={adaptador} alVerOrigen={alVerOrigen} />);
    expect(screen.queryByTestId("compartir")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver origen" }));
    expect(alVerOrigen).toHaveBeenCalledWith("u-0");
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
    expect(screen.getByTestId("compartir").textContent).toContain("Cristal suave");
  });

  it("itemDeGuardado: referencia con kind, clave, licencia y tags de la familia", () => {
    const item = itemDeGuardado("widget:clima", variacion({ tema: "bruma" }));
    expect([item.title, item.mime]).toEqual(["Cristal suave", "application/json"]);
    expect(item.tags).toEqual(["starseed-variacion", "widget", "tema:bruma"]);
    const contenido = JSON.parse(item.content) as { kind: string; version: number; clave: string; licencia: string; payload: unknown };
    expect(contenido).toEqual({ kind: "starseed-variacion", version: 1, clave: "widget:clima", licencia: "MIT", payload: { radio: "grande" } });
  });
});
