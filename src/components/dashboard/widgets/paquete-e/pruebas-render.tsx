/**
 * Ayudas de las pruebas de render del paquete E (no es un test: lo importan los *.test.tsx).
 * Fuerza la clase de tamaño con el mismo contexto que publica el MarcoUnificado.
 */
import * as React from "react";
import { render } from "@testing-library/react";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

export function marcoDe(clase: ClaseTamano, acento = "#94a3b8"): ContextoMarcoUnificado {
    const base = clase === "panoramico" || clase === "torre" ? "m" : clase;
    return { acento, acento2: "#23d5ab", clase, base, horizontal: clase === "panoramico", espaciado: ESPACIADO_MARCO[base] };
}

export function montarEn(clase: ClaseTamano, nodo: React.ReactElement, acento?: string) {
    return render(<ContextoMarco.Provider value={marcoDe(clase, acento)}>{nodo}</ContextoMarco.Provider>);
}

export function entornoNavegador() {
    const g = globalThis as any;
    g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as any;
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
    HTMLCanvasElement.prototype.getContext = (() => null) as any;
}

export const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];
