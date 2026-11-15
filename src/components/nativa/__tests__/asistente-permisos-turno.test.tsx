/**
 * PER1115A — la lista de permisos espera su turno: no se pinta mientras haya un diálogo (acceso, «Esta neurona») en el
 * primer plano, y cuando se pinta se marca para que los demás esperen. Orden en asistente-permisos.tsx.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AsistentePermisos } from "../asistente-permisos";
import { primerPlanoOcupado } from "@/lib/ui/fullscreen-modal";

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { __TAURI__: unknown }).__TAURI__ = {
    core: { invoke: async (c: string) => { if (c === "permisos_inicio_estado") return { plataforma: "android" }; throw new Error("no"); } },
  };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  delete document.body.dataset.ssModal;
});

const esperar = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("AsistentePermisos: turno de primer arranque (PER1115A)", () => {
  it("con un diálogo Radix abierto no se pinta; al cerrarse sale, y ocupa el primer plano", async () => {
    document.body.dataset.ssModal = "1";
    render(<AsistentePermisos />);
    await esperar(2500);
    expect(screen.queryByTestId("asistente-permisos")).toBeNull();
    delete document.body.dataset.ssModal;
    await esperar(2500);
    expect(screen.getByTestId("asistente-permisos")).toBeTruthy();
    expect(primerPlanoOcupado()).toBe(true); // las demás ventanas de primer arranque esperan a que termine
  }, 15000);
});
