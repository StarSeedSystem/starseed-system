/**
 * Composición con la `GridArea` REAL del dashboard personal (sin tocarla): se comprueba que la
 * página le entrega los widgets compartidos, que sus botones de edición llegan al documento
 * compartido y que «Fijar» nunca mete configuración ajena en HTML.
 * Solo se sustituye el registro de widgets (cientos de módulos pesados) y el contexto de aspecto.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const ID_ESPACIO = "44444444-4444-4444-8444-444444444444";
const mundo = vi.hoisted(() => ({
    espacio: null as null | { id: string; titulo: string; doc: Record<string, unknown>; rev: number; propietario: string; acceso: string },
    suscriptores: new Set<(c: { rev: number; doc?: Record<string, unknown> | null }) => void>(),
    guardados: 0,
}));

vi.mock("@/lib/vivo/tabla/espacio", () => ({
    miUid: async () => "11111111-1111-4111-8111-111111111111",
    instanciaId: () => "test:1",
    leerEspacio: async () => ({ ok: true, espacio: { ...mundo.espacio! } }),
    guardarEspacioCAS: async (_id: string, doc: Record<string, unknown>, rev: number) => {
        if (rev !== mundo.espacio!.rev) return { ok: false, motivo: "conflicto" };
        mundo.espacio = { ...mundo.espacio!, doc, rev: rev + 1 };
        mundo.guardados += 1;
        return { ok: true, espacio: { ...mundo.espacio } };
    },
    suscribirEspacio: (_id: string, cb: (c: { rev: number; doc?: Record<string, unknown> | null }) => void) => {
        mundo.suscriptores.add(cb);
        return () => mundo.suscriptores.delete(cb);
    },
    puedoEditarEspacio: async () => true,
    crearEspacioVivo: async () => "x",
    listarEspaciosVivos: async () => [],
}));
vi.mock("@/lib/social/os-profiles", () => ({ fetchMyProfile: async () => null, fetchProfilesByIds: async () => ({}), searchUsers: async () => [] }));
vi.mock("@/lib/spaces/spaces", () => ({
    updateSpaceMeta: vi.fn(async () => true),
    listSpaceEditors: vi.fn(async () => []),
    inviteToSpaceByUsername: vi.fn(async () => true),
    removeSpaceEditor: vi.fn(async () => true),
    deleteSpace: vi.fn(async () => true),
    acceptSpaceInvite: vi.fn(async () => {}),
}));
vi.mock("@/lib/widget-sync", () => ({ shareWidget: vi.fn(async () => ({ entityId: "e" })) }));
vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
        <a href={href} {...r}>
            {children}
        </a>
    ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../tabla/use-presencia", () => ({ usePresencia: () => ({ presentes: [], anunciar: () => {} }) }));
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    WeatherLocationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" } } }) }));
vi.mock("@/components/dashboard/widget-registry", () => ({
    WidgetRegistry: ({ widget }: { widget: { widget_type: string; settings?: { styleVariant?: string } } }) => (
        <div data-testid={`widget-${widget.widget_type}`}>{`contenido de ${widget.widget_type} ${widget.settings?.styleVariant ?? ""}`}</div>
    ),
}));
vi.mock("@/components/dashboard/kit/widget-config-popover", () => ({ WidgetConfigPopover: () => null }));
vi.mock("@/components/dashboard/add-widget-dialog", () => ({ AddWidgetDialog: () => null }));

import { anadirWidget, dashboardVacio, docDashboard, normalizarDashboard } from "@/lib/vivo/dashboard";
import type { Ctx } from "@/lib/vivo/tabla/modelo";
import { DashboardVivo } from "../dashboard-vivo";

let n = 0;
const C = (): Ctx => ({ t: 1000 + n++, a: "ana000000000" });

beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
    let d = dashboardVacio();
    d = anadirWidget(d, { id: "reloj-0001", tipo: "CLOCK_DATE", pos: { x: 0, y: 0, w: 4, h: 3 }, size: "M", ajustes: { styleVariant: "cristal", ontology: { title: "<img src=x onerror=alert(1)>" } } }, C()).doc;
    d = anadirWidget(d, { id: "notas-0001", tipo: "QUICK_NOTES", pos: { x: 4, y: 0, w: 4, h: 3 }, size: "M", ajustes: {} }, C()).doc;
    mundo.espacio = { id: ID_ESPACIO, titulo: "Real", doc: docDashboard(d), rev: 1, propietario: "11111111-1111-4111-8111-111111111111", acceso: "invite" };
    mundo.suscriptores.clear();
    mundo.guardados = 0;
    try {
        localStorage.clear();
    } catch {
        /* sin almacenamiento */
    }
});
afterEach(cleanup);

const guardado = () => normalizarDashboard((mundo.espacio!.doc as { dashboard: unknown }).dashboard);

describe("con la GridArea real", () => {
    test("pinta los widgets compartidos con su configuración", async () => {
        render(<DashboardVivo id={ID_ESPACIO} />);
        expect(await screen.findByTestId("widget-CLOCK_DATE")).toBeTruthy();
        expect(screen.getByTestId("widget-CLOCK_DATE").textContent).toBe("contenido de CLOCK_DATE cristal");
        expect(screen.getByTestId("widget-QUICK_NOTES")).toBeTruthy();
    });

    test("eliminar un widget desde su botón llega al documento compartido como lápida", async () => {
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("widget-CLOCK_DATE");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        const botones = await screen.findAllByRole("button", { name: "Eliminar el widget" });
        expect(botones).toHaveLength(2);
        await user.click(botones[0]);
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        const borrados = Object.values(guardado().widgets).filter((w) => w.borrado?.v);
        expect(borrados).toHaveLength(1);
        expect(screen.queryAllByRole("button", { name: "Eliminar el widget" })).toHaveLength(1);
    });

    test("bloquear un widget se comparte como configuración", async () => {
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("widget-CLOCK_DATE");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        const bloquear = await screen.findAllByRole("button", { name: /Bloquear el widget/ });
        await user.click(bloquear[0]);
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        const cfgs = Object.values(guardado().widgets).map((w) => w.cfg.v);
        expect(cfgs.some((c) => (c as { bloqueado?: boolean }).bloqueado === true)).toBe(true);
    });

    test("«Fijar» arma la ficha con una plantilla fija: nada de la configuración compartida entra en el HTML", async () => {
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("widget-CLOCK_DATE");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        const fijar = await screen.findAllByRole("button", { name: /Fijar el widget/ });
        await user.click(fijar[0]);
        const guardadas = JSON.parse(localStorage.getItem("starseed_pinned_widgets") ?? "[]") as { htmlCode: string; title: string }[];
        expect(guardadas).toHaveLength(1);
        expect(guardadas[0].htmlCode).toContain("CLOCK DATE");
        expect(guardadas[0].htmlCode).not.toMatch(/onerror|<img|alert/);
        expect(guardadas[0].title).not.toMatch(/[<>]/);
        // fijar dos veces no duplica
        await user.click(fijar[0]);
        expect(JSON.parse(localStorage.getItem("starseed_pinned_widgets") ?? "[]")).toHaveLength(1);
    });
});
