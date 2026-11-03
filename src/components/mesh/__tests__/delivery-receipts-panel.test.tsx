/**
 * Prueba jsdom del panel de recibos de entrega (Ola 1012Q, contrato §6):
 * con dos recibos falsos se pintan DOS filas — dato, hora, estado, medio y
 * ruta — y sin recibos se declara el vacío honesto. El store vivo no se toca:
 * el barril `@/ai/astraura/mesh` se dobla exactamente igual que hace
 * `montajes-malla.test.tsx` en la pantalla de malla.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const estado = vi.hoisted(() => ({ recibos: [] as Array<Record<string, unknown>> }));

vi.mock("@/ai/astraura/mesh", () => ({
  useDeliveryReceipts: () => estado.recibos,
}));

import { DeliveryReceiptsPanel } from "../delivery-receipts-panel";

const reciboFalso = (id: string, resumen: string, status: "delivered" | "sent") => ({
  id,
  scope: "local-group",
  cls: "P1",
  summary: resumen,
  status,
  hops: [
    {
      via: status === "delivered" ? "server-relay" : "wifi-direct",
      label: status === "delivered" ? "Relé" : "LAN",
      role: "primary",
      status: status === "delivered" ? "confirmed" : "sent",
      detail: "recibo falso de prueba",
      through: "prueba",
      at: 1,
    },
  ],
  startedAt: 1,
  endedAt: 2,
});

afterEach(() => {
  cleanup();
  estado.recibos = [];
});

describe("panel de recibos de entrega", () => {
  it("con dos recibos falsos pinta dos filas con dato, hora, estado, medio y ruta", () => {
    estado.recibos = [
      reciboFalso("dlv-uno", "Nota de entrega uno", "delivered"),
      reciboFalso("dlv-dos", "Nota de entrega dos", "sent"),
    ];
    render(<DeliveryReceiptsPanel />);
    const filas = screen.getAllByTestId("fila-recibo");
    expect(filas).toHaveLength(2);
    // Primera fila: confirmada por el relé → recibido, por Servidor.
    const primera = within(filas[0]);
    expect(primera.getByText("Nota de entrega uno")).toBeInTheDocument();
    expect(primera.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(primera.getByText("Recibido")).toBeInTheDocument();
    expect(primera.getByText("Servidor")).toBeInTheDocument();
    expect(primera.getByText(/ruta: servidor/)).toBeInTheDocument();
    // Segunda fila: salió por la LAN → enviado, por Wi‑Fi.
    const segunda = within(filas[1]);
    expect(segunda.getByText("Nota de entrega dos")).toBeInTheDocument();
    expect(segunda.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(segunda.getByText("Enviado")).toBeInTheDocument();
    expect(segunda.getByText("Wi‑Fi")).toBeInTheDocument();
    expect(segunda.getByText(/ruta: wifi-lan/)).toBeInTheDocument();
  });

  it("sin ningún recibo declara su estado vacío", () => {
    render(<DeliveryReceiptsPanel />);
    expect(screen.queryByTestId("fila-recibo")).toBeNull();
    expect(screen.getByText(/aún no hay recibos/)).toBeInTheDocument();
  });
});
