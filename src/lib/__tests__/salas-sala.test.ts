/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Salas (Ola 307) — pruebas del contrato PURO de sala.
 * ---------------------------------------------------------------------------
 * Se prueban la matriz de roles completa, la elección de transporte (con la
 * privacidad por delante) y que los cinco tipos declaren capacidades. No hay
 * red, ni Supabase, ni disco: el módulo es puro y la suite, determinista.
 *
 * Nota de estilo: `globals: false`, así que se importan los helpers de vitest
 * explícitamente (nunca se usan las globales implícitas).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

import {
    puedeVer,
    puedeEditar,
    puedeInvitar,
    rolDe,
    elegirTransporte,
    CAPACIDADES_POR_TIPO,
    admiteCapacidad,
    type Sala,
    type TipoSala,
    type Alcanzabilidad,
} from "@/lib/salas/sala";

/** Sala mínima de pruebas, con los cuatro roles representados. */
function sala(cambios: Partial<Sala> = {}): Sala {
    return {
        id: "sala-1",
        tipo: "pizarra",
        titulo: "Pizarra de la asamblea",
        visibilidad: "privada",
        transporte: "local",
        miembros: {
            "u-dueno": "dueno",
            "u-editor": "editor",
            "u-comenta": "comentarista",
            "u-observa": "observador",
        },
        creadaEn: 1_757_000_000_000,
        ...cambios,
    };
}

/** Alcanzabilidad mínima; se enciende sólo lo que cada prueba necesita. */
function alcance(cambios: Partial<Alcanzabilidad> = {}): Alcanzabilidad {
    return { internet: false, servidorPrivado: false, malla: false, ...cambios };
}

describe("salas · matriz de roles", () => {
    it("reconoce el rol de cada miembro y devuelve null para un extraño", () => {
        const s = sala();
        expect(rolDe(s, "u-dueno")).toBe("dueno");
        expect(rolDe(s, "u-editor")).toBe("editor");
        expect(rolDe(s, "u-comenta")).toBe("comentarista");
        expect(rolDe(s, "u-observa")).toBe("observador");
        expect(rolDe(s, "u-extrano")).toBeNull();
    });

    it("en sala privada: ven los cuatro miembros, edita sólo dueño y editor, invita sólo el dueño", () => {
        const s = sala({ visibilidad: "privada" });
        const matriz = [
            { id: "u-dueno", ver: true, editar: true, invitar: true },
            { id: "u-editor", ver: true, editar: true, invitar: false },
            { id: "u-comenta", ver: true, editar: false, invitar: false },
            { id: "u-observa", ver: true, editar: false, invitar: false },
            { id: "u-extrano", ver: false, editar: false, invitar: false },
        ];
        for (const fila of matriz) {
            expect([fila.id, puedeVer(s, fila.id)]).toEqual([fila.id, fila.ver]);
            expect([fila.id, puedeEditar(s, fila.id)]).toEqual([fila.id, fila.editar]);
            expect([fila.id, puedeInvitar(s, fila.id)]).toEqual([fila.id, fila.invitar]);
        }
    });

    it("en sala de grupo el editor ya puede invitar, y el extraño sigue sin ver", () => {
        const s = sala({ visibilidad: "grupo", grupoId: "g-1" });
        expect(puedeInvitar(s, "u-editor")).toBe(true);
        expect(puedeInvitar(s, "u-comenta")).toBe(false);
        expect(puedeVer(s, "u-extrano")).toBe(false);
    });

    it("en sala pública cualquiera ve, pero quien no es miembro no edita ni invita", () => {
        const s = sala({ visibilidad: "publica" });
        expect(puedeVer(s, "u-extrano")).toBe(true);
        expect(puedeEditar(s, "u-extrano")).toBe(false);
        expect(puedeInvitar(s, "u-extrano")).toBe(false);
        expect(puedeEditar(s, "u-editor")).toBe(true);
        expect(puedeInvitar(s, "u-editor")).toBe(true);
    });
});

describe("salas · elección de transporte", () => {
    it("sala privada con internet y malla NUNCA elige servidor público", () => {
        const s = sala({ visibilidad: "privada" });
        const d = elegirTransporte(s, alcance({ internet: true, malla: true }));
        expect(d.transporte).toBe("malla-p2p");
        expect(d.transporte).not.toBe("servidor-publico");
        expect(d.motivo.length).toBeGreaterThan(0);
    });

    it("sala privada con internet, malla y servidor privado prefiere el servidor privado", () => {
        const s = sala({ visibilidad: "privada", servidorUrl: "https://casa.local:8443" });
        const d = elegirTransporte(
            s,
            alcance({ internet: true, malla: true, servidorPrivado: true }),
        );
        expect(d.transporte).toBe("servidor-privado");
    });

    it("no cuenta como servidor privado si no sabemos dónde está", () => {
        const s = sala({ visibilidad: "privada" });
        const d = elegirTransporte(s, alcance({ servidorPrivado: true, malla: true }));
        expect(d.transporte).toBe("malla-p2p");
    });

    it("sala de grupo también antepone la malla al servidor público", () => {
        const s = sala({ visibilidad: "grupo", grupoId: "g-1" });
        expect(elegirTransporte(s, alcance({ internet: true, malla: true })).transporte).toBe(
            "malla-p2p",
        );
    });

    it("sala privada sin camino reservado acepta servidor público, y el motivo lo confiesa", () => {
        const s = sala({ visibilidad: "privada" });
        const d = elegirTransporte(s, alcance({ internet: true }));
        expect(d.transporte).toBe("servidor-publico");
        expect(d.motivo).toContain("menos reservado");
    });

    it("sala pública con internet usa el servidor público", () => {
        const s = sala({ visibilidad: "publica" });
        expect(elegirTransporte(s, alcance({ internet: true })).transporte).toBe(
            "servidor-publico",
        );
    });

    it("sin nada disponible cae a `local` con un motivo honesto, sea pública o privada", () => {
        for (const visibilidad of ["privada", "publica"] as const) {
            const d = elegirTransporte(sala({ visibilidad }), alcance());
            expect(d.transporte).toBe("local");
            expect(d.motivo).toContain("NO se está sincronizando");
        }
    });
});

describe("salas · capacidades por tipo", () => {
    const TIPOS: TipoSala[] = ["pizarra", "escritorio", "dashboard", "escena3d", "xr"];

    it("los cinco tipos declaran capacidades y ninguna lista viene vacía o repetida", () => {
        expect(Object.keys(CAPACIDADES_POR_TIPO).sort()).toEqual([...TIPOS].sort());
        for (const tipo of TIPOS) {
            const caps = CAPACIDADES_POR_TIPO[tipo];
            expect(caps.length).toBeGreaterThan(0);
            expect(new Set(caps).size).toBe(caps.length);
        }
    });

    it("cada tipo admite lo suyo: trazos en la pizarra, widgets en el dashboard, anclas en 3D y XR", () => {
        expect(CAPACIDADES_POR_TIPO.pizarra).toContain("trazos");
        expect(CAPACIDADES_POR_TIPO.pizarra).toContain("notas");
        expect(CAPACIDADES_POR_TIPO.pizarra).toContain("formas");
        expect(CAPACIDADES_POR_TIPO.escritorio).toContain("ventanas");
        expect(CAPACIDADES_POR_TIPO.dashboard).toContain("widgets");
        for (const tipo of ["escena3d", "xr"] as const) {
            expect(CAPACIDADES_POR_TIPO[tipo]).toContain("objetos");
            expect(CAPACIDADES_POR_TIPO[tipo]).toContain("anclas");
            expect(CAPACIDADES_POR_TIPO[tipo]).toContain("avatares");
        }
    });

    it("`admiteCapacidad` deja a la UI no ofrecer lo imposible", () => {
        expect(admiteCapacidad(sala({ tipo: "pizarra" }), "trazos")).toBe(true);
        expect(admiteCapacidad(sala({ tipo: "pizarra" }), "anclas")).toBe(false);
        expect(admiteCapacidad(sala({ tipo: "dashboard" }), "widgets")).toBe(true);
        expect(admiteCapacidad(sala({ tipo: "xr" }), "escala-real")).toBe(true);
    });
});
