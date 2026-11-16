/**
 * PER1111S — la ventana de la lista de permisos: qué enseña por sistema, con el estado real, y qué botón ofrece.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ListaPermisos } from "../lista-permisos";
import { GUARDADO_VACIO, abrirAsistente, reducirAsistente, type EstadoAsistente } from "@/lib/nativa/permisos-inicio";

afterEach(cleanup);

const noop = () => {};
function pintar(e: EstadoAsistente, onPedir = vi.fn()) {
  render(<ListaPermisos estado={e} onEmpezar={noop} onOmitir={noop} onOmitirTodo={noop} onPedir={onPedir} onCerrar={noop} />);
  return onPedir;
}

describe("ListaPermisos (PER1111S)", () => {
  it("macOS: agrupa, enseña el estado real y dice qué no se puede leer", () => {
    const e = abrirAsistente("macos", GUARDADO_VACIO, true, { accesibilidad: "concedido", pantalla: "no-concedido", camara: "denegado" });
    pintar(e);
    expect(screen.getByTestId("grupo-pantalla-control")).toBeTruthy();
    expect(screen.getByTestId("estado-accesibilidad").textContent).toBe("Concedido");
    expect(screen.getByTestId("estado-camara").textContent).toMatch(/Denegado/);
    expect(screen.getByTestId("estado-disco-completo").textContent).toMatch(/fase 6/);
    expect(screen.getByTestId("estado-carpetas").textContent).toMatch(/al usarlo/);
    expect(screen.getByTestId("permiso-accesibilidad").getAttribute("data-accion")).toBe("listo");
    expect(screen.getByTestId("permiso-camara").getAttribute("data-accion")).toBe("abrir-ajustes");
  });

  it("en el resumen cada permiso pedible tiene su botón y lo demás no", () => {
    let e = abrirAsistente("macos", GUARDADO_VACIO, true, { camara: "denegado" });
    e = reducirAsistente(reducirAsistente(e, { t: "empezar" }), { t: "omitir-todo" });
    const onPedir = pintar(e);
    fireEvent.click(within(screen.getByTestId("permiso-camara")).getByRole("button", { name: "Abrir Ajustes" }));
    expect(onPedir).toHaveBeenCalledWith(expect.objectContaining({ id: "camara" }));
    expect(within(screen.getByTestId("permiso-capacidades")).queryByRole("button")).toBeNull();
    expect(within(screen.getByTestId("permiso-disco-completo")).queryByRole("button")).toBeNull();
  });

  it("Android: lo de fases posteriores se enseña con su fase, sin botón", () => {
    let e = abrirAsistente("android", GUARDADO_VACIO, true, { cercanos: "concedido" });
    e = reducirAsistente(reducirAsistente(e, { t: "empezar" }), { t: "omitir-todo" });
    pintar(e);
    expect(screen.getByTestId("estado-accesibilidad").textContent).toMatch(/fase 3/);
    expect(within(screen.getByTestId("permiso-accesibilidad")).queryByRole("button")).toBeNull();
    expect(screen.getByTestId("estado-pantalla").textContent).toMatch(/fase 2/);
  });

  it("pidiendo: el botón del pie nombra lo que se pide y si abre Ajustes", () => {
    const e = reducirAsistente(abrirAsistente("macos", { ...GUARDADO_VACIO, vistos: ["bluetooth", "red-local", "ubicacion-wifi", "notificaciones", "microfono", "camara"], avisos: ["pantalla"] }), { t: "empezar" });
    pintar(e);
    expect(screen.getByTestId("boton-pedir-actual").textContent).toBe("Abrir Ajustes: Grabación de pantalla y audio del sistema");
  });

  // FAC1116: qué pantalla se abre y qué pulsar, o la verdad de que no hay enlace.
  it("denegado: dice la pantalla exacta y qué pulsar allí (macOS directo, Android por la ficha)", () => {
    const m = abrirAsistente("macos", GUARDADO_VACIO, true, { camara: "denegado" });
    pintar(m);
    const t = screen.getByTestId("enlace-camara");
    expect(t.getAttribute("data-nivel")).toBe("directo");
    expect(t.textContent).toMatch(/Privacidad y seguridad › Cámara.*Activa el interruptor de StarSeed OS/);
    cleanup();
    const a = abrirAsistente("android", GUARDADO_VACIO, true, { microfono: "denegado" });
    pintar(a);
    const u = screen.getByTestId("enlace-microfono");
    expect(u.getAttribute("data-nivel")).toBe("ficha");
    expect(u.textContent).toMatch(/Android no tiene una pantalla propia.*«Permisos» › «Micrófono»/);
  });

  it("lo ya concedido no enseña pasos", () => {
    pintar(abrirAsistente("macos", GUARDADO_VACIO, true, { camara: "concedido" }));
    expect(screen.queryByTestId("enlace-camara")).toBeNull();
  });
});
