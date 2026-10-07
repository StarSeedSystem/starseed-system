import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { NuevaEstacion } from "../nueva-estacion";

const mockPublicar = vi.fn();
const mockEditar = vi.fn();
const mockAnunciar = vi.fn();

vi.mock("@/lib/estaciones/datos", () => ({ publicarEstacion: (...a: unknown[]) => mockPublicar(...a), editarEstacion: (...a: unknown[]) => mockEditar(...a) }));
vi.mock("@/lib/estaciones/malla", () => ({ anunciarEnMalla: (...a: unknown[]) => mockAnunciar(...a) }));

describe("NuevaEstacion (ES1010K)", () => {
  beforeEach(() => { mockPublicar.mockReset(); mockEditar.mockReset(); mockAnunciar.mockReset(); });

  it("muestra errores por campo al guardar con datos inválidos", async () => {
    render(<AppearanceProvider><NuevaEstacion abierto onCerrar={() => {}} /></AppearanceProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Publicar estación/i }));
    await waitFor(() => expect(screen.getByText(/Enlace es obligatorio/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Título es obligatorio/)).toBeTruthy());
  });

  it("publica y llama a malla si en_malla está activo", async () => {
    mockPublicar.mockResolvedValue({ ok: true, estacion: { id: "e2", titulo: "Radio", tipo: "audio", enlace: "https://radio.org/stream", licencia: "cc-by", en_malla: true } as any });
    render(<AppearanceProvider><NuevaEstacion abierto onCerrar={() => {}} /></AppearanceProvider>);
    const [enlaceIn] = screen.getAllByPlaceholderText("https://...");
    fireEvent.change(enlaceIn, { target: { value: "https://radio.org/stream" } });
    const [tituloIn] = screen.getAllByPlaceholderText("Nombre de la transmisión");
    fireEvent.change(tituloIn, { target: { value: "Radio" } });
    const checkMalla = screen.getByLabelText("Anunciar también por la malla");
    fireEvent.click(checkMalla);
    fireEvent.click(screen.getByRole("button", { name: /Publicar estación/i }));
    await waitFor(() => expect(mockPublicar).toHaveBeenCalled());
    await waitFor(() => expect(mockAnunciar).toHaveBeenCalled());
  });

  it("edita una estación existente", async () => {
    mockEditar.mockResolvedValue({ ok: true, estacion: { id: "e3", titulo: "Editado", tipo: "video", enlace: "https://v.org", licencia: "cc0" } as any });
    render(<AppearanceProvider><NuevaEstacion abierto onCerrar={() => {}} inicial={{ id: "e3", titulo: "Editado", tipo: "video", enlace: "https://v.org", licencia: "cc0" }} /></AppearanceProvider>);
    const [tituloEd] = screen.getAllByPlaceholderText("Nombre de la transmisión");
    fireEvent.change(tituloEd, { target: { value: "Editado" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    await waitFor(() => expect(mockEditar).toHaveBeenCalled());
  });

  it("detecta formato y sugiere tipo al pegar enlace", async () => {
    mockPublicar.mockResolvedValue({ ok: true, estacion: { id: "e1", titulo: "Test", tipo: "audio", enlace: "https://ejemplo.org/stream.m3u8", licencia: "cc0" } as any });
    render(<AppearanceProvider><NuevaEstacion abierto onCerrar={() => {}} /></AppearanceProvider>);
    const [enlaceInput] = screen.getAllByPlaceholderText("https://...");
    fireEvent.change(enlaceInput, { target: { value: "https://ejemplo.org/stream.m3u8" } });
    await waitFor(() => expect(screen.getByText(/HLS/)).toBeTruthy());
  });
});
