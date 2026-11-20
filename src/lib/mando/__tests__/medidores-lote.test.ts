import { describe, expect, it } from "vitest";

import { ESPERA_A_OTRA, type DetalleMedidor } from "@/lib/mando/medidores";
import { CLAVES_RESUMEN_PULSO, extraerResumenMedidores, parsearClavesLote } from "@/lib/mando/medidores-lote";

describe("parsearClavesLote", () => {
    it("filtra claves desconocidas, quita duplicados y respeta el orden", () => {
        expect(parsearClavesLote(null)).toEqual([]);
        expect(parsearClavesLote("")).toEqual([]);
        expect(parsearClavesLote("agentes,inventada,listas,agentes,en-curso,../etc")).toEqual([
            "agentes",
            "listas",
            "en-curso",
        ]);
    });

    it("incluye todas las claves del pulso", () => {
        expect(parsearClavesLote(CLAVES_RESUMEN_PULSO.join(","))).toEqual([...CLAVES_RESUMEN_PULSO]);
    });
});

describe("extraerResumenMedidores", () => {
    const base = (overrides: Partial<DetalleMedidor>): DetalleMedidor => ({
        clave: "listas",
        titulo: "t",
        resumen: "",
        filas: [],
        acciones: [],
        ...overrides,
    });

    it("calcula el resumen completo manteniendo las mismas reglas por pastilla", () => {
        const res = extraerResumenMedidores({
            listas: base({
                clave: "listas",
                filas: [
                    { id: "T1", titulo: "t1", estado: "lista", acciones: [] },
                    { id: "T2", titulo: "t2", estado: ESPERA_A_OTRA, acciones: [] },
                ],
            }),
            agentes: base({ clave: "agentes", cuenta: 4, resumen: "4 activos", filas: [] }),
            "en-curso": base({ clave: "en-curso", cuenta: 5, resumen: "5 en marcha", filas: [] }),
            contenedores: base({ clave: "contenedores", resumen: "9 libres en nube" }),
            proveedores: base({
                clave: "proveedores",
                resumen: "2 disponibles · 1 sin cupo",
                filas: [
                    { id: "groq", titulo: "groq", estado: "vivo", acciones: [] },
                    { id: "nim", titulo: "nim", estado: "vivo", acciones: [] },
                    { id: "openrouter", titulo: "openrouter", estado: "sin cupo", acciones: [] },
                ],
            }),
            tokens: base({
                clave: "tokens",
                resumen: "42.5 tok/s",
                filas: [{ id: "c1", titulo: "nube", estado: "trabajando sin contador", etapa: "3 agentes", acciones: [] }],
            }),
            "ola-activa": base({
                clave: "ola-activa",
                resumen: "1 ola",
                filas: [{ id: "ola:1", titulo: "Ola 400 · Prueba", acciones: [] }],
            }),
            integradas: base({ clave: "integradas", resumen: "310 tareas integradas en main" }),
            "credito-claude": base({
                clave: "credito-claude",
                resumen: "sesión 12 % · semana 45 %",
                filas: [{ id: "s", titulo: "sesión", estado: "ok", acciones: [] }],
            }),
            fallidas: base({ clave: "fallidas", resumen: "1 fallo", filas: [{ id: "F1", titulo: "f1", acciones: [] }] }),
        });

        expect(res.listas).toBe(1);
        expect(res.agentes).toBe(4);
        expect(res.enCurso).toBe(5);
        expect(res.contenedores).toBe(9);
        expect(res.vivos).toBe(2);
        expect(res.agotados).toBe(1);
        expect(res.tokens).toBe(42.5);
        expect(res.tokensCiegos).toBe(3);
        expect(res.olas).toBe(1);
        expect(res.olaTitulo).toBe("Ola 400 · Prueba");
        expect(res.integradas).toBe(310);
        expect(res.credito).toBe("12 % · 45 %");
        expect(res.creditoTono).toBe("ok");
        expect(res.fallidas).toBe(1);
    });
});
