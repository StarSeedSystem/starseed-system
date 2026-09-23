import { describe, expect, it } from "vitest";

import { cargaDePublicacion, detalleDeMedidor, veredictoDeAgente } from "@/lib/mando/medidores";

// (2026-09-23) Alex: «botones para buscar y asignar tareas faltantes en Tareas en curso, Agentes y
// Listas, en cada una y en general», y «en Sin publicar un indicador de carga como el de las
// comprobaciones».

const latido = {
    tarea: "LY1",
    fase: "escribiendo",
    modelo: "google/gemini-3.6-flash",
    minutos: 12,
    donde: "mac",
    proveedor: "google",
    quietoSegundos: 20,
    bytesLog: 40_000,
};

describe("botones de asignar", () => {
    it("Listas: cada tarea trae «Asignar ya» y «¿Puede entrar?», y el panel los dos generales", () => {
        const d = detalleDeMedidor("listas", {
            ejecutables: [{ id: "LY2", titulo: "Laya en Jev" }],
            asuntosDeMain: "",
        });
        expect(d.filas[0].acciones.map((a) => a.clase)).toEqual(
            expect.arrayContaining(["asignar-tarea", "comprobar-asignacion"]),
        );
        expect(d.acciones.map((a) => a.clase)).toEqual(expect.arrayContaining(["asignar-huecos", "comprobar-asignacion"]));
    });

    it("Agentes: cada agente se comprueba por su TAREA, no por «proveedor · modelo»", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido] });
        const a = d.filas[0].acciones.find((x) => x.clase === "comprobar-agente");
        expect(a?.objetivo).toBe("LY1");
        expect(d.acciones.map((x) => x.clase)).toContain("asignar-huecos");
    });

    it("En curso: las activas se comprueban; las rancias se pueden reasignar ya", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [latido],
            progreso: { LY1: { estado: "en_curso" }, VZR1: { estado: "en_curso", t: "2026-09-23 10:00:00" } },
        });
        const viva = d.filas.find((f) => f.id === "LY1");
        const rancia = d.filas.find((f) => f.id === "VZR1");
        expect(viva?.acciones.map((a) => a.clase)).toContain("comprobar-agente");
        expect(rancia?.acciones.map((a) => a.clase)).toContain("asignar-tarea");
        expect(d.acciones.map((a) => a.clase)).toContain("asignar-huecos");
    });
});

describe("veredictoDeAgente", () => {
    it("sin latido lo llama estado rancio", () => {
        expect(veredictoDeAgente(undefined, 3)).toMatch(/rancio/);
    });
    it("esperando pasarela: dice si hay alguna libre", () => {
        const l = { ...latido, fase: "esperando proveedor" };
        expect(veredictoDeAgente(l, 2)).toMatch(/2 pasarela/);
        expect(veredictoDeAgente(l, 0)).toMatch(/NO hay ninguna/);
    });
    it("callado: dice cuándo lo corta el orquestador", () => {
        expect(veredictoDeAgente({ ...latido, quietoSegundos: 600 }, 1)).toMatch(/10 min sin escribir/);
    });
    it("escribiendo: normal", () => {
        expect(veredictoDeAgente(latido, 1)).toMatch(/con normalidad/);
    });
});

describe("indicador de carga de «Sin publicar»", () => {
    const ahora = Date.parse("2026-09-23T11:10:00");
    const diario = {
        estado: "corriendo",
        empezado: "2026-09-23 11:05:00",
        pasos: [
            { titulo: "Comprobar la rama", estado: "ok" },
            { titulo: "Commit", estado: "omitido" },
            { titulo: "Tipos (tsc --noEmit)", estado: "corriendo", detalle: "esperando turno de máquina" },
            { titulo: "Pruebas del OS", estado: "pendiente" },
        ],
    };

    it("dice el paso, cuánto lleva y el avance", () => {
        const c = cargaDePublicacion(diario, ahora);
        expect(c?.texto).toMatch(/paso 3 de 4: Tipos \(tsc --noEmit\) · esperando turno de máquina · 5 min/);
        expect(c?.progreso).toBe(50);
    });

    it("una publicación terminada no enseña carga", () => {
        expect(cargaDePublicacion({ ...diario, estado: "hecho" }, ahora)).toBeUndefined();
        expect(cargaDePublicacion(null, ahora)).toBeUndefined();
    });

    it("un diario «corriendo» de hace horas no finge estar publicando", () => {
        expect(cargaDePublicacion({ ...diario, empezado: "2026-09-23 07:00:00" }, ahora)?.texto).toMatch(/parece muerto/);
    });

    it("el panel lo lleva y no ofrece publicar otra vez mientras tanto", () => {
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "abcdef1234", asunto: "algo" }],
            publicacion: { ...diario, empezado: new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ") },
        });
        expect(d.cargando?.texto).toMatch(/Publicando/);
        expect(d.acciones).toEqual([]);
        expect(d.resumen).toMatch(/publicando/);
    });
});
