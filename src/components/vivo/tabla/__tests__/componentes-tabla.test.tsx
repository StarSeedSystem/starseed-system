/**
 * Piezas sueltas de la tabla: cómo se pinta cada tipo de celda (y qué NO se enlaza), el editor
 * de columna con su fórmula validada en vivo, la barra de orden/filtros, el panel de compartir
 * y la lista de tablas.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { columnasCitables, compilarFormula, crearCalculadora } from "@/lib/vivo/tabla/formulas";
import { columnasVisibles, tablaVacia, type Ctx, type Tabla } from "@/lib/vivo/tabla/modelo";
import { anadirColumna, anadirFilasAlFinal, anadirOpcion, aplicarCeldas, establecerFormula } from "@/lib/vivo/tabla/operaciones";
import { VISTA_VACIA, type VistaTabla } from "@/lib/vivo/tabla/vista";

const invitar = vi.hoisted(() => vi.fn(async (_id: string, _u: string, _r: string) => true));
const quitar = vi.hoisted(() => vi.fn(async () => true));
const cambiarMeta = vi.hoisted(() => vi.fn(async () => true));
const editores = vi.hoisted(() => ({ lista: [] as { spaceId: string; account: string; role: "editor" | "viewer"; status: "member" | "invited" | "pending"; createdAt: string }[] }));
const espacios = vi.hoisted(() => ({ lista: [] as { refId: string; titulo: string; actualizado: string; esMio: boolean; pendiente: boolean }[] }));
const borrar = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/spaces/spaces", () => ({
    updateSpaceMeta: cambiarMeta,
    listSpaceEditors: async () => editores.lista,
    inviteToSpaceByUsername: invitar,
    removeSpaceEditor: quitar,
    deleteSpace: borrar,
    acceptSpaceInvite: async () => {},
}));
vi.mock("@/lib/social/os-profiles", () => ({
    fetchMyProfile: async () => null,
    fetchProfilesByIds: async (ids: string[]) =>
        Object.fromEntries(ids.map((u) => [u, { userId: u, username: `user_${u.slice(0, 4)}`, displayName: `Persona ${u.slice(0, 4)}` }])),
    searchUsers: async () => [],
}));
vi.mock("@/lib/vivo/tabla/espacio", () => ({
    miUid: async () => "11111111-1111-4111-8111-111111111111",
    instanciaId: () => "t",
    listarEspaciosVivos: async () => espacios.lista,
    crearEspacioVivo: async () => "nuevo",
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
    default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
        <a href={href} {...r}>
            {children}
        </a>
    ),
}));

import { BarraVista, type PanelVista } from "../barra-vista";
import { CeldaVista } from "../celda-vista";
import { EditorColumna } from "../editor-columna";
import { ListaTablas } from "../lista-tablas";
import { PanelCompartir } from "../panel-compartir";
import type { AccionesColumna } from "../tipos";

let n = 0;
const C = (): Ctx => ({ t: 1000 + n++, a: "ana000000000" });

function fixture() {
    let t = tablaVacia();
    const nom = anadirColumna(t, C(), { nombre: "Nombre", tipo: "texto" });
    t = nom.tabla;
    const precio = anadirColumna(t, C(), { nombre: "Precio", tipo: "numero" });
    t = precio.tabla;
    const cant = anadirColumna(t, C(), { nombre: "Cantidad", tipo: "numero" });
    t = cant.tabla;
    const total = anadirColumna(t, C(), { nombre: "Total", tipo: "calculado" });
    t = total.tabla;
    const url = anadirColumna(t, C(), { nombre: "Web", tipo: "enlace" });
    t = url.tabla;
    const est = anadirColumna(t, C(), { nombre: "Estado", tipo: "seleccion" });
    t = est.tabla;
    const op = anadirOpcion(t, est.colId!, "En curso", C());
    t = op.tabla;
    const ok = anadirColumna(t, C(), { nombre: "Hecho", tipo: "casilla" });
    t = ok.tabla;
    const f = anadirFilasAlFinal(t, 3, C());
    t = f.tabla;
    t = aplicarCeldas(
        t,
        [
            { filaId: f.filaIds[0], colId: precio.colId!, valor: 10 },
            { filaId: f.filaIds[0], colId: cant.colId!, valor: 0 },
            { filaId: f.filaIds[0], colId: url.colId!, valor: "https://starseed.example/a" },
            { filaId: f.filaIds[1], colId: url.colId!, valor: "javascript:alert(1)" },
            { filaId: f.filaIds[0], colId: est.colId!, valor: op.opcionId! },
            { filaId: f.filaIds[0], colId: ok.colId!, valor: true },
        ],
        C(),
    );
    const comp = compilarFormula("[Precio] / [Cantidad]", columnasCitables(t, total.colId!), total.colId!);
    if (!comp.ok) throw new Error(comp.error);
    t = establecerFormula(t, total.colId!, comp.almacenada, C());
    return { t, f: f.filaIds, c: { nom: nom.colId!, precio: precio.colId!, cant: cant.colId!, total: total.colId!, url: url.colId!, est: est.colId!, ok: ok.colId! } };
}

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
afterEach(() => {
    cleanup();
    invitar.mockClear();
    quitar.mockClear();
    cambiarMeta.mockClear();
    borrar.mockClear();
    push.mockClear();
    editores.lista = [];
    espacios.lista = [];
});

// ───────────────────────────── celdas ─────────────────────────────

describe("cada tipo de celda", () => {
    const perfil = () => undefined;
    function ver(colKey: keyof ReturnType<typeof fixture>["c"], fila = 0, extra: Partial<React.ComponentProps<typeof CeldaVista>> = {}) {
        const fx = fixture();
        const tabla: Tabla = fx.t;
        const col = tabla.columnas[fx.c[colKey]];
        return render(<CeldaVista tabla={tabla} col={col} filaId={fx.f[fila]} calc={crearCalculadora(tabla)} perfil={perfil} puedeEditar={false} {...extra} />);
    }

    test("un enlace http se abre en pestaña nueva sin pasar datos al destino", () => {
        ver("url", 0);
        const a = screen.getByRole("link");
        expect(a.getAttribute("href")).toBe("https://starseed.example/a");
        expect(a.getAttribute("target")).toBe("_blank");
        const rel = a.getAttribute("rel") ?? "";
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
    });

    test("un enlace javascript: se ve como texto y NO se puede pulsar", () => {
        ver("url", 1);
        expect(screen.queryByRole("link")).toBeNull();
        expect(document.body.innerHTML).not.toMatch(/href="javascript:/i);
    });

    test("en una tarjeta (dentro de algo pulsable) los enlaces se muestran como texto", () => {
        ver("url", 0, { dentroDeBoton: true });
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText(/starseed\.example/)).toBeTruthy();
    });

    test("en una tarjeta la casilla es solo un dibujo con etiqueta (no hay controles dentro de un botón)", () => {
        ver("ok", 0, { dentroDeBoton: true, puedeEditar: true });
        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByRole("img", { name: "Hecho: marcada" })).toBeTruthy();
    });

    test("selección: la opción con su nombre", () => {
        ver("est", 0);
        expect(screen.getByText("En curso")).toBeTruthy();
    });

    test("casilla: un interruptor accesible que avisa al pulsarlo (si se puede editar)", () => {
        const alternar = vi.fn();
        ver("ok", 0, { puedeEditar: true, alAlternar: alternar });
        const caja = screen.getByRole("checkbox");
        expect(caja.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(caja);
        expect(alternar).toHaveBeenCalledTimes(1);
    });

    test("casilla en solo lectura: no reacciona", () => {
        const alternar = vi.fn();
        ver("ok", 0, { puedeEditar: false, alAlternar: alternar });
        fireEvent.click(screen.getByRole("checkbox"));
        expect(alternar).not.toHaveBeenCalled();
    });

    test("calculado con división por cero: enseña el error, no «Infinity» ni una celda vacía", () => {
        ver("total", 0);
        expect(document.body.textContent).toMatch(/DIV|dividir|÷|#/i);
        expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
    });

    test("calculado sin datos en la fila: vacío", () => {
        ver("total", 2);
        expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
    });
});

// ───────────────────────────── editor de columna ─────────────────────────────

function accionesColumna() {
    return {
        renombrar: vi.fn(),
        cambiarTipo: vi.fn(),
        establecerFormula: vi.fn(),
        establecerTotal: vi.fn(),
        redimensionar: vi.fn(),
        mover: vi.fn(),
        borrar: vi.fn(),
        anadirOpcion: vi.fn(() => null),
        editarOpcion: vi.fn(),
        quitarOpcion: vi.fn(),
        moverOpcion: vi.fn(),
    };
}

describe("editor de columna", () => {
    function abrir(colKey: keyof ReturnType<typeof fixture>["c"], puedeEditar = true) {
        const fx = fixture();
        const a = accionesColumna();
        const cerrar = vi.fn();
        render(<EditorColumna tabla={fx.t} colId={fx.c[colKey]} puedeEditar={puedeEditar} lado="centro" acciones={a as unknown as AccionesColumna} alCerrar={cerrar} />);
        return { a, cerrar, fx };
    }

    test("renombrar guarda al salir del campo; un nombre vacío se descarta", () => {
        const { a, fx } = abrir("nom");
        const campo = screen.getByLabelText("Nombre") as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "Concepto" } });
        fireEvent.blur(campo);
        expect(a.renombrar).toHaveBeenCalledWith(fx.c.nom, "Concepto");
        fireEvent.change(campo, { target: { value: "   " } });
        fireEvent.blur(campo);
        expect(a.renombrar).toHaveBeenCalledTimes(1);
        expect(campo.value).toBe("Nombre");
    });

    test("una fórmula inválida enseña por qué y no se puede guardar", () => {
        const { a } = abrir("total");
        const campo = screen.getByLabelText("Escribe la fórmula") as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "EVAL([Precio])" } });
        expect(screen.getByRole("alert").textContent?.length).toBeGreaterThan(5);
        expect(campo.getAttribute("aria-invalid")).toBe("true");
        const boton = screen.getByRole("button", { name: "Guardar la fórmula" }) as HTMLButtonElement;
        expect(boton.disabled).toBe(true);
        fireEvent.keyDown(campo, { key: "Enter" });
        expect(a.establecerFormula).not.toHaveBeenCalled();
    });

    test("no se acepta código: constructor, funciones ajenas, cadenas ni acceso a propiedades", () => {
        const { a } = abrir("total");
        const campo = screen.getByLabelText("Escribe la fórmula") as HTMLInputElement;
        for (const malo of ["constructor", "alert(1)", "[Precio].x", "'a' + 1", "[Precio] ** 2", "window", "1; 2"]) {
            fireEvent.change(campo, { target: { value: malo } });
            const boton = screen.getByRole("button", { name: "Guardar la fórmula" }) as HTMLButtonElement;
            expect(boton.disabled, malo).toBe(true);
        }
        expect(a.establecerFormula).not.toHaveBeenCalled();
    });

    test("una fórmula válida se guarda en su forma estable (por id de columna)", () => {
        const { a, fx } = abrir("total");
        const campo = screen.getByLabelText("Escribe la fórmula") as HTMLInputElement;
        fireEvent.change(campo, { target: { value: "[Precio] * [Cantidad]" } });
        expect(screen.queryByRole("alert")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Guardar la fórmula" }));
        expect(a.establecerFormula).toHaveBeenCalledTimes(1);
        const [colId, almacenada] = a.establecerFormula.mock.calls[0] as unknown as [string, string];
        expect(colId).toBe(fx.c.total);
        expect(almacenada).toContain(fx.c.precio);
        expect(almacenada).toContain(fx.c.cant);
        expect(almacenada).not.toContain("Precio"); // renombrar la columna no rompe la fórmula
    });

    test("las funciones de columna entera (SUMA, PROMEDIO, MIN, MAX, CONTAR) son válidas", () => {
        const { a } = abrir("total");
        const campo = screen.getByLabelText("Escribe la fórmula") as HTMLInputElement;
        for (const f of ["SUMA([Precio])", "PROMEDIO([Precio])", "MIN([Precio])", "MAX([Precio])", "CONTAR([Precio])"]) {
            fireEvent.change(campo, { target: { value: f } });
            expect(screen.queryByRole("alert"), f).toBeNull();
        }
        expect(a.establecerFormula).not.toHaveBeenCalled();
    });

    test("insertar una columna con el botón pone su nombre entre corchetes", () => {
        abrir("total");
        fireEvent.click(screen.getByRole("button", { name: "[Precio]" }));
        expect((screen.getByLabelText("Escribe la fórmula") as HTMLInputElement).value).toContain("[Precio]");
    });

    test("eliminar pide confirmación, avisa de las fórmulas que la usan y solo entonces borra", () => {
        const { a, cerrar, fx } = abrir("precio");
        expect(screen.getByRole("note").textContent).toContain("Total");
        fireEvent.click(screen.getByRole("button", { name: /Eliminar la columna/ }));
        expect(a.borrar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /Sí, eliminar la columna/ }));
        expect(a.borrar).toHaveBeenCalledWith(fx.c.precio);
        expect(cerrar).toHaveBeenCalled();
    });

    test("en solo lectura no hay forma de cambiar nada", () => {
        abrir("total", false);
        expect((screen.getByLabelText("Nombre") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Tipo de dato") as HTMLSelectElement).disabled).toBe(true);
        expect(screen.queryByRole("button", { name: /Eliminar la columna/ })).toBeNull();
        expect(screen.queryByRole("button", { name: "Guardar la fórmula" })).toBeNull();
    });

    test("una columna de selección deja crear, renombrar y quitar opciones", () => {
        const { a, fx } = abrir("est");
        fireEvent.change(screen.getByLabelText("Nombre de la nueva opción"), { target: { value: "Hecho" } });
        fireEvent.click(screen.getByRole("button", { name: /Añadir opción/ }));
        expect(a.anadirOpcion).toHaveBeenCalledWith(fx.c.est, "Hecho");
        fireEvent.click(screen.getByRole("button", { name: "Quitar «En curso»" }));
        expect(a.quitarOpcion).toHaveBeenCalledTimes(1);
    });
});

// ───────────────────────────── orden y filtros ─────────────────────────────

describe("orden y filtros solo para mí", () => {
    function Contenedor({ inicial = VISTA_VACIA as VistaTabla, abierto = null as PanelVista, alCambiar }: { inicial?: VistaTabla; abierto?: PanelVista; alCambiar?: (v: VistaTabla) => void }) {
        const fx = fixture();
        const [vista, setVista] = useState<VistaTabla>(inicial);
        const [panel, setPanel] = useState<PanelVista>(abierto);
        return (
            <BarraVista
                columnas={columnasVisibles(fx.t)}
                vista={vista}
                alCambiar={(v) => {
                    setVista(v);
                    alCambiar?.(v);
                }}
                abierto={panel}
                setAbierto={setPanel}
                filaVisibles={2}
                filasTotal={3}
            />
        );
    }

    test("sin filtros solo cuenta las filas; con filtros dice que es solo para ti", () => {
        const { rerender } = render(<Contenedor />);
        expect(screen.getByRole("status").textContent).toBe("3 filas");
        rerender(<Contenedor inicial={{ orden: null, filtros: [{ col: "c_x", op: "vacio", valor: "" }] }} />);
        expect(screen.getByRole("status").textContent).toBe("3 filas"); // rerender conserva el estado interno: se comprueba abajo con un montaje nuevo
        cleanup();
        render(<Contenedor inicial={{ orden: null, filtros: [{ col: "c_x", op: "vacio", valor: "" }] }} />);
        expect(screen.getByRole("status").textContent).toContain("solo tú ves este orden y estos filtros");
        expect(screen.getByRole("status").textContent).toContain("Viendo 2 de 3");
    });

    test("elegir una columna para ordenar avisa con el orden nuevo", async () => {
        const cambios: VistaTabla[] = [];
        const user = userEvent.setup();
        render(<Contenedor alCambiar={(v) => cambios.push(v)} />);
        await user.click(screen.getByRole("button", { name: /Ordenar/ }));
        const selector = await screen.findByLabelText("Columna");
        const opcion = within(selector).getByRole("option", { name: "Precio" }) as HTMLOptionElement;
        fireEvent.change(selector, { target: { value: opcion.value } });
        expect(cambios.at(-1)?.orden).toEqual({ col: opcion.value, dir: "asc" });
    });

    test("añadir un filtro y quitarlo desde su chip", async () => {
        const cambios: VistaTabla[] = [];
        const user = userEvent.setup();
        render(<Contenedor alCambiar={(v) => cambios.push(v)} />);
        await user.click(screen.getByRole("button", { name: /Filtrar/ }));
        await user.click(await screen.findByRole("button", { name: /Añadir un filtro/ }));
        expect(cambios.at(-1)?.filtros).toHaveLength(1);
        await user.keyboard("{Escape}");
        const quitarChip = await screen.findByRole("button", { name: /Quitar el filtro de/ });
        await user.click(quitarChip);
        expect(cambios.at(-1)?.filtros).toHaveLength(0);
    });
});

// ───────────────────────────── compartir ─────────────────────────────

describe("compartir", () => {
    const DUENO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    function abrir(esDueno = true, acceso: string | null = "invite") {
        return render(
            <PanelCompartir abierto alCambiar={() => {}} espacioId="esp-1" esDueno={esDueno} duenoUid={DUENO} acceso={acceso} rutaPublica="/tabla/esp-1" nota="Nota honesta sobre la fusión." />,
        );
    }

    test("invita por @usuario con el rol elegido", async () => {
        const user = userEvent.setup();
        abrir();
        await user.type(screen.getByLabelText("Nombre de usuario"), "@marta");
        await user.click(screen.getByRole("radio", { name: "Solo puede mirar" }));
        await user.click(screen.getByRole("button", { name: /Enviar la invitación/ }));
        await waitFor(() => expect(invitar).toHaveBeenCalledWith("esp-1", "marta", "viewer"));
        expect((await screen.findByText(/Invitación enviada a @marta/)).textContent).toContain("@marta");
    });

    test("si no encuentra a la persona lo dice, en rojo y con un aviso accesible", async () => {
        invitar.mockResolvedValueOnce(false);
        const user = userEvent.setup();
        abrir();
        await user.type(screen.getByLabelText("Nombre de usuario"), "nadie");
        await user.click(screen.getByRole("button", { name: /Enviar la invitación/ }));
        expect((await screen.findByRole("alert")).textContent).toContain("No encontramos a @nadie");
    });

    test("quien no es dueño ve quién tiene acceso pero no puede invitar ni quitar", async () => {
        editores.lista = [{ spaceId: "esp-1", account: OTRA, role: "editor", status: "member", createdAt: "" }];
        abrir(false);
        expect(screen.queryByLabelText("Nombre de usuario")).toBeNull();
        expect(await screen.findByText(/Persona bbbb/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Quitar el acceso/ })).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
    });

    test("quitar acceso pide confirmar", async () => {
        editores.lista = [{ spaceId: "esp-1", account: OTRA, role: "viewer", status: "invited", createdAt: "" }];
        const user = userEvent.setup();
        abrir();
        expect(await screen.findByText(/aún no aceptó/)).toBeTruthy();
        await user.click(await screen.findByRole("button", { name: /Quitar el acceso de/ }));
        expect(quitar).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Sí, quitar" }));
        await waitFor(() => expect(quitar).toHaveBeenCalledWith("esp-1", OTRA));
    });

    test("el enlace público solo deja mirar y se explica con todas las letras", async () => {
        const user = userEvent.setup();
        abrir(true, "invite");
        const interruptor = screen.getByRole("switch");
        expect(interruptor.getAttribute("aria-checked")).toBe("false");
        expect(screen.getByText(/El enlace por sí solo no da acceso/)).toBeTruthy();
        await user.click(interruptor);
        await waitFor(() => expect(cambiarMeta).toHaveBeenCalledWith("esp-1", { access: "public" }));
        await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
        expect(screen.getByText(/puede mirar, sin editar/)).toBeTruthy();
    });

    test("la nota de cómo se combinan los cambios siempre está a la vista", () => {
        abrir();
        expect(screen.getByText("Nota honesta sobre la fusión.")).toBeTruthy();
    });
});

// ───────────────────────────── lista ─────────────────────────────

describe("lista de tablas", () => {
    test("sin tablas: invita a crear la primera", async () => {
        render(<ListaTablas />);
        expect(screen.getByText(/Buscando lo tuyo/)).toBeTruthy();
        expect(await screen.findByText(/Aún no tienes ninguna tabla/)).toBeTruthy();
        expect(screen.getByRole("button", { name: /Crear una tabla/ })).toBeTruthy();
    });

    test("distingue las mías, las compartidas y las invitaciones sin aceptar", async () => {
        espacios.lista = [
            { refId: "a", titulo: "Mis gastos", actualizado: "2026-09-28T10:00:00Z", esMio: true, pendiente: false },
            { refId: "b", titulo: "Inventario", actualizado: "2026-09-27T10:00:00Z", esMio: false, pendiente: false },
            { refId: "c", titulo: "Censo", actualizado: "2026-09-26T10:00:00Z", esMio: false, pendiente: true },
        ];
        render(<ListaTablas />);
        expect(await screen.findByText("Mis gastos")).toBeTruthy();
        expect(screen.getByText(/Tuya/)).toBeTruthy();
        expect(screen.getByText(/Compartida contigo/)).toBeTruthy();
        expect(screen.getByText(/Invitación sin aceptar/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Mis gastos" }).getAttribute("href")).toBe("/tabla/a");
        // solo la mía se puede eliminar
        expect(screen.getAllByRole("button", { name: /^Eliminar / })).toHaveLength(1);
    });

    test("eliminar pide confirmar y la quita de la lista", async () => {
        espacios.lista = [{ refId: "a", titulo: "Mis gastos", actualizado: "2026-09-28T10:00:00Z", esMio: true, pendiente: false }];
        const user = userEvent.setup();
        render(<ListaTablas />);
        await user.click(await screen.findByRole("button", { name: "Eliminar Mis gastos" }));
        expect(borrar).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: /Sí, eliminar/ }));
        await waitFor(() => expect(borrar).toHaveBeenCalledWith("a"));
        await waitFor(() => expect(screen.queryByText("Mis gastos")).toBeNull());
    });

    test("crear una tabla lleva a su ruta", async () => {
        const user = userEvent.setup();
        render(<ListaTablas />);
        await screen.findByText(/Aún no tienes ninguna tabla/);
        await user.type(screen.getByLabelText("Nombre"), "Censo");
        await user.click(screen.getByRole("button", { name: /Crear una tabla/ }));
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        expect(String(push.mock.calls[0][0])).toMatch(/^\/tabla\//);
    });
});
