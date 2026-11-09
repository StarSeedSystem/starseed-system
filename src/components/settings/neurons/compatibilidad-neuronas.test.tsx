"use client";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TablaCompatibilidad, neuronasParaMatriz } from "./compatibilidad-neuronas";
import { lanasPlenas, type NeuronaDeCuenta } from "@/lib/malla/matriz-enlaces";
import type { Neuron } from "@/lib/neurons/neurons";

const nc = (id: string, nombre: string, plataforma: NeuronaDeCuenta["plataforma"]): NeuronaDeCuenta => ({ id, nombre, plataforma, lanas: lanasPlenas(plataforma), anunciadas: true });

afterEach(() => cleanup());

describe("TablaCompatibilidad", () => {
  it("con una sola neurona dice que no hay parejas", () => {
    render(<TablaCompatibilidad neuronas={[nc("a", "Mac", "macos")]} />);
    expect(screen.getByTestId("compatibilidad-vacia")).toBeInTheDocument();
    expect(screen.queryByTestId("tabla-compatibilidad")).toBeNull();
  });

  it("una fila por pareja, con carriles numerados y la frase del límite", () => {
    render(<TablaCompatibilidad mismaRed neuronas={[nc("m", "Mi Mac", "macos"), nc("w", "Sobremesa", "windows"), nc("p", "Navegador", "web")]} />);
    const tabla = screen.getByTestId("tabla-compatibilidad");
    expect(within(tabla).getByRole("columnheader", { name: "Pareja" })).toBeInTheDocument();
    expect(within(tabla).getByRole("columnheader", { name: /Carriles ahora/ })).toBeInTheDocument();
    const filas = screen.getAllByTestId("fila-compatibilidad");
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("Mac ↔ Windows: solo Bluetooth (macOS no tiene Wi‑Fi Direct)");
    expect(filas[0]).toHaveTextContent("1 · Bluetooth");
    expect(filas[0]).toHaveTextContent("2 · red local");
    expect(filas[1]).toHaveTextContent("Web/PWA: sin antenas directas; usa la red local por la app nativa o la malla");
    expect(filas[1]).toHaveTextContent("ninguno directo");
  });

  it("es accesible: título de tabla, cabeceras de fila y región desplazable con nombre", () => {
    render(<TablaCompatibilidad mismaRed neuronas={[nc("a", "A", "android"), nc("b", "B", "android")]} />);
    expect(screen.getByRole("region", { name: /Compatibilidad entre tus neuronas/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    expect(screen.getByTestId("fila-compatibilidad")).toHaveTextContent("1 · Wi‑Fi Aware");
  });

  it("enseña los carriles en espera por un fallo reciente y ya no los cuenta", () => {
    render(<TablaCompatibilidad mismaRed caidas={() => ["wifi-direct"]} neuronas={[nc("a", "Linux", "linux"), nc("b", "Win", "windows")]} />);
    const fila = screen.getByTestId("fila-compatibilidad");
    expect(fila).toHaveTextContent("En espera por un fallo reciente: Wi‑Fi Direct");
    expect(fila).not.toHaveTextContent("1 · Wi‑Fi Direct");
    expect(fila).toHaveTextContent("1 · Bluetooth");
  });
});

describe("neuronasParaMatriz", () => {
  const neurona = (id: string, name: string, platform: string, extra: Record<string, unknown> = {}): Neuron =>
    ({ id, name, kind: "desktop", capabilities: { platform, ...extra }, permissions: {} }) as unknown as Neuron;
  it("esta neurona usa lo medido; la viva, lo que anunció; la de cuenta, lo publicado; la vieja, lo estimado", () => {
    const vivas = new Map([["v", { plataforma: "linux" as const, lanas: lanasPlenas("linux"), anunciadas: true }]]);
    const out = neuronasParaMatriz(
      [neurona("yo", "Mac", "macOS"), neurona("v", "Portátil", "Linux"), neurona("c", "Móvil", "Android", { lanas: lanasPlenas("android"), plataformaLanas: "android" }), neurona("o", "Viejo", "Windows")],
      vivas,
      { id: "yo", plataforma: "macos", lanas: lanasPlenas("macos") },
    );
    expect(out.map((x) => [x.nombre, x.plataforma, x.anunciadas])).toEqual([
      ["Mac", "macos", true],
      ["Portátil", "linux", true],
      ["Móvil", "android", true],
      ["Viejo", "windows", false],
    ]);
    expect(out[0].esta).toBe(true);
    // Viejo: sin dato de antenas, no se le prometen.
    expect(out[3].lanas["ble-gatt"]).toEqual({ central: false, periferico: false });
  });
});
