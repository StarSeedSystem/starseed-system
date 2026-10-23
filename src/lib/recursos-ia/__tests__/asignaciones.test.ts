/**
 * Asignaciones por elemento: herencia de carpeta, quitar, validación, tamaños confirmados y un
 * estado que llega roto (o de otra versión) desde la cuenta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    asignar,
    asignacionValida,
    claveElemento,
    confirmarTamano,
    declararAlmacen,
    estadoVacio,
    fijarTopologia,
    guardarEstado,
    leerEstado,
    normalizarEstado,
    quitarAsignacion,
    resolverAsignacion,
} from "../asignaciones";
import { CLAVE_RECURSOS_IA, type Alcance, type Asignacion, type ElementoRef } from "../tipos";

const alcance: Alcance = { tipo: "perfil", id: "p1", visibilidad: "privada" };
const carpetaModelos: ElementoRef = { tipo: "carpeta", id: "modelos", nombre: "Modelos" };
const carpetaTexto: ElementoRef = { tipo: "carpeta", id: "texto", nombre: "Texto", padreId: "modelos" };
const bitnet: ElementoRef = { tipo: "modelo", id: "bitnet-2b", nombre: "BitNet b1.58 2B", padreId: "texto" };

const asig = (elemento: ElementoRef, almacenEn: string, extra: Partial<Asignacion> = {}): Asignacion => ({ elemento, almacenEn, alcance, t: 1, ...extra });

describe("resolverAsignacion · herencia de carpeta", () => {
    it("propia > carpeta más cercana > «auto»", () => {
        let e = asignar(estadoVacio(), asig(carpetaModelos, "n-mac:ext:SSD Externo"));
        // Sin asignación propia: la del abuelo, porque el padre directo no tiene.
        expect(resolverAsignacion(e, bitnet, [carpetaTexto, carpetaModelos])).toEqual({ almacenEn: "n-mac:ext:SSD Externo", heredadaDe: "modelos" });
        // El padre directo gana al abuelo.
        e = asignar(e, asig(carpetaTexto, "n-mac:interno"));
        expect(resolverAsignacion(e, bitnet, [carpetaTexto, carpetaModelos])).toEqual({ almacenEn: "n-mac:interno", heredadaDe: "texto" });
        // La propia gana a todo y no dice «heredada».
        e = asignar(e, asig(bitnet, "biblioteca", { procesaEn: "n-mac:cpu" }));
        expect(resolverAsignacion(e, bitnet, [carpetaTexto, carpetaModelos])).toEqual({ almacenEn: "biblioteca", procesaEn: "n-mac:cpu" });
        // Nada en ningún sitio: «auto».
        expect(resolverAsignacion(estadoVacio(), bitnet, [carpetaTexto])).toEqual({ almacenEn: "auto" });
    });

    it("«auto» propio hereda el almacén y conserva el procesador elegido", () => {
        let e = asignar(estadoVacio(), asig(carpetaModelos, "n-mac:ext:SSD Externo", { procesaEn: "n-pc:gpu" }));
        e = asignar(e, asig(bitnet, "auto", { procesaEn: "n-mac:cpu" }));
        expect(resolverAsignacion(e, bitnet, [carpetaModelos])).toEqual({ almacenEn: "n-mac:ext:SSD Externo", procesaEn: "n-mac:cpu", heredadaDe: "modelos" });
        // Sin procesador propio, también lo hereda.
        e = asignar(e, asig(bitnet, "auto"));
        expect(resolverAsignacion(e, bitnet, [carpetaModelos]).procesaEn).toBe("n-pc:gpu");
    });

    it("sin `padres` sube por `padreId` con lo guardado de cada carpeta, sin ciclos", () => {
        let e = asignar(estadoVacio(), asig(carpetaModelos, "n-mac:interno"));
        e = asignar(e, asig(carpetaTexto, "auto"));
        expect(resolverAsignacion(e, bitnet)).toEqual({ almacenEn: "n-mac:interno", heredadaDe: "modelos" });
        // Ciclo: A ⊂ B ⊂ A. No se cuelga.
        const a: ElementoRef = { tipo: "carpeta", id: "a", nombre: "A", padreId: "b" };
        const b: ElementoRef = { tipo: "carpeta", id: "b", nombre: "B", padreId: "a" };
        let c = asignar(estadoVacio(), asig(a, "auto"));
        c = asignar(c, asig(b, "auto"));
        expect(resolverAsignacion(c, { tipo: "archivo", id: "f", nombre: "f", padreId: "a" })).toEqual({ almacenEn: "auto" });
    });
});

describe("asignar / quitar", () => {
    it("valida: sin tipo o id, sin `t` o sin alcance no cambia nada (mismo estado)", () => {
        const e = estadoVacio();
        const malas: unknown[] = [
            asig({ ...bitnet, id: "" }, "n-mac:interno"),
            asig({ ...bitnet, tipo: "otro" as never }, "n-mac:interno"),
            { elemento: bitnet, almacenEn: "n-mac:interno", alcance, t: Number.NaN },
            { elemento: bitnet, almacenEn: "n-mac:interno", t: 1 },
            asig(bitnet, "n-mac:interno", { alcance: { tipo: "perfil", id: "p1", visibilidad: "secreta" as never } }),
            asig(bitnet, ""),
        ];
        for (const m of malas) {
            expect(asignacionValida(m)).toBe(false);
            expect(asignar(e, m as Asignacion)).toBe(e);
        }
    });

    it("guarda una copia limpia y quitar la borra (sin tocar las demás)", () => {
        let e = asignar(estadoVacio(), { ...asig(bitnet, "n-mac:interno"), extra: "x" } as Asignacion);
        e = asignar(e, asig(carpetaModelos, "biblioteca"));
        expect(e.asignaciones[claveElemento("modelo", "bitnet-2b")]).toEqual(asig(bitnet, "n-mac:interno"));
        const sin = quitarAsignacion(e, "modelo", "bitnet-2b");
        expect(Object.keys(sin.asignaciones)).toEqual(["carpeta:modelos"]);
        expect(resolverAsignacion(sin, bitnet, [carpetaModelos])).toEqual({ almacenEn: "biblioteca", heredadaDe: "modelos" });
        expect(quitarAsignacion(sin, "modelo", "no-existe")).toBe(sin);
    });
});

describe("tamaños confirmados, topologías y almacenes declarados", () => {
    it("solo tamaños positivos y finitos", () => {
        let e = confirmarTamano(estadoVacio(), "turbo-fieldfare-gemma4", 14.3);
        expect(e.tamanosConfirmados).toEqual({ "turbo-fieldfare-gemma4": 14.3 });
        for (const gb of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(confirmarTamano(e, "x", gb)).toBe(e);
        expect(confirmarTamano(e, "", 3)).toBe(e);
        e = confirmarTamano(e, "turbo-fieldfare-gemma4", 15);
        expect(e.tamanosConfirmados["turbo-fieldfare-gemma4"]).toBe(15);
    });

    it("topología válida por alcance; inválida no cambia", () => {
        const e = fijarTopologia(estadoVacio(), { topologia: "almacen-externo", almacenExternoId: "n-mac:ext:SSD Externo", vias: ["local", "antena" as never, "zzz" as never], alcance });
        expect(e.topologias["perfil:p1"]).toMatchObject({ topologia: "almacen-externo", vias: ["local", "antena"] });
        expect(fijarTopologia(e, { topologia: "inventada" as never, vias: [], alcance })).toBe(e);
    });

    it("almacén declarado: se reemplaza por id y siempre consta como declarado", () => {
        const m = { id: "nas", tipo: "servidor-externo" as const, etiqueta: "NAS", via: "malla-local" as const, persistente: true, privado: true, disponible: true, fuente: "detectado" as const };
        let e = declararAlmacen(estadoVacio(), m);
        e = declararAlmacen(e, { ...m, etiqueta: "NAS de casa" });
        expect(e.almacenesDeclarados).toEqual([{ ...m, etiqueta: "NAS de casa", fuente: "declarado" }]);
        expect(declararAlmacen(e, { ...m, id: "" })).toBe(e);
        expect(declararAlmacen(e, { ...m, tipo: "disquete" as never })).toBe(e);
    });
});

describe("estado que llega de la cuenta", () => {
    afterEach(() => vi.unstubAllGlobals());

    const conAlmacen = (valor: string | null) => {
        const datos = new Map<string, string>();
        if (valor !== null) datos.set(CLAVE_RECURSOS_IA, valor);
        const eventos: string[] = [];
        vi.stubGlobal("window", {
            localStorage: { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) },
            dispatchEvent: (ev: { type: string }) => (eventos.push(ev.type), true),
        });
        vi.stubGlobal("CustomEvent", class {
            constructor(public type: string) {}
        });
        return { datos, eventos };
    };

    it("JSON roto, de otra versión o sin almacén → vacío, sin lanzar", () => {
        conAlmacen("{esto no es json");
        expect(leerEstado()).toEqual(estadoVacio());
        conAlmacen(JSON.stringify({ v: 2, asignaciones: { "modelo:x": asig(bitnet, "n-mac:interno") } }));
        expect(leerEstado()).toEqual(estadoVacio());
        conAlmacen(null);
        expect(leerEstado()).toEqual(estadoVacio());
        conAlmacen("[1,2,3]");
        expect(leerEstado()).toEqual(estadoVacio());
    });

    it("salva lo válido y descarta lo roto, campo por campo", () => {
        const crudo = {
            v: 1,
            asignaciones: {
                // Clave equivocada: se vuelve a calcular a partir del elemento.
                cualquiera: asig(bitnet, "n-mac:interno"),
                rota: { elemento: { tipo: "modelo" }, almacenEn: 3 },
            },
            topologias: { "perfil:p1": { topologia: "cada-neurona", vias: "local", alcance }, mala: { topologia: "x" } },
            tamanosConfirmados: { a: 4.5, b: "7", c: -1 },
            almacenesDeclarados: [{ id: "nas", tipo: "servidor-externo", etiqueta: "NAS", via: "malla-local" }, { id: "", tipo: "nube", via: "internet" }, "basura"],
        };
        const e = normalizarEstado(crudo);
        expect(Object.keys(e.asignaciones)).toEqual(["modelo:bitnet-2b"]);
        expect(e.topologias["perfil:p1"].vias).toEqual(["local", "malla-local", "red-starseed"]);
        expect(Object.keys(e.topologias)).toEqual(["perfil:p1"]);
        expect(e.tamanosConfirmados).toEqual({ a: 4.5 });
        expect(e.almacenesDeclarados).toEqual([
            { id: "nas", tipo: "servidor-externo", etiqueta: "NAS", via: "malla-local", persistente: true, privado: true, disponible: true, fuente: "declarado" },
        ]);
    });

    it("guardar y volver a leer da lo mismo, y avisa a la pestaña", () => {
        const { eventos } = conAlmacen(null);
        const e = confirmarTamano(asignar(estadoVacio(), asig(bitnet, "n-mac:ext:SSD Externo")), "bitnet-2b", 1.2);
        guardarEstado(e);
        expect(leerEstado()).toEqual(e);
        expect(eventos).toEqual(["starseed:recursos-ia"]);
    });
});
