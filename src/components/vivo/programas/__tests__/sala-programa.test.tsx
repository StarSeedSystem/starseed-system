/**
 * El programa en vivo de punta a punta con VARIAS personas a la vez (red y guardado falsos en
 * memoria, controladores reales): encuesta, lista compartida, contador, kanban, formulario,
 * edición de la estructura con permisos, solo lectura, plantilla inicial y texto hostil.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, waitFor, within, type BoundFunctions, type queries } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Controlador } from "@/lib/vivo/juegos/controlador";
import { docVacio } from "@/lib/vivo/juegos/registro";
import type { EstadoPrograma } from "@/lib/vivo/programas/tipos";
import { buscarMotorProgramas } from "@/lib/vivo/programas/motor";

const h = vi.hoisted(() => ({ cola: [] as unknown[] }));

vi.mock("@/lib/vivo/juegos/transporte-supabase", () => ({
    crearControladorSupabase: vi.fn(async () => h.cola.shift()),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { AlmacenFalso, RedFalsa, crearCliente } from "@/lib/vivo/__pruebas__/juego-red-falsa";
import { docProgramaDe } from "@/lib/vivo/__pruebas__/programa-utiles";
import { SalaPrograma } from "../sala-programa";

let red: RedFalsa;
let almacen: AlmacenFalso;

beforeEach(() => {
    red = new RedFalsa();
    almacen = new AlmacenFalso();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    h.cola.length = 0;
});

interface Sala {
    c: Controlador;
    q: BoundFunctions<typeof queries>;
    caja: HTMLElement;
}

async function abrir(uid: string, extra: Parameters<typeof crearCliente>[3] = {}): Promise<Sala> {
    const c = crearCliente(uid, red, almacen, { nombre: uid[0].toUpperCase() + uid.slice(1), tipoDoc: "programa", buscarMotor: buscarMotorProgramas, ...extra });
    h.cola.push(c);
    const { container } = render(<SalaPrograma spaceId="prog1" />);
    const q = within(container);
    await waitFor(() => expect(c.getSnapshot().fase).toBe("listo"));
    return { c, q, caja: container };
}

const entregar = () => act(async () => { red.entregarTodo(); await Promise.resolve(); });
const clic = (el: HTMLElement) => act(async () => { fireEvent.click(el); await Promise.resolve(); });
const escribir = (el: HTMLElement, valor: string) => act(async () => { fireEvent.change(el, { target: { value: valor } }); await Promise.resolve(); });
const estado = (c: Controlador) => c.getSnapshot().estado as EstadoPrograma;

describe("encuesta", () => {
    test("un voto se ve en todos al instante, se cambia, se retira y los resultados coinciden", async () => {
        almacen.doc = docProgramaDe("encuesta");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(ana.q.getByText("Nadie ha votado todavía")).toBeInTheDocument();

        await clic(beto.q.getByRole("radio", { name: /Viernes por la tarde/ }));
        await entregar();
        expect(beto.q.getByRole("radio", { name: /Viernes por la tarde: 1 voto, 100 por ciento, tu voto/ })).toHaveAttribute("aria-checked", "true");
        // Ana ve el voto de Beto pero no lo marca como suyo
        const enAna = ana.q.getByRole("radio", { name: /Viernes por la tarde: 1 voto, 100 por ciento$/ });
        expect(enAna).toHaveAttribute("aria-checked", "false");
        expect(ana.q.getByText("1 persona ha votado")).toBeInTheDocument();

        await clic(ana.q.getByRole("radio", { name: /Sábado por la mañana/ }));
        await entregar();
        expect(beto.q.getByText("2 personas han votado")).toBeInTheDocument();
        expect(beto.q.getByRole("radio", { name: /Sábado por la mañana: 1 voto, 50 por ciento/ })).toBeInTheDocument();

        // Beto cambia de opinión, y luego retira su voto
        await clic(beto.q.getByRole("radio", { name: /Domingo a mediodía/ }));
        await entregar();
        expect(ana.q.getByRole("radio", { name: /Domingo a mediodía: 1 voto/ })).toBeInTheDocument();
        expect(ana.q.getByRole("radio", { name: /Viernes por la tarde: 0 votos/ })).toBeInTheDocument();
        await clic(beto.q.getByRole("radio", { name: /Domingo a mediodía/ }));
        await entregar();
        expect(ana.q.getByText("1 persona ha votado")).toBeInTheDocument();
    });

    test("el creador cierra la votación: nadie más vota y se dice", async () => {
        almacen.doc = docProgramaDe("encuesta");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Editar programa" }));
        await clic(ana.q.getByRole("button", { name: "Cerrar la votación" }));
        await entregar();
        expect(beto.q.getByText("Cerrada")).toBeInTheDocument();
        for (const op of beto.q.getAllByRole("radio")) expect(op).toBeDisabled();
        // Beto no es el creador: no ve el botón de editar
        expect(beto.q.queryByRole("button", { name: "Editar programa" })).toBeNull();
    });
});

describe("lista compartida", () => {
    test("añadir, marcar (con quién) y quitar tareas entre dos personas", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(ana.q.getByText("0 de 3 hechas")).toBeInTheDocument();

        await escribir(beto.q.getByLabelText("Nueva tarea en «Por hacer»"), "Comprar hielo");
        await clic(beto.q.getByRole("button", { name: "Añadir" }));
        await entregar();
        expect(ana.q.getByText("Comprar hielo")).toBeInTheDocument();
        expect(ana.q.getByText("Añadida por Beto")).toBeInTheDocument();
        expect(ana.q.getByText("0 de 4 hechas")).toBeInTheDocument();

        await clic(ana.q.getByRole("checkbox", { name: "Marcar como hecha: Comprar hielo" }));
        await entregar();
        expect(beto.q.getByRole("checkbox", { name: "Desmarcar: Comprar hielo" })).toHaveAttribute("aria-checked", "true");
        expect(beto.q.getByText("Hecha por Ana")).toBeInTheDocument();
        expect(beto.q.getByRole("progressbar", { name: "Progreso de «Por hacer»" })).toHaveAttribute("aria-valuenow", "25");

        await clic(beto.q.getByRole("button", { name: "Quitar la tarea: Comprar hielo" }));
        await entregar();
        expect(ana.q.queryByText("Comprar hielo")).toBeNull();
        expect(ana.q.getByText("0 de 3 hechas")).toBeInTheDocument();
    });

    test("una tarea con aspecto de código se pinta como texto y nunca crea elementos", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        await escribir(ana.q.getByLabelText("Nueva tarea en «Por hacer»"), '<img src=x onerror=alert(1)><script>robar()</script>');
        await clic(ana.q.getByRole("button", { name: "Añadir" }));
        expect(ana.q.getByText('<img src=x onerror=alert(1)><script>robar()</script>')).toBeInTheDocument();
        expect(ana.caja.querySelector("script")).toBeNull();
        expect(ana.caja.querySelector("img")).toBeNull();
    });

    test("una acción imposible se explica sin romper nada (la tarea la borró otra persona)", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        // Beto ve las tres; Ana la quita a la vez que Beto la marca (sin entregar entre medias)
        await clic(ana.q.getByRole("button", { name: "Quitar la tarea: Traer bebidas" }));
        await clic(beto.q.getByRole("checkbox", { name: "Marcar como hecha: Traer bebidas" }));
        await entregar();
        await entregar();
        expect(estado(ana.c).datos.b2).toEqual(estado(beto.c).datos.b2);
    });
});

describe("contador", () => {
    test("un voto por persona: suma, se ve en todas, se retira; el contador libre suma entre varias", async () => {
        almacen.doc = docProgramaDe("contador-de-votos");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Sumar mi voto" }));
        await entregar();
        expect(ana.q.getByRole("button", { name: "Retirar mi voto" })).toBeInTheDocument();
        expect(beto.q.getByRole("button", { name: "Sumar mi voto" })).toBeInTheDocument();
        await clic(beto.q.getByRole("button", { name: "Sumar mi voto" }));
        await entregar();
        expect(ana.q.getByText("2 personas han aportado")).toBeInTheDocument();

        await clic(ana.q.getByRole("button", { name: "Sumar uno a «Rondas de café»" }));
        await clic(ana.q.getByRole("button", { name: "Sumar uno a «Rondas de café»" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Restar uno a «Rondas de café»" }));
        await entregar();
        const b3 = ana.q.getByRole("region", { name: "Rondas de café" });
        expect(within(b3).getByText("1")).toBeInTheDocument();
        expect(within(b3).getByText("rondas")).toBeInTheDocument();

        await clic(ana.q.getByRole("button", { name: "Retirar mi voto" }));
        await entregar();
        expect(beto.q.getByText("1 persona ha aportado")).toBeInTheDocument();
    });

    test("en el mínimo el botón de restar está desactivado y explica por qué", async () => {
        almacen.doc = docProgramaDe("contador-de-votos");
        const ana = await abrir("ana");
        const menos = ana.q.getByRole("button", { name: "Restar uno a «Rondas de café»" });
        expect(menos).toBeDisabled();
        expect(menos).toHaveAttribute("title", "Ya está en el mínimo.");
    });
});

describe("tablero kanban", () => {
    test("añadir tarjetas, moverlas con el menú y arrastrando; todos ven lo mismo", async () => {
        almacen.doc = docProgramaDe("tablero-kanban");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        const columna = (q: Sala["q"], nombre: string) => q.getByRole("region", { name: new RegExp(`^Columna ${nombre},`) });

        await escribir(ana.q.getByLabelText("Nueva tarjeta en «Hecho»"), "Publicar");
        await clic(ana.q.getByRole("button", { name: "Añadir la tarjeta a «Hecho»" }));
        await entregar();
        expect(within(columna(beto.q, "Hecho")).getByText("Publicar")).toBeInTheDocument();

        // con el menú: «Repartir tareas» (por hacer) → «En curso»
        const tarjeta = within(columna(beto.q, "Por hacer")).getByText("Repartir tareas").closest("li") as HTMLElement;
        await clic(within(tarjeta).getByRole("button", { name: "Mover" }));
        await clic(within(tarjeta).getByRole("button", { name: "Mover a «En curso»" }));
        await entregar();
        expect(within(columna(ana.q, "En curso")).getByText("Repartir tareas")).toBeInTheDocument();
        expect(within(columna(ana.q, "Por hacer")).queryByText("Repartir tareas")).toBeNull();

        // arrastrando: «Definir el objetivo» → «Hecho»
        const origen = within(columna(ana.q, "Por hacer")).getByText("Definir el objetivo").closest("li") as HTMLElement;
        const id = (estado(ana.c).datos.b1 as { tarjetas: { id: string; texto: string }[] }).tarjetas.find((t) => t.texto === "Definir el objetivo")!.id;
        const datos = { setData: vi.fn(), getData: () => id, effectAllowed: "", dropEffect: "" };
        await act(async () => {
            fireEvent.dragStart(origen, { dataTransfer: datos });
            fireEvent.dragOver(columna(ana.q, "Hecho"), { dataTransfer: datos });
            fireEvent.drop(columna(ana.q, "Hecho"), { dataTransfer: datos });
            await Promise.resolve();
        });
        await entregar();
        expect(within(columna(beto.q, "Hecho")).getByText("Definir el objetivo")).toBeInTheDocument();
        expect(JSON.stringify(estado(ana.c).datos)).toBe(JSON.stringify(estado(beto.c).datos));
    });

    test("editar el texto de una tarjeta y quitarla", async () => {
        almacen.doc = docProgramaDe("tablero-kanban");
        const ana = await abrir("ana");
        await clic(ana.q.getByRole("button", { name: "Editar la tarjeta: Repartir tareas" }));
        await escribir(ana.q.getByLabelText("Texto de la tarjeta"), "Repartir las tareas");
        await clic(ana.q.getByRole("button", { name: "Guardar el texto de la tarjeta" }));
        expect(ana.q.getByText("Repartir las tareas")).toBeInTheDocument();
        await clic(ana.q.getByRole("button", { name: "Quitar la tarjeta: Repartir las tareas" }));
        expect(ana.q.queryByText("Repartir las tareas")).toBeNull();
    });
});

describe("formulario de inscripción", () => {
    test("valida los campos, apunta a la persona, resta plazas para todas y deja retirarse", async () => {
        almacen.doc = docProgramaDe("formulario-de-inscripcion");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(beto.q.getByText("20 plazas libres")).toBeInTheDocument();

        // sin nombre ni consentimiento: se explica el primer fallo
        await clic(beto.q.getByRole("button", { name: "Apuntarme" }));
        expect(beto.q.getByRole("alert")).toHaveTextContent("Falta «Nombre».");
        await escribir(beto.q.getByLabelText("Nombre *"), "Beto Ruiz");
        await clic(beto.q.getByRole("button", { name: "Apuntarme" }));
        expect(beto.q.getByRole("alert")).toHaveTextContent("Elige una opción en «Turno».");
        await escribir(beto.q.getByLabelText("Turno *"), "Tarde");
        await clic(beto.q.getByRole("button", { name: "Apuntarme" }));
        expect(beto.q.getByRole("alert")).toHaveTextContent("Tienes que marcar «Acepto que el grupo vea mis respuestas».");
        await clic(beto.q.getByLabelText(/Acepto que el grupo vea mis respuestas/));
        await clic(beto.q.getByRole("button", { name: "Apuntarme" }));
        await entregar();

        expect(beto.q.getByText(/Ya estás apuntada\/o/)).toBeInTheDocument();
        expect(beto.q.getByText("19 plazas libres")).toBeInTheDocument();
        expect(ana.q.getByText("19 plazas libres")).toBeInTheDocument();
        const lista = ana.q.getByRole("list", { name: "Respuestas del grupo" });
        expect(within(lista).getByText("Beto")).toBeInTheDocument();
        expect(within(lista).getByText("Beto Ruiz")).toBeInTheDocument();
        expect(within(lista).getByText("Tarde")).toBeInTheDocument();
        expect(ana.q.getByText(/no pongas datos privados/)).toBeInTheDocument();

        // Ana (creadora) puede quitar la respuesta de otra persona; Beto puede retirar la suya
        expect(beto.q.queryByRole("button", { name: /Quitar la respuesta de/ })).toBeNull();
        await clic(beto.q.getByRole("button", { name: "Retirar mi respuesta" }));
        await entregar();
        expect(ana.q.getByText("20 plazas libres")).toBeInTheDocument();
        expect(ana.q.getByText("Todavía no se ha apuntado nadie.")).toBeInTheDocument();
    });

    test("la creadora quita la respuesta de otra persona", async () => {
        almacen.doc = docProgramaDe("formulario-de-inscripcion");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        await escribir(beto.q.getByLabelText("Nombre *"), "Beto");
        await escribir(beto.q.getByLabelText("Turno *"), "Mañana");
        await clic(beto.q.getByLabelText(/Acepto que el grupo vea mis respuestas/));
        await clic(beto.q.getByRole("button", { name: "Apuntarme" }));
        await entregar();
        await clic(ana.q.getByRole("button", { name: "Quitar la respuesta de Beto" }));
        await entregar();
        expect(beto.q.getByText("Todavía no se ha apuntado nadie.")).toBeInTheDocument();
        expect(beto.q.getByRole("button", { name: "Apuntarme" })).toBeInTheDocument();
    });
});

describe("editar la estructura", () => {
    test("la creadora añade un bloque de texto y lo ven todas; los demás no tienen controles hasta que lo abre", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(beto.q.queryByRole("button", { name: "Editar programa" })).toBeNull();

        await clic(ana.q.getByRole("button", { name: "Editar programa" }));
        await clic(ana.q.getByRole("button", { name: /^Texto/ }));
        await escribir(ana.q.getByRole("textbox", { name: "Texto" }), "Traed vuestra propia taza.");
        await clic(ana.q.getByRole("button", { name: "Añadir al programa" }));
        await entregar();
        expect(ana.q.getByText("Traed vuestra propia taza.")).toBeInTheDocument();
        expect(beto.q.getByText("Traed vuestra propia taza.")).toBeInTheDocument();

        // El editor valida con las reglas del motor y lo explica
        await clic(ana.q.getByRole("button", { name: /^Encuesta/ }));
        await clic(ana.q.getByRole("button", { name: "Añadir al programa" }));
        expect(ana.q.getByRole("alert")).toHaveTextContent(/al menos dos opciones/);
        await clic(ana.q.getByRole("button", { name: "Cancelar" }));

        // Abre el programa a cambios: ahora Beto también puede editar
        await clic(ana.q.getByRole("button", { name: /Cerrado: solo tú cambias los bloques/ }));
        await entregar();
        expect(beto.q.getByRole("button", { name: "Editar programa" })).toBeInTheDocument();
    });

    test("mover, editar y quitar un bloque (con confirmación)", async () => {
        almacen.doc = docProgramaDe("reunion");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Editar programa" }));

        await clic(ana.q.getByRole("button", { name: "Bajar el bloque Acuerdos y tareas" }));
        await entregar();
        expect(estado(beto.c).bloques.map((b) => b.id)).toEqual(["b1", "b2", "b4", "b3"]);

        await clic(ana.q.getByRole("button", { name: "Editar el bloque Acuerdos y tareas" }));
        await escribir(ana.q.getByRole("textbox", { name: "Título de la lista" }), "Compromisos");
        await clic(ana.q.getByRole("button", { name: "Guardar los cambios" }));
        await entregar();
        expect(beto.q.getByRole("region", { name: "Compromisos" })).toBeInTheDocument();

        await clic(ana.q.getByRole("button", { name: "Quitar el bloque Compromisos" }));
        expect(ana.q.getByRole("alertdialog")).toHaveTextContent(/¿Quitar este bloque/);
        await clic(ana.q.getByRole("button", { name: "Conservarlo" }));
        expect(ana.q.getByRole("region", { name: "Compromisos" })).toBeInTheDocument();
        await clic(ana.q.getByRole("button", { name: "Quitar el bloque Compromisos" }));
        await clic(ana.q.getByRole("button", { name: "Sí, quitar el bloque" }));
        await entregar();
        expect(beto.q.queryByRole("region", { name: "Compromisos" })).toBeNull();
    });

    test("cambiar el título del programa", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        const beto = await abrir("beto");
        expect(ana.q.getByRole("heading", { level: 1 })).toHaveTextContent("Lista compartida");
        await clic(ana.q.getByRole("button", { name: "Editar programa" }));
        await escribir(ana.q.getByRole("textbox", { name: "Título" }), "Cena del viernes");
        await clic(ana.q.getByRole("button", { name: "Guardar título y descripción" }));
        await entregar();
        expect(beto.q.getByRole("heading", { level: 1 })).toHaveTextContent("Cena del viernes");
    });
});

describe("permisos y estados", () => {
    test("solo lectura: se ve todo pero ningún control deja actuar y se dice por qué", async () => {
        almacen.doc = docProgramaDe("lista-compartida");
        const ana = await abrir("ana");
        await clic(ana.q.getByRole("checkbox", { name: "Marcar como hecha: Traer bebidas" }));
        const lola = await abrir("lola", { soloLectura: true });
        // (2026-10-05) La vista de solo lectura llega asíncrona: con la suite entera bajo carga
        // un `getByText` síncrono la buscaba antes de tiempo. Se espera (5 s, vitest.setup-dom.ts).
        expect(await lola.q.findByText(/solo para mirar/i)).toBeInTheDocument();
        expect(lola.q.getByText("Traer bebidas")).toBeInTheDocument();
        for (const c of lola.q.getAllByRole("checkbox")) expect(c).toBeDisabled();
        expect(lola.q.queryByLabelText("Nueva tarea en «Por hacer»")).toBeNull();
        expect(lola.q.queryByRole("button", { name: "Editar programa" })).toBeNull();
        expect(lola.q.getByText("Puedes mirar la lista, pero no cambiarla.")).toBeInTheDocument();
    });

    test("un programa sin plantilla ofrece elegirla; quien no puede editar solo lo ve", async () => {
        almacen.doc = docVacio("programa");
        const ana = await abrir("ana");
        expect(ana.q.getByText("¿Con qué empezamos?")).toBeInTheDocument();
        expect(ana.q.getAllByRole("radio")).toHaveLength(7);
        await clic(ana.q.getByRole("radio", { name: /Tablero kanban/ }));
        await clic(ana.q.getByRole("button", { name: "Empezar con esta plantilla" }));
        expect(ana.q.getByRole("region", { name: "Tareas del equipo" })).toBeInTheDocument();
        expect(estado(ana.c).creador).toBe("ana");

        almacen.doc = docVacio("programa");
        cleanup();
        const lola = await abrir("lola", { soloLectura: true });
        expect(lola.q.getByText(/Aún no se ha preparado este programa/)).toBeInTheDocument();
        expect(lola.q.queryByRole("button", { name: "Empezar con esta plantilla" })).toBeNull();
    });

    test("un espacio que no es un programa dice qué pasa y deja reintentar", async () => {
        almacen.doc = docVacio("juego");
        const c = crearCliente("ana", red, almacen, { tipoDoc: "programa", buscarMotor: buscarMotorProgramas });
        h.cola.push(c);
        const { container } = render(<SalaPrograma spaceId="prog1" />);
        await waitFor(() => expect(c.getSnapshot().fase).toBe("error"));
        const q = within(container);
        expect(q.getByRole("alert")).toHaveTextContent(/es un juego, no un programa/);
        expect(q.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    });

    test("la cabecera dice quién está y que hay conexión en vivo", async () => {
        almacen.doc = docProgramaDe("encuesta");
        const ana = await abrir("ana");
        await abrir("beto");
        await waitFor(() => expect(ana.q.getByText("En vivo")).toBeInTheDocument());
        expect(ana.q.getByRole("group", { name: "2 en la sala ahora" })).toBeInTheDocument();
        expect(ana.q.getByRole("link", { name: "Volver a los programas" })).toHaveAttribute("href", "/programa");
    });
});
