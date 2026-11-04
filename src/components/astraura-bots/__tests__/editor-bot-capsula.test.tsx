// @vitest-environment jsdom
/**
 * EditorBot con cápsulas de memoria (MVD1027H-d3): la sección de "Memoria en cápsula"
 * se muestra para cada bot con su sujeto { tipo: "bot", id }.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EditorBot } from "../editor-bot";
import type { Bot } from "@/lib/astraura-bots/tipos";
import type { NivelBot } from "@/lib/astraura-bots/permisos";

vi.mock("@/components/ui/button", () => ({
  Button: (p: { onClick?: () => void; disabled?: boolean; children?: React.ReactNode; variant?: string; size?: string; className?: string }) => (
    <button type="button" disabled={p.disabled} onClick={p.onClick}>{p.children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: (p: { children?: React.ReactNode; className?: string }) => <div className={p.className}>{p.children}</div>,
  CardContent: (p: { children?: React.ReactNode; className?: string }) => <div className={p.className}>{p.children}</div>,
  CardHeader: (p: { children?: React.ReactNode; className?: string }) => <div className={p.className}>{p.children}</div>,
  CardTitle: (p: { children?: React.ReactNode; className?: string }) => <div className={p.className}>{p.children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: (p: { children?: React.ReactNode; variant?: string; className?: string }) => <span className={p.className}>{p.children}</span>,
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: (p: { checked?: boolean; onCheckedChange?: (v: boolean) => void }) => (
    <input type="checkbox" checked={p.checked} onChange={(e) => p.onCheckedChange?.(e.target.checked)} />
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: (p: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }) => (
    <select value={p.value} onChange={(e) => p.onValueChange?.(e.target.value)}>{p.children}</select>
  ),
  SelectTrigger: (p: { children?: React.ReactNode; className?: string }) => <div className={p.className}>{p.children}</div>,
  SelectContent: (p: { children?: React.ReactNode }) => <div>{p.children}</div>,
  SelectItem: (p: { value: string; children?: React.ReactNode; className?: string }) => (
    <option value={p.value} className={p.className}>{p.children}</option>
  ),
  SelectValue: () => <span />,
}));
vi.mock("@/components/memorias/capsula-ajustes", () => ({
  CapsulaAjustes: (p: { sujeto: { tipo: string; id: string } }) => (
    <div data-testid="capsula-ajustes" data-tipo={p.sujeto.tipo} data-id={p.sujeto.id}>
      Memoria en cápsula para {p.sujeto.tipo}:{p.sujeto.id}
    </div>
  ),
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

const montar = (bot: Bot) => {
  render(<EditorBot bot={bot} nivel={"aplicar-bajo" as NivelBot} onGuardar={vi.fn()} onCerrar={vi.fn()} />);
};

describe("EditorBot · Cápsula de memoria", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("muestra la sección de Memoria en cápsula con el sujeto correcto (tipo: bot)", () => {
    montar(botBase());
    const capsula = screen.getByTestId("capsula-ajustes");
    expect(capsula).not.toBeNull();
    expect(capsula.getAttribute("data-tipo")).toBe("bot");
    expect(capsula.getAttribute("data-id")).toBe("bot:1");
  });

  it("usa el id del bot pasado como prop", () => {
    const botConOtroId = botBase({ id: "bot:otro-id" });
    montar(botConOtroId);
    const capsula = screen.getByTestId("capsula-ajustes");
    expect(capsula.getAttribute("data-id")).toBe("bot:otro-id");
  });
});