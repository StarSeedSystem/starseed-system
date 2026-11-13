/**
 * GEN1114F · reparaciones de «Conexiones de chat» vistas en pantalla el 13-11 (1440×900 y 360×640):
 *  5. las tres tarjetas miden lo mismo y sus «Guardar» quedan en la misma línea;
 *  6. el agente de Mi Genesis cuenta la misma historia aquí y en la pestaña Genesis;
 *  7. ningún botón dice «Chatbot».
 * Mismo arnés que la prueba de GEN1113E: componentes reales, bordes simulados.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrefsChatsGenesis } from "@/lib/chats-genesis/tipos";

const sim = vi.hoisted(() => ({
  prefs: { v: 1, vinculos: [], conexiones: {} } as PrefsChatsGenesis,
  acceso: null as null | { miembro: boolean; dueno: boolean },
}));

function cadena() {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "ilike", "order", "limit", "in"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: null, error: null });
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
  return c;
}

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "cuenta-1" } } }),
      getSession: async () => ({ data: { session: null } }),
    },
    from: () => cadena(),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/realtime/realtime", () => ({ useRealtime: () => undefined, onTableChange: () => () => undefined }));
vi.mock("@/lib/messaging/messaging-channels", async (original) => {
  const real = await original<typeof import("@/lib/messaging/messaging-channels")>();
  return { ...real, loadChannels: async () => real.defaultChannels(), getTelegramLink: async () => null, onChannelsChange: () => () => undefined, saveChannel: async (c: unknown) => c };
});
vi.mock("@/lib/chats-genesis/vinculos", async (original) => ({
  ...(await original<typeof import("@/lib/chats-genesis/vinculos")>()),
  leerPrefsChatsGenesis: async () => sim.prefs,
  leerCopiaLocalChatsGenesis: () => sim.prefs,
  guardarPrefsChatsGenesis: async () => undefined,
}));
vi.mock("@/lib/metagenesis/accesos", () => ({ miAccesoMetaGenesis: async () => sim.acceso }));
vi.mock("@/lib/genesis/entidades", () => ({ misEntidades: async () => ({ ok: true, lista: [] }) }));

import { AppearanceProvider } from "@/context/appearance-context";
import { ChatConnectionsPanel } from "../chat-connections-panel";
import { ConexionesGenesis, estadoAgenteGenesis } from "../conexiones-genesis";
import { PestanaGenesis } from "@/components/chats-genesis/pestana-genesis";

beforeEach(() => {
  sim.prefs = { v: 1, vinculos: [], conexiones: {} };
  sim.acceso = null;
});
afterEach(() => cleanup());

describe("5 · las tres fuentes", () => {
  it("cada tarjeta es una columna de altura completa con «Guardar» al pie (misma línea en 1440)", async () => {
    render(<ChatConnectionsPanel />, { wrapper: AppearanceProvider });
    await screen.findByText("Agentes de Genesis");
    const rejilla = screen.getByTestId("fuentes-chat");
    expect(rejilla.className).toMatch(/lg:grid-cols-3/);
    expect(rejilla.className).toMatch(/lg:items-stretch/);
    const columnas = within(rejilla).getAllByTestId("columna-fuente");
    expect(columnas).toHaveLength(3);
    for (const c of columnas) {
      expect(c.className).toMatch(/\bh-full\b/);
      expect(c.className).toMatch(/\bflex-col\b/);
      const pie = within(c).getByTestId("pie-fuente");
      expect(c.lastElementChild).toBe(pie);
      expect(pie.className).toMatch(/\bmt-auto\b/);
      expect(within(pie).getByRole("button", { name: /Guardar/ })).toBeInTheDocument();
      // Lo de en medio crece; el pie no.
      expect(pie.previousElementSibling!.className).toMatch(/\bflex-1\b/);
    }
    // Cada interruptor dice qué activa.
    for (const n of ["Terminal (dispositivo)", "Servidor StarSeed", "Externo"]) expect(screen.getByRole("switch", { name: `Activar ${n}` })).toBeInTheDocument();
    // Nada depende de desplazarse de lado.
    for (const el of rejilla.querySelectorAll("*")) expect(el.getAttribute("class") ?? "").not.toMatch(/overflow-x-(auto|scroll)|ss-hscroll/);
  });
});

describe("6 · una sola historia del agente de Mi Genesis", () => {
  it("la función común: sin nada guardado está apagado y la memoria se aplicará al activarlo", () => {
    expect(estadoAgenteGenesis(undefined)).toEqual({ activo: false, memoria: true, texto: "Apagado: el agente de Mi Genesis no entra en tus chats. Cuando lo actives, usará tus memorias y contexto." });
    expect(estadoAgenteGenesis({ activo: true, memoria: true }).texto).toBe("Activo: el agente de Mi Genesis entra en tus chats y usa tus memorias y contexto.");
    expect(estadoAgenteGenesis({ activo: true, memoria: false }).texto).toBe("Activo: el agente de Mi Genesis entra en tus chats, sin tus memorias ni tu contexto.");
    expect(estadoAgenteGenesis({ activo: false, memoria: false }).texto).toContain("Cuando lo actives, no usará tus memorias.");
  });

  for (const caso of [
    { nombre: "sin nada guardado", conexiones: {} },
    { nombre: "activo sin memorias", conexiones: { genesis: { activo: true, memoria: false } } },
    { nombre: "apagado con memorias", conexiones: { genesis: { activo: false, memoria: true } } },
  ]) {
    it(`Conexiones de chat y la pestaña Genesis dicen lo mismo (${caso.nombre})`, async () => {
      sim.prefs = { v: 1, vinculos: [], conexiones: caso.conexiones };
      const esperado = estadoAgenteGenesis(sim.prefs.conexiones.genesis).texto;
      render(
        <ConexionesGenesis prefs={sim.prefs} acceso={null} onGuardar={async () => true} />,
        { wrapper: AppearanceProvider },
      );
      expect(screen.getByTestId("estado-agente-genesis")).toHaveTextContent(esperado);
      const activo = sim.prefs.conexiones.genesis?.activo === true;
      expect(screen.getByText(activo ? "Usar mis memorias y contexto" : "Al activarlo, usar mis memorias y contexto")).toBeInTheDocument();
      cleanup();
      sim.acceso = { miembro: false, dueno: false };
      render(<PestanaGenesis cliente={{ feed: vi.fn(), enviar: vi.fn(), acuses: vi.fn() } as never} />);
      expect(await screen.findByTestId("estado-agente-genesis")).toHaveTextContent(esperado);
      expect(screen.getByRole("link", { name: activo ? /Cambiarla en Conexiones de chat/ : /Activarlo en Conexiones de chat/ })).toHaveAttribute("href", "/agent?tab=conexiones-chat&foco=genesis");
      expect(screen.queryByText(/aún no está activa en Conexiones de chat/)).toBeNull();
    });
  }
});

describe("7 · texto visible en español", () => {
  it("la opción Telegram ya no tiene ningún botón «Chatbot»", async () => {
    render(<ChatConnectionsPanel foco="telegram" />, { wrapper: AppearanceProvider });
    const tarjeta = await screen.findByText("StarSeed Neurocortex · Telegram");
    const caja = tarjeta.closest("#conexion-telegram") as HTMLElement;
    expect(within(caja).getByRole("button", { name: /Chat con el bot/ })).toBeInTheDocument();
    expect(caja.textContent).not.toMatch(/\bChatbot\b/);
  });
});
