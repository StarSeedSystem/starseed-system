import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { AjustesImaginacion, aplicarCambio, textoRango } from "../ajustes-imaginacion";
import { AJUSTES_POR_DEFECTO, type AjustesAutodesarrollo } from "@/lib/mando/imaginacion-tipos";

const base = (): AjustesAutodesarrollo => structuredClone(AJUSTES_POR_DEFECTO);
const respuesta = (cuerpo: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));

describe("lógica pura de los ajustes de imaginación", () => {
    it("textoRango dice el rango en palabras", () => {
        expect(textoRango(base())).toBe("Tareas autodesarrolladas por ciclo: de 0 a 10");
    });

    it("rango: redondea, acota 0–10 y nunca cruza mínimo y máximo", () => {
        expect(aplicarCambio(base(), { tipo: "rango", campo: "min", valor: 12 }).rango).toEqual({ min: 10, max: 10 });
        expect(aplicarCambio(base(), { tipo: "rango", campo: "max", valor: -3 }).rango).toEqual({ min: 0, max: 0 });
        expect(aplicarCambio(base(), { tipo: "rango", campo: "min", valor: 4.6 }).rango.min).toBe(5);
        const a = { ...base(), rango: { min: 3, max: 6 } };
        expect(aplicarCambio(a, { tipo: "rango", campo: "min", valor: 9 }).rango).toEqual({ min: 6, max: 6 });
        expect(aplicarCambio(a, { tipo: "rango", campo: "max", valor: 1 }).rango).toEqual({ min: 3, max: 3 });
    });

    it("alterna fuentes, modo, reparto y acota los días profundos", () => {
        expect(aplicarCambio(base(), { tipo: "fuente", fuente: "astraura" }).fuentes.astraura).toBe(false);
        expect(base().fuentes.astraura).toBe(true);
        expect(aplicarCambio(base(), { tipo: "modo", modo: "franjas" }).horario.modo).toBe("franjas");
        expect(aplicarCambio(base(), { tipo: "repartir", valor: false }).horario.repartir).toBe(false);
        expect(aplicarCambio(base(), { tipo: "profunda", dias: -5 }).profunda.cada_dias).toBe(0);
        expect(aplicarCambio(base(), { tipo: "profunda", dias: 999 }).profunda.cada_dias).toBe(365);
    });

    it("edita franjas y días, y añade o quita franjas", () => {
        expect(aplicarCambio(base(), { tipo: "dia", indice: 0, dia: 1 }).horario.franjas[0]?.dias).toEqual([0, 2, 3, 4, 5, 6]);
        expect(aplicarCambio(base(), { tipo: "franja", indice: 0, cambios: { desde: "09:30" } }).horario.franjas[0]?.desde).toBe("09:30");
        expect(aplicarCambio(base(), { tipo: "anadir-franja" }).horario.franjas).toHaveLength(2);
        expect(aplicarCambio(base(), { tipo: "quitar-franja", indice: 0 }).horario.franjas).toEqual([]);
        expect(aplicarCambio(base(), { tipo: "dia", indice: 99, dia: 1 })).toEqual(base());
    });
});

describe("AjustesImaginacion", () => {
    let posts: Array<{ accion: string; ajustes: AjustesAutodesarrollo }>;
    let servidor: AjustesAutodesarrollo;

    beforeEach(() => {
        posts = [];
        servidor = {
            ...base(), automatico: false, rango: { min: 2, max: 4 },
            fuentes: { diaria: true, profunda: false, astraura: true, directores: true },
            horario: { modo: "franjas", franjas: [{ dias: [1, 2], desde: "03:00", hasta: "05:00" }], repartir: false },
            profunda: { cada_dias: 3 },
        };
        vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                const cuerpo = JSON.parse(String(init.body)) as { accion: string; ajustes: AjustesAutodesarrollo };
                posts.push(cuerpo);
                return respuesta({ ok: true, ajustes: cuerpo.ajustes });
            }
            return respuesta({ propuestas: [], ajustes: servidor });
        }));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("carga los ajustes guardados y pinta rango, fuentes y franjas", async () => {
        render(<AppearanceProvider><AjustesImaginacion /></AppearanceProvider>);
        expect(await screen.findByText("Tareas autodesarrolladas por ciclo: de 2 a 4")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Automático" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("switch", { name: "Imaginación profunda" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("radio", { name: "Por franjas" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByLabelText("Desde de la franja 1")).toHaveValue("03:00");
        expect(screen.getByLabelText("Imaginación profunda cada N días")).toHaveValue(3);
        expect(screen.getByText(/Lo importante siempre espera tu visto bueno/)).toBeInTheDocument();
    });

    it("guarda con POST {accion: ajustes} y respeta los topes", async () => {
        render(<AppearanceProvider><AjustesImaginacion /></AppearanceProvider>);
        fireEvent.click(await screen.findByRole("switch", { name: "Automático" }));
        fireEvent.change(screen.getByLabelText("Mínimo de tareas por ciclo"), { target: { value: "9" } });
        fireEvent.click(screen.getByRole("switch", { name: "Directores" }));
        fireEvent.click(screen.getByRole("radio", { name: "Inteligente" }));
        fireEvent.change(screen.getByLabelText("Imaginación profunda cada N días"), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar ajustes" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]?.accion).toBe("ajustes");
        expect(posts[0]?.ajustes.automatico).toBe(true);
        expect(posts[0]?.ajustes.rango).toEqual({ min: 4, max: 4 });
        expect(posts[0]?.ajustes.fuentes.directores).toBe(false);
        expect(posts[0]?.ajustes.horario.modo).toBe("inteligente");
        expect(posts[0]?.ajustes.profunda.cada_dias).toBe(0);
        expect(await screen.findByText(/Ajustes guardados/)).toBeInTheDocument();
    });

    it("añade y quita franjas con sus días y horas", async () => {
        render(<AppearanceProvider><AjustesImaginacion /></AppearanceProvider>);
        fireEvent.click(await screen.findByRole("button", { name: "Añadir franja" }));
        expect(screen.getByLabelText("Desde de la franja 2")).toHaveValue("02:00");
        fireEvent.change(screen.getByLabelText("Hasta de la franja 2"), { target: { value: "08:15" } });
        const domingos = screen.getAllByRole("button", { name: "domingo" });
        const segundo = domingos[1];
        if (segundo) fireEvent.click(segundo);
        fireEvent.click(screen.getByRole("button", { name: "Quitar franja 1" }));
        expect(screen.queryByLabelText("Desde de la franja 2")).toBeNull();
        expect(screen.getByLabelText("Hasta de la franja 1")).toHaveValue("08:15");
        expect(screen.getByRole("button", { name: "domingo" })).toHaveAttribute("aria-pressed", "false");
    });
});
