// @vitest-environment jsdom
/** ServidorNeurona + EstadoServidorLocal — lo que se ve en la tarjeta del servidor y en la app nativa. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/malla/sincronizacion-neuronas-motor", () => ({
  vinculosDeNeuronas: () => [],
  useVinculosNeuronas: () => [{ neurona: "n1", nombre: "Mac de Alex" }],
}));
const consultar = vi.fn();
const actualizar = vi.fn();
vi.mock("@/lib/nativa/estado-servidor-local", async (orig) => ({
  ...(await orig<typeof import("@/lib/nativa/estado-servidor-local")>()),
  consultarEstadoServidor: () => consultar(),
  pedirActualizarServidor: () => actualizar(),
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
    expect(p.textContent).toBe("servidor local · listo en 127.0.0.1:47610 · capa del instalador");
    expect(p.getAttribute("data-tono")).toBe("ok");
    expect(screen.queryByTestId("estado-servidor-local-actualizar")).toBeNull();
  });
  test("(CAP1107A) dice qué capa sirve y, con una nueva lista, ofrece «Actualizar ahora»", async () => {
    consultar.mockResolvedValue({
      fase: "local",
      puerto: 47610,
      capa: "AA0YdaG0s8hV9CgdmX1rc",
      capa_nueva: "BB1zzzzzzzzzzzzzzzzzz",
      capa_nueva_version: "0.3.1 · abc1234",
    });
    actualizar.mockResolvedValue({ ok: true, mensaje: "Reiniciando el servidor local con la capa nueva: la página se recargará sola." });
    render(<EstadoServidorLocal />);
    const p = await screen.findByRole("status");
    expect(p.textContent).toBe("servidor local · listo en 127.0.0.1:47610 · capa AA0YdaG0");
    expect(p.getAttribute("aria-label")).toContain("Sirve la capa AA0YdaG0s8hV9CgdmX1rc");
    const b = screen.getByTestId("estado-servidor-local-actualizar");
    expect(b.textContent).toBe("capa nueva lista · 0.3.1 · abc1234 · Actualizar ahora");
    fireEvent.click(b);
    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(b.textContent).toBe("actualizando…"));
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });
  test("(CAP1107A) si no se pudo actualizar, lo dice y deja reintentar", async () => {
    consultar.mockResolvedValue({ fase: "local", puerto: 47610, capa_nueva: "BB1" });
    actualizar.mockResolvedValue({ ok: false, mensaje: "No hay ninguna capa nueva lista." });
    render(<EstadoServidorLocal />);
    const b = await screen.findByTestId("estado-servidor-local-actualizar");
    fireEvent.click(b);
    await waitFor(() => expect(screen.getByRole("status").getAttribute("aria-label")).toContain("No hay ninguna capa nueva lista."));
    expect((b as HTMLButtonElement).disabled).toBe(false);
  });
});
