import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";

preparaDom();

const estado = vi.hoisted(() => ({ eventos: [] as Array<Record<string, unknown>>, fallback: false, asistencias: [] as string[] }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-os-entities", () => ({
    useOsEvents: () => ({ data: estado.eventos, loading: false, error: null, usingFallback: estado.fallback, refetch: () => undefined }),
}));
vi.mock("@/lib/os-social", () => ({
    realEventsOnly: (e: Array<{ isSample?: boolean }>) => e.filter((x) => !x.isSample),
    setAttendance: vi.fn(async (slug: string) => { estado.asistencias.push(slug); return { ok: true }; }),
}));

import { SocialRadarWidget, cuentaAtras, tipoDeEvento } from "../../social-radar-widget";

const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const evento = (slug: string, h: number, kind = "asamblea", extra: Record<string, unknown> = {}) => ({
    id: `id-${slug}`, slug, title: `Evento ${slug}`, kind, description: "", startsAt: en(h), location: "Plaza del Sol", organizerSlug: "", tags: [], attendeeCount: 4, ...extra,
});

beforeEach(() => { estado.eventos = []; estado.fallback = false; estado.asistencias = []; });
afterEach(() => cleanup());

describe("Radar Social · solo eventos reales", () => {
    it("piezas puras: tipo y cuenta atrás", () => {
        expect(tipoDeEvento("Taller de huerto")).toBe("taller");
        expect(cuentaAtras(Date.now() + 30 * 60_000, Date.now())).toBe("en 30 min");
        expect(cuentaAtras(Date.now() - 1000, Date.now())).toBe("ahora");
        const mediodia = new Date(2026, 8, 29, 12, 0).getTime();
        expect(cuentaAtras(mediodia + 3 * 3_600_000, mediodia)).toBe("en 3 h");
        expect(cuentaAtras(mediodia + 24 * 3_600_000, mediodia)).toBe("mañana 12:00");
        expect(cuentaAtras(mediodia + 4 * 24 * 3_600_000, mediodia)).toBe("en 4 días");
    });

    it("ignora el relleno y los eventos pasados", () => {
        estado.eventos = [evento("pasado", -30), evento("relleno", 5, "asamblea", { isSample: true })];
        render(<EnMarco clase="m"><SocialRadarWidget /></EnMarco>);
        expect(screen.getByTestId("marco-widget")).toHaveAttribute("data-estado", "vacio");
        expect(screen.getByRole("button", { name: "Convocar un evento" })).toBeInTheDocument();
    });

    it("s: el siguiente con su cuenta atrás", () => {
        estado.eventos = [evento("luna", 30), evento("sol", 2)];
        render(<EnMarco clase="s"><SocialRadarWidget /></EnMarco>);
        // «en 2 h» o «mañana HH:MM» según la hora a la que corra la prueba.
        expect(screen.getByRole("link", { name: /^Asamblea: Evento sol, (en 2 h|mañana \d\d:\d\d), en Plaza del Sol$/ })).toHaveAttribute("href", "/evento/sol");
    });

    it("l: radar + asistir de verdad", async () => {
        estado.eventos = [evento("sol", 2, "taller")];
        render(<EnMarco clase="l"><SocialRadarWidget /></EnMarco>);
        expect(screen.getByRole("img", { name: "1 eventos próximos en el radar" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Asistir a Evento sol" }));
        await waitFor(() => expect(estado.asistencias).toEqual(["sol"]));
        expect(await screen.findByText("Asistirás")).toBeInTheDocument();
    });

    it("panorámico: la franja de los próximos días", () => {
        estado.eventos = [evento("sol", 2)];
        render(<EnMarco clase="panoramico"><SocialRadarWidget /></EnMarco>);
        expect(screen.getByRole("list", { name: "Próximos eventos" })).toBeInTheDocument();
    });
});
