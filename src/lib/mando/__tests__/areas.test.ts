import { describe, expect, it } from "vitest";
import {
    AREAS_TRABAJO,
    CLASES_MENSAJE,
    mensajeFalloCarga,
    mensajeSinActividad,
    type AreaTrabajo,
} from "../areas";

const area: AreaTrabajo = {
    id: "prueba",
    nombre: "Área de prueba",
    descripcion: "Una zona inventada para el test.",
    color: "violet",
    rutas: [{ etiqueta: "Bienvenida", href: "/bienvenida" }],
    documentos: ["memory/principles.md"],
    olas: [],
};

describe("mensajeFalloCarga", () => {
    it("un fallo al leer eventos es error, no un aviso: dice qué falta y cómo reintentar", () => {
        const m = mensajeFalloCarga("eventos");
        expect(m.tono).toBe("error");
        expect(m.titulo).toMatch(/actividad/i);
        expect(m.texto).toMatch(/Actualizar/);
        expect(m.texto).not.toMatch(/denegado/);
    });

    it("un fallo al leer permisos se distingue de un permiso denegado", () => {
        const m = mensajeFalloCarga("permisos");
        expect(m.tono).toBe("error");
        expect(m.titulo).toMatch(/permisos/i);
        expect(m.texto).toMatch(/no es un permiso denegado/i);
        expect(m.texto).toMatch(/Privacidad/);
    });

    it("los dos fallos no comparten texto (contexto real, no genérico)", () => {
        expect(mensajeFalloCarga("eventos").texto).not.toBe(mensajeFalloCarga("permisos").texto);
    });
});

describe("mensajeSinActividad", () => {
    it("guía con el nombre del área y su primer acceso y memoria", () => {
        const m = mensajeSinActividad(area);
        expect(m.tono).toBe("aviso");
        expect(m.titulo).toContain(area.nombre);
        expect(m.texto).toContain("Bienvenida");
        expect(m.texto).toContain("memory/principles.md");
    });

    it("sin accesos ni memorias sigue dando un mensaje útil", () => {
        const m = mensajeSinActividad({ ...area, rutas: [], documentos: [] });
        expect(m.texto.length).toBeGreaterThan(20);
        expect(m.titulo).toContain(area.nombre);
    });

    it("nunca filtra rutas absolutas del disco", () => {
        for (const a of AREAS_TRABAJO) {
            expect(mensajeSinActividad(a).texto).not.toMatch(/\/Users\/|\/home\//);
        }
    });
});

describe("CLASES_MENSAJE", () => {
    it("cada tono lleva borde y tinta propia sobre fondo profundo", () => {
        for (const clase of Object.values(CLASES_MENSAJE)) {
            expect(clase).toContain("border");
            expect(clase).toContain("text-");
        }
        expect(CLASES_MENSAJE.error).toContain("text-red-100");
        expect(CLASES_MENSAJE.error).toContain("bg-red-950");
    });

    it("los tres tonos no comparten estilo (se distinguen sin depender solo del color)", () => {
        const clases = Object.values(CLASES_MENSAJE);
        expect(new Set(clases).size).toBe(3);
    });
});
