// @vitest-environment jsdom
/**
 * La cabecera del chat enseña el nombre REAL de la otra persona aunque aún no haya escrito
 * (antes solo se cargaban los perfiles de quien enviaba mensajes y se veía «Conversación»),
 * y los perfiles se FUSIONAN: nunca se pierde uno ya conocido.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// ── Datos y red (dm.ts, perfiles, Aurora) ───────────────────────────────────
const dm = vi.hoisted(() => ({
    listMessages: vi.fn(async (): Promise<unknown[]> => []),
    listMembers: vi.fn(async (): Promise<unknown[]> => []),
    subscribeThread: vi.fn((_id: string, _cb: (p: unknown) => void) => () => {}),
    markRead: vi.fn(async () => {}),
    markThreadReadLocal: vi.fn(),
}));
vi.mock("@/lib/messages/dm", () => ({
    listMessages: dm.listMessages,
    listMembers: dm.listMembers,
    subscribeThread: dm.subscribeThread,
    markRead: dm.markRead,
    markThreadReadLocal: dm.markThreadReadLocal,
    sendMessage: vi.fn(async () => null),
    editMessage: vi.fn(async () => true),
    softDeleteMessage: vi.fn(async () => true),
    setThreadAgent: vi.fn(async () => true),
    mentionsAurora: () => false,
    messageFromRealtimeRow: (r: unknown) => r,
    threadEntityLink: () => null,
    listThreadMedia: vi.fn(async () => []),
    addMembers: vi.fn(async () => true),
    leaveThread: vi.fn(async () => true),
    removeMember: vi.fn(async () => true),
    renameThread: vi.fn(async () => true),
    setMemberRole: vi.fn(async () => true),
    setThreadAvatar: vi.fn(async () => true),
    setThreadDescription: vi.fn(async () => true),
}));
vi.mock("@/lib/messages/aurora-thread", () => ({ askAuroraInThread: vi.fn(async () => ({ ok: true })) }));
const perfiles = vi.hoisted(() => ({ fetchProfilesByIds: vi.fn(async (_ids: string[]) => ({}) as Record<string, unknown>) }));
vi.mock("@/lib/social/os-profiles", () => ({ fetchProfilesByIds: perfiles.fetchProfilesByIds, searchUsers: vi.fn(async () => []) }));

// ── Contactos, confirmaciones, avisos ───────────────────────────────────────
vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => ({ contactos: [], porUserId: () => undefined, sinSesion: false }),
    usePorUserId: () => undefined,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true, usePrompt: () => async () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: ReactNode }) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// ── Contrato C7 (librería de mensajería) ────────────────────────────────────
const ajustesHilo = vi.hoisted(() => ({ hilos: {} as Record<string, Record<string, unknown>> }));
vi.mock("@/lib/mensajeria/ajustes-store", async () => {
    const { AJUSTES_DEFECTO } = await vi.importActual<typeof import("@/lib/mensajeria/ajustes-tipos")>("@/lib/mensajeria/ajustes-tipos");
    const { ajustesEfectivos } = await vi.importActual<typeof import("@/lib/mensajeria/ajustes")>("@/lib/mensajeria/ajustes");
    return {
        useAjustesMensajeria: () => {
            const ajustes = { ...AJUSTES_DEFECTO, hilos: ajustesHilo.hilos };
            return {
                listo: true,
                ajustes,
                cambiar: vi.fn(),
                cambiarHilo: vi.fn(),
                restablecerHilo: vi.fn(),
                restablecerTodo: vi.fn(),
                efectivos: (id: string | null, tipo: "dm" | "grupo" | "correo") => ajustesEfectivos(ajustes as never, id, tipo),
            };
        },
    };
});
vi.mock("@/lib/mensajeria/presencia", () => ({
    usePresencia: () => ({}),
    useSalaHilo: () => ({ presentes: [], escribiendo: [], anunciarEscribiendo: vi.fn() }),
    formatearPresencia: () => null,
}));
vi.mock("@/lib/mensajeria/carpetas-hilo", () => ({
    useCarpetasHilo: () => ({
        carpetas: [], listo: true, error: null,
        crear: vi.fn(), renombrar: vi.fn(), eliminar: vi.fn(), agregarItem: vi.fn(), quitarItem: vi.fn(), publicarEnBiblioteca: vi.fn(),
    }),
}));
vi.mock("@/lib/mensajeria/adjuntos", () => ({ urlVigenteAdjunto: (u?: string | null) => u ?? undefined }));
vi.mock("@/lib/mensajeria/formato", () => ({ estiloACss: () => ({}), validarFormato: (f: unknown) => ({ ok: true, formato: f }), urlsDeFormato: () => new Set<string>() }));

// ── Componentes de otros agentes (C4, C5, C6, C8, C9) y pesados ──────────────
vi.mock("@/components/messages/rico/mensaje-formateado", () => ({ MensajeFormateado: ({ textoPlano }: { textoPlano: string }) => <p>{textoPlano}</p>, superficiePropia: () => false }));
vi.mock("@/components/messages/rico/estilo-rapido", () => ({ BotonEstiloRapido: () => <button type="button">Estilo</button> }));
vi.mock("@/components/messages/rico/editor-mensaje-rico", () => ({ EditorMensajeRico: () => null }));
vi.mock("@/components/llamadas/botones-llamada", () => ({ BotonesLlamada: ({ titulo }: { titulo: string }) => <span data-testid="llamadas">{titulo}</span> }));
vi.mock("@/components/llamadas/tarjeta-llamada", () => ({ TarjetaLlamada: () => <div>llamada</div> }));
vi.mock("@/components/messages/vivo/boton-compartir-vivo", () => ({ BotonCompartirVivo: () => <button type="button">App en vivo</button> }));
vi.mock("@/components/messages/vivo/tarjeta-vivo", () => ({ TarjetaVivo: () => <div>vivo</div> }));
vi.mock("@/components/contactos/editor-contacto", () => ({ EditorContacto: () => null }));
vi.mock("@/components/contactos/linea-tiempo-notas", () => ({ LineaTiempoNotas: () => null }));
vi.mock("@/components/contactos/boton-anadir-contacto", () => ({ BotonAnadirContacto: () => <button type="button">Añadir a contactos</button> }));
vi.mock("@/components/aurora/message-renderer", () => ({ MessageRenderer: ({ text }: { text: string }) => <p>{text}</p> }));
vi.mock("@/components/library/save-to-library", () => ({ SaveToLibrary: () => <button type="button">Guardar en Biblioteca</button> }));
vi.mock("@/components/files/universal-attachment-view", () => ({ UniversalAttachmentView: () => null, isInviteLike: () => false, isNetworkRefLike: () => false }));
vi.mock("@/components/files/file-preview", () => ({ FilePreview: () => null }));
vi.mock("@/components/profile/foto-con-marco", () => ({ FotoConMarco: () => null }));
vi.mock("@/components/files/universal-file-picker", () => ({
    AttachFilePickerButton: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
    UniversalFilePicker: () => null,
}));
vi.mock("@/components/invitations/invite-composer-button", () => ({ InviteComposerButton: ({ children }: { children: ReactNode }) => <button type="button">{children}</button> }));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn(), fileToAttachment: vi.fn(), humanFileSize: () => "" }));

import { ThreadView } from "@/components/messages/dm/thread-view";
import type { DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

const perfil = (userId: string, displayName: string, username: string): OsProfile => ({
    userId, displayName, username, bio: "", tags: [], searchable: true, updatedAt: "2026-09-28T00:00:00.000Z",
});

const hilo = (over: Partial<DmThreadSummary> = {}): DmThreadSummary => ({
    id: "h1",
    kind: "dm",
    title: null,
    avatarUrl: null,
    createdBy: "yo",
    agent: null,
    meta: null,
    lastMsgAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    lastMessage: null,
    unreadCount: 0,
    memberIds: ["yo", "ana"],
    ...over,
});

beforeEach(() => {
    ajustesHilo.hilos = {};
    dm.listMessages.mockResolvedValue([]);
    dm.listMembers.mockResolvedValue([
        { threadId: "h1", userId: "yo", role: "owner", joinedAt: "2026-09-01T10:00:00.000Z" },
        { threadId: "h1", userId: "ana", role: "member", joinedAt: "2026-09-01T10:00:00.000Z" },
    ]);
    perfiles.fetchProfilesByIds.mockImplementation(async (ids: string[]) => {
        const todos: Record<string, OsProfile> = { ana: perfil("ana", "Ana García", "ana"), yo: perfil("yo", "Alex", "alex") };
        return Object.fromEntries(ids.filter((id) => todos[id]).map((id) => [id, todos[id]]));
    });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("ThreadView · cabecera con el nombre real", () => {
    it("muestra el nombre de la otra persona aunque todavía no haya escrito nada", async () => {
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await waitFor(() => expect(screen.getByTestId("nombre-hilo").textContent).toBe("Ana García"));
        // Se pidieron los perfiles de los MIEMBROS, no solo de quien envió mensajes.
        const pedidos = perfiles.fetchProfilesByIds.mock.calls.flatMap((c) => c[0]);
        expect(pedidos).toContain("ana");
        expect(screen.queryByText("Conversación")).toBeNull();
    });

    it("fusiona los perfiles de la página con los de los remitentes, sin reemplazar", async () => {
        dm.listMessages.mockResolvedValue([
            { id: "m1", threadId: "h1", sender: "yo", body: "Hola", attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt: "2026-09-28T09:00:00.000Z", formato: null },
        ]);
        render(
            <ThreadView
                thread={hilo()}
                myUserId="yo"
                onThreadUpdated={() => {}}
                perfilesMiembros={{ ana: perfil("ana", "Ana de la página", "ana") }}
            />,
        );
        await screen.findByText("Hola");
        await waitFor(() => expect(perfiles.fetchProfilesByIds).toHaveBeenCalled());
        // Ana ya venía de la página: no se vuelve a pedir y su nombre sigue ahí tras cargar al remitente.
        const pedidos = perfiles.fetchProfilesByIds.mock.calls.flatMap((c) => c[0]);
        expect(pedidos).not.toContain("ana");
        expect(screen.getByTestId("nombre-hilo").textContent).toBe("Ana de la página");
    });

    it("el apodo propio del chat manda sobre el perfil", async () => {
        ajustesHilo.hilos = { h1: { apodo: "Mi hermana" } };
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await waitFor(() => expect(perfiles.fetchProfilesByIds).toHaveBeenCalled());
        expect(screen.getByTestId("nombre-hilo").textContent).toBe("Mi hermana");
    });

    it("un mensaje nuevo en tiempo real de otra persona no borra los perfiles ya cargados", async () => {
        let alLlegar: ((p: unknown) => void) | null = null;
        dm.subscribeThread.mockImplementation((_id: string, cb: (p: unknown) => void) => {
            alLlegar = cb;
            return () => {};
        });
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await waitFor(() => expect(screen.getByTestId("nombre-hilo").textContent).toBe("Ana García"));
        perfiles.fetchProfilesByIds.mockResolvedValue({});
        alLlegar!({
            eventType: "INSERT",
            new: { id: "m9", threadId: "h1", sender: "ana", body: "¿Vienes?", attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt: new Date().toISOString(), formato: null },
        });
        await screen.findByText("¿Vienes?");
        expect(screen.getByTestId("nombre-hilo").textContent).toBe("Ana García");
        // Mensaje de otra persona con confirmaciones activas → marca de lectura remota.
        expect(dm.markRead).toHaveBeenCalledWith("h1");
    });
});

describe("ThreadView · ajustes del hilo aplicados", () => {
    const m = (id: string, body: string, createdAt: string) => ({
        id, threadId: "h1", sender: "ana", body, attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt, formato: null,
    });

    it("«vaciar solo para mí» oculta lo anterior y se puede mostrar todo", async () => {
        ajustesHilo.hilos = { h1: { vaciadoEn: "2026-09-28T09:30:00.000Z" } };
        dm.listMessages.mockResolvedValue([m("m1", "Mensaje viejo", "2026-09-28T09:00:00.000Z"), m("m2", "Mensaje nuevo", "2026-09-28T10:00:00.000Z")]);
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await screen.findByText("Mensaje nuevo");
        expect(screen.queryByText("Mensaje viejo")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Mostrar todo/ }));
        expect(screen.getByText("Mensaje viejo")).toBeTruthy();
    });

    it("sin confirmaciones de lectura solo marca en local, nunca en remoto", async () => {
        ajustesHilo.hilos = { h1: { confirmacionesLectura: false } };
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await waitFor(() => expect(dm.markThreadReadLocal).toHaveBeenCalledWith("h1"));
        expect(dm.markRead).not.toHaveBeenCalled();
    });

    it("tocar el nombre abre la información del contacto", async () => {
        render(<ThreadView thread={hilo()} myUserId="yo" onThreadUpdated={() => {}} />);
        await waitFor(() => expect(screen.getByTestId("nombre-hilo").textContent).toBe("Ana García"));
        fireEvent.click(screen.getByRole("button", { name: "Ver información de Ana García" }));
        expect(await screen.findByRole("heading", { name: "Info del contacto" })).toBeTruthy();
        expect(screen.getByText("Archivos, enlaces y documentos")).toBeTruthy();
        expect(screen.getByText("Carpetas del chat")).toBeTruthy();
    });
});
