// @vitest-environment jsdom
/**
 * MPT1108B — la franja de cifrado y vías de un archivo: candado o aviso, reparto vivo, velocidad total y «Verificado (SHA-256)»;
 * y su lugar en la ventana de recepción (`envios-entrantes`) y en el panel de transferencias.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EstadoTransferencia } from "@/lib/network/archivos-malla";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

import { CifradoViasArchivo, textoVelocidad } from "@/components/network/cifrado-vias-archivo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VentanaEnvio as VentanaSuelta } from "@/components/network/envios-entrantes";
import { agruparEnvios } from "@/lib/network/envios-entrantes";

afterEach(() => cleanup());

describe("CifradoViasArchivo", () => {
  it("con cifrado de punta a punta: candado, reparto por vías, velocidad total y verificado", () => {
    render(<CifradoViasArchivo cifradoArchivo="archivo" repartoVias="Red local 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %" velocidadBps={1_258_291} verificado />);
    expect(screen.getByTestId("candado-archivo").textContent).toContain("Cifrado de archivo");
    expect(screen.getByTestId("reparto-vias").textContent).toContain("Red local 72 % · Wi‑Fi directo 20 % · Bluetooth 8 %");
    expect(screen.getByTestId("velocidad-total").textContent).toBe("1,2 MB/s");
    expect(screen.getByTestId("verificado-sha").textContent).toContain("Verificado (SHA-256)");
    expect(screen.queryByTestId("aviso-sin-cifrado")).toBeNull();
  });

  it("con un par antiguo: el aviso «Sin cifrado de archivo», nunca el candado", () => {
    render(<CifradoViasArchivo cifradoArchivo="sin-cifrado-de-archivo" />);
    expect(screen.getByTestId("aviso-sin-cifrado").textContent).toContain("Sin cifrado de archivo");
    expect(screen.queryByTestId("candado-archivo")).toBeNull();
    expect(screen.queryByTestId("reparto-vias")).toBeNull();
    expect(screen.queryByTestId("verificado-sha")).toBeNull();
  });

  it("sin datos no pinta nada (nada se inventa); la velocidad se escribe en B, KB y MB por segundo", () => {
    const { container } = render(<CifradoViasArchivo />);
    expect(container.firstChild).toBeNull();
    expect(textoVelocidad(undefined)).toBeNull();
    expect(textoVelocidad(0)).toBeNull();
    expect(textoVelocidad(800)).toBe("800 B/s");
    expect(textoVelocidad(340 * 1024)).toBe("340 KB/s");
    expect(textoVelocidad(3 * 1024 * 1024)).toBe("3,0 MB/s");
  });
});

function Ventana(p: Parameters<typeof VentanaSuelta>[0]) {
  return (
    <Dialog open>
      <DialogContent>
        <VentanaSuelta {...p} />
      </DialogContent>
    </Dialog>
  );
}

function e(p: Partial<EstadoTransferencia> & { id: string; nombre: string }): EstadoTransferencia {
  return {
    rol: "recibir",
    tipo: "application/octet-stream",
    tamano: 2048,
    trozos: 4,
    progreso: 1,
    fase: "transfiriendo",
    inicioMs: 1_000,
    actualizadoMs: 2_000,
    origen: "MaggaBook",
    lote: "lote_1",
    loteTotal: 2,
    via: "Red local (app nativa)",
    ...p,
  };
}

describe("ventana de recepción", () => {
  it("cada archivo enseña su candado o su aviso y el reparto vivo, y al acabar «Verificado (SHA-256)»", () => {
    const [envio] = agruparEnvios([
      e({ id: "a", nombre: "a.bin", cifradoArchivo: "archivo", repartoVias: "Red local 72 % · Bluetooth 28 %", velocidadBps: 600_000 }),
      e({ id: "b", nombre: "b.bin", cifradoArchivo: "sin-cifrado-de-archivo" }),
      e({ id: "c", nombre: "c.bin", fase: "completada", progreso: 4, cifradoArchivo: "archivo" }),
    ]);
    render(
      <Ventana
        envio={envio}
        acciones={{ aceptar: vi.fn(), rechazar: vi.fn(), cancelar: vi.fn(), blobDe: () => undefined, inspeccionarIA: vi.fn() } as never}
      />,
    );
    expect(screen.getAllByTestId("candado-archivo")).toHaveLength(2);
    expect(screen.getAllByTestId("aviso-sin-cifrado")).toHaveLength(1);
    expect(screen.getByTestId("reparto-vias").textContent).toContain("Red local 72 % · Bluetooth 28 %");
    expect(screen.getByTestId("velocidad-total").textContent).toBe("586 KB/s");
    expect(screen.getByText("Verificado (SHA-256)")).toBeTruthy();
  });
});
