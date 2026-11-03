/**
 * Recibos de entrega de la malla en su pantalla (Ola 1012Q, contrato §6):
 * con dos recibos falsos inyectados se pintan DOS filas, cada una con su
 * dato, hora, estado, medio y ruta. Jsdom, sin tocar el store vivo.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import type { DeliveryReceipt } from "@/ai/astraura/mesh/delivery";

/** Recibo fijo de entrega del mesh: sin reloj real ni red. */
function reciboFalso(
  id: string,
  resumen: string,
  status: "delivered" | "sent",
): DeliveryReceipt {
  return {
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
  };
}

afterEach(() => {
  cleanup();
});

describe("DeliveryReceiptsPanel montado en Señales", () => {
  it("pinta una fila por recibo (dos recibos falsos → dos filas)", () => {
    render(
      <DeliveryReceiptsPanel
        recibos={[
          reciboFalso("dlv-uno", "Nota de prueba uno", "delivered"),
          reciboFalso("dlv-dos", "Nota de prueba dos", "sent"),
        ]}
      />,
    );
    expect(screen.getAllByTestId("fila-recibo")).toHaveLength(2);
    expect(screen.getByText("Nota de prueba uno")).not.toBeNull();
    expect(screen.getByText("Recibido")).not.toBeNull();
    expect(screen.getByText("Nota de prueba dos")).not.toBeNull();
    expect(screen.getByText("Enviado")).not.toBeNull();
    expect(screen.getAllByText("Servidor").length).toBeGreaterThanOrEqual(1);
  });

  it("declara el vacío honesto cuando aún no hay recibos", () => {
    render(<DeliveryReceiptsPanel recibos={[]} />);
    expect(screen.queryAllByTestId("fila-recibo")).toHaveLength(0);
    expect(screen.getByText(/aún no hay recibos/)).not.toBeNull();
  });
});
