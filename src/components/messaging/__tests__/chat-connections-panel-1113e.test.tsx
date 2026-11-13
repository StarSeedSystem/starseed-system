/**
 * GEN1113E · «Conexiones de chat» con la opción Telegram y los agentes de Genesis, PoliGenesis y
 * MetaGenesis (contrato `architecture/astraura-chats-genesis.md` §2.2, §3.3 y §6 comprobación 2).
 *
 * Arnés con el componente REAL (el panel, `ConexionTelegram`, `ConexionesGenesis` y
 * `TelegramSpacesPanel` sin cambios). Solo se simulan los bordes: Supabase, Realtime, las RPC de
 * acceso, las entidades y el adaptador de preferencias (las funciones puras de vínculos son las
 * reales de `@/lib/chats-genesis/vinculos`).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
import type { PrefsChatsGenesis } from "@/lib/chats-genesis/tipos";

const sim = vi.hoisted(() => ({
  uid: "cuenta-alex-0001" as string | null,
  filas: {} as Record<string, unknown[]>,
  acceso: null as null | { miembro: boolean; dueno: boolean },
  entidades: [] as unknown[],
  prefs: { v: 1, vinculos: [], conexiones: {} } as PrefsChatsGenesis,
  guardar: vi.fn(async (_p: unknown) => undefined),
  saveChannel: vi.fn(async (c: unknown) => c),
}));

function cadena(tabla: string) {
  const resultado = () => Promise.resolve({ data: sim.filas[tabla] ?? [], error: null });
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "ilike", "order", "limit", "in"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: null, error: null });
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resultado().then(ok, ko);
  return c;
}

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sim.uid ? { id: sim.uid } : null } }),
      getSession: async () => ({ data: { session: sim.uid ? { user: { id: sim.uid } } : null } }),
    },
    from: (t: string) => cadena(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/realtime/realtime", () => ({ useRealtime: () => undefined, onTableChange: () => () => undefined }));
vi.mock("@/lib/messaging/messaging-channels", async (original) => {
  const real = await original<typeof import("@/lib/messaging/messaging-channels")>();
  return {
    ...real,
    loadChannels: async () => real.defaultChannels(),
    getTelegramLink: async () => null,
    onChannelsChange: () => () => undefined,
    saveChannel: (c: unknown) => sim.saveChannel(c),
  };
});
vi.mock("@/lib/chats-genesis/vinculos", async (original) => ({
  ...(await original<typeof import("@/lib/chats-genesis/vinculos")>()),
  leerPrefsChatsGenesis: async () => sim.prefs,
  guardarPrefsChatsGenesis: (p: unknown) => sim.guardar(p),
  marcarConversacionGenesis: async () => undefined,
}));
vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => sim.acceso }));
vi.mock("@/lib/genesis/entidades", () => ({ misEntidades: async () => ({ ok: true, lista: sim.entidades }) }));

import { AppearanceProvider } from "@/context/appearance-context";
import { ChatConnectionsPanel } from "../chat-connections-panel";

const SIETE = [
  "StarSeed · Noticias",
  "Exocórtex & IA",
  "Constitución & Gobernanza",
  "Estudio & Audiomorphic",
  "Fundación & Sanghas",
  "StarSeed · Comunidad",
  "Café StarSeed",
];
/** El nombre viejo, armado por piezas para que la guardia de nombres no salte con esta prueba. */
const NOMBRE_VIEJO = new RegExp("(?<![\\p{L}])" + "Man" + "dos?(?![\\p{L}])", "u");

function clienteFalso(): ClienteChatsGenesis & { feed: ReturnType<typeof vi.fn> } {
  return {
    feed: vi.fn(async (f: { fuente: string }) => ({
      ok: true as const,
      registros: [{ id: "md-1763000000000-abcd", t: "2026-11-13T02:10:00.000Z", de: "director-protector", rol: "agente", tipo: "aviso", texto: "x", canal: "telegram", fuente: f.fuente }],
      cursor: 1,
      latido: { t: new Date().toISOString(), de: "mac" as const },
    })),
    enviar: vi.fn(),
    acuses: vi.fn(async () => ({})),
  } as unknown as ClienteChatsGenesis & { feed: ReturnType<typeof vi.fn> };
}

async function montar(props: Parameters<typeof ChatConnectionsPanel>[0] = {}) {
  // `Card` lee la apariencia del OS: en la app siempre hay proveedor.
  const r = render(<ChatConnectionsPanel {...props} />, { wrapper: AppearanceProvider });
  await screen.findByText("Agentes de Genesis");
  return r;
}

beforeEach(() => {
  sim.uid = "cuenta-alex-0001";
  sim.filas = {};
  sim.acceso = null;
  sim.entidades = [];
  sim.prefs = { v: 1, vinculos: [], conexiones: {} };
  sim.guardar.mockReset();
  sim.guardar.mockImplementation(async () => undefined);
  sim.saveChannel.mockClear();
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GEN1113E · opción Telegram dentro de Conexiones de chat", () => {
  it("con foco «telegram» (el enlace viejo ?tab=telegram) la opción está abierta con todo lo de la pestaña", async () => {
    await montar({ foco: "telegram" });
    const tarjeta = document.getElementById("conexion-telegram")!;
    expect(tarjeta).toHaveAttribute("data-abierta", "si");
    const t = within(tarjeta);
    expect(t.getByText("StarSeed Neurocortex · Telegram")).toBeInTheDocument();
    // GEN1113INT: el botón depende de la cuenta, que llega después (con la máquina cargada no da tiempo).
    expect(await t.findByRole("button", { name: /Conectar mi cuenta/ }, { timeout: 5000 })).toBeInTheDocument();
    // GEN1114F: el botón «Chatbot» pasa a decirse en español.
    expect(t.getByRole("button", { name: /Chat con el bot/ })).toBeInTheDocument();
    for (const n of SIETE) expect(t.getByText(n)).toBeInTheDocument();
    expect(t.getByText("Chats sincronizados desde Telegram")).toBeInTheDocument();
    expect(t.getByRole("button", { name: /Conectar Telegram/ })).toBeInTheDocument();
  });

  it("«Conectar Telegram» registra la intención en messaging_channels.external.config, como antes", async () => {
    await montar({ foco: "telegram" });
    fireEvent.click(screen.getByRole("button", { name: /Conectar Telegram/ }));
    await waitFor(() => expect(sim.saveChannel).toHaveBeenCalledTimes(1));
    const guardado = sim.saveChannel.mock.calls[0][0] as { scope: string; provider: string; config: Record<string, unknown> };
    expect(guardado.scope).toBe("external");
    expect(guardado.provider).toBe("telegram");
    expect(guardado.config.telegram_intent).toBe(true);
    expect(guardado.config.deep_link).toBe("https://t.me/starseed_nexus_bot?start=acc_cuenta-alex-0001");
    expect(window.open).toHaveBeenCalledWith("https://t.me/starseed_nexus_bot?start=acc_cuenta-alex-0001", "_blank", "noopener");
  });

  it("sin foco está plegada; se abre desde su cabecera y desde «Ver la opción Telegram» de Externo", async () => {
    await montar();
    const tarjeta = document.getElementById("conexion-telegram")!;
    expect(tarjeta).toHaveAttribute("data-abierta", "no");
    expect(screen.queryByText("StarSeed Neurocortex · Telegram")).toBeNull();
    // Externo con Telegram ya no repite el botón: lleva a la opción.
    expect(screen.queryByRole("button", { name: /Conectar Telegram/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver la opción Telegram/ }));
    expect(tarjeta).toHaveAttribute("data-abierta", "si");
    fireEvent.click(within(tarjeta).getByRole("button", { expanded: true }));
    expect(tarjeta).toHaveAttribute("data-abierta", "no");
  });

  it("cada chat llegado desde Telegram se puede mostrar también en Genesis (vínculo, no copia)", async () => {
    sim.filas.astraura_messages = [
      { chat_id: "chat-tg-1", content: "hola desde Telegram", created_at: "2026-11-12T10:00:00Z" },
      { chat_id: "chat-tg-1", content: "segundo", created_at: "2026-11-12T11:00:00Z" },
    ];
    await montar({ foco: "telegram" });
    const enGenesis = await screen.findByRole("switch", { name: "Mostrar en Genesis" });
    const enChats = screen.getByRole("switch", { name: "Mostrar en Chats" });
    expect(enChats).toBeChecked();
    expect(enChats).toBeDisabled(); // un chat no puede quedarse en ningún sitio
    fireEvent.click(enGenesis);
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    const p = sim.guardar.mock.calls[0][0] as PrefsChatsGenesis;
    expect(p.vinculos).toHaveLength(1);
    expect(p.vinculos[0]).toMatchObject({ id: "tg:chat-tg-1", en: ["chats", "genesis"], nivel: "genesis" });
    expect(sim.saveChannel).not.toHaveBeenCalled();
  });

  it("sin chats de Telegram lo dice", async () => {
    await montar({ foco: "telegram" });
    expect(await screen.findByText("Aún no hay chats que hayan llegado desde Telegram a tu cuenta.")).toBeInTheDocument();
  });
});

describe("GEN1113E · agentes de Genesis, PoliGenesis y MetaGenesis", () => {
  it("una cuenta sin acceso a MetaGenesis no ve su opción ni los puentes", async () => {
    sim.acceso = { miembro: false, dueno: false };
    await montar({ foco: "telegram", clienteChatsGenesis: clienteFalso() });
    expect(screen.queryByText("Agentes de MetaGenesis")).toBeNull();
    expect(screen.queryByText(/Puentes de Telegram de MetaGenesis/)).toBeNull();
  });

  it("sin sesión ni acceso comprobable tampoco aparece MetaGenesis", async () => {
    sim.uid = null;
    sim.acceso = null;
    await montar();
    expect(screen.queryByText("Agentes de MetaGenesis")).toBeNull();
  });

  it("un dueño ve la opción MetaGenesis con su rol y los tres puentes con su último aviso", async () => {
    sim.acceso = { miembro: true, dueno: true };
    const cliente = clienteFalso();
    await montar({ foco: "telegram", clienteChatsGenesis: cliente });
    expect(await screen.findByText("Agentes de MetaGenesis")).toBeInTheDocument();
    expect(screen.getByText("Dueño")).toBeInTheDocument();
    for (const n of ["Hermes y avisos", "Peticiones y encargos", "Avisos de los directores"]) expect(screen.getByText(n)).toBeInTheDocument();
    await waitFor(() => expect(cliente.feed).toHaveBeenCalledTimes(3));
    expect(cliente.feed.mock.calls.map((c) => (c[0] as { fuente: string }).fuente).sort()).toEqual([
      "puente:avisos-directores",
      "puente:hermes-avisos",
      "puente:peticiones",
    ]);
    expect((await screen.findAllByText(/Último aviso de director-protector .* · copia en vivo/)).length).toBe(3);
    expect(screen.getAllByRole("link", { name: /Abrir en Genesis/ }).length).toBeGreaterThanOrEqual(3);
  });

  it("un desarrollador no lee los puentes A y B (solo dueño) y sí el de avisos", async () => {
    sim.acceso = { miembro: true, dueno: false };
    const cliente = clienteFalso();
    await montar({ foco: "telegram", clienteChatsGenesis: cliente });
    expect(await screen.findByText("Desarrollador")).toBeInTheDocument();
    expect(screen.getAllByText("Solo para dueños de MetaGenesis.")).toHaveLength(2);
    await waitFor(() => expect(cliente.feed).toHaveBeenCalledTimes(1));
    expect((cliente.feed.mock.calls[0][0] as { fuente: string }).fuente).toBe("puente:avisos-directores");
  });

  it("la puerta del A1 caída se dice, no se inventa un estado", async () => {
    sim.acceso = { miembro: true, dueno: true };
    const cliente = clienteFalso();
    cliente.feed.mockResolvedValue({ ok: false, estado: 0, error: "sin red" });
    await montar({ foco: "telegram", clienteChatsGenesis: cliente });
    expect((await screen.findAllByText(/La puerta de datos del A1 no responde/)).length).toBe(3);
  });

  it("activar Agentes de Genesis se guarda en las preferencias de la cuenta, no en messaging_channels", async () => {
    await montar();
    fireEvent.click(screen.getByRole("switch", { name: "Activar Agentes de Genesis" }));
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    expect((sim.guardar.mock.calls[0][0] as PrefsChatsGenesis).conexiones.genesis).toEqual({ activo: true, memoria: true });
    expect(sim.saveChannel).not.toHaveBeenCalled();
  });

  it("si la cuenta no guarda, el interruptor vuelve a como estaba", async () => {
    sim.guardar.mockRejectedValueOnce(new Error("sin red"));
    await montar();
    fireEvent.click(screen.getByRole("switch", { name: "Activar Agentes de Genesis" }));
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Activar Agentes de Genesis" })).not.toBeChecked());
  });

  it("PoliGenesis solo con grupos o páginas de rango ≥ 2; si no, dice por qué", async () => {
    await montar();
    expect(await screen.findByText(/Agentes de PoliGenesis aparece cuando colaboras/)).toBeInTheDocument();
    cleanup();
    sim.entidades = [
      { tipo: "grupo", id: "g1", slug: "g1", nombre: "Sangha Norte", rol: "owner", rango: 4, dueña: true },
      { tipo: "pagina", id: "p1", slug: "p1", nombre: "Página baja", rol: "lector", rango: 1, dueña: false },
    ];
    sim.prefs = { v: 1, vinculos: [], conexiones: { poligenesis: { activo: true, entidades: [] } } };
    await montar();
    expect(await screen.findByText("Agentes de PoliGenesis")).toBeInTheDocument();
    expect(screen.getByText("Sangha Norte")).toBeInTheDocument();
    expect(screen.queryByText("Página baja")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(sim.guardar).toHaveBeenCalledTimes(1));
    expect((sim.guardar.mock.calls[0][0] as PrefsChatsGenesis).conexiones.poligenesis).toEqual({ activo: true, entidades: ["g1"] });
  });

  it("ningún texto visible usa el nombre viejo de Genesis", async () => {
    sim.acceso = { miembro: true, dueno: true };
    const { container } = await montar({ foco: "telegram", clienteChatsGenesis: clienteFalso() });
    await screen.findByText("Agentes de MetaGenesis");
    expect(container.textContent).not.toMatch(NOMBRE_VIEJO);
  });
});
