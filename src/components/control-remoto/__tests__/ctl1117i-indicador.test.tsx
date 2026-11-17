import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const HUELLA = "abcdef0123456789abcdef0123456789";
const estado = vi.hoisted(() => ({
    sesion: null as null | { token: string; de: string; nombre: string; nivel: string; inicio: number; ultima: number; color?: string },
    permiso: { encendido: true, nivel: "controlar", controladores: [] as unknown[], pendientes: [] as unknown[] },
    revocado: [] as string[],
}));

vi.mock("@/lib/control-remoto/canal", () => ({
    leerPermisoLocal: () => estado.permiso,
    guardarPermisoLocal: () => undefined,
    puertaControl: () => ({ sesionActiva: () => estado.sesion, revocar: (m: string) => { estado.revocado.push(m); estado.sesion = null; } }),
    presentarmeA: async () => ({ ok: true }),
    iniciarCanalControl: async () => undefined,
}));
vi.mock("@/lib/chats-genesis/firma-aparato", () => ({ aparatoLocal: async () => ({ codigo: "A1B2" }), codigoDe: async () => "E5F6" }));
vi.mock("@/lib/banco-llamadas/app", () => ({ estadoBanco: () => null, ultimoInforme: () => null, informarBanco: () => undefined, armarBanco: () => true, apagarBanco: () => undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

import { BandaControl, ControlEntreNeuronasPanel } from "../banda-control";
import { PuntoControl } from "../punto-control";
import { AjustesIndicadorControl } from "../ajustes-indicador";
import { quienControla } from "@/lib/control-remoto/quien-controla";

const ahora = Date.parse("2026-11-17T10:30:00Z");
const quien = { nombre: "Mac de Alex", nivel: "controlar" as const, desde: ahora, color: "#dd3cd2", neurona: "mac-alex" };

beforeEach(() => {
    estado.sesion = null;
    estado.revocado = [];
    estado.permiso = { encendido: true, nivel: "controlar", controladores: [{ huella: HUELLA, nombre: "Mac de Alex", cuenta: "c", neurona: "mac-alex", desde: "2026-11-15T10:00:00Z" }], pendientes: [] };
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
});

function tauri(ajustes: { indicador: string; ver_toques: boolean }, extra: Record<string, unknown> = {}) {
    const inv = vi.fn(async (c: string, a?: { parcial?: Record<string, unknown> }) => {
        if (c === "control_ajustes_leer") return ajustes;
        if (c === "control_ajustes_poner") {
            Object.assign(ajustes, a?.parcial);
            return ajustes;
        }
        if (c in extra) return extra[c];
        throw new Error("no");
    });
    (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke: inv } };
    return inv;
}

describe("CTL1117I · quién controla, con su color", () => {
    it("el color sale de lo firmado, si no del declarado, si no del de su id", () => {
        const s = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar" as const, inicio: 1, ultima: 1 };
        expect(quienControla(s, estado.permiso as never)?.color).toBe("#dd3cd2"); // por su id: mac-alex
        expect(quienControla({ ...s, color: "#112233" }, estado.permiso as never)?.color).toBe("#112233");
        expect(quienControla({ ...s, color: "rojo" }, { controladores: [{ ...(estado.permiso.controladores[0] as object), color: "#445566" } as never] })?.color).toBe("#445566");
        expect(quienControla(null, estado.permiso as never)).toBeNull();
    });
});

describe("CTL1117I · el punto de la esquina", () => {
    it("es un botón con nombre accesible, cerrado al principio; pulsarlo abre el panelito con quién, nivel, desde y color", async () => {
        render(<PuntoControl quien={quien} onTerminar={() => undefined} />);
        const b = screen.getByRole("button", { name: /Controla este aparato: Mac de Alex/ });
        expect(b).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByTestId("punto-control-punto")).toHaveAttribute("data-color", "#dd3cd2");
        expect(screen.queryByRole("dialog")).toBeNull();
        await userEvent.click(b);
        expect(b).toHaveAttribute("aria-expanded", "true");
        const d = screen.getByRole("dialog", { name: "Control entre mis neuronas" });
        expect(d).toHaveTextContent("Mac de Alex");
        expect(d).toHaveTextContent("controlar");
        expect(screen.getByTestId("punto-control-color")).toHaveTextContent("#dd3cd2");
        expect(d).toHaveTextContent(new Date(ahora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    });
    it("se maneja con el teclado: Intro abre, Escape cierra y devuelve el foco al punto", async () => {
        render(<PuntoControl quien={quien} onTerminar={() => undefined} />);
        const b = screen.getByRole("button", { name: /Controla este aparato/ });
        b.focus();
        await userEvent.keyboard("{Enter}");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(b).toHaveFocus();
    });
    it("«Terminar» llama a terminar", async () => {
        const f = vi.fn();
        render(<PuntoControl quien={quien} onTerminar={f} />);
        await userEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        await userEvent.click(screen.getByRole("button", { name: "Terminar" }));
        expect(f).toHaveBeenCalledTimes(1);
    });
    it("se pliega solo a los 5 s si no estás dentro, y no si tienes el foco dentro", async () => {
        vi.useFakeTimers();
        render(<PuntoControl quien={quien} onTerminar={() => undefined} />);
        fireEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        act(() => void vi.advanceTimersByTime(4900));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        act(() => void vi.advanceTimersByTime(200));
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Controla este aparato/ }));
        act(() => screen.getByRole("button", { name: "Terminar" }).focus());
        act(() => void vi.advanceTimersByTime(20_000));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});

describe("CTL1117I · la banda de la app según el indicador", () => {
    it("indicador=punto: hay punto con el color de quien controla y ya no hay banda roja", async () => {
        tauri({ indicador: "punto", ver_toques: true });
        estado.sesion = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar", inicio: ahora, ultima: ahora, color: "#dd3cd2" };
        render(<BandaControl />);
        await waitFor(() => expect(screen.getByTestId("punto-control-punto")).toHaveAttribute("data-color", "#dd3cd2"));
        expect(screen.queryByText(/Terminar y quitar el permiso/)).toBeNull();
    });
    it("indicador=oculto: no se dibuja nada", async () => {
        const inv = tauri({ indicador: "oculto", ver_toques: true });
        estado.sesion = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar", inicio: ahora, ultima: ahora };
        const { container } = render(<BandaControl />);
        await waitFor(() => expect(inv).toHaveBeenCalledWith("control_ajustes_leer"));
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(container).toBeEmptyDOMElement();
    });
    it("con indicador nativo (Android) la web NO pinta su punto: solo el nativo; el panel sigue diciendo quién controla y deja «Terminar»", async () => {
        const inv = tauri({ indicador: "punto", ver_toques: true }, { control_capacidades: { ok: true, pantalla: {}, entrada: {}, falta: [] } });
        estado.sesion = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar", inicio: ahora, ultima: ahora };
        const { container } = render(<BandaControl />);
        await waitFor(() => expect(inv).toHaveBeenCalledWith("control_capacidades"));
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(screen.queryByTestId("punto-control")).toBeNull();
        expect(container).toBeEmptyDOMElement();
        cleanup();
        render(<ControlEntreNeuronasPanel />);
        const q = await screen.findByTestId("quien-controla-ahora");
        await waitFor(() => expect(q).toHaveTextContent(/Mac de Alex controla este aparato \(nivel controlar\)/));
        await userEvent.click(q.querySelector("button") as HTMLElement);
        expect(estado.revocado).toEqual(["terminado-por-el-dueno"]);
    });
    it("sin app nativa (web) el indicador es el punto, el de fábrica", async () => {
        estado.sesion = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar", inicio: ahora, ultima: ahora };
        render(<BandaControl />);
        await waitFor(() => expect(screen.getByTestId("punto-control")).toBeInTheDocument());
    });
    it("sin sesión no hay punto", async () => {
        tauri({ indicador: "punto", ver_toques: true });
        const { container } = render(<BandaControl />);
        await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
        expect(container).toBeEmptyDOMElement();
    });
});

describe("CTL1117I · ajustes «Cómo se ve que te controlan»", () => {
    it("con app nativa lee los valores, los cambia con ponerAjustesControl y dice la frase fija de las notificaciones", async () => {
        const inv = tauri({ indicador: "punto", ver_toques: true });
        render(<AjustesIndicadorControl disponible quien={null} onTerminar={() => undefined} />);
        const punto = screen.getByRole("radio", { name: "Punto en la esquina" });
        const oculto = screen.getByRole("radio", { name: "Oculto" });
        await waitFor(() => expect(punto).toHaveAttribute("aria-checked", "true"));
        expect(oculto).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("switch", { name: /Ver los toques de quien controla: sí/ })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByTestId("aviso-siempre")).toHaveTextContent("El aviso en las notificaciones sigue ahí siempre que alguien controla este aparato.");
        await userEvent.click(oculto);
        await waitFor(() => expect(inv).toHaveBeenCalledWith("control_ajustes_poner", { parcial: { indicador: "oculto" } }));
        await waitFor(() => expect(oculto).toHaveAttribute("aria-checked", "true"));
        await userEvent.click(screen.getByRole("switch", { name: /Ver los toques/ }));
        await waitFor(() => expect(inv).toHaveBeenCalledWith("control_ajustes_poner", { parcial: { ver_toques: false } }));
        await waitFor(() => expect(screen.getByRole("switch", { name: /Ver los toques de quien controla: no/ })).toHaveAttribute("aria-checked", "false"));
    });
    it("cada ajuste lleva su frase y sus controles quedan descritos para el lector de pantalla", () => {
        render(<AjustesIndicadorControl disponible={false} quien={null} onTerminar={() => undefined} />);
        const sw = screen.getByRole("switch");
        const ayuda = sw.getAttribute("aria-describedby");
        expect(ayuda && document.getElementById(ayuda)?.textContent).toMatch(/con su color/);
        expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-labelledby");
    });
    it("en escritorio o web salen apagados y con el motivo; no llaman a nada", async () => {
        const inv = vi.fn();
        const poner = vi.fn();
        render(<AjustesIndicadorControl disponible={false} quien={null} onTerminar={() => undefined} leer={inv} poner={poner} />);
        for (const r of screen.getAllByRole("radio")) {
            expect(r).toBeDisabled();
            expect(r).toHaveAttribute("aria-checked", "false");
        }
        const sw = screen.getByRole("switch");
        expect(sw).toBeDisabled();
        expect(sw).toHaveAttribute("aria-checked", "false");
        expect(screen.getByTestId("ajustes-indicador-motivo")).toHaveTextContent(/no tiene control de pantalla propio/);
        expect(screen.getByTestId("aviso-siempre")).toBeInTheDocument();
        await userEvent.click(sw);
        expect(inv).not.toHaveBeenCalled();
        expect(poner).not.toHaveBeenCalled();
    });
    it("si lo nativo no acepta el cambio lo dice", async () => {
        const poner = vi.fn(async () => ({ indicador: "punto" as const, ver_toques: true }));
        render(<AjustesIndicadorControl disponible quien={null} onTerminar={() => undefined} leer={async () => ({ indicador: "punto", ver_toques: true })} poner={poner} />);
        await userEvent.click(screen.getByRole("radio", { name: "Oculto" }));
        await waitFor(() => expect(screen.getByTestId("ajustes-indicador-fallo")).toBeInTheDocument());
    });
    it("con el indicador oculto, el panel dice quién controla y deja terminar", async () => {
        const f = vi.fn();
        render(<AjustesIndicadorControl disponible quien={quien} onTerminar={f} leer={async () => ({ indicador: "oculto", ver_toques: true })} poner={async () => ({ indicador: "oculto", ver_toques: true })} />);
        expect(screen.getByTestId("quien-controla-ahora")).toHaveTextContent(/Mac de Alex controla este aparato \(nivel controlar\) desde las/);
        await userEvent.click(screen.getByRole("button", { name: "Terminar" }));
        expect(f).toHaveBeenCalled();
    });
});

describe("CTL1117I · el panel «Control entre mis neuronas» entero", () => {
    it("con sesión viva y el indicador oculto sigue diciendo quién controla y «Terminar» la acaba", async () => {
        tauri({ indicador: "oculto", ver_toques: false }, { control_capacidades: { ok: true, pantalla: {}, entrada: {}, falta: [] } });
        estado.sesion = { token: "t", de: HUELLA, nombre: "Mac de Alex", nivel: "controlar", inicio: ahora, ultima: ahora };
        render(<ControlEntreNeuronasPanel />);
        const q = await screen.findByTestId("quien-controla-ahora");
        await waitFor(() => expect(q).toHaveTextContent(/Mac de Alex controla este aparato/));
        const dentro = screen.getByTestId("ajustes-indicador");
        await userEvent.click(dentro.querySelector("[data-testid='quien-controla-ahora'] button") as HTMLElement);
        expect(estado.revocado).toEqual(["terminado-por-el-dueno"]);
        await waitFor(() => expect(screen.getByTestId("quien-controla-ahora")).toHaveTextContent("Ahora nadie controla"));
    });
    it("cada neurona que puede controlar este aparato lleva su punto de color junto al nombre", async () => {
        render(<ControlEntreNeuronasPanel />);
        await screen.findByTestId("control-entre-neuronas");
        const puntos = screen.getAllByTestId("punto-color").map((x) => x.getAttribute("data-color"));
        expect(puntos).toContain("#dd3cd2"); // mac-alex
    });
});
