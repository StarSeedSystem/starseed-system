// Pruebas del módulo PURO src/lib/mando/reportes.ts (bandeja curada del Mando).
import { describe, it, expect } from "vitest";

import {
    construirReportes,
    filtrar,
    importanciaDe,
    puntuarRelevancia,
    rutaLocalDe,
    type DatosConstruccion,
    type Reporte,
} from "@/lib/mando/reportes";

const AHORA = new Date("2026-09-14T12:00:00Z").getTime();
const haceHoras = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();

const baseDatos: DatosConstruccion = {
    eventos: [],
    progreso: [],
    commits: [],
    colas: [],
    ahora: AHORA,
    baseRemota: "https://github.com/starseed",
    baseLocal: "http://localhost:9002",
};

const reporteBase: Reporte = {
    id: "nota:x:t0",
    t: haceHoras(0),
    clase: "nota",
    importancia: "baja",
    relevancia: 0,
    titulo: "Nota",
    contexto: "Texto",
    enlaces: [],
    pruebas: [],
};

describe("importanciaDe", () => {
    it("'espera' siempre es critica", () => {
        expect(importanciaDe("espera")).toBe("critica");
    });

    it("'aviso' bloqueante es critica y sin bloqueo es alta", () => {
        expect(importanciaDe("aviso", { bloqueante: true })).toBe("critica");
        expect(importanciaDe("aviso", { bloqueante: false })).toBe("alta");
        expect(importanciaDe("aviso")).toBe("alta");
    });

    it("'sugerencia' de director es alta y la otra, normal", () => {
        expect(importanciaDe("sugerencia", { esDirector: true })).toBe("alta");
        expect(importanciaDe("sugerencia", { esDirector: false })).toBe("normal");
        expect(importanciaDe("sugerencia")).toBe("normal");
    });

    it("'ola-cerrada' con fallidas es alta y sin ellas, normal", () => {
        expect(importanciaDe("ola-cerrada", { fallidas: 3 })).toBe("alta");
        expect(importanciaDe("ola-cerrada", { fallidas: 0 })).toBe("normal");
    });

    it("'cambio' y 'ola-nueva' son normal; 'nota' es baja", () => {
        expect(importanciaDe("cambio")).toBe("normal");
        expect(importanciaDe("ola-nueva")).toBe("normal");
        expect(importanciaDe("nota")).toBe("baja");
    });
});

describe("puntuarRelevancia", () => {
    it("base por importancia: critica 60, alta 45, normal 25, baja 10", () => {
        const p = (imp: Reporte["importancia"]) =>
            puntuarRelevancia({ ...reporteBase, importancia: imp }, AHORA);
        expect(p("critica")).toBe(60);
        expect(p("alta")).toBe(45);
        expect(p("normal")).toBe(25);
        expect(p("baja")).toBe(10);
    });

    it("suma 20 si pide decisión ('espera' o 'sugerencia')", () => {
        expect(puntuarRelevancia({ ...reporteBase, clase: "espera", importancia: "critica" }, AHORA)).toBe(80);
        expect(puntuarRelevancia({ ...reporteBase, clase: "sugerencia", importancia: "alta" }, AHORA)).toBe(65);
    });

    it("suma 15 si trae pruebas y 10 si trae enlace local", () => {
        const r: Reporte = {
            ...reporteBase,
            enlaces: [{ clase: "local", texto: "Probar", url: "http://localhost:9002/mando" }],
            pruebas: [{ clase: "codigo", texto: "x", pie: "p" }],
        };
        expect(puntuarRelevancia(r, AHORA)).toBe(35);
    });

    it("resta 1 por hora cumplida y respeta suelo 0 y techo 100", () => {
        expect(puntuarRelevancia({ ...reporteBase, t: haceHoras(5) }, AHORA)).toBe(5);
        expect(puntuarRelevancia({ ...reporteBase, t: haceHoras(200) }, AHORA)).toBe(0);
        const tope: Reporte = {
            ...reporteBase,
            clase: "espera",
            importancia: "critica",
            enlaces: [{ clase: "local", texto: "l", url: "u" }],
            pruebas: [{ clase: "captura", ruta: "r", pie: "p" }],
        };
        expect(puntuarRelevancia(tope, AHORA)).toBe(100);
    });

    it("fecha inválida no descuenta nada", () => {
        expect(puntuarRelevancia({ ...reporteBase, t: "no-fecha" }, AHORA)).toBe(10);
    });
});

describe("rutaLocalDe", () => {
    it("convierte src/app/(app)/mando/page.tsx en /mando", () => {
        expect(rutaLocalDe("src/app/(app)/mando/page.tsx")).toBe("/mando");
    });

    it("la raíz y lo que no es página se resuelven bien", () => {
        expect(rutaLocalDe("src/app/page.tsx")).toBe("/");
        expect(rutaLocalDe("src/lib/mando/reportes.ts")).toBeNull();
        expect(rutaLocalDe("src/app/api/mando/route.ts")).toBeNull();
    });
});

describe("construirReportes", () => {
    it("con listas vacías devuelve [] y no revienta", () => {
        expect(construirReportes(baseDatos)).toEqual([]);
    });

    it("un commit de src/app/(app)/mando/page.tsx produce enlace local /mando", () => {
        const rs = construirReportes({
            ...baseDatos,
            commits: [{
                sha: "abc1234def",
                asunto: "Bandeja de reportes",
                cuerpo: null,
                fecha: haceHoras(1),
                archivos: ["src/app/(app)/mando/page.tsx", "src/lib/mando/reportes.ts"],
            }],
        });
        expect(rs).toHaveLength(1);
        const r = rs[0];
        expect(r.clase).toBe("cambio");
        expect(r.id).toBe("cambio:abc1234def");
        expect(r.enlaces).toContainEqual({
            clase: "local",
            texto: "Probar /mando",
            url: "http://localhost:9002/mando",
        });
        expect(r.enlaces[0]).toEqual({
            clase: "diff",
            texto: "Diff abc1234",
            url: "https://github.com/starseed/commit/abc1234def",
        });
    });

    it("el contexto del commit agrupa los archivos por carpeta en prosa", () => {
        const rs = construirReportes({
            ...baseDatos,
            commits: [{
                sha: "aabbccd",
                asunto: "Dos librerías",
                cuerpo: null,
                fecha: haceHoras(0),
                archivos: ["src/lib/a.ts", "src/lib/b.ts", "src/app/x/page.tsx"],
            }],
        });
        expect(rs[0].contexto).toContain("2 archivos en src/lib");
        expect(rs[0].contexto).toContain("1 archivo en src/app/x");
        expect(rs[0].contexto).toContain("Dos librerías");
    });

    it("usa el cuerpo del commit como contexto si lo hay", () => {
        const rs = construirReportes({
            ...baseDatos,
            commits: [{ sha: "1", asunto: "A", cuerpo: "Detalle largo", fecha: haceHoras(0), archivos: [] }],
        });
        expect(rs[0].contexto).toBe("Detalle largo");
    });

    it("eventos: cola_terminada→ola-cerrada, inicio de cola→ola-nueva, director→sugerencia, resto→nota", () => {
        const rs = construirReportes({
            ...baseDatos,
            eventos: [
                { id: "e1", t: haceHoras(0), quien: "orquestador", tipo: "cola_terminada", tarea: "", texto: "Ola 300 cerrada" },
                { id: "e2", t: haceHoras(0), quien: "orquestador", tipo: "inicio", tarea: "", texto: "Cola 301 publicada" },
                { id: "e3", t: haceHoras(0), quien: "director-1", tipo: "comentario", tarea: "", texto: "Haz esto" },
                { id: "e4", t: haceHoras(0), quien: "agente", tipo: "comentario", tarea: "", texto: "Voy" },
            ],
        });
        expect(rs.map((r) => r.clase).sort()).toEqual(["nota", "ola-cerrada", "ola-nueva", "sugerencia"]);
    });

    it("progreso en espera genera reporte 'espera' y el resto no", () => {
        const rs = construirReportes({
            ...baseDatos,
            progreso: [
                { id: "t1", estado: "esperando_aprobacion", ola: "300", texto: "Aprueba la bandeja" },
                { id: "t2", estado: "integrada", ola: "300" },
            ],
        });
        expect(rs).toHaveLength(1);
        expect(rs[0].clase).toBe("espera");
        expect(rs[0].importancia).toBe("critica");
    });

    it("un reporte antiguo pierde relevancia frente a uno nuevo de la misma clase", () => {
        const rs = construirReportes({
            ...baseDatos,
            commits: [
                { sha: "viejo1", asunto: "Viejo", cuerpo: null, fecha: haceHoras(20), archivos: [] },
                { sha: "nuevo1", asunto: "Nuevo", cuerpo: null, fecha: haceHoras(0), archivos: [] },
            ],
        });
        expect(rs[0].titulo).toBe("Nuevo");
        expect(rs[0].relevancia).toBeGreaterThan(rs[1].relevancia);
    });

    it("'espera' sale por encima de 'nota'", () => {
        const rs = construirReportes({
            ...baseDatos,
            progreso: [{ id: "t1", estado: "esperando_aprobacion" }],
            eventos: [{ id: "e1", t: haceHoras(0), quien: "agente", tipo: "comentario", tarea: "x", texto: "Voy" }],
        });
        expect(rs[0].clase).toBe("espera");
        expect(rs[1].clase).toBe("nota");
    });
});
