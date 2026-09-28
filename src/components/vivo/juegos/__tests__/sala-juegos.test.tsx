/**
 * La sala de juegos de punta a punta con VARIAS personas a la vez (red y guardado falsos en
 * memoria, controladores reales): vestíbulo, sentarse, jugar, ver la jugada del otro, ganar,
 * revancha, permisos de solo lectura y el Dibujo-adivina con árbitro, chat y marcador.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, waitFor, within, type BoundFunctions, type queries } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Controlador } from "@/lib/vivo/juegos/controlador";
import type { EstadoMesa } from "@/lib/vivo/juegos/mesa";

const h = vi.hoisted(() => ({ cola: [] as unknown[] }));

vi.mock("@/lib/vivo/juegos/transporte-supabase", () => ({
    crearControladorSupabase: vi.fn(async () => h.cola.shift()),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { INSTANTANEA_VACIA } from "@/lib/vivo/juegos/controlador";
import { AlmacenFalso, RedFalsa, crearCliente, docInicial } from "@/lib/vivo/__pruebas__/juego-red-falsa";
import { SalaJuegos } from "../sala-juegos";

let red: RedFalsa;
let almacen: AlmacenFalso;

beforeEach(() => {
    red = new RedFalsa();
    almacen = new AlmacenFalso();
    almacen.doc = docInicial("juego");
    // jsdom no implementa canvas: un contexto de mentira basta para que el lienzo no proteste.
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never);
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
    const c = crearCliente(uid, red, almacen, { nombre: uid[0].toUpperCase() + uid.slice(1), ...extra });
    h.cola.push(c);
    const { container } = render(<SalaJuegos spaceId="sala1" />);
    const q = within(container);
    await waitFor(() => expect(container.querySelector('[aria-label="Abriendo la sala…"], header')).not.toBeNull());
    await waitFor(() => expect(c.getSnapshot().fase).toBe("listo"));
    return { c, q, caja: container };
}

const entregar = () => act(async () => { red.entregarTodo(); await Promise.resolve(); });
const clic = (el: HTMLElement) => act(async () => { fireEvent.click(el); await Promise.resolve(); });
const mesa = (c: Controlador) => c.getSnapshot().estado as EstadoMesa;

async function elegirJuego(sala: Sala, juego: string) {
    await clic(sala.q.getByRole("radio", { name: new RegExp(juego) }));
    await clic(sala.q.getByRole("button", { name: "Empezar con este juego" }));
    await waitFor(() => expect(almacen.escrituras).toBeGreaterThan(0));
}

describe("tres en raya entre dos personas", () => {
    test("vestíbulo, sentarse, jugar hasta ganar, ver el resultado y la revancha", async () => {
        const ana = await abrir("ana");
        expect(ana.q.getByText("¿A qué jugáis?")).toBeInTheDocument();
        await elegirJuego(ana, "Tres en raya");
        const beto = await abrir("beto");
        expect(beto.q.getByRole("grid", { name: "Tablero de tres en raya" })).toBeInTheDocument();

        await clic(ana.q.getByRole("button", { name: "Sentarme con X" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Sentarme con O" }));
        await entregar();
        expect(mesa(ana.c).iniciada).toBe(true);
        expect(ana.q.getByText("Te toca a ti (X)")).toBeInTheDocument();
        expect(beto.q.getByText(/Turno de Ana \(X\)/)).toBeInTheDocument();

        // Beto no puede jugar en el turno de Ana
        for (const celda of beto.q.getAllByRole("gridcell")) expect(celda).toBeDisabled();

        const jugar = async (quien: Sala, casilla: string) => {
            await clic(quien.q.getByRole("gridcell", { name: `${casilla}, vacía` }));
            await entregar();
        };
        await jugar(ana, "Casilla arriba a la izquierda");
        expect(beto.q.getByRole("gridcell", { name: "Casilla arriba a la izquierda, marca X" })).toBeInTheDocument();
        await jugar(beto, "Casilla en medio a la izquierda");
        await jugar(ana, "Casilla arriba en el centro");
        await jugar(beto, "Casilla en medio en el centro");
        await jugar(ana, "Casilla arriba a la derecha");

        expect(mesa(ana.c).fin).toMatchObject({ tipo: "victoria", ganador: 0 });
        expect(ana.q.getByText("¡Has ganado!")).toBeInTheDocument();
        expect(beto.q.getByText("Has perdido esta vez")).toBeInTheDocument();
        expect(ana.q.getAllByText("Tres en raya").length).toBeGreaterThanOrEqual(2); // subtítulo y motivo

        await clic(beto.q.getByRole("button", { name: "Revancha (cambiando de bando)" }));
        await entregar();
        expect(mesa(beto.c).asientos.map((a) => a?.uid)).toEqual(["beto", "ana"]);
        expect(mesa(ana.c).iniciada).toBe(true);
        expect(beto.q.getByText("Te toca a ti (X)")).toBeInTheDocument();
        expect(ana.q.getByText(/Turno de Beto \(X\)/)).toBeInTheDocument();
        // la partida anterior queda en el historial de las dos
        expect(ana.q.getByText("Partidas anteriores")).toBeInTheDocument();
    });

    test("quien solo tiene permiso de lectura ve la partida pero no puede jugar ni sentarse", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Tres en raya");
        await clic(ana.q.getByRole("button", { name: "Sentarme con X" }));
        await entregar();
        const lector = await abrir("lola", { soloLectura: true });
        expect(lector.q.getByText(/solo para mirar/i)).toBeInTheDocument();
        expect(lector.q.queryByRole("button", { name: /Sentarme/ })).toBeNull();
        for (const celda of lector.q.getAllByRole("gridcell")) expect(celda).toBeDisabled();
        expect(lector.q.queryByRole("button", { name: "Cambiar de juego" })).toBeNull();
    });

    test("quien llega tarde reconstruye la partida en curso desde el diario guardado", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Tres en raya");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Sentarme con X" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Sentarme con O" }));
        await entregar();
        await clic(ana.q.getByRole("gridcell", { name: "Casilla en medio en el centro, vacía" }));
        await entregar();
        await act(async () => { ana.c.vaciarCola(); beto.c.vaciarCola(); await new Promise((r) => setTimeout(r, 120)); });
        const tarde = await abrir("carla");
        expect(tarde.q.getByRole("gridcell", { name: "Casilla en medio en el centro, marca X" })).toBeInTheDocument();
        expect(tarde.q.getByText(/Turno de Beto \(O\)/)).toBeInTheDocument();
    });
});

describe("ajedrez", () => {
    test("jugar una jugada con clics, verla en el otro tablero, con el tablero girado para las negras", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Ajedrez");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Sentarme con Blancas" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Sentarme con Negras" }));
        await entregar();

        const casilla = (s: Sala, n: string) => s.q.getByRole("button", { name: new RegExp(`^${n},`) });
        await clic(casilla(ana, "e2"));
        await clic(casilla(ana, "e4"));
        await entregar();

        expect(casilla(beto, "e4")).toHaveAccessibleName("e4, peón blanco");
        expect(casilla(beto, "e2")).toHaveAccessibleName("e2, vacía");
        expect(beto.q.getByText("Te toca a ti (Negras)")).toBeInTheDocument();
        expect(beto.q.getByRole("list", { name: "Lista de jugadas" })).toHaveTextContent("e4");
        // Beto solo tiene negras: el tablero se le presenta con las negras abajo
        const botonesBeto = beto.q.getAllByRole("button").filter((b) => /^[a-h][1-8],/.test(b.getAttribute("aria-label") ?? ""));
        expect(botonesBeto[0]).toHaveAccessibleName(/^h1,/);
        // y una jugada ilegal (pieza blanca) no se puede ni seleccionar
        await clic(casilla(beto, "e4"));
        expect(casilla(beto, "e4")).toHaveAttribute("aria-pressed", "false");
    });

    test("rendirse pide confirmación y da la victoria al rival", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Ajedrez");
        const beto = await abrir("beto");
        await clic(ana.q.getByRole("button", { name: "Sentarme con Blancas" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Sentarme con Negras" }));
        await entregar();
        await clic(beto.q.getByRole("button", { name: "Rendirme" }));
        expect(mesa(beto.c).fin).toBeNull(); // aún no: pide confirmar
        await clic(beto.q.getByRole("button", { name: "Sí, rendirme" }));
        await entregar();
        expect(mesa(ana.c).fin).toMatchObject({ tipo: "rendicion", ganador: 0 });
        expect(ana.q.getByText("¡Has ganado!")).toBeInTheDocument();
    });
});

describe("Dibujo-adivina", () => {
    test("elegir palabra, adivinar con veredicto del dibujante, marcador del grupo y fin de ronda", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Dibujo-adivina");
        const beto = await abrir("beto");
        const carla = await abrir("carla");
        for (const s of [ana, beto, carla]) {
            await clic(s.q.getByRole("button", { name: "Sentarme a jugar" }));
            await entregar();
        }
        expect(mesa(ana.c).asientos.filter(Boolean)).toHaveLength(3);
        await clic(ana.q.getByRole("button", { name: "Empezar la partida" }));
        await entregar();

        // Ana dibuja: ve tres palabras; las demás ven que está eligiendo
        expect(beto.q.getByText(/Ana está eligiendo palabra/)).toBeInTheDocument();
        const opciones = ana.q.getAllByRole("button").filter((b) => b.className.includes("palabraOpcion"));
        expect(opciones).toHaveLength(3);
        const palabra = opciones[0].textContent ?? "";
        await clic(opciones[0]);
        await entregar();
        expect(ana.q.getByText(palabra)).toBeInTheDocument();
        const letras = palabra.replace(/[^a-záéíóúüñ]/gi, "").length;
        expect(beto.q.getByRole("img", { name: `La palabra tiene ${letras} letras` })).toBeInTheDocument();
        // nadie que adivina ve la palabra
        expect(beto.caja.textContent).not.toContain(palabra);

        const escribir = async (s: Sala, texto: string) => {
            const entrada = s.q.getByLabelText("Escribe tu intento");
            await act(async () => { fireEvent.change(entrada, { target: { value: texto } }); });
            await clic(s.q.getByRole("button", { name: "Enviar" }));
            await entregar(); // intento → dibujante
            await entregar(); // veredicto → todos
        };

        await escribir(beto, "zzzz");
        await waitFor(() => expect(carla.q.getByText("zzzz")).toBeInTheDocument());
        expect(beto.q.getByText("zzzz")).toBeInTheDocument();

        await escribir(beto, palabra);
        await entregar();
        await waitFor(() => expect(carla.q.getByText(/Beto ha acertado/)).toBeInTheDocument());
        // la palabra acertada NUNCA se enseña en el chat de los demás
        expect(carla.caja.textContent).not.toContain(`Beto${palabra}`);
        expect(mesa(ana.c).tablero).toMatchObject({ aciertos: [expect.objectContaining({ seat: 1 })] });
        expect(beto.q.getByLabelText("Escribe tu intento")).toBeDisabled(); // ya acertó

        await escribir(carla, palabra);
        await entregar();
        await waitFor(() => expect(mesa(ana.c).tablero).toMatchObject({ fase: "revelada" }), { timeout: 5000 });
        await entregar();
        expect(mesa(carla.c).tablero).toMatchObject({ fase: "revelada", palabra, anulada: false });
        expect(carla.q.getByText("La palabra era")).toBeInTheDocument();
        expect(carla.q.getAllByText(palabra).length).toBeGreaterThan(0);
        // marcador del grupo: aciertos + dibujante + bonus de todos
        const t = mesa(ana.c).tablero as { puntos: number[] };
        expect(t.puntos.every((p) => p > 0)).toBe(true);
        expect(ana.q.getByText(String(t.puntos.reduce((a, b) => a + b, 0)))).toBeInTheDocument();
    }, 15_000);

    test("el lienzo de quien dibuja llega a quien mira por difusión", async () => {
        const ana = await abrir("ana");
        await elegirJuego(ana, "Dibujo-adivina");
        const beto = await abrir("beto");
        for (const s of [ana, beto]) {
            await clic(s.q.getByRole("button", { name: "Sentarme a jugar" }));
            await entregar();
        }
        await clic(ana.q.getByRole("button", { name: "Empezar la partida" }));
        await entregar();
        const opcion = ana.q.getAllByRole("button").find((b) => b.className.includes("palabraOpcion"))!;
        await clic(opcion);
        await entregar();

        const recibidos: unknown[] = [];
        beto.c.alEfimero("lienzo", (m) => recibidos.push(m));
        const canvas = ana.q.getByRole("img", { name: /Lienzo: dibuja aquí/ });
        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 750, right: 1000, bottom: 750, x: 0, y: 0, toJSON: () => ({}) });
        const puntero = (tipo: string, x: number, y: number) => fireEvent(canvas, new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y }));
        await act(async () => {
            puntero("pointerdown", 100, 100);
            puntero("pointermove", 300, 300);
            puntero("pointermove", 500, 200);
            puntero("pointerup", 500, 200);
        });
        await entregar();
        expect(recibidos.length).toBeGreaterThan(0);
        expect(recibidos[0]).toMatchObject({ rev: 1, l: [{ i: 0, o: 0 }] });
    });
});

describe("estabilidad", () => {
    test("la instantánea vacía es siempre el mismo objeto y la sala no entra en bucle al abrirse", async () => {
        expect(INSTANTANEA_VACIA).toBe(INSTANTANEA_VACIA);
        const errores = vi.spyOn(console, "error").mockImplementation(() => {});
        const ana = await abrir("ana");
        await elegirJuego(ana, "Conecta 4");
        const antes = ana.c.getSnapshot();
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(ana.c.getSnapshot()).toBe(antes); // sin cambios, misma instantánea
        const llamadas = errores.mock.calls.map((c) => String(c[0]));
        expect(llamadas.filter((m) => /Maximum update depth|getSnapshot should be cached/.test(m))).toEqual([]);
    });
});
