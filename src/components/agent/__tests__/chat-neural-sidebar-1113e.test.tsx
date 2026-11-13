/**
 * GEN1113E · barra de Chats de `/agent`: «Llevar a Genesis…», la carpeta «Genesis» y los chats que
 * ya no están en Chats (contrato `architecture/astraura-chats-genesis.md` §2.4 y §3.2).
 *
 * Regla que se prueba: llevar un chat a Genesis CREA UN VÍNCULO y no borra nada.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrefsChatsGenesis, VinculoChat } from "@/lib/chats-genesis/tipos";

const sim = vi.hoisted(() => ({
  convs: [] as Array<Record<string, unknown>>,
  remove: vi.fn(),
  prefs: { v: 1, vinculos: [], conexiones: {} } as PrefsChatsGenesis,
  guardar: vi.fn(async (_p: unknown) => undefined),
  marcar: vi.fn(async (_id: string, _g: unknown) => undefined),
  acceso: null as null | { miembro: boolean; dueno: boolean },
  entidades: [] as unknown[],
}));

vi.mock("@/lib/aurora/conversations", () => ({
  useAiConversations: () => ({
    conversations: sim.convs,
    activeId: null,
    setActive: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    remove: sim.remove,
  }),
  pinnedThenRecent: () => 0,
}));
vi.mock("@/lib/aurora/chat-folders-store", () => ({ useChatFolders: () => ({ folders: [] }) }));
vi.mock("@/components/aurora/chat-folders", () => ({ ChatFolders: () => null }));
vi.mock("@/lib/aurora/chat-grouping", () => ({ groupConversationsByPersonality: () => [] }));
vi.mock("@/components/aurora/chat-context-menu", () => ({ useChatContextMenu: () => ({ bind: () => ({}), menu: null }) }));
vi.mock("@/components/externos/panel-externos", () => ({ PanelExternos: () => null }));
vi.mock("@/components/externos/puentes-chat", () => ({ PuentesChat: () => null }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/chats-genesis/vinculos", async (original) => ({
  ...(await original<typeof import("@/lib/chats-genesis/vinculos")>()),
  leerPrefsChatsGenesis: async () => sim.prefs,
  guardarPrefsChatsGenesis: (p: unknown) => sim.guardar(p),
  marcarConversacionGenesis: (id: string, g: unknown) => sim.marcar(id, g),
}));
vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => sim.acceso }));
vi.mock("@/lib/genesis/entidades", () => ({ misEntidades: async () => ({ ok: true, lista: sim.entidades }) }));

import { ChatNeuralSidebar, estaEnChats, enCarpetaGenesis } from "../chat-neural-sidebar";

function conv(id: string, title: string, meta: unknown = null) {
  return { id, title, kind: "astraura", surface: "agent", folder: null, meta, updatedAt: Date.parse("2026-11-12T10:00:00Z") };
}
function vinculo(p: Partial<VinculoChat> & Pick<VinculoChat, "id" | "fuente" | "en">): VinculoChat {
  return { v: 1, nivel: "metagenesis", creado: "2026-11-12T00:00:00Z", actualizado: "2026-11-12T00:00:00Z", ...p } as VinculoChat;
}

beforeEach(() => {
  sim.convs = [conv("c1", "Plan de la Sangha"), conv("c2", "Ideas sueltas")];
  sim.remove.mockClear();
  sim.prefs = { v: 1, vinculos: [], conexiones: {} };
  sim.guardar.mockReset();
  sim.guardar.mockImplementation(async () => undefined);
  sim.marcar.mockClear();
  sim.acceso = null;
  sim.entidades = [];
});
afterEach(cleanup);

describe("GEN1113E · «Llevar a Genesis…» desde la barra de Chats", () => {
  it("crea el vínculo en las dos bandejas, marca el chat y no borra nada", async () => {
    render(<ChatNeuralSidebar variant="panel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Llevar «Plan de la Sangha» a Genesis" }));
    expect(screen.getByText("El chat sigue aquí y aparece también en la pestaña Genesis.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Llevar a Genesis" }));
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    const p = sim.guardar.mock.calls[0][0] as PrefsChatsGenesis;
    expect(p.vinculos).toEqual([
      expect.objectContaining({ id: "astraura:c1", fuente: { tipo: "astraura", convId: "c1" }, nivel: "genesis", en: ["chats", "genesis"], titulo: "Plan de la Sangha" }),
    ]);
    await waitFor(() => expect(sim.marcar).toHaveBeenCalledWith("c1", { nivel: "genesis", entidad: null, en: ["chats", "genesis"] }));
    expect(sim.remove).not.toHaveBeenCalled();
    // Sigue en Chats.
    expect(screen.getByText("Plan de la Sangha")).toBeInTheDocument();
  });

  it("«Quitar de Chats» (trasladar) lo esconde de la barra, sin borrarlo", async () => {
    render(<ChatNeuralSidebar variant="panel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Llevar «Ideas sueltas» a Genesis" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Quitar de Chats/ }));
    fireEvent.click(screen.getByRole("button", { name: "Llevar a Genesis" }));
    await waitFor(() => expect(screen.queryByText("Ideas sueltas")).toBeNull());
    expect((sim.guardar.mock.calls[0][0] as PrefsChatsGenesis).vinculos[0].en).toEqual(["genesis"]);
    expect(sim.remove).not.toHaveBeenCalled();
    expect(screen.getByText("Plan de la Sangha")).toBeInTheDocument();
  });

  it("si la cuenta no guarda el vínculo, lo dice y no toca el chat", async () => {
    sim.guardar.mockRejectedValueOnce(new Error("sin red"));
    render(<ChatNeuralSidebar variant="panel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Llevar «Plan de la Sangha» a Genesis" }));
    fireEvent.click(screen.getByRole("button", { name: "Llevar a Genesis" }));
    expect(await screen.findByText("No se pudo guardar el vínculo; el chat sigue como estaba.")).toBeInTheDocument();
    expect(sim.marcar).not.toHaveBeenCalled();
    expect(sim.remove).not.toHaveBeenCalled();
  });

  it("MetaGenesis solo se ofrece a quien tiene acceso; PoliGenesis pide la entidad", async () => {
    render(<ChatNeuralSidebar variant="panel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Llevar «Plan de la Sangha» a Genesis" }));
    expect(screen.queryByRole("button", { name: "MetaGenesis" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PoliGenesis" }));
    expect(await screen.findByText("No colaboras (rango 2 o más) en ningún grupo ni página.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Llevar a Genesis" })).toBeDisabled();
    cleanup();

    sim.acceso = { miembro: true, dueno: true };
    sim.entidades = [{ tipo: "grupo", id: "g1", slug: "g1", nombre: "Sangha Norte", rol: "owner", rango: 4, dueña: true }];
    render(<ChatNeuralSidebar variant="panel" />);
    fireEvent.click(await screen.findByRole("button", { name: "Llevar «Plan de la Sangha» a Genesis" }));
    expect(await screen.findByRole("button", { name: "MetaGenesis" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PoliGenesis" }));
    expect(await screen.findByRole("combobox", { name: "Grupo o página" })).toHaveValue("g1");
    fireEvent.click(screen.getByRole("button", { name: "Llevar a Genesis" }));
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    expect((sim.guardar.mock.calls[0][0] as PrefsChatsGenesis).vinculos[0]).toMatchObject({ nivel: "poligenesis", entidad: "g1" });
  });
});

describe("GEN1113E · qué se ve en la barra", () => {
  it("un chat con vínculo sin «chats» (en preferencias o en su meta) no sale; los demás sí", async () => {
    sim.convs = [conv("c1", "Visible"), conv("c2", "Solo Genesis por meta", { genesis: { nivel: "genesis", en: ["genesis"] } }), conv("c3", "Solo Genesis por vínculo")];
    sim.prefs = { v: 1, vinculos: [vinculo({ id: "astraura:c3", fuente: { tipo: "astraura", convId: "c3" }, en: ["genesis"], nivel: "genesis" })], conexiones: {} };
    render(<ChatNeuralSidebar variant="panel" />);
    await waitFor(() => expect(screen.queryByText("Solo Genesis por vínculo")).toBeNull());
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Solo Genesis por meta")).toBeNull();
  });

  it("si todos están solo en Genesis, lo dice en vez de «aún no hay conversaciones»", async () => {
    sim.convs = [conv("c2", "Oculto", { genesis: { nivel: "genesis", en: ["genesis"] } })];
    render(<ChatNeuralSidebar variant="panel" />);
    expect(await screen.findByText(/Tus chats están solo en Genesis/)).toBeInTheDocument();
  });

  it("la dirección y los puentes añadidos a Chats salen en la carpeta «Genesis» y abren la pestaña Genesis", async () => {
    sim.prefs = {
      v: 1,
      vinculos: [
        vinculo({ id: "direccion", fuente: { tipo: "direccion" }, en: ["chats", "genesis"] }),
        vinculo({ id: "puente:peticiones", fuente: { tipo: "puente", puente: "peticiones" }, en: ["genesis"] }),
      ],
      conexiones: {},
    };
    render(<ChatNeuralSidebar variant="panel" />);
    const enlace = await screen.findByRole("link", { name: /Dirección de MetaGenesis/ });
    expect(enlace).toHaveAttribute("href", "/agent?tab=chats-genesis");
    expect(screen.queryByText("Peticiones y encargos")).toBeNull();
  });

  it("estaEnChats y enCarpetaGenesis (puras)", () => {
    expect(estaEnChats({ id: "x", meta: null }, [])).toBe(true);
    expect(estaEnChats({ id: "x", meta: { genesis: { en: ["chats", "genesis"] } } }, [])).toBe(true);
    expect(estaEnChats({ id: "x", meta: { genesis: { en: ["genesis"] } } }, [])).toBe(false);
    // El vínculo de las preferencias manda sobre la marca del chat.
    const v = vinculo({ id: "astraura:x", fuente: { tipo: "astraura", convId: "x" }, en: ["chats", "genesis"] });
    expect(estaEnChats({ id: "x", meta: { genesis: { en: ["genesis"] } } }, [v])).toBe(true);
    expect(enCarpetaGenesis([v])).toEqual([]);
  });
});
