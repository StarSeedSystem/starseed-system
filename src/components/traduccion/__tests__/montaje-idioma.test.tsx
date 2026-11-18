// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { capturarSeleccionEditable, deshacerUltimo, reemplazar } from "../reemplazar-seleccion";
import { entradasVisibles, entradasIdioma } from "../entradas-idioma";
import { crearTraductor, type MotorTraduccion } from "@/lib/traduccion/motor";

function area(valor: string): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    el.value = valor;
    document.body.append(el);
    el.focus();
    return el;
}

function inputTexto(valor: string): HTMLInputElement {
    const el = document.createElement("input");
    el.type = "text";
    el.value = valor;
    document.body.append(el);
    el.focus();
    return el;
}

function ctx(opciones: { seleccion?: string; objetivo?: Element | null; paginaTraducida?: boolean; editable?: boolean; seleccionEditable?: { elemento: unknown; inicio: number; fin: number; texto: string } | null }): { seleccion: string; objetivo: Element | null; paginaTraducida: boolean; editable: boolean; seleccionEditable: { elemento: unknown; inicio: number; fin: number; texto: string } | null } {
    return {
        seleccion: opciones.seleccion ?? "",
        objetivo: opciones.objetivo ?? null,
        paginaTraducida: opciones.paginaTraducida ?? false,
        editable: opciones.editable ?? false,
        seleccionEditable: opciones.seleccionEditable ?? null,
    };
}

afterEach(() => {
    deshacerUltimo();
    document.body.textContent = "";
});

describe("reemplazar selección con motor falso", () => {
    it("reemplaza el texto de un textarea y Deshacer lo devuelve", () => {
        const el = area("Hola mundo");
        el.setSelectionRange(5, 10);
        const objetivo = capturarSeleccionEditable(document)!;
        expect(objetivo.texto).toBe("mundo");
        const ok = reemplazar(objetivo, "world");
        expect(ok).toBe(true);
        expect(el.value).toBe("Hola world");
        expect(deshacerUltimo()).toBe(true);
        expect(el.value).toBe("Hola mundo");
    });

    it("reemplaza el texto de un input y Deshacer lo devuelve", () => {
        const el = inputTexto("Correo listo");
        el.setSelectionRange(0, 6);
        const objetivo = capturarSeleccionEditable(document)!;
        expect(objetivo.texto).toBe("Correo");
        const ok = reemplazar(objetivo, "Mensaje");
        expect(ok).toBe(true);
        expect(el.value).toBe("Mensaje listo");
        expect(deshacerUltimo()).toBe(true);
        expect(el.value).toBe("Correo listo");
    });
});

describe("motor falso que falla no cambia el texto", () => {
    it("si el motor falla, el texto original permanece intacto", async () => {
        const el = area("Hola mundo");
        el.setSelectionRange(5, 10);
        const objetivo = capturarSeleccionEditable(document)!;
        const original = el.value;

        const motorFalso: MotorTraduccion = {
            id: "falso-falla",
            alcance: "aparato",
            disponible: async () => true,
            traducir: async () => { throw new Error("Motor simulado falla"); },
        };

        const traductor = crearTraductor([motorFalso], { privado: true });

        await expect(traductor.traducir(["mundo"], "auto", "en")).rejects.toThrow("Motor simulado falla");
        expect(el.value).toBe(original);
    });
});

describe("entradasIdioma · visibilidad y ejecución", () => {
    it("las tres entradas de IMA17 se filtran por visibilidad correcta", () => {
        const acciones = {
            leerEnVozAlta: vi.fn(),
            añadirAlPaquete: vi.fn(),
            hayEdicion: () => true,
            abrirTraductor: vi.fn(),
        };
        const entradas = entradasIdioma(acciones);
        const porId = Object.fromEntries(entradas.map((e) => [e.id, e]));

        expect(entradasVisibles([porId["leer-en-voz-alta"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
        expect(entradasVisibles([porId["leer-en-voz-alta"]], ctx({}))).toHaveLength(0);
        expect(entradasVisibles([porId["abrir-traductor"]], ctx({ seleccion: "hola" }))).toHaveLength(1);
        expect(entradasVisibles([porId["abrir-traductor"]], ctx({}))).toHaveLength(0);
        expect(entradasVisibles([porId["anadir-al-paquete"]], ctx({ seleccion: "hola" }))).toHaveLength(1);

        const sinEdicion = Object.fromEntries(
            entradasIdioma({ ...acciones, hayEdicion: () => false }).map((e) => [e.id, e]),
        );
        expect(entradasVisibles([sinEdicion["anadir-al-paquete"]], ctx({ seleccion: "hola" }))).toHaveLength(0);
    });
});