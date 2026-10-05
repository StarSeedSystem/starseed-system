/**
 * Pruebas del módulo puro del gancho HTTP (`@/lib/mando/gancho`).
 * La ruta no se importa: la lógica vive en el módulo puro.
 */

import { describe, expect, it } from "vitest";

import {
    construirEvento,
    firmarCuerpo,
    nombreArchivoEntrada,
    sanitizarRuta,
    verificarFirma,
} from "@/lib/mando/gancho";

const SECRETO = "secreto-de-prueba";

function cabecera(cuerpo: string, secreto = SECRETO): string {
    return `sha256=${firmarCuerpo(cuerpo, secreto)}`;
}

describe("verificarFirma", () => {
    it("acepta la firma correcta", () => {
        expect(verificarFirma("{\"a\":1}", cabecera("{\"a\":1}"), SECRETO)).toBe(true);
    });

    it("rechaza cuerpo alterado, otro secreto y formatos raros", () => {
        const buena = cabecera("hola");
        expect(verificarFirma("hola!", buena, SECRETO)).toBe(false);
        expect(verificarFirma("hola", cabecera("hola", "otro"), SECRETO)).toBe(false);
        expect(verificarFirma("hola", null, SECRETO)).toBe(false);
        expect(verificarFirma("hola", buena, "")).toBe(false);
        expect(verificarFirma("hola", buena, undefined)).toBe(false);
        expect(verificarFirma("hola", "sin-prefijo", SECRETO)).toBe(false);
        expect(verificarFirma("hola", "sha256=zzzz", SECRETO)).toBe(false);
    });
});

describe("sanitizarRuta", () => {
    it("acepta nombres sencillos", () => {
        expect(sanitizarRuta("n8n-pieza_lista")).toBe("n8n-pieza_lista");
    });

    it("rechaza rutas peligrosas o vacías", () => {
        for (const mala of ["", "../sube", "a/b", "a.json", "con espacio", "á"]) {
            expect(sanitizarRuta(mala)).toBeNull();
        }
        expect(sanitizarRuta("x".repeat(65))).toBeNull();
    });
});

describe("nombreArchivoEntrada y construirEvento", () => {
    it("forma el nombre que disparadores.py espera", () => {
        expect(nombreArchivoEntrada("n8n", 1759660000123.9)).toBe(
            "1759660000123-n8n.json");
    });

    it("guarda cuerpo y procedencia", () => {
        const evento = construirEvento("n8n", { hola: 1 }, new Date("2026-10-05T10:00:00Z"));
        expect(evento).toEqual({
            ruta: "n8n",
            recibido: "2026-10-05T10:00:00.000Z",
            cuerpo: { hola: 1 },
        });
    });
});
