import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppearanceProvider } from "@/context/appearance-context";
import type { Neuron } from "@/lib/neurons/neurons";
import { FichaNeurona, coincideBusqueda, type SeccionFicha } from "../ficha-neurona";
import { SeccionPermisos } from "../seccion-permisos";
import { SeccionPapelRed } from "../seccion-papel-red";
import { SeccionSalud } from "../seccion-salud";

const AHORA = Date.now();

const montar = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

function neurona(id: string, aparatos: Record<string, { n: string; so: string; medio: string }>): Neuron {
  const mapa = Object.fromEntries(Object.entries(aparatos).map(([k, v]) => [k, { ...v, ts: AHORA - 60_000 }]));
  return {
    id,
    name: `Neurona ${id}`,
    kind: "laptop",
    capabilities: { aparatos: mapa },
    permissions: { compute: false, storage: false, sync: false, agent: false, senses: false, notify: false },
    isThisDevice: false,
  } as unknown as Neuron;
}

function extras(n: Neuron): SeccionFicha[] {
  return [
    { id: "permisos", titulo: "Permisos", palabras: "control remoto terminal archivos", contenido: <SeccionPermisos neurona={n} /> },
    { id: "papel", titulo: "Papel en la red", palabras: "relé servidor almacén", contenido: <SeccionPapelRed neurona={n} /> },
    { id: "salud", titulo: "Salud", palabras: "latido latencia versión", contenido: <SeccionSalud neurona={n} /> },
  ];
}

describe("NEU1126B · FichaNeurona", () => {
  afterEach(() => cleanup());

  it("coincideBusqueda ignora acentos y mayúsculas, y exige todas las palabras", () => {
    const s = { titulo: "Papel en la red", palabras: "relé servidor" };
    expect(coincideBusqueda(s, "")).toBe(true);
    expect(coincideBusqueda(s, "RELE")).toBe(true);
    expect(coincideBusqueda(s, "servidor papel")).toBe(true);
    expect(coincideBusqueda(s, "batería")).toBe(false);
  });

  it("monta una neurona de un aparato con las cinco secciones", () => {
    const n = neurona("uno-0001", { "aparato-0001": { n: "Mi portátil", so: "macOS", medio: "Chrome" } });
    montar(<FichaNeurona neurona={n} extras={extras(n)} />);
    for (const t of ["Identidad", "Aparatos", "Permisos", "Papel en la red", "Salud"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    fireEvent.click(screen.getByText("Aparatos"));
    expect(screen.getByText("Mi portátil")).toBeTruthy();
    expect(screen.queryByText(/lo recomendado es uno por neurona/)).toBeNull();
  });

  it("monta una neurona de dos aparatos y avisa de que lo recomendado es uno", () => {
    const n = neurona("dos-0002", {
      "aparato-0001": { n: "Mac del salón", so: "macOS", medio: "Chrome" },
      "aparato-0002": { n: "Pixel de Ana", so: "Android", medio: "App" },
    });
    montar(<FichaNeurona neurona={n} extras={extras(n)} />);
    fireEvent.click(screen.getByText("Aparatos"));
    expect(screen.getByText("Mac del salón")).toBeTruthy();
    expect(screen.getByText("Pixel de Ana")).toBeTruthy();
    expect(screen.getByText(/2 aparatos/)).toBeTruthy();
  });

  it("la búsqueda deja solo las secciones que coinciden", () => {
    const n = neurona("uno-0001", { "aparato-0001": { n: "Mi portátil", so: "macOS", medio: "Chrome" } });
    montar(<FichaNeurona neurona={n} extras={extras(n)} />);
    fireEvent.change(screen.getByLabelText("Buscar un ajuste de esta neurona"), { target: { value: "terminal" } });
    expect(screen.getByText("Permisos")).toBeTruthy();
    expect(screen.queryByText("Salud")).toBeNull();
    fireEvent.change(screen.getByLabelText("Buscar un ajuste de esta neurona"), { target: { value: "zzzz" } });
    expect(screen.getByRole("status").textContent).toContain("zzzz");
  });
});
