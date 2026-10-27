import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  PanelEditarPdf,
  nombreVersionNueva,
  operacionesDisponibles,
  type ClientePdf,
  type OperacionPdf,
  type ResultadoEdicion,
} from "../panel-editar-pdf";

afterEach(cleanup);

const archivo = { nombre: "informe.pdf", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }) };

function clienteSimulado(respuesta: ResultadoEdicion = {
  ok: true,
  blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  nombre: "editado.pdf",
}) {
  const llamadas: { op: OperacionPdf; archivo: Blob; valores: Record<string, string> }[] = [];
  const cliente: ClientePdf = {
    async ejecutar(op, original, valores) {
      llamadas.push({ op, archivo: original, valores });
      return respuesta;
    },
  };
  return { cliente, llamadas };
}

describe("operacionesDisponibles", () => {
  it("sin capacidades enseña el catálogo conocido", () => {
    expect(operacionesDisponibles().map((op) => op.id)).toEqual([
      "rotar", "dividir", "quitar", "reordenar", "comprimir", "ocr", "marca",
    ]);
    expect(operacionesDisponibles([])).toHaveLength(7);
  });

  it("solo deja las operaciones que la instancia declara", () => {
    expect(operacionesDisponibles(["compress-pdf", "/api/v1/security/add-watermark", "desconocida"]).map((op) => op.id))
      .toEqual(["comprimir", "marca"]);
  });
});

describe("nombreVersionNueva", () => {
  it("marca la versión nueva y conserva la extensión", () => {
    expect(nombreVersionNueva("informe.pdf")).toBe("informe (versión nueva).pdf");
    expect(nombreVersionNueva("")).toBe("documento (versión nueva).pdf");
  });
});

describe("PanelEditarPdf", () => {
  it("sin servidor lo dice con todas las letras", () => {
    render(<PanelEditarPdf archivo={archivo} alGuardar={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(/necesita un servidor Stirling-PDF/);
  });

  it("solo enseña las operaciones que la instancia declara", () => {
    const { cliente } = clienteSimulado();
    render(<PanelEditarPdf archivo={archivo} alGuardar={() => {}} cfg={{ cliente, capacidades: ["/api/v1/misc/compress-pdf"] }} />);
    expect(screen.getByRole("button", { name: "Comprimir" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rotar" })).not.toBeInTheDocument();
  });

  it("ejecuta, previsualiza y guarda como versión nueva", async () => {
    const { cliente, llamadas } = clienteSimulado();
    const guardados: { blob: Blob; nombre: string }[] = [];
    render(<PanelEditarPdf archivo={archivo} alGuardar={(blob, nombre) => { guardados.push({ blob, nombre }); }} cfg={{ cliente }} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotar" }));
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambio" }));
    expect(await screen.findByText(/Resultado listo/)).toBeInTheDocument();
    expect(llamadas[0].op.id).toBe("rotar");
    expect(llamadas[0].valores.angle).toBe("180");
    expect(llamadas[0].archivo).toBe(archivo.blob);
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }));
    await waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0].nombre).toBe("editado (versión nueva).pdf");
    expect(guardados[0].blob).not.toBe(archivo.blob);
  });

  it("enseña un error legible cuando el servidor falla", async () => {
    const { cliente } = clienteSimulado({ ok: false, error: "La instancia no tiene OCR instalado." });
    render(<PanelEditarPdf archivo={archivo} alGuardar={() => {}} cfg={{ cliente, capacidades: ["ocr-pdf"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "OCR" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La instancia no tiene OCR instalado.");
  });
});
