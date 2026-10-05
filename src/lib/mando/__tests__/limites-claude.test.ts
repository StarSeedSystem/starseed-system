import { describe, it, expect } from "vitest";

import {
    ENLACE_USO_CLAUDE,
    costePorRevision,
    disparosAntes,
    estadoLimitesClaude,
    resumenLimitesClaude,
    type LecturaLimites,
    type ProgramadaClaude,
} from "../limites-claude";

const T0 = Date.parse("2026-10-05T12:00:00.000Z");

function lectura(parcial: Partial<LecturaLimites>): LecturaLimites {
    return {
        t: "2026-10-05T12:00:00.000Z",
        sesion_pct: 30,
        sesion_reinicio: "2026-10-05T14:10:00.000Z",
        semana_pct: 61,
        semana_reinicio: "2026-10-09T00:00:00.000Z",
        modelo_nombre: null,
        modelo_pct: null,
        modelo_reinicio: null,
        fuente: "prueba",
        ...parcial,
    };
}

function cfg(parcial: Record<string, unknown>): Record<string, unknown> {
    return {
        lecturas: [],
        programadas: { t: "2026-10-05T12:00:00.000Z", lista: [] },
        umbral_pct: 90,
        ...parcial,
    };
}

describe("costePorRevision", () => {
    it("devuelve la mediana de los aumentos positivos entre lecturas consecutivas", () => {
        const lecturas = [
            lectura({ sesion_pct: 10 }),
            lectura({ sesion_pct: 14 }),
            lectura({ sesion_pct: 20 }),
            lectura({ sesion_pct: 26 }),
        ];
        // deltas: 4, 6, 6 → mediana 6
        expect(costePorRevision(lecturas, "sesion")).toBe(6);
    });

    it("mediana par: media de los dos centrales e ignora bajadas", () => {
        const lecturas = [
            lectura({ sesion_pct: 10 }),
            lectura({ sesion_pct: 4 }),
            lectura({ sesion_pct: 6 }),
            lectura({ sesion_pct: 16 }),
        ];
        // deltas positivos: 2, 10 → mediana 6
        expect(costePorRevision(lecturas, "sesion")).toBe(6);
    });

    it("no mezcla ventanas distintas (cambia el reinicio ⇒ no cuenta)", () => {
        const lecturas = [
            lectura({ sesion_pct: 10, sesion_reinicio: "2026-10-05T14:10:00.000Z" }),
            lectura({ sesion_pct: 40, sesion_reinicio: "2026-10-05T19:10:00.000Z" }),
        ];
        expect(costePorRevision(lecturas, "sesion")).toBeNull();
    });

    it("null si solo hay una lectura", () => {
        expect(costePorRevision([lectura({})], "semana")).toBeNull();
    });
});

describe("disparosAntes", () => {
    const lista: ProgramadaClaude[] = [
        { nombre: "revisión horaria", proxima: "2026-10-05T12:30:00.000Z", cada_min: 60 },
        { nombre: "puntual", proxima: "2026-10-05T13:00:00.000Z", cada_min: null },
        { nombre: "ya pasó", proxima: "2026-10-05T10:00:00.000Z", cada_min: 30 },
        { nombre: "después del reinicio", proxima: "2026-10-05T15:00:00.000Z", cada_min: null },
    ];

    it("cuenta 1 por próxima dentro + repeticiones por cada_min", () => {
        const hasta = Date.parse("2026-10-05T14:10:00.000Z");
        // horaria: 1 + floor(100 min / 60) = 2; puntual: 1; pasadas y posteriores: 0
        expect(disparosAntes(lista, T0, hasta)).toBe(3);
    });

    it("0 si el reinicio ya pasó", () => {
        expect(disparosAntes(lista, T0, T0 - 1)).toBe(0);
    });
});

describe("estadoLimitesClaude", () => {
    it("entrada basura: todo null, tono aviso y recomendación de sin lectura", () => {
        for (const basura of [null, undefined, {}, { lecturas: "patata" }, { lecturas: [{ foo: 1 }] }]) {
            const e = estadoLimitesClaude(basura, T0);
            expect(e.sesion).toBeNull();
            expect(e.semana).toBeNull();
            expect(e.modelo).toBeNull();
            expect(e.lecturaEn).toBeNull();
            expect(e.tono).toBe("aviso");
            expect(e.recomendacion).toBe("Sin lectura todavía: la dirección la toma en su próxima revisión");
        }
    });

    it("proyección, tonos y recomendación con programadas", () => {
        const lecturas = [
            lectura({ t: "2026-10-05T11:30:00.000Z", sesion_pct: 25 }),
            lectura({ t: "2026-10-05T12:00:00.000Z", sesion_pct: 30, semana_pct: 61 }),
        ];
        const c = cfg({
            lecturas,
            umbral_pct: 90,
            programadas: {
                t: "2026-10-05T12:00:00.000Z",
                lista: [{ nombre: "revisión", proxima: "2026-10-05T12:30:00.000Z", cada_min: 30 }],
            },
        });
        const e = estadoLimitesClaude(c, T0);
        expect(e.sesion).not.toBeNull();
        expect(e.sesion!.coste).toBe(5);
        // disparos sesión: 1 + floor(100/30) = 4 → proyección 30 + 20 = 50
        expect(e.programadasEnSesion).toBe(4);
        expect(e.sesion!.proyeccion).toBe(50);
        expect(e.sesion!.tono).toBe("ok");
        expect(e.semana!.pct).toBe(61);
        expect(e.semana!.tono).toBe("aviso");
        expect(e.tono).toBe("aviso");
        expect(e.recomendacion).toBeNull();
        expect(e.desactualizada).toBe(false);

        // Con más disparos la proyección de sesión supera el umbral ⇒ recomendación
        const c2 = cfg({
            lecturas,
            umbral_pct: 40,
            programadas: {
                t: "2026-10-05T12:00:00.000Z",
                lista: [{ nombre: "revisión", proxima: "2026-10-05T12:30:00.000Z", cada_min: 10 }],
            },
        });
        const e2 = estadoLimitesClaude(c2, T0);
        // disparos: 1 + floor(100/10) = 11 → proyección 30 + 55 = 85 > 40
        expect(e2.sesion!.proyeccion).toBe(85);
        expect(e2.recomendacion).toBe("Espacia las revisiones: caben 2 hasta el reinicio de sesión");
        expect(e2.tono).toBe("peligro"); // semana 61 ≥ umbral 40
    });

    it("peligro cuando pct ≥ umbral o proyección > 100", () => {
        const e = estadoLimitesClaude(
            cfg({ lecturas: [lectura({ sesion_pct: 92 })], umbral_pct: 90 }),
            T0,
        );
        expect(e.sesion!.tono).toBe("peligro");
        expect(e.tono).toBe("peligro");

        const e2 = estadoLimitesClaude(
            cfg({
                lecturas: [
                    lectura({ t: "2026-10-05T11:59:00.000Z", sesion_pct: 80 }),
                    lectura({ t: "2026-10-05T12:00:00.000Z", sesion_pct: 90, semana_pct: 10 }),
                ],
                umbral_pct: 99,
                programadas: {
                    t: "2026-10-05T12:00:00.000Z",
                    lista: [{ nombre: "r", proxima: "2026-10-05T12:05:00.000Z", cada_min: 5 }],
                },
            }),
            T0,
        );
        // disparos sesión: 1 + floor(125/5) = 26 → proyección 90 + 26×10 = 350 > 100
        expect(e2.sesion!.proyeccion).toBe(350);
        expect(e2.sesion!.tono).toBe("peligro");
        expect(e2.recomendacion).toBe("Espacia las revisiones: caben 0 hasta el reinicio de sesión");
    });

    it("reinicio ya pasado: la ventana vale 0 % y queda reiniciada", () => {
        const e = estadoLimitesClaude(
            cfg({ lecturas: [lectura({ sesion_reinicio: "2026-10-05T11:00:00.000Z" })] }),
            T0,
        );
        expect(e.sesion!.reiniciada).toBe(true);
        expect(e.sesion!.pct).toBe(0);
        expect(e.sesion!.minutosParaReinicio).toBe(0);
        expect(e.sesion!.tono).toBe("ok");
    });

    it("lectura de hace más de 120 min: desactualizada y como mínimo aviso", () => {
        const e = estadoLimitesClaude(
            cfg({ lecturas: [lectura({ t: "2026-10-05T09:00:00.000Z", sesion_pct: 10, semana_pct: 10 })] }),
            T0,
        );
        expect(e.desactualizada).toBe(true);
        expect(e.lecturaHaceMin).toBe(180);
        expect(e.tono).toBe("aviso");
    });

    it("ventana de modelo solo si claude.ai la enseña", () => {
        const e = estadoLimitesClaude(
            cfg({
                lecturas: [
                    lectura({
                        modelo_nombre: "Fable",
                        modelo_pct: 45,
                        modelo_reinicio: "2026-10-09T00:00:00.000Z",
                    }),
                ],
            }),
            T0,
        );
        expect(e.modeloNombre).toBe("Fable");
        expect(e.modelo).not.toBeNull();
        expect(e.modelo!.pct).toBe(45);
    });
});

describe("resumenLimitesClaude", () => {
    it("formato del contrato", () => {
        const e = estadoLimitesClaude(
            cfg({
                lecturas: [
                    lectura({ t: "2026-10-05T11:00:00.000Z", sesion_pct: 26 }),
                    lectura({ t: "2026-10-05T12:00:00.000Z", sesion_pct: 34, semana_pct: 61 }),
                ],
                programadas: {
                    t: "2026-10-05T12:00:00.000Z",
                    lista: [{ nombre: "r", proxima: "2026-10-05T12:10:00.000Z", cada_min: 30 }],
                },
            }),
            T0,
        );
        // 2 h 10 min hasta el reinicio de la sesión; disparos 1 + floor(120/30) = 5 → 34 + 40 = 74
        expect(resumenLimitesClaude(e)).toBe("sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 74 %");
    });

    it("sin lectura y solo minutos", () => {
        expect(resumenLimitesClaude(estadoLimitesClaude(null, T0))).toBe("sin lectura");
        const e = estadoLimitesClaude(
            cfg({ lecturas: [lectura({ semana_pct: 10 })] }),
            Date.parse("2026-10-05T13:25:00.000Z"),
        );
        expect(resumenLimitesClaude(e)).toBe("sesión 30 % · semana 10 % · reinicia en 45 min");
    });
});

describe("constantes", () => {
    it("enlace de uso", () => {
        expect(ENLACE_USO_CLAUDE).toBe("https://claude.ai/settings/usage");
    });
});



