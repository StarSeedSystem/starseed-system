/** «Qué grabar y cómo»: solo se ofrece lo que este navegador puede, y el teclado funciona en los selectores. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UA_FIREFOX_ESCRITORIO, UA_SAFARI_MAC, entornoFalso, GrabadorFalso } from "@/lib/grabacion/falsos-prueba";
import { detectarSoporte } from "@/lib/grabacion/soporte";
import { OPCIONES_POR_DEFECTO, type OpcionesGrabacion } from "@/lib/grabacion/tipos";
import { AjustesGrabacion } from "../grabar/ajustes-grabacion";

afterEach(cleanup);

function ver(parcial: Parameters<typeof entornoFalso>[0] = {}, opciones: Partial<OpcionesGrabacion> = {}) {
  const alCambiar = vi.fn();
  const soporte = detectarSoporte(entornoFalso(parcial));
  render(<AjustesGrabacion opciones={{ ...OPCIONES_POR_DEFECTO, ...opciones }} soporte={soporte} onCambio={alCambiar} />);
  return alCambiar;
}

describe("AjustesGrabacion", () => {
  it("en Chrome de escritorio ofrece fuente, micrófono, sonido del sistema y cámara superpuesta", () => {
    GrabadorFalso.reiniciar(["video/webm;codecs=vp9,opus", "video/webm"]);
    ver();
    expect(screen.getByRole("radiogroup", { name: "Qué grabar" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Micrófono/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Sonido del sistema/ })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Cámara superpuesta/ })).toBeTruthy();
  });

  it("en Firefox no pinta un interruptor de sonido del sistema: explica que no se puede", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    ver({ userAgent: UA_FIREFOX_ESCRITORIO, plataforma: "Linux x86_64" });
    expect(screen.queryByRole("switch", { name: /Sonido del sistema/ })).toBeNull();
    expect(screen.getByText(/solo lo ofrecen Chrome y Edge/)).toBeTruthy();
  });

  it("el selector de formato solo aparece si el navegador sabe grabar WebM y MP4", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    ver();
    expect(screen.queryByRole("radiogroup", { name: "Formato del archivo" })).toBeNull();
    cleanup();
    GrabadorFalso.reiniciar(["video/webm", "video/mp4"]);
    ver();
    expect(screen.getByRole("radiogroup", { name: "Formato del archivo" })).toBeTruthy();
  });

  it("Safari de escritorio (solo MP4) no ofrece elegir formato: no hay nada que elegir", () => {
    GrabadorFalso.reiniciar(["video/mp4"]);
    ver({ userAgent: UA_SAFARI_MAC, plataforma: "MacIntel" });
    expect(screen.queryByRole("radiogroup", { name: "Formato del archivo" })).toBeNull();
  });

  it("la esquina y el tamaño de la cámara solo salen con la cámara superpuesta encendida", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    ver({}, { camaraSuperpuesta: false });
    expect(screen.queryByRole("radiogroup", { name: "Esquina de la cámara" })).toBeNull();
    cleanup();
    ver({}, { camaraSuperpuesta: true });
    expect(screen.getByRole("radiogroup", { name: "Esquina de la cámara" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Tamaño de la cámara" })).toBeTruthy();
  });

  it("con «Solo cámara» no se ofrece el sonido del sistema ni la cámara superpuesta", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    ver({}, { fuente: "camara" });
    expect(screen.queryByRole("switch", { name: /Sonido del sistema/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Cámara superpuesta/ })).toBeNull();
  });

  it("estima cuánto pesa por minuto y cuántos minutos caben en la Biblioteca, y cambia con la calidad", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    ver({}, { calidad: "estandar" });
    const estandar = screen.getByTestId("estimacion-tamano").textContent;
    expect(estandar).toMatch(/por minuto/);
    expect(estandar).toMatch(/50 MB/);
    cleanup();
    ver({}, { calidad: "ligera" });
    expect(screen.getByTestId("estimacion-tamano").textContent).not.toBe(estandar);
  });

  it("los selectores se manejan con flechas y avisan del cambio", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    const alCambiar = ver({}, { cuentaAtras: 3 });
    const tres = screen.getByRole("radio", { name: "3 s" });
    expect(tres.getAttribute("aria-checked")).toBe("true");
    expect(tres.tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "5 s" }).tabIndex).toBe(-1);
    fireEvent.keyDown(tres, { key: "ArrowRight" });
    expect(alCambiar).toHaveBeenLastCalledWith({ cuentaAtras: 5 });
    fireEvent.keyDown(tres, { key: "ArrowLeft" });
    expect(alCambiar).toHaveBeenLastCalledWith({ cuentaAtras: 0 });
  });

  it("encender el micrófono lo comunica", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    const alCambiar = ver();
    fireEvent.click(screen.getByRole("switch", { name: /Micrófono/ }));
    expect(alCambiar).toHaveBeenCalledWith({ microfono: true });
  });
});
