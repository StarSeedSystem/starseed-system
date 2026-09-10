import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ════════════════════════════════════════════════════════════════
// Widgets sociales sin relleno (Ola 305 · zW4)
// ----------------------------------------------------------------
// Regla del proyecto: ningún dato falso se muestra como real. Estos
// tres widgets tenían publicaciones, obras y eventos de ejemplo que
// un usuario nuevo leía como contenido de verdad. Aquí se comprueba
// que sin fuente real enseñan el vacío honesto del marco común en
// vez de publicaciones, obras y eventos que nadie ha escrito.
// ════════════════════════════════════════════════════════════════

// jsdom no trae matchMedia y framer-motion lo consulta al medir la
// preferencia de movimiento reducido.
if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
        }),
    });
}

// ── Apariencia: los widgets la leen antes de decidir su estado. ──
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { animations: { enabled: false, hover: false } } }),
}));

// ── Supabase: `cafe_posts` responde sin filas (comunidad recién nacida). ──
vi.mock("@/utils/supabase/client", () => {
    interface Respuesta { data: unknown[]; error: unknown; count: number }
    interface Consulta extends PromiseLike<Respuesta> {
        select: () => Consulta;
        order: () => Consulta;
        limit: () => Consulta;
    }
    interface Canal { on: () => Canal; subscribe: () => Canal }

    const sinFilas: Respuesta = { data: [], error: null, count: 0 };
    function consulta(): Consulta {
        const espera = Promise.resolve(sinFilas);
        const c: Consulta = {
            select: () => c,
            order: () => c,
            limit: () => c,
            then: (alCumplir, alFallar) => espera.then(alCumplir, alFallar),
        };
        return c;
    }
    const canal: Canal = { on: () => canal, subscribe: () => canal };

    return {
        createClient: () => ({
            from: () => consulta(),
            channel: () => canal,
            removeChannel: () => undefined,
        }),
    };
});

// ── Eventos del OS: el hook sirve su relleno de ejemplo (`usingFallback`),
// que el widget NO debe enseñar como agenda real de la red. ──
vi.mock("@/hooks/use-os-entities", () => ({
    useOsEvents: () => ({
        data: [{
            id: "ev-relleno",
            slug: "asamblea-de-relleno",
            title: "Asamblea de relleno",
            kind: "asamblea",
            location: "Lugar inventado",
            startsAt: new Date(Date.now() + 86_400_000).toISOString(),
            attendeeCount: 42,
        }],
        loading: false,
        error: null,
        usingFallback: true,
        refetch: () => undefined,
    }),
}));

import { RelevantPostsWidget } from "../widgets/relevant-posts-widget";
import { CulturalFeedWidget } from "../widgets/cultural-feed-widget";
import { SocialRadarWidget } from "../widgets/social-radar-widget";

const marco = () => screen.getByTestId("marco-widget");

afterEach(() => {
    cleanup();
});

describe("Widgets sociales · vacío honesto en vez de contenido inventado", () => {
    it("Publicaciones Relevantes: sin filas en `cafe_posts` cae al vacío del marco común", async () => {
        render(<RelevantPostsWidget />);
        await waitFor(() => expect(marco()).toHaveAttribute("data-estado", "vacio"));
        // El texto sale del contrato común (`mensajeVacio("social")`).
        expect(screen.getByText("Aún no hay actividad en tu círculo")).toBeInTheDocument();
        expect(marco()).toHaveAttribute("aria-label", "Publicaciones Relevantes");
    });

    it("Corriente Cultural: sin obras reales no inventa creaciones", async () => {
        render(<CulturalFeedWidget />);
        await waitFor(() => expect(marco()).toHaveAttribute("data-estado", "vacio"));
        expect(screen.getByText("Todavía no hay nada que mostrar aquí")).toBeInTheDocument();
    });

    it("Radar Social: ignora el relleno del hook y enseña el vacío", () => {
        render(<SocialRadarWidget />);
        expect(marco()).toHaveAttribute("data-estado", "vacio");
        expect(screen.queryByText(/Asamblea de relleno/)).toBeNull();
        expect(screen.queryByText(/Lugar inventado/)).toBeNull();
    });
});


