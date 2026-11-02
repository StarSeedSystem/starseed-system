/**
 * Pruebas del panel «Mis bots» y su editor (BOT1011I1) en jsdom.
 * El almacén es localStorage (SSR-safe); la orbe en miniatura se tolera sin canvas.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PanelBots } from "../panel-bots";

vi.mock("@/components/avatares/cuerpo-3d-bot", () => ({
  Cuerpo3dBot: ({ bot }: { bot: { id: string } }) => <span data-testid="cuerpo-3d" data-bot={bot.id} />,
}));

/** El selector de avatar de la editora usa UI de shadcn, que pide el AppearanceProvider que no hay en jsdom. */
vi.mock("@/components/ui/button", () => ({
  Button: (p: { onClick?: () => void; disabled?: boolean; children?: React.ReactNode }) => (
    <button type="button" disabled={p.disabled} onClick={p.onClick}>{p.children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: (p: { children?: React.ReactNode }) => <span>{p.children}</span>,
}));
import * as React from "react";

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

  it("la forma vrm se elige y se explica dónde se ve: orbe+ADN en la web, XR más adelante", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Editar Astraura"));
    fireEvent.change(screen.getByLabelText("Cuerpo"), { target: { value: "vrm" } });
    expect(screen.getByText("en la web se ve su orbe con este ADN; el cuerpo dentro de XR llega con StarSeed XR")).toBeTruthy();
    expect(screen.getByText(/Elige la orbe o una plantilla CC0/)).toBeTruthy();
  });

  it("un bot con cuerpo vrm muestra su avatar 3D en la lista", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Editar Astraura"));
    fireEvent.change(screen.getByLabelText("Cuerpo"), { target: { value: "vrm" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByTestId("cuerpo-3d").getAttribute("data-bot")).toBe("astraura:perfil-1");
  });

  it("pausar cambia el estado del bot", () => {
    render(<PanelBots {...PROPS} />);
    fireEvent.click(screen.getByLabelText("Pausar Astraura"));
    expect(screen.getByText(/Astraura local · en pausa/)).toBeTruthy();
    expect(leerGuardados().bots[0].activo).toBe(false);
  });
});
