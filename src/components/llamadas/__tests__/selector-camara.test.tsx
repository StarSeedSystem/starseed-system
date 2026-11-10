// @vitest-environment jsdom
/**
 * VID1110A · selector de cámara, opciones por capacidades y pintado directo del vídeo ligero en un canvas.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { OpcionesDeCamara, SelectorCamara } from "../selector-camara";
import { LienzoLigero, Pista } from "../superficie/piezas";

afterEach(() => cleanup());

const MAC = [
  { id: "ph", nombre: "Maggabook's iPhone Camera" },
  { id: "ft", nombre: "FaceTime HD Camera (Built-in)" },
];

describe("SelectorCamara", () => {
  it("marca la del propio aparato como predeterminada y elige sin cortar", () => {
    const onElegir = vi.fn();
    render(<SelectorCamara camaras={MAC} elegidaId={null} neurona="t-sel" onElegir={onElegir} />);
    const grupo = screen.getByRole("radiogroup", { name: "Cámara" });
    expect(grupo.textContent).toContain("Cámara de este aparato".replace("este aparato", "este aparato"));
    const iphone = screen.getByRole("radio", { name: /iPhone \(Continuidad\)/ });
    const propia = screen.getAllByRole("radio").find((r) => r.textContent?.includes("predeterminada"));
    expect(propia?.textContent).toMatch(/predeterminada/);
    expect(iphone.textContent).not.toMatch(/predeterminada/);
    expect(propia?.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(iphone);
    expect(onElegir).toHaveBeenCalledWith("ph");
  });

  it("«Cámara de otra neurona» está desactivada y dice por qué", () => {
    render(<SelectorCamara camaras={MAC} elegidaId={null} neurona="t-sel" onElegir={() => undefined} />);
    const r = screen.getByRole("radio", { name: /Cámara de otra neurona/ }) as HTMLButtonElement;
    expect(r.disabled).toBe(true);
    expect(r.getAttribute("aria-describedby")).toBe("motivo-camara-remota");
    expect(document.getElementById("motivo-camara-remota")?.textContent).toMatch(/Continuidad/);
  });

  it("sin cámaras lo dice", () => {
    render(<SelectorCamara camaras={[]} elegidaId={null} neurona="t-sel" />);
    expect(screen.getByText(/No vemos ninguna cámara/)).toBeTruthy();
  });
});

describe("OpcionesDeCamara", () => {
  const pista = (cap: Record<string, unknown>, apply = vi.fn().mockResolvedValue(undefined)) =>
    ({ label: "FaceTime HD Camera", getCapabilities: () => cap, getSettings: () => ({ height: 720 }), applyConstraints: apply }) as unknown as MediaStreamTrack;

  it("solo enseña lo que la cámara admite", () => {
    render(<OpcionesDeCamara pista={pista({ height: { min: 120, max: 1080 }, zoom: { min: 1, max: 4, step: 0.5 } })} neurona="t-op" />);
    expect(screen.getByText("Resolución")).toBeTruthy();
    expect(screen.getByText(/Zoom/)).toBeTruthy();
    expect(screen.queryByText("Linterna")).toBeNull();
    expect(screen.queryByText("Enfoque")).toBeNull();
  });

  it("una cámara sin capacidades (WKWebView) lo explica en vez de enseñar controles muertos", () => {
    render(<OpcionesDeCamara pista={pista({})} neurona="t-op" />);
    expect(screen.getByText(/no deja cambiar sus ajustes/)).toBeTruthy();
    expect(screen.queryByText("Resolución")).toBeNull();
  });

  it("cambiar la resolución llama a applyConstraints", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    render(<OpcionesDeCamara pista={pista({ height: { min: 120, max: 1080 } }, apply)} neurona="t-op" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "480" } });
    expect(apply).toHaveBeenCalledWith({ height: { ideal: 480 } });
  });
});

describe("pintado directo del vídeo ligero", () => {
  it("LienzoLigero monta el canvas tal cual en el documento y lo suelta al desmontar", () => {
    const c = document.createElement("canvas");
    const { container, unmount } = render(<LienzoLigero lienzo={c} etiqueta="Imagen de Alex" />);
    expect(container.querySelector("[data-lienzo-ligero]")?.contains(c)).toBe(true);
    expect(c.getAttribute("aria-label")).toBe("Imagen de Alex");
    unmount();
    expect(c.parentNode).toBeNull();
  });

  it("Pista con lienzo no usa <video> ni necesita MediaStream", () => {
    const c = document.createElement("canvas");
    const { container } = render(<Pista stream={null} lienzo={c} video />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.contains(c)).toBe(true);
  });
});
