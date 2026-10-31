// @vitest-environment jsdom
// Pruebas del panel «Decisiones de Laya» (Ola 1018L · LYS1018N). Respuestas de
// Laya de EJEMPLO con la forma real de una decisión de sistema uno (choice/
// probabilities/answer_confidence, score, noul). Sin red (la sonda va inyectada),
// sin disco más allá de jsdom y sin cargar modelos (contrato §2: tarda segundos).
// globals=false en este repo: describe/it/expect se importan de vitest.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    CLAVE_HABILIDADES,
    PanelDecisionesLaya,
    decisionesVisibles,
    leerInterruptores,
    medioPanel,
    umbralesEfectivos,
    type SondeoLaya,
} from "@/components/astraura/laya-decisiones-panel";
import { anotar, huellaEstado, type RegistroAprendizaje } from "@/lib/astraura/laya/aprendizaje-laya";

const RESPUESTA_CHOICE = { choice: "diagramar", probabilities: { diagramar: 0.91, conversar: 0.09 }, answer_confidence: 0.91 } as const;
const RESPUESTA_SCORE = { score: "media", probabilities: { baja: 0.1, media: 0.82, alta: 0.08 }, answer_confidence: 0.82 } as const;
const RESPUESTA_NOUL = { noul: 0.88, probabilities: [0.12, 0.88], answer_confidence: 0.88 } as const;

const PRIVADO = "mensaje con teléfono de Ana 555-1234";
let registro: RegistroAprendizaje = [];
registro = anotar(registro, { punto: "habilidad.elegir", ambito: "os", p: RESPUESTA_CHOICE.answer_confidence, donde: "mac", ms: 1950, resultado: "aceptada", estado: "diagramar el flujo con pizarras", privado: false, ts: 100 });
registro = anotar(registro, { punto: "plan.dificultad", ambito: "os", p: RESPUESTA_SCORE.answer_confidence, donde: "a1", ms: 3100, resultado: "corregida", estado: "redactar el informe de la vara", privado: false, ts: 200 });
registro = anotar(registro, { punto: "privacidad.subir", ambito: "os", p: RESPUESTA_NOUL.answer_confidence, donde: "mac", ms: 2050, resultado: "escalada", estado: PRIVADO, privado: true, ts: 300 });

const sonda = (viva: boolean, medio: SondeoLaya["medio"]): (() => Promise<SondeoLaya | null>) => () => Promise.resolve({ viva, medio, ms: null });

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); });

describe("derivaciones puras del panel", () => {
    it("la última decisión va primero y lo privado muestra SOLO la huella", () => {
        const filas = decisionesVisibles(registro, 2);
        expect(filas).toHaveLength(2);
        expect(filas[0].punto).toBe("privacidad.subir");
        expect(filas[0].privado).toBe(true);
        expect(filas[0].respuesta).toBe(huellaEstado(PRIVADO));
        expect(filas[0].respuesta).not.toContain("Ana");
        expect(filas[1].punto).toBe("plan.dificultad");
    });

    it("el medio del caso se traduce al lenguaje del panel", () => {
        expect(medioPanel("mac")).toBe("local");
        expect(medioPanel("local")).toBe("local");
        expect(medioPanel("malla")).toBe("A1");
        expect(medioPanel("a1")).toBe("A1");
        expect(medioPanel(undefined)).toBe("ninguno");
    });

    it("con menos de 30 casos manda el umbral del catálogo por punto", () => {
        const u = umbralesEfectivos(registro);
        expect(u.find((x) => x.id === "privacidad.subir")?.umbral).toBe(0.5);
        expect(u.find((x) => x.id === "habilidad.elegir")?.umbral).toBe(0.6);
        expect(u.every((x) => !x.recalibrado)).toBe(true);
    });

    it("con 30 casos el punto se marca como recalibrado", () => {
        let r: RegistroAprendizaje = [];
        for (let i = 0; i < 30; i++) {
            r = anotar(r, { punto: "habilidad.elegir", ambito: "os", p: 0.9, donde: "a1", ms: 10, resultado: "aceptada", estado: "ok", privado: false, ts: i });
        }
        const u = umbralesEfectivos(r);
        expect(u.find((x) => x.id === "habilidad.elegir")).toMatchObject({ recalibrado: true, umbral: 0.9 });
    });

    it("las habilidades van TODAS encendidas por defecto y el guardado solo las apaga", () => {
        expect(Object.values(leerInterruptores(null)).every(Boolean)).toBe(true);
        expect(leerInterruptores(JSON.stringify({ tdd: false }))["tdd"]).toBe(false);
        expect(leerInterruptores(JSON.stringify({ tdd: true }))["tdd"]).toBe(true);
        expect(leerInterruptores("no es json")["tdd"]).toBe(true);
    });
});

describe("«Decisiones de Laya» en el panel", () => {
    it("enseña el medio por la sonda, las decisiones y la huella de lo privado", async () => {
        render(<PanelDecisionesLaya registro={registro} sondear={sonda(true, "local")} />);
        await waitFor(() => expect(screen.getByText("Laya en el aparato")).toBeTruthy());
        expect(screen.getAllByText(/habilidad\.elegir/).length).toBeGreaterThan(0);
        expect(screen.getByText(/confianza 88%/)).toBeTruthy();
        expect(screen.getByText(new RegExp(`huella ${huellaEstado(PRIVADO)}`))).toBeTruthy();
        expect(screen.queryByText(/Ana/)).toBeNull();
        expect(screen.getByText(/última latencia:/).textContent).toContain("2050 ms");
    });

    it("sin sonda viva y sin registro enseña «Laya sin señal» y el estado vacío honesto", async () => {
        render(<PanelDecisionesLaya registro={[]} sondear={sonda(false, "ninguno")} />);
        await waitFor(() => expect(screen.getByText("Laya sin señal")).toBeTruthy());
        expect(screen.getByText(/Ninguna decisión registrada todavía/)).toBeTruthy();
    });

    it("la sonda de la malla al A1 cambia la pastilla del medio", async () => {
        render(<PanelDecisionesLaya registro={[]} sondear={sonda(true, "A1")} />);
        await waitFor(() => expect(screen.getByText("Laya por la malla al A1")).toBeTruthy());
    });

    it("los interruptores de habilidades van encendidos y al apagar se guardan", () => {
        render(<PanelDecisionesLaya registro={[]} sondear={async () => null} />);
        const interruptor = screen.getByRole("switch", { name: "Habilidad TDD · Desarrollo guiado por pruebas" });
        expect(interruptor.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(interruptor);
        expect(interruptor.getAttribute("aria-checked")).toBe("false");
        expect(JSON.parse(localStorage.getItem(CLAVE_HABILIDADES) ?? "{}")["tdd"]).toBe(false);
        expect(screen.getByText(/Umbrales efectivos/)).toBeTruthy();
        expect(screen.getAllByText(/privacidad\.subir/).length).toBeGreaterThan(0);
    });
});
