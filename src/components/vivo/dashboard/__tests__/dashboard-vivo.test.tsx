/**
 * El dashboard compartido montado: motor real sobre un «servidor» en memoria y `GridArea` de
 * mentira (la rejilla real es del dashboard personal y no se toca aquí). Se prueba lo que ESTA
 * página añade: qué widgets llegan a la rejilla, que un movimiento se guarda por widget, que lo
 * ajeno se mezcla sin pisar, el modo solo lectura, y el aviso honesto de qué se comparte.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const UID = "11111111-1111-4111-8111-111111111111";
const ID_ESPACIO = "33333333-3333-4333-8333-333333333333";

const mundo = vi.hoisted(() => ({
    espacio: null as null | { id: string; titulo: string; doc: Record<string, unknown>; rev: number; propietario: string; acceso: string },
    editar: true,
    leer: "ok" as string,
    suscriptores: new Set<(c: { rev: number; doc?: Record<string, unknown> | null }) => void>(),
    guardados: 0,
    presentes: [] as unknown[],
    toasts: [] as { title?: string; description?: string }[],
    creado: null as null | { vivo: string; titulo: string; doc: Record<string, unknown> },
    lista: [] as { refId: string; titulo: string; actualizado: string; esMio: boolean; pendiente: boolean }[],
    grid: { edit: false, widgets: [] as { id: string; widget_type: string; layout: { x: number; y: number; w: number; h: number; i: string }; settings?: Record<string, unknown>; size?: string }[] },
}));

vi.mock("@/lib/vivo/tabla/espacio", () => ({
    miUid: async () => "11111111-1111-4111-8111-111111111111",
    instanciaId: () => "test:1",
    leerEspacio: async () => {
        if (mundo.leer !== "ok" || !mundo.espacio) return { ok: false, motivo: mundo.leer === "ok" ? "no-encontrado" : mundo.leer };
        return { ok: true, espacio: { ...mundo.espacio } };
    },
    guardarEspacioCAS: async (_id: string, doc: Record<string, unknown>, rev: number) => {
        if (!mundo.espacio) return { ok: false, motivo: "desaparecido" };
        if (rev !== mundo.espacio.rev) return { ok: false, motivo: "conflicto" };
        mundo.espacio = { ...mundo.espacio, doc, rev: rev + 1 };
        mundo.guardados += 1;
        return { ok: true, espacio: { ...mundo.espacio } };
    },
    suscribirEspacio: (_id: string, cb: (c: { rev: number; doc?: Record<string, unknown> | null }) => void) => {
        mundo.suscriptores.add(cb);
        return () => mundo.suscriptores.delete(cb);
    },
    puedoEditarEspacio: async () => mundo.editar,
    crearEspacioVivo: async (vivo: string, titulo: string, doc: Record<string, unknown>) => {
        mundo.creado = { vivo, titulo, doc };
        return "nuevo-id";
    },
    listarEspaciosVivos: async () => mundo.lista,
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
vi.mock("@/components/ui/use-toast", () => ({
    toast: (t: { title?: string; description?: string }) => void mundo.toasts.push(t),
    useToast: () => ({ toast: () => {} }),
}));
vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
        <a href={href} {...r}>
            {children}
        </a>
    ),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../tabla/use-presencia", () => ({ usePresencia: () => ({ presentes: mundo.presentes, anunciar: () => {} }) }));
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    WeatherLocationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// La rejilla real vive en el dashboard personal: aquí se sustituye por una que enseña lo recibido
// y deja mover o borrar un widget como lo haría `GridArea` (entregando la lista completa).
vi.mock("@/components/dashboard/grid-area", () => ({
    GridArea: ({ widgets, setWidgets, isEditMode }: { widgets: typeof mundo.grid.widgets; setWidgets: (w: typeof mundo.grid.widgets) => void; isEditMode: boolean }) => {
        mundo.grid.edit = isEditMode;
        mundo.grid.widgets = widgets;
        return (
            <ul data-testid="rejilla" data-edicion={String(isEditMode)}>
                {widgets.map((w) => (
                    <li key={w.id} data-tipo={w.widget_type}>
                        <span>{`${w.widget_type} x=${w.layout.x} y=${w.layout.y}`}</span>
                        <button type="button" onClick={() => setWidgets(widgets.map((o) => (o.id === w.id ? { ...o, layout: { ...o.layout, x: o.layout.x + 1 } } : o)))}>
                            {`mover ${w.widget_type}`}
                        </button>
                        <button type="button" onClick={() => setWidgets(widgets.filter((o) => o.id !== w.id))}>
                            {`borrar ${w.widget_type}`}
                        </button>
                    </li>
                ))}
            </ul>
        );
    },
}));
vi.mock("@/components/dashboard/add-widget-dialog", () => ({
    AddWidgetDialog: ({ onAdd }: { onAdd: (t: string) => void }) => (
        <>
            <button type="button" onClick={() => onAdd("CLOCK_DATE")}>
                Añadir reloj
            </button>
            <button type="button" onClick={() => onAdd("AI_GENERATED")}>
                Añadir forjado
            </button>
        </>
    ),
}));

import { anadirWidget, dashboardVacio, docDashboard, normalizarDashboard, type DocDashboard } from "@/lib/vivo/dashboard";
import type { Ctx } from "@/lib/vivo/tabla/modelo";
import { DashboardVivo } from "../dashboard-vivo";
import { ListaDashboards } from "../lista-dashboards";

let n = 0;
const C = (): Ctx => ({ t: 1000 + n++, a: "ana000000000" });

function fixture(): { doc: DocDashboard; reloj: string; notas: string } {
    let d = dashboardVacio();
    const a = anadirWidget(d, { id: "reloj-0001", tipo: "CLOCK_DATE", pos: { x: 0, y: 0, w: 4, h: 3 }, size: "M", ajustes: { styleVariant: "cristal" } }, C());
    d = a.doc;
    const b = anadirWidget(d, { id: "notas-0001", tipo: "QUICK_NOTES", pos: { x: 4, y: 0, w: 4, h: 3 }, size: "M", ajustes: {} }, C());
    d = b.doc;
    return { doc: d, reloj: a.id!, notas: b.id! };
}

function prepararEspacio(opc: { editar?: boolean; doc?: Record<string, unknown> } = {}) {
    const f = fixture();
    mundo.espacio = { id: ID_ESPACIO, titulo: "Panel del barrio", doc: opc.doc ?? docDashboard(f.doc), rev: 1, propietario: UID, acceso: "invite" };
    mundo.editar = opc.editar ?? true;
    mundo.leer = "ok";
    return f;
}
const guardado = (): DocDashboard => normalizarDashboard((mundo.espacio!.doc as { dashboard: unknown }).dashboard);

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
    mundo.suscriptores.clear();
    mundo.guardados = 0;
    mundo.presentes = [];
    mundo.toasts.length = 0;
    mundo.creado = null;
    mundo.lista = [];
    mundo.grid.widgets = [];
    push.mockClear();
    try {
        localStorage.clear();
    } catch {
        /* sin almacenamiento */
    }
});
afterEach(cleanup);

describe("apertura", () => {
    test("pinta los widgets del documento y avisa con claridad de qué se comparte y qué no", async () => {
        prepararEspacio();
        render(<DashboardVivo id={ID_ESPACIO} />);
        expect(screen.getByRole("status").textContent).toContain("Abriendo el dashboard");
        const rejilla = await screen.findByTestId("rejilla");
        expect(within(rejilla).getByText("CLOCK_DATE x=0 y=0")).toBeTruthy();
        expect(within(rejilla).getByText("QUICK_NOTES x=4 y=0")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Panel del barrio");
        // la honestidad va SIEMPRE a la vista, no escondida en un menú
        const aviso = screen.getAllByRole("note")[0];
        expect(aviso.textContent).toContain("acomodo y la configuración");
        expect(aviso.textContent).toContain("no se comparten");
        expect(aviso.textContent).toContain("cada persona ve cada widget con lo suyo");
    });

    test("la configuración de un widget llega a la rejilla (estilo) sin código", async () => {
        prepararEspacio();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        const reloj = mundo.grid.widgets.find((w) => w.widget_type === "CLOCK_DATE")!;
        expect(reloj.settings).toEqual({ styleVariant: "cristal" });
        expect(reloj.size).toBe("M");
    });

    test("un widget forjado por IA (con HTML propio) que llegue en el documento NO se pinta", async () => {
        const f = fixture();
        const doc = docDashboard(f.doc) as { dashboard: { widgets: Record<string, unknown> } };
        doc.dashboard.widgets["ia-0000001"] = {
            id: "ia-0000001",
            tipo: "AI_GENERATED",
            creado: 5,
            pos: { v: { x: 0, y: 5, w: 4, h: 3 }, t: 5, a: "mal000000000" },
            tam: { v: null, t: 5, a: "mal000000000" },
            cfg: { v: { customHtml: "<script>alert(1)</script>" }, t: 5, a: "mal000000000" },
        };
        prepararEspacio({ doc: doc as unknown as Record<string, unknown> });
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        expect(mundo.grid.widgets.map((w) => w.widget_type).sort()).toEqual(["CLOCK_DATE", "QUICK_NOTES"]);
        expect(document.body.innerHTML).not.toContain("<script>alert");
    });

    test("un espacio que no es un dashboard da un mensaje claro", async () => {
        prepararEspacio({ doc: { vivo: "tabla", v: 1, tabla: {} } });
        render(<DashboardVivo id={ID_ESPACIO} />);
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("No se pudo abrir el dashboard");
        expect(alerta.textContent).toContain("no es un dashboard compartido");
        expect(within(alerta).getByRole("link", { name: /Ver mis dashboards compartidos/ }).getAttribute("href")).toBe("/dashboard-compartido");
    });
});

describe("edición", () => {
    test("por defecto se mira; «Editar el acomodo» activa la edición y muestra el selector de widgets", async () => {
        prepararEspacio();
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        const rejilla = await screen.findByTestId("rejilla");
        expect(rejilla.getAttribute("data-edicion")).toBe("false");
        expect(screen.queryByRole("button", { name: "Añadir reloj" })).toBeNull();
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        expect(screen.getByTestId("rejilla").getAttribute("data-edicion")).toBe("true");
        expect(screen.getByRole("button", { name: "Añadir reloj" })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: /Terminar de editar/ }));
        expect(screen.getByTestId("rejilla").getAttribute("data-edicion")).toBe("false");
    });

    test("mover un widget se guarda, una sola vez, y solo cambia ese widget", async () => {
        const f = prepararEspacio();
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        await user.click(screen.getByRole("button", { name: "mover CLOCK_DATE" }));
        expect(screen.getByText("CLOCK_DATE x=1 y=0")).toBeTruthy();
        expect(mundo.guardados).toBe(0); // se espera a que se calme la edición
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        const d = guardado();
        expect(d.widgets[f.reloj].pos.v.x).toBe(1);
        expect(d.widgets[f.notas].pos.v.x).toBe(4); // el otro, intacto
        expect(d.widgets[f.reloj].cfg.v).toEqual({ styleVariant: "cristal" });
    });

    test("añadir un widget lo guarda con su talla; un tipo que no se puede compartir se rechaza con un aviso", async () => {
        prepararEspacio();
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        await user.click(screen.getByRole("button", { name: "Añadir forjado" }));
        expect(mundo.toasts.at(-1)?.title).toBe("No se pudo añadir el widget");
        expect(mundo.grid.widgets).toHaveLength(2);
        await user.click(screen.getByRole("button", { name: "Añadir reloj" }));
        expect(mundo.toasts.at(-1)?.title).toBe("Widget añadido");
        expect(mundo.grid.widgets).toHaveLength(3);
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        const vivos = Object.values(guardado().widgets).filter((w) => !w.borrado?.v);
        expect(vivos).toHaveLength(3);
        expect(vivos.filter((w) => w.tipo === "CLOCK_DATE")).toHaveLength(2);
    });

    test("borrar un widget deja lápida: no desaparece del documento, se marca borrado", async () => {
        const f = prepararEspacio();
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        await user.click(screen.getByRole("button", { name: "borrar QUICK_NOTES" }));
        expect(screen.queryByText(/QUICK_NOTES/)).toBeNull();
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        expect(guardado().widgets[f.notas].borrado?.v).toBe(true);
        expect(guardado().widgets[f.reloj].borrado?.v).not.toBe(true);
    });
});

describe("otras personas", () => {
    test("un cambio ajeno en otro widget llega sin recargar y no pisa el tuyo", async () => {
        const f = prepararEspacio();
        const user = userEvent.setup();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        await user.click(await screen.findByRole("button", { name: /Editar el acomodo/ }));
        await user.click(screen.getByRole("button", { name: "mover CLOCK_DATE" })); // yo: el reloj
        // otra persona, a la vez: mueve las notas (partiendo del documento que ella conocía)
        const suyo = fixture();
        const ajeno: DocDashboard = { v: suyo.doc.v, widgets: { ...suyo.doc.widgets } };
        // mismo id que el de mi documento: reutilizamos el estado del servidor y le cambiamos la posición
        const base = normalizarDashboard((mundo.espacio!.doc as { dashboard: unknown }).dashboard);
        const notas = base.widgets[f.notas];
        ajeno.widgets = { ...base.widgets, [f.notas]: { ...notas, pos: { v: { ...notas.pos.v, y: 6 }, t: Date.now() + 9000, a: "bea000000000" } } };
        await act(async () => {
            for (const cb of [...mundo.suscriptores]) cb({ rev: 2, doc: docDashboard(ajeno) });
        });
        expect(await screen.findByText("QUICK_NOTES x=4 y=6")).toBeTruthy();
        expect(screen.getByText("CLOCK_DATE x=1 y=0")).toBeTruthy(); // lo mío sigue
    });

    test("si otra persona borra un widget, desaparece de mi pantalla", async () => {
        const f = prepararEspacio();
        render(<DashboardVivo id={ID_ESPACIO} />);
        await screen.findByTestId("rejilla");
        const base = normalizarDashboard((mundo.espacio!.doc as { dashboard: unknown }).dashboard);
        const ajeno: DocDashboard = { v: base.v, widgets: { ...base.widgets, [f.notas]: { ...base.widgets[f.notas], borrado: { v: true, t: Date.now() + 9000, a: "bea000000000" } } } };
        await act(async () => {
            for (const cb of [...mundo.suscriptores]) cb({ rev: 2, doc: docDashboard(ajeno) });
        });
        await waitFor(() => expect(screen.queryByText(/QUICK_NOTES/)).toBeNull());
        expect(screen.getByText("CLOCK_DATE x=0 y=0")).toBeTruthy();
    });
});

describe("solo lectura", () => {
    test("sin permiso: no hay edición, se explica y el estado dice «Solo lectura»", async () => {
        prepararEspacio({ editar: false });
        render(<DashboardVivo id={ID_ESPACIO} />);
        const rejilla = await screen.findByTestId("rejilla");
        expect(rejilla.getAttribute("data-edicion")).toBe("false");
        expect(screen.queryByRole("button", { name: /Editar el acomodo/ })).toBeNull();
        expect(screen.getByTestId("estado-guardado").textContent).toContain("Solo lectura");
        expect(screen.getAllByRole("note").map((x) => x.textContent).join(" ")).toContain("sin permiso para editarlo");
    });
});

describe("lista y creación", () => {
    test("crear un dashboard vacío", async () => {
        const user = userEvent.setup();
        render(<ListaDashboards />);
        await screen.findByText(/Aún no tienes ningún dashboard compartido/);
        expect(screen.queryByRole("checkbox")).toBeNull(); // sin dashboard personal no hay de dónde copiar
        await user.type(screen.getByLabelText("Nombre"), "Barrio");
        await user.click(screen.getByRole("button", { name: /Crear un dashboard compartido/ }));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard-compartido/nuevo-id"));
        expect(mundo.creado?.vivo).toBe("dashboard");
        expect(mundo.creado?.titulo).toBe("Barrio");
        expect(Object.keys((mundo.creado!.doc as { dashboard: DocDashboard }).dashboard.widgets)).toHaveLength(0);
    });

    test("«empezar con mi dashboard» copia el acomodo y solo el estilo: ni datos ni código ni widgets forjados", async () => {
        localStorage.setItem("starseed_dashboards", JSON.stringify([{ id: "d1", name: "Mi casa" }]));
        localStorage.setItem(
            "starseed_widgets",
            JSON.stringify({
                d1: [
                    { id: "w1", widget_type: "CLOCK_DATE", layout: { x: 0, y: 0, w: 4, h: 3, i: "w1" }, size: "M", settings: { styleVariant: "cristal", timezone: "Atlantic/Canary", notas: "secreto" } },
                    { id: "w2", widget_type: "AI_GENERATED", layout: { x: 4, y: 0, w: 4, h: 3, i: "w2" }, settings: { customHtml: "<script>x</script>" } },
                ],
            }),
        );
        const user = userEvent.setup();
        render(<ListaDashboards />);
        const casilla = await screen.findByRole("checkbox");
        expect(screen.getByText(/Empezar con el acomodo de «Mi casa»/)).toBeTruthy();
        expect(screen.getByText(/No copia tus datos ni nada que tenga código/)).toBeTruthy();
        await user.click(casilla);
        await user.click(screen.getByRole("button", { name: /Crear un dashboard compartido/ }));
        await waitFor(() => expect(mundo.creado).not.toBeNull());
        const ws = Object.values((mundo.creado!.doc as { dashboard: DocDashboard }).dashboard.widgets);
        expect(ws).toHaveLength(1);
        expect(ws[0].tipo).toBe("CLOCK_DATE");
        expect(ws[0].cfg.v).toEqual({ styleVariant: "cristal" }); // ni la zona horaria ni las notas
        expect(JSON.stringify(mundo.creado)).not.toMatch(/secreto|script/);
    });

    test("muestra las mías y las compartidas conmigo", async () => {
        mundo.lista = [
            { refId: "a", titulo: "Panel A", actualizado: "2026-09-28T10:00:00Z", esMio: true, pendiente: false },
            { refId: "b", titulo: "Panel B", actualizado: "2026-09-27T10:00:00Z", esMio: false, pendiente: false },
        ];
        render(<ListaDashboards />);
        expect(await screen.findByRole("link", { name: "Panel A" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Panel B" }).getAttribute("href")).toBe("/dashboard-compartido/b");
        expect(screen.getByText(/Compartida contigo/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Eliminar Panel A" }));
        expect(screen.getByRole("button", { name: /Sí, eliminar/ })).toBeTruthy();
    });
});
