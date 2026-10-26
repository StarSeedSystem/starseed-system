/**
 * Las tarjetas reales del OS pintan «Bot de IA» junto a lo que publica o comenta un agente, y respetan el bloqueo
 * (Ola 1025U · U3). Se montan las piezas de verdad; solo se simulan la red y los componentes pesados ajenos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { _reiniciarCacheBloqueoParaPruebas, bloquearBot, leerReglas } from "@/lib/agentes-red/bloqueo-bots";
import { marcaDeAgente, marcarComoBot } from "@/lib/agentes-red/marca-bot";
import { normalizeCafePost, type CafePostRow, type NormalizedPost } from "@/lib/social-posts";
import type { CommentNode } from "@/lib/posts/post-entity";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (p: { alt?: string }) => <span role="img" aria-label={p.alt ?? ""} /> }));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined }),
}));
// Piezas ajenas, pesadas, que no son el objeto de estas pruebas.
vi.mock("@/components/mentions/mention-input", () => ({ default: () => <textarea aria-label="comentario" /> }));
vi.mock("@/components/mentions/entity-chip", () => ({ MentionChip: () => null }));
vi.mock("@/components/files/universal-file-picker", () => ({ AttachFilePickerButton: () => null }));
vi.mock("@/components/files/universal-attachment-view", () => ({ UniversalAttachmentView: () => null, isNetworkRefLike: () => false }));
vi.mock("@/components/files/file-preview", () => ({ FilePreview: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true, usePrompt: () => async () => null }));
vi.mock("@/components/sharing/share-to-dialog", () => ({ ShareToDialog: () => null }));
vi.mock("@/components/profile/foto-con-marco", () => ({ FotoConMarco: () => null }));
vi.mock("@/components/social/post-blocks-renderer", () => ({ PostBlocksRenderer: () => null, PostTagChips: () => null }));

import { PostCard } from "@/components/social/PostCard";
import { CommentThread } from "@/components/network/feed/comment-thread";

const GUARDIAN = crearAgenteMundoRef({ origen: "bot", idOrigen: "guardian", nombre: "Guardián del huerto", dueno: { tipo: "grupo", id: "huerto" } });

function fila(over: Partial<CafePostRow> = {}): CafePostRow {
  return { id: "fallback-1", author_name: "Ana", author_handle: "@ana", body: "Hola desde una persona", created_at: new Date().toISOString(), ...over } as CafePostRow;
}
const post = (over: Partial<CafePostRow> = {}): NormalizedPost => ({ ...normalizeCafePost(fila(over)), isFallback: true });

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheBloqueoParaPruebas();
});
afterEach(cleanup);

describe("normalizeCafePost + PostCard", () => {
  it("una publicación de un agente sale de la normalización con su marca y la tarjeta pinta «Bot de IA»", () => {
    const p = post({ id: "fallback-bot", author_name: "Guardián del huerto", body: marcarComoBot("Hoy toca regar", GUARDIAN) });
    expect(p.autorBot).toMatchObject({ agenteId: "bot:guardian" });
    expect(p.body).toBe("Hoy toca regar");
    render(<PostCard post={p} />);
    expect(screen.getByTestId("etiqueta-bot-ia")).toBeVisible();
    expect(screen.getByTestId("menu-bot-ia")).toBeVisible();
    expect(screen.getByText("Hoy toca regar")).toBeVisible();
  });

  it("la de una persona no lleva etiqueta ni menú de bot", () => {
    render(<PostCard post={post()} />);
    expect(screen.queryByTestId("etiqueta-bot-ia")).toBeNull();
    expect(screen.queryByTestId("menu-bot-ia")).toBeNull();
  });

  it("el menú de la tarjeta bloquea al bot", async () => {
    const p = post({ id: "fallback-bot", body: marcarComoBot("Hoy toca regar", GUARDIAN) });
    render(<PostCard post={p} />);
    await userEvent.click(screen.getByTestId("menu-bot-ia"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Bloquear este bot/ }));
    expect(leerReglas().bots["bot:guardian"]).toBeDefined();
  });
});

function nodo(id: string, over: Partial<CommentNode> = {}): CommentNode {
  return {
    id, author_id: "u-dueño", type: "comment", content: { text: `Comentario ${id}` }, visibility: "public",
    post_references: { parent: "p1" }, interactions: {}, created_at: new Date().toISOString(), updated_at: null,
    author: { id: "u-dueño", display_name: "Ana Real", handle: "anareal" }, parentComment: null, children: [], ...over,
  };
}
const COMENTARIOS: CommentNode[] = [
  nodo("c1"),
  nodo("c2", { post_references: { parent: "p1", bot: marcaDeAgente(GUARDIAN) }, content: { text: "Comentario del bot" }, children: [nodo("c3", { content: { text: "Respuesta de una persona" } })] }),
];

describe("CommentThread (comentarios del Lienzo)", () => {
  const montar = () => render(<CommentThread postId="p1" comments={COMENTARIOS} currentUserId={null} onChanged={() => undefined} />);

  it("el comentario de un agente lleva «Bot de IA» y se muestra con el nombre del AGENTE, no el de su persona", () => {
    montar();
    expect(screen.getAllByTestId("etiqueta-bot-ia")).toHaveLength(1);
    const item = screen.getByText("Comentario del bot").closest("div.rounded-lg") as HTMLElement;
    expect(within(item).getByText("Guardián del huerto")).toBeVisible();
    expect(within(item).queryByText("Ana Real")).toBeNull();
    expect(screen.getByText("Comentario c1")).toBeVisible();
  });

  it("bloquear al bot lo quita del hilo, conserva la respuesta de la persona y avisa del filtro", async () => {
    montar();
    await userEvent.click(screen.getByTestId("menu-bot-ia"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Bloquear este bot/ }));
    expect(screen.queryByText("Comentario del bot")).toBeNull();
    expect(screen.getByText("Respuesta de una persona")).toBeVisible();
    expect(screen.getByText("Comentario c1")).toBeVisible();
    expect(screen.queryByTestId("etiqueta-bot-ia")).toBeNull();
    // el filtro de la publicación sigue a mano para poder permitirlo ahí
    expect(screen.getByTestId("filtro-bots-publicacion")).toBeVisible();
  });

  it("el filtro de la publicación aparece solo si hay bots en el hilo", () => {
    render(<CommentThread postId="p1" comments={[nodo("c1")]} currentUserId={null} onChanged={() => undefined} />);
    expect(screen.queryByTestId("filtro-bots-publicacion")).toBeNull();
  });

  it("«ninguno» en la publicación esconde los bots de ESA publicación", async () => {
    montar();
    await userEvent.click(screen.getByTestId("filtro-bots-publicacion"));
    await userEvent.click(await screen.findByRole("radio", { name: /Ningún bot/ }));
    expect(screen.queryByText("Comentario del bot")).toBeNull();
    expect(leerReglas().publicaciones.p1).toBe("ninguno");
  });

  it("un bot bloqueado desde fuera (otra pestaña, otro dispositivo) desaparece sin recargar", () => {
    montar();
    expect(screen.getByText("Comentario del bot")).toBeVisible();
    act(() => { bloquearBot("bot:guardian", "Guardián del huerto"); });
    expect(screen.queryByText("Comentario del bot")).toBeNull();
  });
});
