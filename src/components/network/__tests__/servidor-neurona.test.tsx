// @vitest-environment jsdom
/** ServidorNeurona + EstadoServidorLocal — lo que se ve en la tarjeta del servidor y en la app nativa. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/malla/sincronizacion-neuronas-motor", () => ({
  vinculosDeNeuronas: () => [],
  useVinculosNeuronas: () => [{ neurona: "n1", nombre: "Mac de Alex" }],
}));
const consultar = vi.fn();
vi.mock("@/lib/nativa/estado-servidor-local", async (orig) => ({
  ...(await orig<typeof import("@/lib/nativa/estado-servidor-local")>()),
  consultarEstadoServidor: () => consultar(),
}));

import { ServidorNeurona } from "@/components/network/servidor-neurona";
import { EstadoServidorLocal } from "@/components/nativa/estado-servidor-local";
import { CLAVE_SERVIDOR_NEURONA } from "@/lib/malla/registro-servidor-neurona";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("ServidorNeurona", () => {
  test("sin asociar por defecto y se asocia a mano", () => {
    render(<ServidorNeurona servidor={{ id: "s1", name: "Mi VPS" }} />);
    expect(screen.getByText("sin neurona asociada")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Neurona vinculada de Mi VPS"), { target: { value: "n1" } });
    expect(screen.getByText("neurona vinculada: Mac de Alex")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(CLAVE_SERVIDOR_NEURONA)!)).toEqual({ v: 1, mapa: { s1: "n1" } });
  });
  test("lee lo guardado y se puede quitar", async () => {
    localStorage.setItem(CLAVE_SERVIDOR_NEURONA, JSON.stringify({ v: 1, mapa: { s1: "n1" } }));
    render(<ServidorNeurona servidor={{ id: "s1", name: "Mi VPS" }} />);
    await waitFor(() => expect(screen.getByText("neurona vinculada: Mac de Alex")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Neurona vinculada de Mi VPS"), { target: { value: "" } });
    expect(screen.getByText("sin neurona asociada")).toBeTruthy();
  });
});

describe("EstadoServidorLocal", () => {
  test("fuera de la app nativa no pinta nada", async () => {
    consultar.mockResolvedValue(null);
    const { container } = render(<EstadoServidorLocal />);
    await Promise.resolve();
    expect(container.innerHTML).toBe("");
  });
  test("en la app nativa pinta el estado como status accesible", async () => {
    consultar.mockResolvedValue({ fase: "local", puerto: 47610, origen: "http://127.0.0.1:47610" });
    render(<EstadoServidorLocal />);
    const p = await screen.findByRole("status");
    expect(p.textContent).toBe("servidor local · listo en 127.0.0.1:47610");
    expect(p.getAttribute("data-tono")).toBe("ok");
  });
});
