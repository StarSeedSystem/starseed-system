import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderSolo, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { PiezasCampana, textoFormato, type AccionesPiezas } from "../piezas-campana";
import type { Campana } from "@/lib/metageminis/tipos";
import { pieza } from "@/lib/metageminis/datos-de-prueba";

afterEach(cleanup);

/** `Button` lee la apariencia: todo componente de este panel se prueba dentro de su proveedor. */
const render = (ui: React.ReactElement) => renderSolo(<AppearanceProvider>{ui}</AppearanceProvider>);

const campana: Campana = { id: "c1", nombre: "Semilla de otoño", objetivo: null, brief: {}, estado: "activa", rama_id: "campanas", creado_en: "2026-10-01T00:00:00Z", actualizado_en: "2026-10-01T00:00:00Z" };

function acciones(sobre: Partial<AccionesPiezas> = {}): AccionesPiezas {
  return {
    aprobar: vi.fn(async () => ({ ok: true })),
    descartar: vi.fn(async () => ({ ok: true })),
    marcarPublicada: vi.fn(async () => ({ ok: true })),
    ...sobre,
  };
}

const base = { campanas: [campana], sinTabla: false, esDueno: true, acciones: acciones() };

describe("PiezasCampana", () => {
  it("si la tabla no existe lo dice con claridad y no pinta ceros", () => {
    render(<PiezasCampana {...base} piezas={[]} sinTabla />);
    expect(screen.getByTestId("aviso-sin-tabla")).toHaveTextContent(/metageminis_piezas/);
    expect(screen.getByTestId("aviso-sin-tabla")).toHaveTextContent(/todavía no existe/);
    expect(screen.queryByTestId("pieza")).toBeNull();
  });

  it("si la tabla existe pero falló la lectura, lo dice", () => {
    render(<PiezasCampana {...base} piezas={[]} error="Solo para miembros de MetaGenesis con sesión iniciada." />);
    expect(screen.getByRole("alert")).toHaveTextContent(/No se pudieron leer las piezas/);
  });

  it("sin piezas explica qué aparecerá", () => {
    render(<PiezasCampana {...base} piezas={[]} />);
    expect(screen.getByText(/Todavía no hay piezas/)).toBeInTheDocument();
  });

  it("agrupa por campaña y medio, con imagen y vídeo de vista previa", () => {
    render(
      <PiezasCampana
        {...base}
        piezas={[
          pieza({ id: "p1", ruta: "/piezas/cartel.png" }),
          pieza({ id: "p2", tipo: "video", medio: "tiktok", formato: "1080x1920@15s", ruta: null, url: "https://cdn.example/spot.mp4" }),
        ]}
      />,
    );
    expect(screen.getByRole("region", { name: "Campaña Semilla de otoño" })).toBeInTheDocument();
    expect(screen.getByText("instagram")).toBeInTheDocument();
    expect(screen.getByText("tiktok")).toBeInTheDocument();
    const img = screen.getByRole("img", { name: /Imagen para instagram/ });
    expect(img).toHaveAttribute("src", "/piezas/cartel.png");
    const video = screen.getByLabelText(/Vídeo para tiktok/);
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "https://cdn.example/spot.mp4");
    expect(screen.getByText("1080×1920 · 15 s")).toBeInTheDocument();
    expect(screen.getByText("2 para aprobar")).toBeInTheDocument();
  });

  it("nunca carga direcciones peligrosas: muestra «Sin vista previa»", () => {
    render(<PiezasCampana {...base} piezas={[pieza({ ruta: null, url: null }), pieza({ id: "p9", ruta: "javascript:alert(1)", url: "http://x.example/a.png" })]} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getAllByText("Sin vista previa").length).toBe(2);
  });

  it("un dueño aprueba y descarta con motivo", async () => {
    const a = acciones();
    const alCambiar = vi.fn();
    render(<PiezasCampana {...base} acciones={a} alCambiar={alCambiar} piezas={[pieza()]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Aprobar$/ }));
    await waitFor(() => expect(a.aprobar).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(alCambiar).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Descartar/ }));
    fireEvent.change(screen.getByLabelText("Motivo del descarte"), { target: { value: "Texto con errores" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar descarte/ }));
    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("p1", "Texto con errores"));
  });

  it("quien no es dueño no ve botones", () => {
    render(<PiezasCampana {...base} esDueno={false} piezas={[pieza()]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Solo los dueños de MetaGenesis aprueban o descartan/)).toBeInTheDocument();
  });

  it("una pieza aprobada se marca publicada y una descartada enseña su motivo", async () => {
    const a = acciones();
    render(
      <PiezasCampana
        {...base}
        acciones={a}
        piezas={[
          pieza({ id: "ok", estado: "aprobado", aprobado_por: "u", aprobado_en: "2026-10-10T09:00:00Z" }),
          pieza({ id: "no", estado: "descartado", motivo_descarte: "Mala resolución", medio: "youtube" }),
        ]}
      />,
    );
    expect(screen.getByText(/Motivo: Mala resolución/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ya la publiqué/ }));
    await waitFor(() => expect(a.marcarPublicada).toHaveBeenCalledWith("ok"));
    expect(within(screen.getAllByTestId("pieza").find((e) => e.getAttribute("data-estado") === "descartado")!).queryByRole("button")).toBeNull();
  });

  it("muestra las métricas reales cuando las hay", () => {
    render(<PiezasCampana {...base} piezas={[pieza({ estado: "publicado", metricas: { visualizaciones: 1200, clics: 34 } })]} />);
    expect(screen.getByLabelText("Métricas reales")).toHaveTextContent(/visualizaciones: 1200/);
  });

  it("formato legible", () => {
    expect(textoFormato("1920x1080")).toBe("1920×1080");
    expect(textoFormato("1080x1920@15s")).toBe("1080×1920 · 15 s");
    expect(textoFormato("raro")).toBe("raro");
  });
});
