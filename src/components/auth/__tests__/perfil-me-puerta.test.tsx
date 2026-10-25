/**
 * ACC1025B · /profile/[usuario]: solo el alias propio («me») sin sesión pinta la puerta.
 * Los perfiles de OTRAS personas son públicos y se ven sin cuenta, como siempre.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render as renderCrudo, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";

const sim = vi.hoisted(() => ({
    usuario: undefined as string | undefined,
    user: null as null | { id: string },
    cargando: false,
    perfilResuelto: false,
}));

vi.mock("next/navigation", () => ({
    useParams: () => ({ username: sim.usuario }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => `/profile/${sim.usuario ?? "me"}`,
}));
vi.mock("@/context/account-context", () => ({
    useAccount: () => ({ user: sim.user, session: null, profile: null, loading: sim.cargando }),
}));
// La resolución del perfil no termina: lo que importa es qué pinta la página ANTES de tener datos.
vi.mock("@/lib/social/profile-resolver", () => ({
    resolveProfileData: () => new Promise(() => undefined),
}));
// La puerta es lo que se prueba: aquí se sustituye por una marca para no cargar su vista previa.
vi.mock("@/components/auth/puerta-sesion", () => ({
    PuertaSesion: ({ vista, nombrePagina }: { vista?: string; nombrePagina: string }) => (
        <div data-testid="puerta-sesion" data-vista={vista} data-pagina={nombrePagina} />
    ),
}));
vi.mock("@/components/ui/starseed-loader", () => ({ StarSeedLoader: () => <div data-testid="cargando-perfil" /> }));

import ProfilePage from "../../../app/(app)/profile/[username]/page";

const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

beforeEach(() => {
    sim.usuario = undefined;
    sim.user = null;
    sim.cargando = false;
    window.localStorage.clear();
});
afterEach(() => cleanup());

describe("/profile/[usuario] · la puerta solo es para el perfil propio", () => {
    it("/profile/me sin sesión pinta la puerta con la vista del perfil", () => {
        sim.usuario = "me";
        render(<ProfilePage />);
        const puerta = screen.getByTestId("puerta-sesion");
        expect(puerta).toHaveAttribute("data-vista", "perfil");
        expect(puerta).toHaveAttribute("data-pagina", "Tu perfil");
        expect(screen.queryByTestId("cargando-perfil")).toBeNull();
    });

    it("sin ningún usuario en la ruta el alias es «me»: también la puerta", () => {
        render(<ProfilePage />);
        expect(screen.getByTestId("puerta-sesion")).toBeInTheDocument();
    });

    it("mientras la cuenta aún se está cargando NO enseña la puerta (no parpadea a quien ya tiene sesión)", () => {
        sim.usuario = "me";
        sim.cargando = true;
        render(<ProfilePage />);
        expect(screen.queryByTestId("puerta-sesion")).toBeNull();
    });

    it("/profile/me con sesión no pinta la puerta", async () => {
        sim.usuario = "me";
        sim.user = { id: "u1" };
        render(<ProfilePage />);
        await waitFor(() => expect(screen.getByTestId("cargando-perfil")).toBeInTheDocument());
        expect(screen.queryByTestId("puerta-sesion")).toBeNull();
    });

    it("el perfil de OTRA persona es público: sin sesión tampoco hay puerta", async () => {
        sim.usuario = "ana";
        render(<ProfilePage />);
        await waitFor(() => expect(screen.getByTestId("cargando-perfil")).toBeInTheDocument());
        expect(screen.queryByTestId("puerta-sesion")).toBeNull();
    });
});
