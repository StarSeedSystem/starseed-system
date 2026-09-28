// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AJUSTES_DEFECTO, type AjustesHilo, type AjustesMensajeria, type AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { ajustesEfectivos } from "@/lib/mensajeria/ajustes";
import type { Contacto } from "@/lib/contactos/tipos";
import type { DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

// ── Dobles: ajustes (C7), presencia (C7), libreta de contactos y el diálogo de A3a ──
const dobles = vi.hoisted(() => ({
    api: null as unknown as AjustesMensajeriaApi,
    contactos: [] as Contacto[],
    presencia: {} as Record<string, { enLinea: boolean; visto: string | null }>,
}));

vi.mock("@/lib/mensajeria/ajustes-store", () => ({ useAjustesMensajeria: () => dobles.api }));
vi.mock("@/lib/mensajeria/presencia", () => ({ usePresencia: () => dobles.presencia }));
vi.mock("@/lib/contactos/store", () => ({
    useContactos: () => ({
        listo: true,
        sinSesion: false,
        contactos: dobles.contactos,
        porUserId: (uid: string) => dobles.contactos.find((c) => c.userId === uid),
        crear: vi.fn(),
    }),
}));
vi.mock("@/components/messages/marco/dialogo-ajustes-hilo", () => ({ DialogoAjustesHilo: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ThreadList } from "@/components/messages/dm/thread-list";

const YO = "yo";

function crearApi(hilos: Record<string, AjustesHilo> = {}, privacidad: Partial<AjustesMensajeria["privacidad"]> = {}): AjustesMensajeriaApi {
    const ajustes: AjustesMensajeria = { ...AJUSTES_DEFECTO, privacidad: { ...AJUSTES_DEFECTO.privacidad, ...privacidad }, hilos };
    return {
        listo: true,
        ajustes,
        cambiar: vi.fn(),
        cambiarHilo: vi.fn(),
        restablecerHilo: vi.fn(),
        restablecerTodo: vi.fn(),
        efectivos: (id, tipo) => ajustesEfectivos(ajustes, id, tipo),
    };
}

function hilo(id: string, otro: string, extra: Partial<DmThreadSummary> = {}): DmThreadSummary {
    return {
        id,
        kind: "dm",
        title: null,
        avatarUrl: null,
        createdBy: otro,
        agent: null,
        meta: {},
        lastMsgAt: "2026-09-28T09:00:00.000Z",
        createdAt: "2026-09-20T09:00:00.000Z",
        lastMessage: null,
        unreadCount: 0,
        memberIds: [YO, otro],
        ...extra,
    } as DmThreadSummary;
}

function perfil(userId: string, displayName: string): OsProfile {
    return { userId, username: displayName.toLowerCase(), displayName, bio: "", tags: [], searchable: true, updatedAt: "2026-09-01T00:00:00.000Z" };
}

function contacto(userId: string, nombre: string, apodo?: string): Contacto {
    return {
        id: `c-${userId}`,
        userId,
        nombre,
        apodo,
        relacion: "amistad",
        telefonos: [],
        correos: [],
        enlaces: [],
        categorias: [],
        listas: [],
        favorito: false,
        visibilidad: "privada",
        origen: "starseed",
        creado: "2026-09-01T00:00:00.000Z",
        actualizado: "2026-09-01T00:00:00.000Z",
    };
}

const HILOS = [
    hilo("h-ana", "ana", { lastMessage: { id: "m1", threadId: "h-ana", sender: "ana", body: "¿Vienes al huerto?", attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt: "2026-09-28T09:00:00.000Z", formato: null } as unknown as DmThreadSummary["lastMessage"] }),
    hilo("h-beto", "beto"),
    hilo("h-desconocida", "desconocida", { unreadCount: 2 }),
];
const PERFILES = {
    ana: perfil("ana", "Ana García"),
    beto: perfil("beto", "Beto Ruiz"),
    desconocida: perfil("desconocida", "Dana Ext"),
};

function pintar() {
    return render(
        <ThreadList threads={HILOS} profiles={PERFILES} myUserId={YO} selectedId={null} onSelect={() => {}} onNewChat={() => {}} />,
    );
}

function nombresVisibles(): string[] {
    const lista = screen.getByTestId("lista-hilos");
    return within(lista)
        .queryAllByRole("button", { current: false })
        .map((b) => b.getAttribute("aria-label") ?? "")
        .filter((n) => n && !n.startsWith("Opciones"));
}

describe("ThreadList · filtros con datos simulados", () => {
    beforeEach(() => {
        dobles.contactos = [contacto("ana", "Ana", "Anita"), contacto("beto", "Beto")];
        dobles.presencia = {};
        dobles.api = crearApi({ "h-beto": { archivado: true, actualizado: "2026-09-28T10:00:00.000Z" } });
    });
    afterEach(cleanup);

    it("el nombre sale del apodo del contacto y la vista previa del último mensaje", () => {
        pintar();
        expect(screen.getByText("Anita")).toBeTruthy();
        expect(screen.getByText("¿Vienes al huerto?")).toBeTruthy();
    });

    it("«Todos» esconde los archivados y «Archivados» los enseña", () => {
        pintar();
        expect(nombresVisibles().some((n) => n.startsWith("Beto"))).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: /^Archivados/ }));
        const visibles = nombresVisibles();
        expect(visibles).toHaveLength(1);
        expect(visibles[0]).toMatch(/^Beto/);
    });

    it("sin «solo contactos» no hay Solicitudes y el desconocido está en Todos", () => {
        pintar();
        expect(screen.queryByRole("button", { name: /^Solicitudes/ })).toBeNull();
        expect(nombresVisibles().some((n) => n.startsWith("Dana Ext"))).toBe(true);
    });

    it("con «solo contactos», lo del desconocido va a Solicitudes y sale de Todos", () => {
        dobles.api = crearApi({}, { escribirme: "contactos" });
        pintar();
        expect(nombresVisibles().some((n) => n.startsWith("Dana Ext"))).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: /^Solicitudes/ }));
        const visibles = nombresVisibles();
        expect(visibles).toHaveLength(1);
        expect(visibles[0]).toMatch(/^Dana Ext, 2 sin leer/);
    });

    it("el apodo del chat manda sobre el del contacto, y los fijados van en su sección", () => {
        dobles.api = crearApi({ "h-ana": { apodo: "Ana del huerto", fijado: true, actualizado: "2026-09-28T10:00:00.000Z" } });
        pintar();
        const fijados = screen.getByRole("list", { name: "Chats fijados" });
        expect(fijados.textContent).toContain("Ana del huerto");
        expect(screen.getByRole("list", { name: "Chats" }).textContent).not.toContain("Ana del huerto");
    });

    it("la presencia pinta el punto verde solo si compartes la tuya", () => {
        dobles.presencia = { ana: { enLinea: true, visto: null } };
        pintar();
        expect(screen.getAllByTestId("avatar-en-linea")).toHaveLength(1);
        cleanup();
        dobles.api = crearApi({}, { mostrarEnLinea: "nadie" });
        pintar();
        expect(screen.queryAllByTestId("avatar-en-linea")).toHaveLength(0);
    });
});
