// @vitest-environment jsdom
/**
 * ARC1108A — la ventana de un envío: cabecera (quién, verificación, ruta, tamaño, mensaje), carpetas,
 * lista/cuadrícula, casillas, «Aceptar seleccionados», «Rechazar todos», «Aceptar todos» (que pide
 * confirmar lo marcado como peligro), progreso tras aceptar e «Inspeccionar con IA» (solo metadatos,
 * nunca acepta sola). Y el montaje global: una ventana por envío, las demás esperan en una pastilla.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EstadoTransferencia, MotorArchivos } from "@/lib/network/archivos-malla";
import { agruparEnvios } from "@/lib/network/envios-entrantes";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EnviosEntrantes, VentanaEnvio as VentanaSuelta, type AccionesEnvio } from "@/components/network/envios-entrantes";

/** La ventana va siempre dentro del diálogo de Radix (título y descripción accesibles). */
function VentanaEnvio(p: Parameters<typeof VentanaSuelta>[0]) {
  return (
    <Dialog open>
      <DialogContent>
        <VentanaSuelta {...p} />
      </DialogContent>
    </Dialog>
  );
}

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

function e(p: Partial<EstadoTransferencia> & { id: string; nombre: string }): EstadoTransferencia {
  return {
    rol: "recibir",
    tipo: "application/octet-stream",
    tamano: 2048,
    trozos: 1,
    progreso: 0,
    fase: "pendiente-aceptar",
    inicioMs: 1_000,
    actualizadoMs: 1_000,
    origen: "MaggaBook (red local · app nativa)",
    lote: "lote_1",
    loteTotal: 4,
    mensaje: "Las fotos y el contrato",
    via: "Red local (app nativa) · enlace directo WebRTC",
    verificacion: { tipo: "firma", texto: "Firmado por su identidad de malla", huella: "fp-mac" },
    ...p,
  };
}

const archivos = [
  e({ id: "a", nombre: "a.png", tipo: "image/png", ruta: "viaje/fotos/a.png", inicioB64: PNG_B64, vista: { tipo: "imagen", datosUrl: "data:image/jpeg;base64,AAAA" } }),
  e({ id: "b", nombre: "contrato.pdf", tipo: "application/pdf" }),
  e({ id: "c", nombre: "factura.pdf.exe", tipo: "application/octet-stream" }),
  e({ id: "d", nombre: "nota.txt", tipo: "text/plain", vista: { tipo: "texto", texto: "Hola desde la Mac" } }),
];

function acciones(): AccionesEnvio & { aceptar: ReturnType<typeof vi.fn>; rechazar: ReturnType<typeof vi.fn>; inspeccionarIA: ReturnType<typeof vi.fn> } {
  return {
    aceptar: vi.fn(),
    rechazar: vi.fn(),
    cancelar: vi.fn(),
    blobDe: () => undefined,
    inspeccionarIA: vi.fn(async () => ({
      ok: true as const,
      veredicto: { nivel: "peligro" as const, resumen: "Un ejecutable disfrazado de PDF", porArchivo: { 2: { nivel: "peligro" as const, motivo: "doble extensión" } } },
      modelo: "modelo-gratis",
    })),
  };
}

afterEach(() => cleanup());

describe("VentanaEnvio", () => {
  it("la cabecera dice quién lo manda, cómo se verificó, por dónde llega, cuánto es y su mensaje", () => {
    const [envio] = agruparEnvios(archivos);
    render(<VentanaEnvio envio={envio} acciones={acciones()} />);
    expect(screen.getByText("Envío de MaggaBook (red local · app nativa)")).toBeTruthy();
    expect(screen.getByText(/4 archivos · 8 KB · 4 por decidir/)).toBeTruthy();
    expect(screen.getByText("Firmado por su identidad de malla")).toBeTruthy();
    expect(screen.getByText("Red local (app nativa) · enlace directo WebRTC")).toBeTruthy();
    expect(screen.getByText("Las fotos y el contrato")).toBeTruthy();
    // Carpetas de las rutas relativas y vistas previas seguras.
    expect(screen.getByRole("region", { name: "Carpeta viaje" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Carpeta viaje/fotos" })).toBeTruthy();
    expect(screen.getByAltText("Miniatura de a.png").getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    // La inspección local se ve sin pedir nada: la doble extensión es «peligro».
    expect(screen.getByText(/Inspección local: peligro/)).toBeTruthy();
    expect(screen.getAllByText(/Doble extensión: parece \.pdf pero es \.exe/).length).toBeGreaterThan(0);
  });

  it("preselecciona todo menos lo marcado como peligro; «Aceptar seleccionados» y «Rechazar todos» mandan los ids", () => {
    const [envio] = agruparEnvios(archivos);
    const ac = acciones();
    render(<VentanaEnvio envio={envio} acciones={ac} />);
    expect((screen.getByLabelText("Seleccionar factura.pdf.exe") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Seleccionar contrato.pdf") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Seleccionar nota.txt"));
    fireEvent.click(screen.getByRole("button", { name: /Aceptar seleccionados \(2\)/ }));
    expect(ac.aceptar).toHaveBeenCalledWith(expect.arrayContaining(["a", "b"]));
    expect(ac.aceptar.mock.calls[0][0]).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Rechazar todos/ }));
    expect(ac.rechazar).toHaveBeenCalledWith(["a", "b", "c", "d"]);
  });

  it("«Aceptar todos» pide confirmar si hay algo marcado como peligro (nunca va solo)", () => {
    const [envio] = agruparEnvios(archivos);
    const ac = acciones();
    render(<VentanaEnvio envio={envio} acciones={ac} />);
    fireEvent.click(screen.getByRole("button", { name: "Aceptar todos" }));
    expect(ac.aceptar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar: aceptar también 1 con peligro/ }));
    expect(ac.aceptar).toHaveBeenCalledWith(["a", "b", "c", "d"]);
  });

  it("la casilla de una carpeta marca y desmarca sus archivos; «Seleccionar todo» también", () => {
    const [envio] = agruparEnvios(archivos);
    render(<VentanaEnvio envio={envio} acciones={acciones()} />);
    const png = screen.getByLabelText("Seleccionar a.png") as HTMLInputElement;
    fireEvent.click(screen.getByLabelText("Seleccionar la carpeta viaje"));
    expect(png.checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Seleccionar la carpeta viaje"));
    expect(png.checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/Seleccionar todo/));
    expect((screen.getByLabelText("Seleccionar factura.pdf.exe") as HTMLInputElement).checked).toBe(true);
  });

  it("cambia entre lista y cuadrícula (la cuadrícula enseña el texto de la vista previa)", () => {
    const [envio] = agruparEnvios(archivos);
    render(<VentanaEnvio envio={envio} acciones={acciones()} />);
    expect(screen.queryByText("Hola desde la Mac")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver en cuadrícula" }));
    expect(screen.getByRole("button", { name: "Ver en cuadrícula" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Hola desde la Mac")).toBeTruthy();
  });

  it("«Inspeccionar con IA» manda solo metadatos (sin fragmentos salvo permiso) y enseña el veredicto, sin aceptar nada", async () => {
    const [envio] = agruparEnvios(archivos);
    const ac = acciones();
    render(<VentanaEnvio envio={envio} acciones={ac} />);
    fireEvent.click(screen.getByRole("button", { name: /Inspeccionar con IA/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Preguntar a la IA/ }));
    });
    const peticion = ac.inspeccionarIA.mock.calls[0][0];
    expect(peticion.origen).toBe("MaggaBook (red local · app nativa)");
    expect(peticion.archivos.map((a: { nombre: string }) => a.nombre)).toEqual(["a.png", "contrato.pdf", "factura.pdf.exe", "nota.txt"]);
    expect(peticion.archivos.some((a: { fragmento?: string }) => a.fragmento)).toBe(false);
    expect(await screen.findByText(/Un ejecutable disfrazado de PDF/)).toBeTruthy();
    expect(screen.getByText(/IA: peligro — doble extensión/)).toBeTruthy();
    expect(ac.aceptar).not.toHaveBeenCalled();

    // Con permiso, el fragmento de texto de la vista previa va también.
    fireEvent.click(screen.getByLabelText(/Incluir los primeros 500 caracteres/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Volver a inspeccionar/ }));
    });
    const conPermiso = ac.inspeccionarIA.mock.calls[1][0];
    expect(conPermiso.archivos.find((a: { nombre: string }) => a.nombre === "nota.txt").fragmento).toBe("Hola desde la Mac");
  });

  it("tras aceptar, el progreso de cada archivo sigue en la misma ventana", () => {
    const [envio] = agruparEnvios([
      e({ id: "a", nombre: "a.png", fase: "transfiriendo", trozos: 4, progreso: 1 }),
      e({ id: "b", nombre: "b.png", fase: "completada", trozos: 4, progreso: 4 }),
      e({ id: "c", nombre: "c.png", fase: "error", motivo: "Falló en este aparato (receptor): no llegaron todos los trozos." }),
    ]);
    render(<VentanaEnvio envio={envio} acciones={acciones()} />);
    expect(screen.getByRole("progressbar", { name: "Progreso de a.png" }).getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText("Verificado (SHA-256)")).toBeTruthy();
    expect(screen.getByText(/no llegaron todos los trozos/)).toBeTruthy();
    expect(screen.getByText(/Recibiendo 1… · 1 verificado · 1 con error/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Aceptar todos/ })).toBeNull();
  });
});

describe("EnviosEntrantes (montaje global)", () => {
  it("abre UNA ventana para el envío más antiguo por decidir; el otro espera en una pastilla", () => {
    const motor = { aceptarOferta: vi.fn(), rechazarOferta: vi.fn(), cancelar: vi.fn(), blobRecibido: vi.fn(() => undefined) } as unknown as MotorArchivos;
    const transferencias = [
      e({ id: "x1", nombre: "x1.txt", lote: "L_viejo", inicioMs: 1_000 }),
      e({ id: "x2", nombre: "x2.txt", lote: "L_viejo", inicioMs: 1_100 }),
      e({ id: "y1", nombre: "y1.txt", lote: "L_nuevo", origen: "Maggaboard", inicioMs: 5_000 }),
    ];
    render(<EnviosEntrantes motor={motor} transferencias={transferencias} />);
    const ventana = screen.getByTestId("ventana-envio");
    expect(within(ventana).getAllByTestId("archivo-envio")).toHaveLength(2);
    // La pastilla del otro envío está detrás del diálogo modal (fuera del árbol accesible mientras está abierto).
    expect(screen.getByRole("button", { name: /Envío de Maggaboard/, hidden: true })).toBeTruthy();
    fireEvent.click(within(ventana).getByRole("button", { name: "Aceptar todos" }));
    expect(motor.aceptarOferta).toHaveBeenCalledTimes(2);
  });
});
