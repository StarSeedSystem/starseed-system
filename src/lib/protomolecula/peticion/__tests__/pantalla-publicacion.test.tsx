// @vitest-environment jsdom
/** La publicación abierta anuncia su contexto a la ventana de la Protomolécula (propia = personal; ajena = pública o de su página). */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  post: null as unknown,
  uid: "yo" as string | null,
}));

vi.mock("@/lib/posts/post-entity", () => ({
  loadPost: vi.fn(async () => m.post),
  reachOf: vi.fn(async () => []),
  react: vi.fn(), vote: vi.fn(), tag: vi.fn(), republish: vi.fn(), suggestChange: vi.fn(), report: vi.fn(),
  commentTree: vi.fn(async () => []),
  subscribe: vi.fn(() => () => undefined),
}));
vi.mock("@/lib/os-social", () => ({ getCurrentUserId: vi.fn(async () => m.uid) }));
vi.mock("@/components/files/file-preview", () => ({ FilePreview: () => null }));
vi.mock("@/components/posts/attachment-carousel", () => ({ AttachmentCarousel: () => null }));
vi.mock("@/components/network/feed/comment-thread", () => ({ CommentThread: () => null }));
vi.mock("@/components/agentes-red/etiqueta-bot-ia", () => ({ EtiquetaBotIA: () => null }));
vi.mock("@/components/agentes-red/menu-bot-ia", () => ({ MenuBotIA: () => null }));
vi.mock("@/lib/agentes-red/marca-bot", () => ({ marcaBotDe: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(), usePrompt: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { leerContexto, reiniciarContexto } from "../contexto";
import PostView from "@/components/posts/post-view";
import { AppearanceProvider } from "@/context/appearance-context";

const Pantalla = () => <AppearanceProvider><PostView postId="p1" /></AppearanceProvider>;

const post = (extra: Record<string, unknown> = {}) => ({
  id: "p1",
  author_id: "yo",
  content: { title: "Mi diario", body: "hola" },
  post_references: { destinations: [] },
  created_at: "2026-10-26T10:00:00Z",
  ...extra,
});

async function montar() {
  render(<Pantalla />);
  // loadPost + getCurrentUserId + efectos
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

beforeEach(() => { reiniciarContexto(); m.uid = "yo"; window.history.pushState({}, "", "/post/p1"); });
afterEach(() => { cleanup(); reiniciarContexto(); });

describe("PostView anuncia su contexto", () => {
  it("una publicación PROPIA se rige como personal y lleva su título", async () => {
    m.post = post();
    await montar();
    const c = leerContexto();
    expect(c.entidad).toEqual({ tipo: "publicacion", id: "p1", nombre: "Mi diario" });
    expect(c.ambito).toBe("personal");
    expect(c.gobernadaPor).toBeUndefined();
  });

  it("una publicación AJENA es pública, y se rige por la página donde vive si la tiene", async () => {
    m.post = post({ author_id: "otra", post_references: { destinations: [{ kind: "page", id: "nexus", label: "Nexus" }] } });
    await montar();
    const c = leerContexto();
    expect(c.ambito).toBe("publica");
    expect(c.gobernadaPor).toEqual({ tipo: "pagina", id: "nexus", nombre: "Nexus" });
  });

  it("sin sesión, nada es propio", async () => {
    m.uid = null;
    m.post = post();
    await montar();
    expect(leerContexto().ambito).toBe("publica");
  });

  it("al salir de la pantalla retira su anuncio", async () => {
    m.post = post();
    render(<Pantalla />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(leerContexto().entidad?.nombre).toBe("Mi diario");
    cleanup();
    expect(leerContexto().entidad?.nombre).toBeUndefined();
    expect(leerContexto().entidad).toEqual({ tipo: "publicacion", id: "p1" }); // lo que dice la ruta por sí sola
  });
});
