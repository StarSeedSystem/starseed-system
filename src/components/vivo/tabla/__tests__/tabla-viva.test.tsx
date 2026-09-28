/**
 * La tabla montada de punta a punta: motor de documento vivo real sobre un «servidor» en
 * memoria, con la rejilla, la barra, el guardado con espera y los cambios de otras personas.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { docTabla } from "@/lib/vivo/tabla";
import { filasVisibles, normalizarTabla, tablaVacia, valorCelda, type Ctx, type Tabla } from "@/lib/vivo/tabla/modelo";
import { anadirColumna, anadirFilasAlFinal, aplicarCeldas, establecerCelda, establecerTotal } from "@/lib/vivo/tabla/operaciones";

const UID = "11111111-1111-4111-8111-111111111111";

const mundo = vi.hoisted(() => ({
    espacio: null as null | { id: string; titulo: string; doc: Record<string, unknown>; rev: number; propietario: string; acceso: string },
    editar: true,
    leer: "ok" as string,
    suscriptores: new Set<(c: { rev: number; doc?: Record<string, unknown> | null; titulo?: string }) => void>(),
    toasts: [] as { title?: string; description?: string }[],
    descargas: [] as unknown[][],
    presentes: [] as unknown[],
    movil: false,
    guardados: 0,
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
    crearEspacioVivo: async () => "nuevo",
    listarEspaciosVivos: async () => [],
}));
vi.mock("@/lib/social/os-profiles", () => ({
    fetchMyProfile: async () => null,
    fetchProfilesByIds: async () => ({}),
    searchUsers: async () => [],
}));
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../use-presencia", () => ({ usePresencia: () => ({ presentes: mundo.presentes, anunciar: () => {} }) }));
vi.mock("../use-media", () => ({ useEsMovil: () => mundo.movil, useMediaQuery: () => mundo.movil }));
vi.mock("../importar-exportar", async (orig) => ({
    ...(await orig<typeof import("../importar-exportar")>()),
    descargarTexto: (...a: unknown[]) => void mundo.descargas.push(a),
}));

import { TablaViva } from "../tabla-viva";

let n = 0;
const C = (): Ctx => ({ t: 1000 + n++, a: "ana000000000" });
const ID_ESPACIO = "22222222-2222-4222-8222-222222222222";

function fixture() {
    let t = tablaVacia();
    const nom = anadirColumna(t, C(), { nombre: "Nombre", tipo: "texto" });
    t = nom.tabla;
    const imp = anadirColumna(t, C(), { nombre: "Importe", tipo: "numero" });
    t = imp.tabla;
    t = establecerTotal(t, imp.colId!, "suma", C());
    const f = anadirFilasAlFinal(t, 3, C());
    t = aplicarCeldas(
        f.tabla,
        [
            { filaId: f.filaIds[0], colId: nom.colId!, valor: "Alquiler" },
            { filaId: f.filaIds[0], colId: imp.colId!, valor: 800 },
            { filaId: f.filaIds[1], colId: nom.colId!, valor: "Luz" },
            { filaId: f.filaIds[1], colId: imp.colId!, valor: 60.5 },
            { filaId: f.filaIds[2], colId: nom.colId!, valor: "Agua" },
            { filaId: f.filaIds[2], colId: imp.colId!, valor: 25 },
        ],
        C(),
    );
    return { t, nom: nom.colId!, imp: imp.colId!, filas: f.filaIds };
}

function prepararEspacio(opc: { editar?: boolean; leer?: string } = {}) {
    const f = fixture();
    mundo.espacio = { id: ID_ESPACIO, titulo: "Presupuesto", doc: docTabla(f.t), rev: 1, propietario: UID, acceso: "invite" };
    mundo.editar = opc.editar ?? true;
    mundo.leer = opc.leer ?? "ok";
    return f;
}

function tablaGuardada(): Tabla {
    return normalizarTabla((mundo.espacio!.doc as { tabla: unknown }).tabla);
}

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
    mundo.suscriptores.clear();
    mundo.toasts.length = 0;
    mundo.descargas.length = 0;
    mundo.presentes = [];
    mundo.movil = false;
    mundo.guardados = 0;
    try {
        localStorage.clear();
    } catch {
        /* sin almacenamiento */
    }
});
afterEach(cleanup);

describe("apertura", () => {
    test("muestra «Abriendo…» y después la tabla, con título y estado", async () => {
        prepararEspacio();
        render(<TablaViva id={ID_ESPACIO} />);
        expect(screen.getByRole("status").textContent).toContain("Abriendo la tabla");
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        expect(within(grid).getByText("Alquiler")).toBeTruthy();
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Presupuesto");
        expect(screen.getByTestId("estado-guardado").textContent).toContain("Guardado");
        expect(screen.getByRole("button", { name: /Añadir fila/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Compartir/ })).toBeTruthy();
    });

    test("un espacio que no existe da un mensaje claro en español y una salida", async () => {
        prepararEspacio({ leer: "no-encontrado" });
        render(<TablaViva id={ID_ESPACIO} />);
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("No se pudo abrir la tabla");
        expect(alerta.textContent).toContain("No encontramos este espacio");
        expect(within(alerta).getByRole("link", { name: "Ver mis tablas" }).getAttribute("href")).toBe("/tabla");
    });

    test("sin red: dice que no pudo conectar (no se queda cargando para siempre)", async () => {
        prepararEspacio({ leer: "red" });
        render(<TablaViva id={ID_ESPACIO} />);
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("No pudimos conectar");
    });

    test("un espacio que es de otro tipo no se abre como tabla", async () => {
        prepararEspacio();
        mundo.espacio!.doc = { vivo: "dashboard", v: 1, dashboard: { v: 1, widgets: {} } };
        render(<TablaViva id={ID_ESPACIO} />);
        const alerta = await screen.findByRole("alert");
        expect(alerta.textContent).toContain("no es una tabla de datos");
    });
});

describe("edición y guardado", () => {
    test("«Añadir fila» añade la fila y la guarda una sola vez, con espera", async () => {
        prepararEspacio();
        const user = userEvent.setup();
        render(<TablaViva id={ID_ESPACIO} />);
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        expect(grid.getAttribute("aria-rowcount")).toBe("4");
        await user.click(screen.getByRole("button", { name: /Añadir fila/ }));
        expect(screen.getByRole("grid", { name: "Tabla de datos" }).getAttribute("aria-rowcount")).toBe("5");
        expect(screen.getByTestId("estado-guardado").textContent).toMatch(/sin guardar|Guardando/);
        // Nada se ha enviado todavía: el guardado espera a que se calme la escritura (≥ 600 ms).
        expect(mundo.guardados).toBe(0);
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        expect(filasVisibles(tablaGuardada())).toHaveLength(4);
        await waitFor(() => expect(screen.getByTestId("estado-guardado").textContent).toContain("Guardado"), { timeout: 3000 });
        expect(mundo.guardados).toBe(1);
    });

    test("editar una celda con el teclado guarda solo ese cambio", async () => {
        const f = prepararEspacio();
        render(<TablaViva id={ID_ESPACIO} />);
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "Enter" });
        const input = within(grid).getByRole("textbox") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "Alquiler piso" } });
        fireEvent.keyDown(input, { key: "Enter" });
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        const t = tablaGuardada();
        expect(valorCelda(t, f.filas[0], f.nom)).toBe("Alquiler piso");
        expect(valorCelda(t, f.filas[1], f.nom)).toBe("Luz"); // lo demás, intacto
    });

    test("un valor que no encaja (texto en una columna numérica) avisa y no cambia la celda", async () => {
        const f = prepararEspacio();
        render(<TablaViva id={ID_ESPACIO} />);
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        grid.focus();
        fireEvent.keyDown(grid, { key: "ArrowDown" });
        fireEvent.keyDown(grid, { key: "ArrowRight" });
        fireEvent.keyDown(grid, { key: "Enter" });
        const input = within(grid).getByRole("textbox") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "muchísimo" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(mundo.toasts.some((t) => /no es un número/.test(t.description ?? ""))).toBe(true);
        expect(mundo.guardados).toBe(0);
        expect(within(grid).getByText("800")).toBeTruthy();
        expect(f.filas).toHaveLength(3);
    });
});

describe("otras personas", () => {
    test("un cambio ajeno de otra celda aparece sin recargar y no pisa lo que ya estaba", async () => {
        const f = prepararEspacio();
        render(<TablaViva id={ID_ESPACIO} />);
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        expect(within(grid).queryByText("Alquiler piso")).toBeNull();
        const ajeno = establecerCelda(f.t, f.filas[0], f.nom, "Alquiler piso", { t: Date.now() + 5000, a: "bea000000000" });
        await act(async () => {
            for (const cb of [...mundo.suscriptores]) cb({ rev: 2, doc: docTabla(ajeno) });
        });
        expect(await screen.findByText("Alquiler piso")).toBeTruthy();
        expect(within(grid).getByText("Luz")).toBeTruthy();
    });

    test("quién está dentro se ve en la barra (una persona con dos pestañas cuenta una vez)", async () => {
        prepararEspacio();
        mundo.presentes = [
            { clave: "k1", uid: "u-2", nombre: "Marta", color: "#10B981", fila: null, col: null, editando: false },
            { clave: "k2", uid: "u-2", nombre: "Marta", color: "#10B981", fila: null, col: null, editando: false },
        ];
        render(<TablaViva id={ID_ESPACIO} />);
        await screen.findByRole("grid", { name: "Tabla de datos" });
        const grupo = screen.getByRole("group", { name: /1 persona más aquí/ });
        expect(grupo).toBeTruthy();
    });
});

describe("solo lectura", () => {
    test("sin permiso: se explica, no hay botones de edición y el estado dice «Solo lectura»", async () => {
        prepararEspacio({ editar: false });
        render(<TablaViva id={ID_ESPACIO} />);
        await screen.findByRole("grid", { name: "Tabla de datos" });
        expect(screen.queryByRole("button", { name: /Añadir fila/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Añadir columna/ })).toBeNull();
        expect(screen.getByTestId("estado-guardado").textContent).toContain("Solo lectura");
        expect(screen.getByRole("note").textContent).toContain("sin permiso para editarla");
        expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    });
});

describe("exportar e importar", () => {
    test("exportar CSV entrega el archivo con los datos", async () => {
        prepararEspacio();
        const user = userEvent.setup();
        render(<TablaViva id={ID_ESPACIO} />);
        await screen.findByRole("grid", { name: "Tabla de datos" });
        await user.click(screen.getByRole("button", { name: "Más opciones" }));
        await user.click(await screen.findByRole("menuitem", { name: /Exportar como CSV$/ }));
        expect(mundo.descargas).toHaveLength(1);
        const [nombre, texto, tipo, bom] = mundo.descargas[0] as [string, string, string, boolean];
        expect(nombre).toBe("Presupuesto.csv");
        expect(tipo).toBe("text/csv");
        expect(bom).toBe(false);
        expect(texto).toContain("Nombre,Importe");
        expect(texto).toContain("Alquiler,800");
        expect(texto).toContain("Luz,60.5");
    });

    test("exportar para Excel usa punto y coma, coma decimal y marca UTF-8", async () => {
        prepararEspacio();
        const user = userEvent.setup();
        render(<TablaViva id={ID_ESPACIO} />);
        await screen.findByRole("grid", { name: "Tabla de datos" });
        await user.click(screen.getByRole("button", { name: "Más opciones" }));
        await user.click(await screen.findByRole("menuitem", { name: /CSV para Excel/ }));
        const [, texto, , bom] = mundo.descargas[0] as [string, string, string, boolean];
        expect(bom).toBe(true);
        expect(texto).toContain("Nombre;Importe");
        expect(texto).toContain("Luz;60,5");
    });

    test("importar un CSV añade las filas y cuenta lo hecho", async () => {
        prepararEspacio();
        render(<TablaViva id={ID_ESPACIO} />);
        const grid = await screen.findByRole("grid", { name: "Tabla de datos" });
        const input = screen.getByLabelText("Elegir un archivo CSV para importar") as HTMLInputElement;
        const archivo = new File(["Nombre,Importe\nGas,40\nInternet,30\n"], "gastos.csv", { type: "text/csv" });
        fireEvent.change(input, { target: { files: [archivo] } });
        const dialogo = await screen.findByRole("dialog");
        expect(dialogo.textContent).toContain("Importación terminada");
        expect(dialogo.textContent).toContain("añadieron 2 filas");
        // el diálogo oculta el resto a los lectores de pantalla, por eso `hidden`
        expect(screen.getByRole("grid", { name: "Tabla de datos", hidden: true }).getAttribute("aria-rowcount")).toBe("6");
        expect(grid).toBeTruthy();
    });
});

describe("móvil", () => {
    test("una tarjeta por fila y una hoja para editar los campos", async () => {
        const f = prepararEspacio();
        mundo.movil = true;
        render(<TablaViva id={ID_ESPACIO} />);
        const lista = await screen.findByRole("list", { name: "Filas de la tabla" });
        expect(screen.queryByRole("grid")).toBeNull();
        expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
        const tarjeta = within(lista).getByRole("button", { name: /Abrir la fila 1: Alquiler/ });
        fireEvent.click(tarjeta);
        const hoja = await screen.findByRole("dialog");
        expect(hoja.textContent).toContain("Fila 1 de 3");
        const campo = within(hoja).getByLabelText("Importe") as HTMLInputElement;
        expect(campo.value).toBe("800");
        fireEvent.change(campo, { target: { value: "820" } });
        fireEvent.blur(campo);
        await waitFor(() => expect(mundo.guardados).toBe(1), { timeout: 5000 });
        expect(valorCelda(tablaGuardada(), f.filas[0], f.imp)).toBe(820);
    });

    test("«Añadir fila» en el móvil crea la fila y abre su hoja", async () => {
        prepararEspacio();
        mundo.movil = true;
        const user = userEvent.setup();
        render(<TablaViva id={ID_ESPACIO} />);
        await screen.findByRole("list", { name: "Filas de la tabla" });
        await user.click(screen.getByRole("button", { name: /Añadir fila/ }));
        const hoja = await screen.findByRole("dialog");
        expect(hoja.textContent).toContain("Fila 4 de 4");
    });
});
