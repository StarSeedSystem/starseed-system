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
  const nombrePropia = { mac: "Cámara de esta Mac", windows: "Cámara de este equipo", linux: "Cámara de este equipo", android: "Cámara de este aparato" } as const;
  it.each([
    ["mac", "FaceTime HD Camera (Built-in)"],
    ["windows", "Integrated Camera"],
    ["linux", "Integrated_Webcam_HD: Integrate (usb-0000:00:14.0-8)"],
    ["android", "camera2 1, facing front"],
  ] as const)("%s: marca la del propio aparato como predeterminada y elige sin cortar", (plataforma, etiqueta) => {
    const onElegir = vi.fn();
    const camaras = [{ id: "ph", nombre: "Maggabook's iPhone Camera" }, { id: "ft", nombre: etiqueta }];
    render(<SelectorCamara camaras={camaras} elegidaId={null} neurona={`t-sel-${plataforma}`} onElegir={onElegir} plataforma={plataforma} />);
    const propia = screen.getAllByRole("radio").find((r) => r.textContent?.includes("predeterminada"));
    expect(propia?.textContent).toContain(plataforma === "android" ? "Cámara frontal" : nombrePropia[plataforma]);
    expect(propia?.getAttribute("aria-checked")).toBe("true");
    const iphone = screen.getByRole("radio", { name: /iPhone \(Continuidad\)/ });
    expect(iphone.textContent).not.toMatch(/predeterminada/);
    fireEvent.click(iphone);
    expect(onElegir).toHaveBeenCalledWith("ph");
  });

  it("«Cámara de otra neurona» está desactivada y dice por qué", () => {
    render(<SelectorCamara camaras={MAC} elegidaId={null} neurona="t-sel" onElegir={() => undefined} plataforma="mac" />);
    const r = screen.getByRole("radio", { name: /Cámara de otra neurona/ }) as HTMLButtonElement;
    expect(r.disabled).toBe(true);
    expect(r.getAttribute("aria-describedby")).toBe("motivo-camara-remota");
    expect(document.getElementById("motivo-camara-remota")?.textContent).toMatch(/Continuidad/);
  });

  it("sin cámaras lo dice", () => {
    render(<SelectorCamara camaras={[]} elegidaId={null} neurona="t-sel" plataforma="linux" />);
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
