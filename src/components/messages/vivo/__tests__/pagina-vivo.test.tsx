/**
 * /vivo/[id]: cada situación tiene su pantalla clara — enlace inválido, iniciar sesión,
 * servidor sin migración, sin permiso, enlace público que ya no vale, terminada — y la tarjeta
 * de entrada lleva a la app con ?sesion=<id>.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SesionViva } from "@/lib/mensajeria/formato-tipos";

const SID = "44444444-4444-4444-8444-444444444444";
const RUTA = "/pizarra?board-space=sp1&engine=starseed";

const estado = vi.hoisted(() => ({
    id: "",
    token: null as string | null,
    uid: null as string | null,
    porSelect: { sesion: null, error: null } as { sesion: SesionViva | null; error: string | null },
    porToken: { sesion: null, error: null } as { sesion: SesionViva | null; error: string | null },
    push: vi.fn(),
    replace: vi.fn(),
    obtener: vi.fn(),
    router: {} as { push: (r: string) => void; replace: (r: string) => void },
}));
estado.router = { push: (r: string) => estado.push(r), replace: (r: string) => estado.replace(r) };

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: estado.id }),
    useSearchParams: () => ({ get: (k: string) => (k === "t" ? estado.token : null) }),
    useRouter: () => estado.router,
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...resto}>{children}</a>
    ),
}));
vi.mock("@/lib/mensajeria/sesiones-vivas", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/sesiones-vivas")>()),
    miUid: async () => estado.uid,
    obtenerSesion: (id: string, token?: string | null) => {
        estado.obtener(id, token);
        return Promise.resolve(token ? estado.porToken : estado.porSelect);
    },
    usePresentesSesion: () => null,
}));
vi.mock("@/lib/social/os-profiles", () => ({
    fetchProfilesByIds: async () => ({ creadora: { displayName: "Ada", avatarUrl: undefined } }),
}));
vi.mock("@/lib/messages/dm", () => ({ listMembers: vi.fn(), createDm: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/lib/spaces/spaces", () => ({
    createSpace: vi.fn(),
    inviteToSpace: vi.fn(),
    updateSpaceMeta: vi.fn(),
    listOwnedSpaces: vi.fn(),
    deleteSpace: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import PaginaVivo from "@/app/vivo/[id]/page";
import { MENSAJE_SIN_DESPLEGAR } from "@/lib/mensajeria/sesiones-vivas";

function sesion(extra: Partial<SesionViva> = {}): SesionViva {
    return {
        id: SID,
        tipo: "vivo:pizarra",
        hiloId: null,
        creador: "creadora",
        titulo: "Plan del huerto",
        refId: "sp1",
        ruta: RUTA,
        modo: "chat",
        permiso: "editar",
        invitados: [],
        tokenPublico: null,
        estado: "activa",
        creada: "2026-09-28T10:00:00Z",
        caduca: null,
        ...extra,
    };
}

beforeEach(() => {
    estado.id = SID;
    estado.token = null;
    estado.uid = null;
    estado.porSelect = { sesion: null, error: null };
    estado.porToken = { sesion: null, error: null };
    estado.push.mockReset();
    estado.replace.mockReset();
    estado.obtener.mockReset();
});

afterEach(() => cleanup());

describe("/vivo/[id]", () => {
    test("un id que no es uuid: enlace no válido", async () => {
        estado.id = "no-vale";
        render(<PaginaVivo />);
        expect(await screen.findByText("Este enlace no es válido")).toBeTruthy();
        expect(estado.obtener).not.toHaveBeenCalled();
    });

    test("sin cuenta y sin token: pide iniciar sesión y vuelve aquí después", async () => {
        render(<PaginaVivo />);
        expect(await screen.findByText("Inicia sesión para entrar")).toBeTruthy();
        const enlace = screen.getByRole("link", { name: /Iniciar sesión/ });
        expect(enlace.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/vivo/${SID}`)}`);
    });

    test("servidor sin la migración: lo dice sin romperse", async () => {
        estado.uid = "yo";
        estado.porSelect = { sesion: null, error: MENSAJE_SIN_DESPLEGAR };
        render(<PaginaVivo />);
        expect(await screen.findByText("Aún no disponible aquí")).toBeTruthy();
        expect(screen.getByText(new RegExp(MENSAJE_SIN_DESPLEGAR))).toBeTruthy();
    });

    test("con cuenta pero sin acceso", async () => {
        estado.uid = "yo";
        render(<PaginaVivo />);
        expect(await screen.findByText("No tienes acceso a esta sesión")).toBeTruthy();
    });

    test("con cuenta y acceso: tarjeta de entrada y «Entrar» abre la app con ?sesion=", async () => {
        estado.uid = "yo";
        estado.porSelect = { sesion: sesion(), error: null };
        render(<PaginaVivo />);
        expect(await screen.findByText("Plan del huerto")).toBeTruthy();
        expect(await screen.findByText("Compartida por Ada")).toBeTruthy();
        expect(screen.getByText("Pueden editar")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Entrar/ }));
        expect(estado.push).toHaveBeenCalledWith(`${RUTA}&sesion=${SID}`);
    });

    test("por enlace público sin cuenta: entra a ver (los espacios no dan edición por enlace)", async () => {
        estado.token = "tok";
        estado.porToken = { sesion: sesion({ modo: "publico" }), error: null };
        render(<PaginaVivo />);
        expect(await screen.findByText("Plan del huerto")).toBeTruthy();
        expect(estado.obtener).toHaveBeenCalledWith(SID, "tok");
        expect(screen.getByText("Solo ver")).toBeTruthy();
        expect(screen.getByText(/Entras sin cuenta/)).toBeTruthy();
        expect(screen.getByText(/Para editar, pide a quien la compartió que te invite/)).toBeTruthy();
    });

    test("enlace público que ya no vale", async () => {
        estado.token = "viejo";
        render(<PaginaVivo />);
        expect(await screen.findByText("Este enlace público ya no funciona")).toBeTruthy();
    });

    test("sesión terminada", async () => {
        estado.uid = "yo";
        estado.porSelect = { sesion: sesion({ estado: "terminada" }), error: null };
        render(<PaginaVivo />);
        expect(await screen.findByText("Esta sesión terminó")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Entrar/ })).toBeNull();
    });

    test("una llamada se redirige a /llamada/<id> conservando el token", async () => {
        estado.token = "tok";
        estado.porToken = { sesion: sesion({ tipo: "llamada:video" }), error: null };
        render(<PaginaVivo />);
        await vi.waitFor(() => expect(estado.replace).toHaveBeenCalledWith(`/llamada/${SID}?t=tok`));
    });
});
