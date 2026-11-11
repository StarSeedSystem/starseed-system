// @vitest-environment jsdom
/** LLA1111A · relevo lienzo ↔ <video> sin negro: el lienzo se queda encima hasta que el <video> pinta un cuadro. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ImagenRemota } from "../piezas";

let cuadros: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  cuadros = [];
  (HTMLVideoElement.prototype as unknown as { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback = function (cb: () => void) {
    cuadros.push(cb);
    return cuadros.length;
  };
  (HTMLVideoElement.prototype as unknown as { cancelVideoFrameCallback: () => void }).cancelVideoFrameCallback = () => undefined;
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function flujoConVideo(muted = true) {
  const pista = { id: "v1", kind: "video", readyState: "live", muted };
  return { id: "s1", getVideoTracks: () => [pista], getTracks: () => [pista] } as unknown as MediaStream;
}
const pintar = () => {
  act(() => {
    const l = cuadros;
    cuadros = [];
    l.forEach((cb) => cb());
  });
  // El <video> manda cuando lleva un rato pintando (FIRME_MS).
  act(() => {
    vi.advanceTimersByTime(300);
  });
};
const modo = (c: HTMLElement) => c.querySelector("[data-imagen-remota]")?.getAttribute("data-imagen-remota") ?? "nada";

describe("ImagenRemota", () => {
  it("de lienzo a WebRTC: el lienzo sigue encima hasta el primer cuadro del <video> (aunque la pista siga «muted»)", () => {
    const lienzo = document.createElement("canvas");
    const s = flujoConVideo(true);
    const pinta = vi.fn();
    const { container, rerender } = render(<ImagenRemota stream={s} lienzo={lienzo} alPintar={pinta} />);
    expect(modo(container)).toBe("lienzo");
    rerender(<ImagenRemota stream={s} lienzo={null} alPintar={pinta} />);
    expect(modo(container)).toBe("lienzo");
    expect(container.querySelector("video[data-remoto]")).toBeTruthy();
    expect(pinta).toHaveBeenLastCalledWith(true);
    pintar();
    expect(modo(container)).toBe("video");
    expect(pinta).toHaveBeenLastCalledWith(true);
  });

  it("de WebRTC al lienzo: en cuanto el motor da el lienzo pasa encima; a la vuelta hace falta un cuadro NUEVO", () => {
    const lienzo = document.createElement("canvas");
    const s = flujoConVideo(false);
    const { container, rerender } = render(<ImagenRemota stream={s} lienzo={null} />);
    pintar();
    expect(modo(container)).toBe("video");
    rerender(<ImagenRemota stream={s} lienzo={lienzo} />);
    expect(modo(container)).toBe("lienzo");
    rerender(<ImagenRemota stream={s} lienzo={null} />);
    expect(modo(container)).toBe("lienzo");
    pintar();
    expect(modo(container)).toBe("video");
  });

  it("sin lienzo nunca y sin cuadros: no inventa imagen (avisa «sin imagen»)", () => {
    const pinta = vi.fn();
    const { container } = render(<ImagenRemota stream={flujoConVideo(true)} lienzo={null} alPintar={pinta} />);
    expect(modo(container)).toBe("video");
    expect(pinta).toHaveBeenLastCalledWith(false);
  });

  it("(LLA1111H) cuenta al motor si el <video> pinta de verdad: false mientras no hay cuadros, true con el primero, null con la pestaña oculta", () => {
    const dice = vi.fn();
    const { rerender } = render(<ImagenRemota stream={flujoConVideo(true)} lienzo={null} alVideoPinta={dice} />);
    expect(dice).toHaveBeenLastCalledWith(false);
    // Cada 1,5 s lo repite (por si el motor se perdió un aviso).
    dice.mockClear();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(dice).toHaveBeenCalledWith(false);
    pintar();
    expect(dice).toHaveBeenLastCalledWith(true);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(dice).toHaveBeenLastCalledWith(null);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    rerender(<ImagenRemota stream={null} lienzo={null} alVideoPinta={dice} />);
    expect(dice).toHaveBeenLastCalledWith(null);
  });

  it("(LLA1111H) una pista que no pinta NO se reengancha ni se clona (en el banco no servía): el <video> sigue siendo el mismo", () => {
    const s = flujoConVideo(true);
    const { container } = render(<ImagenRemota stream={s} lienzo={null} />);
    const antes = container.querySelector("video");
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(container.querySelector("video")).toBe(antes);
    expect((antes as HTMLVideoElement).srcObject).toBe(s);
  });

  it("(LLA1111H) «pinta» caduca: un <video> congelado con el último cuadro deja de contar (y se lo dice al motor)", () => {
    const dice = vi.fn();
    const { container } = render(<ImagenRemota stream={flujoConVideo(true)} lienzo={null} alVideoPinta={dice} />);
    pintar();
    expect(dice).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(dice).toHaveBeenLastCalledWith(false);
    expect(container.querySelector("[data-imagen-remota]")).toBeTruthy();
    // Si vuelve un cuadro, pinta otra vez.
    pintar();
    expect(dice).toHaveBeenLastCalledWith(true);
  });
});
