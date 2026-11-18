/**
 * Pruebas de la vista del espectro (MRE6): dos señales solapadas siguen siendo dos, la señal sin
 * frecuencia va a su fila, el bloque de `sinFuente` se ve con su motivo y elegir (clic o Enter)
 * llama a `onElegir` con el id. Solo la interfaz pública del componente, sin red ni disco.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SenalEspectro, SinFuente } from "@/lib/senales/espectro/tipos";
import { VistaEspectro } from "../vista-espectro";

function senal(id: string, extra: Partial<SenalEspectro> = {}): SenalEspectro {
  return {
    id, medio: "wifi", banda: "Wi-Fi 2,4 GHz", frecuenciaKhz: 2_412_000, anchoKhz: 20_000,
    fuerzaDbm: -60, calidad: 0.7, origen: "medida", capa: "propia", fuente: "escaneo del sistema",
    medidoEn: null, zona: null, compatibles: [], ...extra,
  };
}

function pintar(senales: SenalEspectro[], sinFuente: SinFuente[] = []) {
  const onElegir = vi.fn();
  const r = render(<VistaEspectro senales={senales} sinFuente={sinFuente} onElegir={onElegir} />);
  return { ...r, onElegir };
}

afterEach(() => cleanup());

describe("VistaEspectro", () => {
  it("dos señales solapadas se pintan las dos y cada una es elegible", () => {
    const { onElegir } = pintar([
      senal("a", { frecuenciaKhz: 2_412_000, fuerzaDbm: -50 }),
      senal("b", { frecuenciaKhz: 2_413_000, fuerzaDbm: -70, origen: "estimada" }),
    ]);
    const a = screen.getByRole("button", { name: /wifi · Wi-Fi 2,4 GHz.*capa propia.*medida/ });
    const b = screen.getByRole("button", { name: /estimada/ });
    fireEvent.keyDown(a, { key: "Enter" });
    fireEvent.keyDown(b, { key: "Enter" });
    expect(onElegir).toHaveBeenNthCalledWith(1, "a");
    expect(onElegir).toHaveBeenNthCalledWith(2, "b");
  });

  it("la señal sin frecuencia va a su fila, no se coloca en el eje", () => {
    pintar([senal("x", { frecuenciaKhz: null, anchoKhz: null })]);
    const pieza = screen.getByRole("button", { name: /^sin frecuencia · wifi/ });
    expect(pieza).toBeInTheDocument();
    expect(screen.getByText("sin frecuencia")).toBeInTheDocument();
  });

  it("el bloque «Lo que este aparato no puede ver» muestra cada sinFuente con su motivo", () => {
    pintar([], [{ medio: "lora", motivo: "error en adaptador LoRa/Malla" }]);
    expect(screen.getByText("Lo que este aparato no puede ver")).toBeInTheDocument();
    expect(screen.getByText(/error en adaptador LoRa\/Malla/)).toBeInTheDocument();
    expect(screen.getByText("lora")).toBeInTheDocument();
  });

  it("Enter sobre una barra llama a onElegir con su id; otras teclas no", () => {
    const { onElegir } = pintar([senal("k")]);
    fireEvent.keyDown(screen.getByRole("button", { name: /wifi · Wi-Fi 2,4 GHz/ }), { key: "Enter" });
    expect(onElegir).toHaveBeenCalledWith("k");
    onElegir.mockClear();
    fireEvent.keyDown(screen.getByRole("button", { name: /wifi · Wi-Fi 2,4 GHz/ }), { key: "Escape" });
    expect(onElegir).not.toHaveBeenCalled();
  });

  it("el estilo sigue el origen: medida sólida, declarada con anillo, estimada rayada, sin medir hueca", () => {
    pintar([
      senal("m", { origen: "medida" }),
      senal("d", { origen: "declarada", frecuenciaKhz: 5_180_000, banda: "Wi-Fi 5 GHz" }),
      senal("e", { origen: "estimada", frecuenciaKhz: 2_437_000, medio: "lora", banda: "LoRa 2,4 GHz" }),
      senal("h", { fuerzaDbm: null, frecuenciaKhz: 868_500, medio: "lora", banda: "LoRa 868 MHz" }),
    ]);
    const rects = Array.from(document.querySelectorAll("svg rect"));
    const de = (id: string) => rects.find((r) => r.closest("g[aria-label]")?.getAttribute("aria-label")?.startsWith(id) ?? false);
    const m = de("wifi · Wi-Fi 2,4 GHz · 2,412 GHz · capa propia · escaneo del sistema · medida")!;
    expect(m.getAttribute("fill")).toBe("#38bdf8");
    const d = de("wifi · Wi-Fi 5 GHz · 5,180 GHz")!;
    expect(d.getAttribute("stroke")).toBe("#38bdf8");
    expect(d.getAttribute("stroke-width")).toBe("0.55");
    const e = de("lora · LoRa 2,4 GHz · 2,437 GHz")!;
    expect(e.getAttribute("fill")).toMatch(/^url\(#rayas-lora\)$/);
    const h = de("lora · LoRa 868 MHz · 868,5 MHz")!;
    expect(h.getAttribute("fill")).toBe("none");
    expect(Number(h.getAttribute("stroke-width"))).toBeGreaterThan(0.4);
  });

  it("el eje rotula las bandas conocidas y da nombre al grupo", () => {
    pintar([senal("s")]);
    const textos = Array.from(document.querySelectorAll("svg text")).map((t) => t.textContent ?? "");
    expect(textos).toContain("433 MHz");
    expect(textos).toContain("868 MHz");
    expect(textos).toContain("2,4 GHz");
    expect(textos).toContain("5 GHz");
    expect(screen.getByRole("group", { name: "Espectro de frecuencias" })).toBeInTheDocument();
  });
});
