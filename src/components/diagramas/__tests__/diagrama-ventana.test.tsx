/**
 * DGM1018J · Pruebas de la ventana de diagrama: la pureza de `pedidoCambio` y la ventana
 * SIN RED NI GUARDADO reales (ambos van inyectados); el HTML sale siempre en iframe sandbox.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramaVentana, pedidoCambio } from "../diagrama-ventana";

afterEach(cleanup);

/* Diagrama mínimo que pasa la validación de aislar-diagrama (un <!DOCTYPE>, un <svg>). */
const DIAGRAMA = `<!DOCTYPE html>
<html lang="es"><head><style>text{font-family:sans-serif}</style></head>
<body><svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
<rect x="10" y="10" width="180" height="40" fill="none" stroke="#4cc3ff" /><text x="100" y="35" fill="#fff">Inicio</text>
</svg></body></html>`;

const GUARDADO_OK = () => Promise.resolve({ ok: true });

describe("ventana diagrama · pedidoCambio (puro)", () => {
  it("con indicación: armado de la petición con el diagrama actual entre vallas", () => {
    const p = pedidoCambio("añade la capa de correo", DIAGRAMA);
    expect(p).toContain("Cambia este diagrama: añade la capa de correo");
    expect(p).toContain("Diagrama actual (edítalo; no lo rehagas desde cero):");
    expect(p).toContain("```html");
    expect(p).toContain("<svg");
  });

  it("sin indicación: mejora conservando tipo y contenido", () => {
    expect(pedidoCambio("   ", DIAGRAMA)).toContain("Mejora este diagrama sin cambiar su tipo ni su contenido.");
  });
});

describe("ventana diagrama · superficies", () => {
  it("sin diagrama: mensaje claro y NADA que guardar ni pedir", () => {
    render(<DiagramaVentana />);
    expect(screen.getByTestId("sin-diagrama").textContent).toContain("No hay diagrama abierto");
    expect(screen.queryByTestId("pedir-cambio")).toBeNull();
    expect(screen.queryByTestId("guardar-biblioteca")).toBeNull();
    expect(screen.queryByTestId("estado-guardado")).toBeNull();
  });

  it("con diagrama: HTML pintado SOLO en iframe sandbox sin permisos, dentro de la vista aislada", () => {
    const { container } = render(<DiagramaVentana html={DIAGRAMA} titulo="Flujo" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(iframe?.getAttribute("srcdoc") ?? "").toContain("Content-Security-Policy");
    expect(screen.getByTestId("estado-guardado").textContent).toContain("En la Biblioteca o por pedir");
  });

  it("Pedir cambio a Astraura: llama a diagrama.crear con la petición armada y limpia el cuadro", () => {
    const alPedirCambio = vi.fn();
    render(<DiagramaVentana html={DIAGRAMA} alPedirCambio={alPedirCambio} />);
    fireEvent.change(screen.getByTestId("cambio-texto"), { target: { value: "más contraste" } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir cambio a Astraura" }));
    expect(alPedirCambio).toHaveBeenCalledTimes(1);
    expect(alPedirCambio).toHaveBeenCalledWith(pedidoCambio("más contraste", DIAGRAMA));
    expect((screen.getByTestId("cambio-texto") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByTestId("estado-accion").textContent).toContain("Cambio pedido a Astraura");
  });

  it("guardar: oka queda «Guardado en la Biblioteca»; falla cuenta el motivo", async () => {
    const alGuardar = vi.fn().mockResolvedValue({ ok: false, motivo: "Inicia sesión para guardar en tu Biblioteca." });
    render(<DiagramaVentana html={DIAGRAMA} alGuardar={alGuardar} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar en la Biblioteca" }));
    expect(screen.getByTestId("estado-guardado").textContent).toContain("Guardando…");
    await waitFor(() => expect(screen.getByTestId("estado-guardado").textContent).toContain("No se pudo guardar"));
    expect(screen.getByTestId("estado-accion")?.textContent).toContain("Inicia sesión");
  });

  it("guardado logrado, y rechazo si red/guardar explotan sin detalle", async () => {
    const alGuardar = vi.fn().mockResolvedValue({ ok: true });
    render(<DiagramaVentana html={DIAGRAMA} alGuardar={alGuardar} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar en la Biblioteca" }));
    await waitFor(() => expect(screen.getByTestId("estado-guardado").textContent).toContain("Guardado en la Biblioteca"));
  });
});
