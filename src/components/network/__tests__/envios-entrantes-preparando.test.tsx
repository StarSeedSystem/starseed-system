// @vitest-environment jsdom
/**
 * ARC1110A — la ventana del envío enseña el archivo YA con el anuncio: «Preparando · por decidir» con el motivo
 * «<neurona> está preparando el archivo…», se puede aceptar de antemano, y tras aceptarlo dice «Aceptado · preparando».
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EstadoTransferencia } from "@/lib/network/archivos-malla";
import { agruparEnvios } from "@/lib/network/envios-entrantes";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VentanaEnvio as VentanaSuelta, type AccionesEnvio } from "@/components/network/envios-entrantes";

function Ventana(p: Parameters<typeof VentanaSuelta>[0]) {
  return (
    <Dialog open>
      <DialogContent>
        <VentanaSuelta {...p} />
      </DialogContent>
    </Dialog>
  );
}

const anuncio = (p: Partial<EstadoTransferencia> = {}): EstadoTransferencia => ({
  id: "t1",
  rol: "recibir",
  nombre: "video.mp4",
  tipo: "video/mp4",
  tamano: 48 * 1024 * 1024,
  trozos: 780,
  progreso: 0,
  fase: "pendiente-aceptar",
  preparando: true,
  motivo: "Maggaboard está preparando el archivo…",
  origen: "Maggaboard",
  inicioMs: 1,
  actualizadoMs: 1,
  ...p,
});

const acciones = (): AccionesEnvio => ({ aceptar: vi.fn(), rechazar: vi.fn(), cancelar: vi.fn(), blobDe: () => undefined, inspeccionarIA: vi.fn() as never });

afterEach(() => cleanup());

describe("anuncio en la ventana del envío", () => {
  it("enseña «Preparando · por decidir» y el motivo; se puede aceptar de antemano", () => {
    const [envio] = agruparEnvios([anuncio()]);
    const ac = acciones();
    render(<Ventana envio={envio} acciones={ac} />);
    expect(screen.getByText("Preparando · por decidir")).toBeTruthy();
    expect(screen.getByText("Maggaboard está preparando el archivo…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Aceptar seleccionados \(1\)/ }));
    expect(ac.aceptar).toHaveBeenCalledWith(["t1"]);
  });

  it("tras aceptarlo de antemano dice «Aceptado · preparando» y ya no está por decidir", () => {
    const [envio] = agruparEnvios([anuncio({ fase: "transfiriendo", preaceptada: true, motivo: "Aceptado: empezará en cuanto Maggaboard termine de preparar el archivo." })]);
    render(<Ventana envio={envio} acciones={acciones()} />);
    expect(screen.getByText("Aceptado · preparando")).toBeTruthy();
    expect(screen.getByText(/empezará en cuanto Maggaboard termine/)).toBeTruthy();
    expect(screen.queryByText("Preparando · por decidir")).toBeNull();
  });
});
