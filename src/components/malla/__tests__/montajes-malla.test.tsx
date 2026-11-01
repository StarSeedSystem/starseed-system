/**
 * Montajes de la malla de sílice en Señales (Ola 1012Q, contrato §6–§7):
 * con dos recibos falsos de entrega se pintan DOS filas, cada una con su
 * dato, hora, estado, medio y ruta. Jsdom, sin tocar el store vivo: los
 * recibos entran por la prop de inyección del panel.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import type { DeliveryReceipt } from "@/ai/astraura/mesh/delivery";

/** Recibo fijo de entrega del mesh, para no depender del reloj ni de la red. */
const reciboFalso = (
  id: string,
  resumen: string,
  status: "delivered" | "sent",
): DeliveryReceipt => ({
  id,
  scope: "private",
  cls: "P2",
  summary: resumen,
  hops: [
    {
      via: "server-relay",
      label: "Relé del servidor",
      role: "primary",
      status: status === "delivered" ? "confirmed" : "sent",
      detail: "prueba",
      at: 1759000000000,
    },
  ],
  status,
  startedAt: 1759000000000,
  endedAt: 1759000000000,
});

describe("DeliveryReceiptsPanel montado en Señales", () => {
  afterEach(() => {
    cleanup();
  });

  it("pinta una fila por cada recibo de entrega (dos recibos falsos → dos filas)", () => {
    render(
      <DeliveryReceiptsPanel
        recibos={[
          reciboFalso("dlv-uno", "Nota de prueba uno", "delivered"),
          reciboFalso("dlv-dos", "Nota de prueba dos", "sent"),
        ]}
      />,
    );
    expect(screen.getAllByTestId("fila-recibo")).toHaveLength(2);
    // Cada fila enseña su dato y su estado traducido al modelo único.
    expect(screen.getByText("Nota de prueba uno")).not.toBeNull();
    expect(screen.getByText("Recibido")).not.toBeNull();
    expect(screen.getByText("Nota de prueba dos")).not.toBeNull();
    expect(screen.getByText("Enviado")).not.toBeNull();
    // El medio de la ruta confirmada via publicada como pastilla.
    expect(screen.getAllByText("Servidor").length).toBeGreaterThanOrEqual(1);
  });

  it("declara su estado vacío cuando aún no hay ningún recibo", () => {
    render(<DeliveryReceiptsPanel recibos={[]} />);
    expect(screen.queryAllByTestId("fila-recibo")).toHaveLength(0);
    expect(screen.getByText(/aún no hay recibos/)).not.toBeNull();
  });
});
