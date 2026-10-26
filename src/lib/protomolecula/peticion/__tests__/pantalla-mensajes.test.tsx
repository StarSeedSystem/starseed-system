// @vitest-environment jsdom
/** El chat abierto en /messages anuncia su contexto (ámbito personal; el nombre del chat solo para la propia persona). */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  hilos: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(""), usePathname: () => "/messages" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "yo" } } }) } }) }));
vi.mock("@/components/messages/correos-panel", () => ({ CorreosPanel: () => null }));
vi.mock("@/components/messages/dm/thread-list", async (orig) => ({ ...(await orig<object>()), ThreadList: () => null }));
vi.mock("@/components/messages/dm/thread-view", () => ({ ThreadView: () => null }));
vi.mock("@/components/messages/dm/new-chat-dialog", () => ({ NewChatDialog: () => null }));
vi.mock("@/components/messages/marco/barra-superior", () => ({ BarraSuperior: () => null }));
vi.mock("@/components/messages/marco/marco-dos-paneles", () => ({ MarcoDosPaneles: ({ lista, detalle }: { lista: React.ReactNode; detalle: React.ReactNode }) => <div>{lista}{detalle}</div> }));
vi.mock("@/components/messages/marco/nombres-hilos", () => ({ ProveedorNombresHilos: ({ children }: { children: React.ReactNode }) => <>{children}</>, useNombresHilos: () => ({ registrar: vi.fn() }) }));
vi.mock("@/components/messages/marco/use-enfoque", () => ({ useEnfoque: () => ({ enfocado: false, alternar: vi.fn() }) }));
vi.mock("@/components/messages/marco/use-es-movil", () => ({ useEsMovil: () => false }));
vi.mock("@/components/messages/marco/aurora-por-defecto", () => ({ aplicarAuroraPorDefecto: vi.fn(async () => undefined) }));
vi.mock("@/lib/mensajeria/ajustes-store", () => ({
  useAjustesMensajeria: () => ({
    efectivos: () => ({ archivado: false, restringido: false, silenciado: false }),
    ajustes: { hilos: {}, privacidad: { escribirme: "todos" }, aurora: {} },
  }),
}));
vi.mock("@/lib/contactos/store", () => ({ useContactos: () => ({ porUserId: () => undefined }) }));
vi.mock("@/lib/messages/dm", () => ({
  createDm: vi.fn(), markRead: vi.fn(), subscribeThreadsList: () => () => undefined,
  listThreads: vi.fn(async () => m.hilos),
}));
vi.mock("@/lib/social/os-profiles", () => ({
  seedMyProfile: vi.fn(async () => undefined),
  fetchProfilesByIds: vi.fn(async () => ({})),
  fetchProfileByUsername: vi.fn(async () => null),
}));

import { leerContexto, reiniciarContexto } from "../contexto";
import MessagesPage from "@/app/(main)/messages/page";

const hilo = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: "group", title: `Chat ${id}`, memberIds: ["yo"], lastMessageAt: "2026-10-26T10:00:00Z", unread: 0, ...extra,
});

async function montar() {
  render(<MessagesPage />);
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}

beforeEach(() => { reiniciarContexto(); window.history.pushState({}, "", "/messages"); m.hilos = []; });
afterEach(() => { cleanup(); reiniciarContexto(); });

describe("/messages anuncia el chat abierto", () => {
  it("con un chat seleccionado: entidad «mensaje» con el id del hilo, ámbito personal", async () => {
    m.hilos = [hilo("hilo-1")];
    await montar();
    const c = leerContexto();
    expect(c.entidad).toMatchObject({ tipo: "mensaje", id: "hilo-1" });
    expect(c.ambito).toBe("personal");
    expect(c.gobernadaPor).toBeUndefined();
  });

  it("sin chats no anuncia nada: queda lo que dice la ruta", async () => {
    await montar();
    expect(leerContexto().entidad).toBeUndefined();
  });

  it("al salir retira su anuncio", async () => {
    m.hilos = [hilo("hilo-1")];
    await montar();
    expect(leerContexto().entidad?.id).toBe("hilo-1");
    cleanup();
    expect(leerContexto().entidad).toBeUndefined();
  });
});
