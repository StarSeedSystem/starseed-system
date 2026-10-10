import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderSolo, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ColaAprobar, type AccionesCola } from "../cola-aprobar";
import { borrador } from "@/lib/metageminis/datos-de-prueba";

afterEach(cleanup);

/** `Button` lee la apariencia: todo componente de este panel se prueba dentro de su proveedor. */
const render = (ui: React.ReactElement) => renderSolo(<AppearanceProvider>{ui}</AppearanceProvider>);

function acciones(sobre: Partial<AccionesCola> = {}): AccionesCola {
  return {
    aprobar: vi.fn(async () => ({ ok: true })),
    descartar: vi.fn(async () => ({ ok: true })),
    marcarEnviado: vi.fn(async () => ({ ok: true })),
    ...sobre,
  };
}

const HOY = new Date("2026-10-10T12:00:00Z");

describe("ColaAprobar", () => {
  it("sin nada pendiente lo explica", () => {
    render(<ColaAprobar borradores={[]} esDueno acciones={acciones()} hoy={HOY} />);
    expect(screen.getByText(/No hay nada esperando tu aprobación/)).toBeInTheDocument();
  });

  it("muestra el borrador con su sitio, canal, puntuación de Jev y el texto completo", () => {
    render(<ColaAprobar borradores={[borrador()]} esDueno acciones={acciones()} hoy={HOY} />);
    const tarjeta = screen.getByTestId("borrador");
    expect(within(tarjeta).getByText("Presentación de StarSeed")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/Jev: alta \(82 %\)/)).toBeInTheDocument();
    expect(within(tarjeta).getByText("API oficial")).toBeInTheDocument();
    const enlace = within(tarjeta).getByRole("link", { name: /Abund\.ai/ });
    expect(enlace).toHaveAttribute("href", "https://abund.ai");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(tarjeta).getByText(/Segunda línea/)).toBeInTheDocument();
  });

  it("un dueño aprueba con un toque y la lista se recarga", async () => {
    const a = acciones();
    const alCambiar = vi.fn();
    render(<ColaAprobar borradores={[borrador()]} esDueno acciones={a} alCambiar={alCambiar} hoy={HOY} />);
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    await waitFor(() => expect(a.aprobar).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(alCambiar).toHaveBeenCalledTimes(1));
  });

  it("descartar pide confirmar y manda el motivo", async () => {
    const a = acciones();
    render(<ColaAprobar borradores={[borrador()]} esDueno acciones={a} hoy={HOY} />);
    fireEvent.click(screen.getByRole("button", { name: /Descartar/ }));
    expect(a.descartar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Motivo del descarte"), { target: { value: "No encaja" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar descarte/ }));
    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("b1", "No encaja"));
  });

  it("si la base rechaza la decisión no recarga y se puede reintentar", async () => {
    const a = acciones({ aprobar: vi.fn(async () => ({ ok: false, motivo: "Solo un dueño de MetaGenesis puede aprobar o descartar." })) });
    const alCambiar = vi.fn();
    render(<ColaAprobar borradores={[borrador()]} esDueno acciones={a} alCambiar={alCambiar} hoy={HOY} />);
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    await waitFor(() => expect(a.aprobar).toHaveBeenCalled());
    expect(alCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Aprobar$/ })).toBeEnabled();
  });

  it("quien no es dueño no ve botones de decisión", () => {
    render(<ColaAprobar borradores={[borrador()]} esDueno={false} acciones={acciones()} hoy={HOY} />);
    expect(screen.queryByRole("button", { name: /Aprobar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Descartar/ })).toBeNull();
    expect(screen.getByText(/Solo los dueños de MetaGenesis aprueban/)).toBeInTheDocument();
  });

  it("avisa cuando el sitio no acepta texto de IA y el botón pasa a «Aprobar igualmente»", () => {
    render(<ColaAprobar borradores={[borrador({ sitio_id: "nlnet-convocatoria", canal: "formulario" })]} esDueno acciones={acciones()} hoy={HOY} />);
    expect(screen.getByText(/no acepta texto escrito por IA/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aprobar igualmente/ })).toBeInTheDocument();
  });

  it("avisa si el texto no dice que lo escribe una IA", () => {
    render(<ColaAprobar borradores={[borrador({ cuerpo: "Hola, somos StarSeed.", asunto: null })]} esDueno acciones={acciones()} hoy={HOY} />);
    expect(screen.getByText(/no dice que lo escribe un agente de IA/)).toBeInTheDocument();
  });

  it("un manual aprobado ofrece «Ya lo envié yo»; uno de API aprobado solo espera al agente", async () => {
    const a = acciones();
    const manual = borrador({ id: "m1", canal: "manual_alex", estado: "aprobado", aprobado_por: "u1", aprobado_en: "2026-10-10T09:00:00Z" });
    const api = borrador({ id: "a1", estado: "aprobado", aprobado_por: "u1", aprobado_en: "2026-10-10T09:00:00Z" });
    render(<ColaAprobar borradores={[manual, api]} esDueno acciones={a} hoy={HOY} />);
    expect(screen.getByText(/Aprobados, pendientes de enviar/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ya lo envié yo/ })).toHaveLength(1);
    expect(screen.getByText(/Esperando a que el agente lo envíe/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ya lo envié yo/ }));
    await waitFor(() => expect(a.marcarEnviado).toHaveBeenCalledWith("m1"));
  });

  it("no pinta los enviados ni los descartados", () => {
    render(<ColaAprobar borradores={[borrador({ id: "x", estado: "enviado" }), borrador({ id: "y", estado: "descartado" })]} esDueno acciones={acciones()} hoy={HOY} />);
    expect(screen.queryAllByTestId("borrador")).toHaveLength(0);
  });
});
