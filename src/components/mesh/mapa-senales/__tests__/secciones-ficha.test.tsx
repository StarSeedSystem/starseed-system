/** La ficha enseña cada valor con su clase de dato y su fuente; «no medido» siempre se explica. */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { fichaDeSenal } from "@/lib/senales/fichas";
import { senal } from "@/lib/senales/__fixtures__/vivo";
import type { FichaMapa } from "@/lib/senales/tipos-vivo";
import { FichaPanel, FichaSecciones } from "../secciones-ficha";

const ficha: FichaMapa = {
  titulo: "Nodo de prueba", subtitulo: "LoRa", resumen: "Un nodo de prueba.",
  secciones: [
    { id: "calidad", titulo: "Calidad", datos: [{ etiqueta: "SNR", valor: "−7,5 dB", fuente: "el chip LoRa de tu radio", estado: "medido" }] },
    { id: "posicion", titulo: "Posición", datos: [
      { etiqueta: "Distancia", valor: "≈300 m", fuente: "modelo log-distancia", estado: "estimado", nota: "Error de ×1,6." },
      { etiqueta: "Batería", valor: "no medido", fuente: "el nodo no la informa", estado: "no-medido", nota: "Este firmware no la publica." },
    ] },
  ],
};

afterEach(() => cleanup());

describe("secciones de la ficha", () => {
  test("cada dato lleva su pastilla de clase y su fuente", () => {
    render(<FichaSecciones ficha={ficha} />);
    expect(screen.getByText("−7,5 dB").closest("[data-estado]")).toHaveAttribute("data-estado", "medido");
    expect(screen.getByText(/el chip LoRa de tu radio/)).toBeInTheDocument();
    expect(screen.getByText("Error de ×1,6.")).toBeInTheDocument();
    for (const t of ["medido", "estimado", "no medido"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });

  test("«omitir» quita secciones enteras", () => {
    render(<FichaSecciones ficha={ficha} omitir={["calidad"]} />);
    expect(screen.queryByText("−7,5 dB")).not.toBeInTheDocument();
    expect(screen.getByText("≈300 m")).toBeInTheDocument();
  });

  test("el panel cierra y vuelve", () => {
    const onCerrar = vi.fn();
    const onVolver = vi.fn();
    render(<FichaPanel ficha={ficha} color="#38bdf8" onCerrar={onCerrar} onVolver={onVolver} textoVolver="Ver el aparato" />);
    const panel = screen.getByTestId("ficha-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar la ficha" }));
    fireEvent.click(within(panel).getByRole("button", { name: /Ver el aparato/ }));
    expect(onCerrar).toHaveBeenCalled();
    expect(onVolver).toHaveBeenCalled();
  });

  test("la ficha real de una señal LoRa sin batería ni saltos dice «no medido» con su motivo", () => {
    const real = fichaDeSenal(senal("lora:1", { metrics: [] }), { ahora: 1_800_000_000_000, cuenta: "ninguna", vivo: null });
    render(<FichaSecciones ficha={real} />);
    const sinMedir = Array.from(document.querySelectorAll('[data-estado="no-medido"]'));
    expect(sinMedir.length).toBeGreaterThan(0);
    for (const fila of sinMedir) expect(fila.querySelectorAll("p").length).toBeGreaterThanOrEqual(2); // fuente + nota
  });
});
