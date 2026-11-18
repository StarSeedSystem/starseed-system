import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl } from "../tipos";

const TODAS = ["atras", "inicio", "recientes", "notificaciones", "ajustes-rapidos", "bloquear", "captura", "menu-energia"];

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    const p: PropsVentanaControl = {
        nombre: "Tableta de Alex",
        modo: "pagina",
        estado: "en-vivo",
        flujo: null,
        pantalla: { ancho: 1000, alto: 2000, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 10, teclas: TODAS, volumen: true, brillo: true, texto: true },
        aparato: { volumen: { multimedia: 0.4, timbre: 0.8 }, brillo: 0.6, bateria: 0.87, cargando: true, red: { wifi: true, datos: false, bluetooth: true } },
        latenciaMs: 42,
        fps: 29.6,
        alEnviar: (e) => env.push(e),
        alCerrar: vi.fn(),
        ...extra,
    };
    return { p, env };
}

/** jsdom no mide nada: la pantalla es una caja de 400×800 en (0,0) y la imagen la llena. */
function medir() {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON() {} });
}

beforeEach(() => {
    olvidarLugarVentana();
    medir();
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 20) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const pantalla = () => screen.getByTestId("ventana-control-pantalla");
const esperarFotograma = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

describe("VEN1115L · controles según capacidades", () => {
    it("con todo: botones, cuatro volúmenes, brillo y texto", () => {
        render(<VentanaControl {...props().p} />);
        for (const n of ["Atrás", "Inicio", "Recientes", "Notificaciones", "Ajustes rápidos", "Bloquear", "Captura", "Menú de encendido"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
        for (const f of ["multimedia", "llamada", "timbre", "alarma"]) expect(screen.getByRole("slider", { name: `Volumen de ${f}` })).toBeTruthy();
        expect(screen.getByRole("slider", { name: "Brillo" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Texto para escribir en el aparato" })).toBeTruthy();
    });

    it("sin capacidades no sale ninguno, y solo salen las teclas que el aparato tiene", () => {
        const { p } = props({ capacidades: { gestos: false, maxDedos: 0, teclas: ["inicio", "captura"], volumen: false, brillo: false, texto: false } });
        render(<VentanaControl {...p} />);
        expect(screen.getByRole("button", { name: "Inicio" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Captura" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Atrás" })).toBeNull();
        expect(screen.queryAllByRole("slider")).toHaveLength(0);
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("sin ninguna capacidad lo dice", () => {
        render(<VentanaControl {...props({ capacidades: { gestos: false, maxDedos: 0, teclas: [], volumen: false, brillo: false, texto: false } }).p} />);
        expect(screen.getByText("Este aparato no ofrece mandos.")).toBeTruthy();
    });

    it("en nivel ver no hay mandos, dice «Solo mirar» y el puntero no envía nada", () => {
        const { p, env } = props({ nivel: "ver" });
        render(<VentanaControl {...p} />);
        expect(screen.queryByTestId("ventana-control-mandos")).toBeNull();
        expect(screen.getByTestId("ventana-control-solo-ver").textContent).toBe("Solo mirar");
        fireEvent.pointerDown(pantalla(), { pointerId: 1, clientX: 200, clientY: 400, button: 0 });
        fireEvent.pointerUp(pantalla(), { pointerId: 1, clientX: 200, clientY: 400 });
        expect(env).toEqual([]);
    });

    it("el volumen del aparato se ve; sin dato dice «sin dato»", () => {
        render(<VentanaControl {...props().p} />);
        expect(screen.getByRole("slider", { name: "Volumen de multimedia" }).getAttribute("aria-valuetext")).toBe("40 %");
        expect(screen.getByRole("slider", { name: "Volumen de llamada" }).getAttribute("aria-valuetext")).toBe("sin dato");
    });

    it("los botones y los deslizadores envían sus órdenes", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Recientes" }));
        fireEvent.change(screen.getByRole("slider", { name: "Volumen de alarma" }), { target: { value: "0.3" } });
        fireEvent.change(screen.getByRole("slider", { name: "Brillo" }), { target: { value: "0.9" } });
        expect(env).toEqual([{ tipo: "tecla", cual: "recientes" }, { tipo: "volumen", flujo: "alarma", nivel: 0.3 }, { tipo: "brillo", nivel: 0.9 }]);
    });

    it("la fila de estado dice lo que se sabe y «—» lo que no", () => {
        const { p } = props();
        const { unmount } = render(<VentanaControl {...p} />);
        const t = screen.getByTestId("ventana-control-estado-aparato").textContent ?? "";
        expect(t).toContain("87 %");
        expect(t).toContain("Latencia: 42 ms");
        expect(t).toContain("Cuadros/s: 30");
        unmount();
        render(<VentanaControl {...props({ aparato: null, latenciaMs: undefined, fps: undefined }).p} />);
        expect(screen.getByTestId("ventana-control-estado-aparato").textContent).toContain("Batería: —");
    });
});

describe("VEN1115L · texto en trozos", () => {
    it("manda lo escrito en trozos de 512 y vacía la caja", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        const caja = screen.getByRole("textbox", { name: "Texto para escribir en el aparato" }) as HTMLInputElement;
        fireEvent.change(caja, { target: { value: "x".repeat(1100) } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar texto" }));
        expect(env.map((e) => (e.tipo === "texto" ? e.texto.length : -1))).toEqual([512, 512, 76]);
        expect(caja.value).toBe("");
    });
    it("vacío no envía", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "Enviar texto" }));
        expect(env).toEqual([]);
    });
});

describe("VEN1115L · teclado", () => {
    it("Escape es atrás; otras teclas no salen", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        const raiz = screen.getByTestId("ventana-control");
        fireEvent.keyDown(raiz, { key: "a" });
        fireEvent.keyDown(raiz, { key: "Enter" });
        fireEvent.keyDown(raiz, { key: "ArrowLeft" });
        expect(env).toEqual([]);
        fireEvent.keyDown(raiz, { key: "Escape" });
        expect(env).toEqual([{ tipo: "tecla", cual: "atras" }]);
    });
    it("Escape no hace nada en pausa local ni sin la tecla", () => {
        const a = props({ estado: "pausa-local" });
        render(<VentanaControl {...a.p} />);
        fireEvent.keyDown(screen.getByTestId("ventana-control"), { key: "Escape" });
        expect(a.env).toEqual([]);
        cleanup();
        const b = props({ capacidades: { gestos: true, maxDedos: 10, teclas: ["inicio"], volumen: false, brillo: false, texto: false } });
        render(<VentanaControl {...b.p} />);
        fireEvent.keyDown(screen.getByTestId("ventana-control"), { key: "Escape" });
        expect(b.env).toEqual([]);
    });
});

describe("VEN1115L · puntero → dedos, de punta a punta", () => {
    it("ratón: pulsar, mover, soltar con coordenadas 0..1", async () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 600 });
        fireEvent.pointerMove(pantalla(), { pointerId: 1, pointerType: "mouse", clientX: 200, clientY: 400 });
        await esperarFotograma();
        fireEvent.pointerUp(pantalla(), { pointerId: 1, pointerType: "mouse", clientX: 200, clientY: 400 });
        const g = env.filter((e) => e.tipo === "gesto") as Extract<EntradaControl, { tipo: "gesto" }>[];
        expect(g[0].sigue).toBe(true);
        expect(g[0].dedos[0].puntos[0].slice(0, 2)).toEqual([0.25, 0.75]);
        expect(g[0].dedos[0].puntos[1].slice(0, 2)).toEqual([0.5, 0.5]);
        expect(g.at(-1)!.sigue).toBe(false);
    });

    it("el botón derecho del ratón no apoya ningún dedo", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "mouse", button: 2, clientX: 100, clientY: 100 });
        expect(env).toEqual([]);
    });

    it("pantalla táctil: dos dedos con id propio", async () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 11, pointerType: "touch", clientX: 100, clientY: 100 });
        fireEvent.pointerDown(pantalla(), { pointerId: 12, pointerType: "touch", clientX: 300, clientY: 700 });
        await esperarFotograma();
        const g = env[0] as Extract<EntradaControl, { tipo: "gesto" }>;
        expect(g.dedos.map((d) => d.id)).toEqual([0, 1]);
    });

    it("puntero perdido (lostpointercapture) termina el dedo", () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
        fireEvent.lostPointerCapture(pantalla(), { pointerId: 1 });
        expect((env.at(-1) as Extract<EntradaControl, { tipo: "gesto" }>).sigue).toBe(false);
    });

    it("pointercancel, desenfoque de la ventana y cierre (desmontar) terminan los dedos", () => {
        for (const como of ["cancel", "blur", "desmontar"] as const) {
            const { p, env } = props();
            const r = render(<VentanaControl {...p} />);
            fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
            if (como === "cancel") fireEvent.pointerCancel(pantalla(), { pointerId: 1 });
            else if (como === "blur") act(() => { window.dispatchEvent(new Event("blur")); });
            else r.unmount();
            expect((env.at(-1) as Extract<EntradaControl, { tipo: "gesto" }>).sigue, como).toBe(false);
            cleanup();
        }
    });

    it("salir de la imagen acota el punto y acaba el trazo", () => {
        const { p, env } = props({ pantalla: { ancho: 1000, alto: 1000, giro: 0 } }); // cuadrada en caja 400×800: bandas arriba y abajo
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 400 });
        fireEvent.pointerMove(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 200, clientY: 10 }); // en la banda negra
        const f = env.at(-1) as Extract<EntradaControl, { tipo: "gesto" }>;
        expect(f.sigue).toBe(false);
        expect(f.dedos[0].puntos.at(-1)!.slice(0, 2)).toEqual([0.5, 0]);
        fireEvent.pointerDown(pantalla(), { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 5 }); // apoyar en la banda no hace nada
        expect(env.at(-1)).toBe(f);
    });

    it("con giro 90 el punto se corrige al cuadro del aparato", () => {
        const { p, env } = props({ pantalla: { ancho: 800, alto: 400, giro: 90 } }); // se ve de 400×800, llena la caja
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 600 }); // u=.25 v=.75
        fireEvent.pointerUp(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 600 });
        const g = env[0] as Extract<EntradaControl, { tipo: "gesto" }>;
        expect(g.dedos[0].puntos[0].slice(0, 2)).toEqual([0.75, 0.75]);
    });

    it("la rueda es un desplazamiento de un dedo y Ctrl+rueda un pellizco", async () => {
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        fireEvent.wheel(pantalla(), { clientX: 200, clientY: 400, deltaY: 100 });
        await esperarFotograma();
        let g = env[0] as Extract<EntradaControl, { tipo: "gesto" }>;
        expect(g.dedos).toHaveLength(1);
        expect(g.dedos[0].puntos.at(-1)![1]).toBeLessThan(0.5); // rueda abajo = dedo hacia arriba
        await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
        env.length = 0;
        fireEvent.wheel(pantalla(), { clientX: 200, clientY: 400, deltaY: -20, ctrlKey: true });
        await esperarFotograma();
        g = env[0] as Extract<EntradaControl, { tipo: "gesto" }>;
        expect(g.dedos).toHaveLength(2);
    });

    it("sin estar en vivo la ventana no envía gestos y dice por qué", () => {
        const { p, env } = props({ estado: "pausa-local", motivo: "toque en esa neurona" });
        render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
        expect(env).toEqual([]);
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toContain("toque en esa neurona");
    });

    it("pasar de en vivo a pausa levanta los dedos apoyados", () => {
        const { p, env } = props();
        const r = render(<VentanaControl {...p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 });
        r.rerender(<VentanaControl {...p} estado="pausa-local" />);
        expect((env.at(-1) as Extract<EntradaControl, { tipo: "gesto" }>).sigue).toBe(false);
    });
});

describe("VEN1115L · estados dichos con palabras", () => {
    it.each([
        ["conectando", "Conectando con Tableta de Alex"],
        ["sin-pantalla", "no enseña su pantalla"],
        ["cerrada", "Sesión cerrada"],
    ] as const)("%s", (estado, texto) => {
        render(<VentanaControl {...props({ estado, motivo: "x" }).p} />);
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toContain(texto);
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toContain("x");
    });
    it("en vivo sin imagen aún dice que espera", () => {
        render(<VentanaControl {...props().p} />);
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toContain("Esperando la imagen");
    });
});

describe("VEN1115L · modo flotante", () => {
    beforeEach(() => {
        vi.stubGlobal("innerWidth", 1280);
        vi.stubGlobal("innerHeight", 800);
    });
    it("es un diálogo con nombre, se reduce a pastilla y vuelve", () => {
        render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        expect(screen.getByRole("dialog", { name: "Control de Tableta de Alex" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Reducir el control/ }));
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Abrir el control de Tableta de Alex" }));
        expect(screen.getByRole("dialog")).toBeTruthy();
    });
    it("se arrastra por la barra y nunca sale de la vista", () => {
        render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        const barra = screen.getByTestId("ventana-control-barra");
        const v = screen.getByTestId("ventana-control");
        fireEvent.pointerDown(barra, { pointerId: 1, clientX: 500, clientY: 70, button: 0 });
        fireEvent.pointerMove(barra, { pointerId: 1, clientX: 9000, clientY: 9000 });
        fireEvent.pointerUp(barra, { pointerId: 1 });
        const x = parseFloat(v.style.left);
        const y = parseFloat(v.style.top);
        const w = parseFloat(v.style.width);
        expect(x + w).toBeLessThanOrEqual(1280);
        expect(y).toBeLessThanOrEqual(800 - 40);
        fireEvent.pointerDown(barra, { pointerId: 1, clientX: 500, clientY: 70, button: 0 });
        fireEvent.pointerMove(barra, { pointerId: 1, clientX: -9000, clientY: -9000 });
        fireEvent.pointerUp(barra, { pointerId: 1 });
        expect(parseFloat(v.style.left)).toBe(0);
        expect(parseFloat(v.style.top)).toBe(0);
    });
    it("recuerda lugar y tamaño al volver a abrirla en la sesión", () => {
        const a = render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        const esquina = screen.getByTestId("ventana-control-esquina");
        fireEvent.keyDown(esquina, { key: "ArrowRight" });
        const w = parseFloat(screen.getByTestId("ventana-control").style.width);
        a.unmount();
        render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        expect(parseFloat(screen.getByTestId("ventana-control").style.width)).toBe(w);
    });
    it("en 360 px de ancho cabe entera", () => {
        vi.stubGlobal("innerWidth", 360);
        render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        const v = screen.getByTestId("ventana-control");
        expect(parseFloat(v.style.left) + parseFloat(v.style.width)).toBeLessThanOrEqual(360);
        expect(parseFloat(v.style.left)).toBeGreaterThanOrEqual(0);
    });
});
