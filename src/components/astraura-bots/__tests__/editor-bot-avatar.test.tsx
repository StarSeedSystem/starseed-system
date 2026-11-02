// @vitest-environment jsdom
/**
 * El editor de «Mis bots» (BOT1011I1) con su Avatar 3D (AV1011K): la sección de
 * avatar solo vive en un cuerpo 3D, elegir una plantilla deja la referencia en el
 * cuerpo al guardar, y un bot que ya tenía ADN lo muestra.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorBot } from "../editor-bot";
import { adnActualDeDueno } from "@/lib/avatares/adaptadores/almacen-adn";
import type { Bot } from "@/lib/astraura-bots/tipos";
import type { NivelBot } from "@/lib/astraura-bots/permisos";

vi.mock("@/components/avatares/avatar-vivo", () => ({
  AvatarVivo: (p: { adn?: { nombre: string } }) => <div data-testid="avatar-vivo">{p.adn?.nombre}</div>,
}));
/** La Button de shadcn pide el AppearanceProvider que no hay en jsdom: como en selector-avatar-3d.test.tsx. */
vi.mock("@/components/ui/button", () => ({
  Button: (p: { onClick?: () => void; disabled?: boolean; children?: React.ReactNode; variant?: string; size?: string; className?: string }) => (
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

const botBase = (extra: Partial<Bot> = {}): Bot => ({
  id: "bot:1",
  nombre: "Astraura",
  dueno: { tipo: "perfil", id: "p1", cuentaId: "c1" },
  origen: "astraura",
  gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 },
  sentidosHabilitados: [],
  activo: true,
  ...extra,
});

const montar = (bot: Bot, onGuardar = vi.fn()) => {
  render(<EditorBot bot={bot} nivel={"aplicar-bajo" as NivelBot} onGuardar={onGuardar} onCerrar={vi.fn()} />);
  return onGuardar;
};

describe("EditorBot · Avatar 3D", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("un bot de orbe no ofrece la sección de avatar", () => {
    montar(botBase());
    expect(screen.queryByRole("button", { name: "Ver opciones" })).toBeNull();
  });

  it("con cuerpo 3D ofrece el selector, y elegir una plantilla guarda la principal en el cuerpo", async () => {
    const onGuardar = montar(botBase({ cuerpo: { forma: "orbe", tono: 200, escala: 1 } }));
    fireEvent.change(screen.getAllByRole("combobox")[0] as HTMLSelectElement, {
      target: { value: "avatar-3d" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver opciones" }));
    fireEvent.click(screen.getByLabelText("Elegir Avatar Arla"));
    await waitFor(() => expect(screen.getByText("Avatar Arla")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onGuardar).toHaveBeenCalled();
    const guardado = onGuardar.mock.calls[0][0] as Bot;
    expect(guardado.cuerpo.avatarRef?.startsWith("biblioteca:")).toBe(true);
    expect(adnActualDeDueno({ tipo: "bot", id: "bot:1" })).not.toBeNull();
  });

  it("la orbe no lleva avatarRef al guardar", () => {
    const onGuardar = montar(botBase());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const guardado = onGuardar.mock.calls[0][0] as Bot;
    expect(guardado.cuerpo.forma).toBe("orbe");
    expect(guardado.cuerpo.avatarRef).toBeUndefined();
  });
});
