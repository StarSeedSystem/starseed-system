/**
 * TarjetaVivo: estado activo (Abrir lleva a la app con ?sesion=), recuento de presentes,
 * sesión terminada (apagada, sin Abrir) y adjunto mal formado (no rompe el chat).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SesionViva } from "@/lib/mensajeria/formato-tipos";

const estado = vi.hoisted(() => ({
    sesion: null as SesionViva | null,
    listo: true,
    presentes: null as number | null,
    uid: "11111111-1111-4111-8111-111111111111" as string | null,
    push: vi.fn(),
}));

vi.mock("@/lib/mensajeria/sesiones-vivas", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/sesiones-vivas")>()),
    useSesionViva: () => ({ sesion: estado.sesion, error: null, listo: estado.listo, recargar: () => {} }),
    usePresentesSesion: () => estado.presentes,
    miUid: async () => estado.uid,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: estado.push }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("@/components/library/save-to-library", () => ({ SaveToLibrary: () => null }));
vi.mock("@/lib/messages/dm", () => ({ listMembers: vi.fn(async () => []), createDm: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/lib/spaces/spaces", () => ({
    createSpace: vi.fn(),
    inviteToSpace: vi.fn(async () => true),
    updateSpaceMeta: vi.fn(async () => true),
    listOwnedSpaces: vi.fn(async () => []),
    deleteSpace: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { TarjetaVivo, textoPresencia } from "@/components/messages/vivo/tarjeta-vivo";

const SID = "44444444-4444-4444-8444-444444444444";
const RUTA = "/pizarra?board-space=sp1&engine=starseed";
const ADJUNTO = { kind: "vivo", tipoVivo: "pizarra", sesionId: SID, route: RUTA, name: "Plan del huerto", permiso: "editar" };

function sesion(extra: Partial<SesionViva> = {}): SesionViva {
    return {
        id: SID,
        tipo: "vivo:pizarra",
        hiloId: "55555555-5555-4555-8555-555555555555",
        creador: "11111111-1111-4111-8111-111111111111",
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
    estado.sesion = sesion();
    estado.listo = true;
    estado.presentes = null;
    estado.push.mockReset();
});

afterEach(() => cleanup());

describe("TarjetaVivo", () => {
    test("activa: título, permiso, acceso y [Abrir] a la app con ?sesion=", () => {
        render(<TarjetaVivo adjunto={ADJUNTO} mio={false} />);
        expect(screen.getByText("Plan del huerto")).toBeTruthy();
        expect(screen.getByText("Pizarra")).toBeTruthy();
        expect(screen.getByText("Pueden editar")).toBeTruthy();
        expect(screen.getByText("Este chat")).toBeTruthy();
        expect(screen.getByRole("article").getAttribute("data-estado")).toBe("activa");
        fireEvent.click(screen.getByRole("button", { name: "Abrir Plan del huerto" }));
        expect(estado.push).toHaveBeenCalledWith(`${RUTA}&sesion=${SID}`);
    });

    test("cuenta a quien está dentro (solo cuando consta alguien)", () => {
        estado.presentes = 3;
        render(<TarjetaVivo adjunto={ADJUNTO} mio />);
        expect(screen.getByText("En vivo · 3 personas dentro")).toBeTruthy();
        expect(textoPresencia(0)).toBe("En vivo");
        expect(textoPresencia(null)).toBe("En vivo");
        expect(textoPresencia(1)).toBe("En vivo · 1 persona dentro");
    });

    test("terminada: apagada, «Sesión terminada» y sin botón Abrir", () => {
        estado.sesion = sesion({ estado: "terminada" });
        render(<TarjetaVivo adjunto={ADJUNTO} mio={false} />);
        expect(screen.getByText("Sesión terminada")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Abrir/ })).toBeNull();
        const tarjeta = screen.getByRole("article");
        expect(tarjeta.getAttribute("data-estado")).toBe("terminada");
        expect(tarjeta.getAttribute("aria-label")).toMatch(/sesión terminada/);
    });

    test("caducada cuenta como terminada", () => {
        estado.sesion = sesion({ caduca: "2020-01-01T00:00:00Z" });
        render(<TarjetaVivo adjunto={ADJUNTO} mio={false} />);
        expect(screen.getByText("Sesión terminada")).toBeTruthy();
    });

    test("sin acceso a la sesión: Abrir lleva a la página de entrada, que explica qué pasa", () => {
        estado.sesion = null;
        render(<TarjetaVivo adjunto={ADJUNTO} mio={false} />);
        fireEvent.click(screen.getByRole("button", { name: "Abrir Plan del huerto" }));
        expect(estado.push).toHaveBeenCalledWith(`/vivo/${SID}`);
    });

    test("un adjunto mal formado no rompe el chat", () => {
        estado.sesion = null;
        render(<TarjetaVivo adjunto={{ kind: "vivo", name: "Algo raro" }} mio={false} />);
        expect(screen.getByText("Algo raro")).toBeTruthy();
        const abrir = screen.getByRole("button", { name: "Abrir Algo raro" }) as HTMLButtonElement;
        expect(abrir.disabled).toBe(true);
        expect(screen.queryByRole("button", { name: /Más opciones/ })).toBeNull();
    });
});
