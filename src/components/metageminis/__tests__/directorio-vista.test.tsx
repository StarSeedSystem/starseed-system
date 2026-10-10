import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render as renderSolo, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { DirectorioVista } from "../directorio-vista";
import { DIRECTORIO } from "@/lib/metageminis/directorio";

afterEach(cleanup);
const render = (ui: React.ReactElement) => renderSolo(<AppearanceProvider>{ui}</AppearanceProvider>);
const HOY = new Date("2026-10-10T12:00:00Z");

describe("DirectorioVista", () => {
  it("muestra el resumen con la fecha de verificación y todas las fichas", () => {
    render(<DirectorioVista hoy={HOY} />);
    expect(screen.getByTestId("directorio-resumen")).toHaveTextContent(`${DIRECTORIO.length} sitios verificados el 2026-10-10`);
    expect(screen.getAllByTestId("sitio")).toHaveLength(DIRECTORIO.length);
    expect(screen.getByTestId("directorio-cuenta")).toHaveTextContent(`${DIRECTORIO.length} sitios con estos filtros`);
  });

  it("cada ficha tiene su enlace «Abrir» seguro", () => {
    render(<DirectorioVista hoy={HOY} />);
    const enlaces = screen.getAllByRole("link", { name: /^Abrir / });
    expect(enlaces).toHaveLength(DIRECTORIO.length);
    for (const a of enlaces) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("filtra por texto y dice cuántos coinciden; sin coincidencias lo explica", () => {
    render(<DirectorioVista hoy={HOY} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "bluesky" } });
    const fichas = screen.getAllByTestId("sitio");
    expect(fichas.length).toBeGreaterThanOrEqual(1);
    expect(within(fichas[0]).getByRole("heading", { level: 5 })).toHaveTextContent(/Bluesky/);
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "zzzz-no-existe" } });
    expect(screen.queryAllByTestId("sitio")).toHaveLength(0);
    expect(screen.getByText(/Ningún sitio coincide/)).toBeInTheDocument();
  });

  it("filtra por categoría, prioridad y «solo donde el agente puede enviar»", () => {
    render(<DirectorioVista hoy={HOY} />);
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "red-agentes" } });
    const esperadas = DIRECTORIO.filter((s) => s.categoria === "red-agentes").length;
    expect(screen.getAllByTestId("sitio")).toHaveLength(esperadas);
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "todas" } });
    fireEvent.change(screen.getByLabelText("Prioridad"), { target: { value: "1" } });
    expect(screen.getAllByTestId("sitio")).toHaveLength(DIRECTORIO.filter((s) => s.prioridad === 1).length);
    fireEvent.change(screen.getByLabelText("Prioridad"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText(/Solo donde el agente puede enviar/));
    const n = screen.getAllByTestId("sitio").length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(DIRECTORIO.length);
  });

  it("deja claro lo que no acepta IA y el plazo de las convocatorias abiertas", () => {
    render(<DirectorioVista hoy={HOY} />);
    const nlnet = document.querySelector('[data-id="nlnet-convocatoria"]') as HTMLElement;
    expect(within(nlnet).getByText("No acepta texto de IA")).toBeInTheDocument();
    expect(within(nlnet).getByText(/vence el 2026-11-03 \(24 días\)/)).toBeInTheDocument();
    expect(within(nlnet).getByText("Lo envía una persona")).toBeInTheDocument();
  });

  it("el detalle cuenta las normas, lo mínimo que se pide a Alex y cuánto se leyó", () => {
    render(<DirectorioVista hoy={HOY} />);
    const ficha = document.querySelector('[data-id="abund-ai"]') as HTMLElement;
    expect(within(ficha).getByText(/Lo mínimo que se pide a Alex/)).toBeInTheDocument();
    expect(within(ficha).getByText(/Página leída · 2026-10-10/)).toBeInTheDocument();
  });
});
