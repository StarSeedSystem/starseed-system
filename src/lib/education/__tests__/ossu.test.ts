// src/lib/education/__tests__/ossu.test.ts
// Pruebas del módulo puro de OSSU (Ola 1025R · INF1025E).

import { describe, it, expect } from "vitest";
import {
    AVISO_LICENCIA_OSSU,
    bloquesOssu,
    contadorCursosOssu,
    cursosDeSeccion,
    cursosOssu,
    itinerarioOssu,
    seccionesOssu,
    versionOssu,
} from "../ossu";

describe("versionOssu", () => {
    it("da el commit corto y la fecha del main de OSSU", () => {
        const v = versionOssu();
        expect(v.commit).toMatch(/^[0-9a-f]{7}$/);
        expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe("estructura del currículo", () => {
    it("son 63 cursos en 15 secciones", () => {
        expect(contadorCursosOssu()).toBe(63);
        expect(seccionesOssu()).toHaveLength(15);
        expect(cursosOssu()).toHaveLength(63);
    });

    it("los bloques salen agrupados y en orden: Intro CS, Core CS, Advanced CS, Final project", () => {
        expect(bloquesOssu()).toEqual(["Intro CS", "Core CS", "Advanced CS", "Final project"]);
    });

    it("cada sección del bloque Final project cierra con 9 cursos", () => {
        const final = seccionesOssu().filter((s) => s.bloque === "Final project");
        expect(final).toHaveLength(1);
        expect(cursosDeSeccion(final[0].seccion)).toHaveLength(9);
    });

    it("cada curso trae enlace http(s), anfitrión, duración y esfuerzo", () => {
        for (const c of cursosOssu()) {
            expect(c.url.startsWith("http")).toBe(true);
            expect(c.anfitrion.length).toBeGreaterThan(0);
            expect(c.duracion.length).toBeGreaterThan(0);
            expect(c.esfuerzo.length).toBeGreaterThan(0);
        }
    });
});

describe("AVISO_LICENCIA_OSSU", () => {
    it("va visible y explica que se enlaza sin copiar material", () => {
        expect(AVISO_LICENCIA_OSSU.length).toBeGreaterThan(20);
        expect(AVISO_LICENCIA_OSSU).toContain("enlaza");
    });
});

describe("itinerarioOssu", () => {
    it("es una guía de tipo «itinerario» con una sección por sección OSSU", () => {
        const itinerario = itinerarioOssu();
        expect(itinerario.kind).toBe("itinerario");
        expect(itinerario.title).toBe("Ruta de Ciencias de la Computación (OSSU)");
        expect(itinerario.sections).toHaveLength(15);
        expect(itinerario.summary).toContain("63 cursos");
    });

    it("trae un recurso por curso, con su url y etiqueta", () => {
        const recursos = itinerarioOssu().sections.flatMap((s) => s.resources ?? []);
        expect(recursos).toHaveLength(63);
        for (const r of recursos) {
            expect(r.label.length).toBeGreaterThan(0);
            expect(r.url?.startsWith("http")).toBe(true);
        }
    });
});
