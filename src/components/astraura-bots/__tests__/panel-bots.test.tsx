/**
 * Pruebas del panel «Mis bots» y su editor (BOT1011I1) en jsdom.
 * El almacén es localStorage (SSR-safe); la orbe en miniatura se tolera sin canvas.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PanelBots } from "../panel-bots";

const PROPS = { perfilId: "perfil-1", cuentaId: "cuenta-1" };
const CLAVE = "starseed.astraura.bots.v1";

function leerGuardados(): { bots: { id: string; nombre: string; personalidad: Record<string, number>; activo: boolean }[] } {
  return JSON.parse(window.localStorage.getItem(CLAVE) ?? "{}");
}

describe("PanelBots", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("lista el bot predeterminado del perfil", () => {
    render(<PanelBots {...PROPS} />);
    expect(screen.getByText("Astraura")).toBeTruthy();
    expect(screen.getByText(/Astraura local · activo/)).toBeTruthy();
  });

  it("«Nuevo bot» añade otro bot con la plantilla del predeterminado", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo bot/ }));
    expect(screen.getByText("Bot 2")).toBeTruthy();
    expect(leerGuardados().bots).toHaveLength(2);
  });

  it("el predeterminado no tiene botón «Borrar»", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo bot/ }));
    expect(screen.queryByLabelText("Borrar Astraura")).toBeNull();
    expect(screen.getByLabelText("Borrar Bot 2")).toBeTruthy();
  });

  it("borrar pide confirmación antes de quitar el bot", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo bot/ }));
    fireEvent.click(screen.getByLabelText("Borrar Bot 2"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(screen.queryByText("Bot 2")).toBeNull();
    expect(leerGuardados().bots).toHaveLength(1);
  });

  it("guardar en el editor persiste los rasgos", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Editar Astraura"));
    fireEvent.change(screen.getByLabelText("rasgo calidez"), { target: { value: "0.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(leerGuardados().bots[0].personalidad.calidez).toBe(0.9);
  });

  it("la forma vrm se anuncia como «próximamente»", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Editar Astraura"));
    fireEvent.change(screen.getByLabelText("Cuerpo"), { target: { value: "vrm" } });
    expect(screen.getByText("próximamente: llega con StarSeed XR")).toBeTruthy();
  });

  it("pausar cambia el estado del bot", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Pausar Astraura"));
    expect(screen.getByText(/Astraura local · en pausa/)).toBeTruthy();
    expect(leerGuardados().bots[0].activo).toBe(false);
  });
});
