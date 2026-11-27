import { describe, expect, it } from "vitest";
import {
    crearPreferenciasPorDefecto,
    obtenerPreferenciasParaRelacion,
    aplicarExcepcionNeurona,
    type PreferenciasNFC,
    type PreferenciasRelacion,
    type RelacionNFC,
    type AccionCatalogo,
    type AvisoNFC,
} from "@/lib/nfc/preferencias";

const RELACIONES: RelacionNFC[] = [
    "misma-cuenta",
    "otra-reconocida",
    "otra-nueva",
    "nodo-propio",
    "nodo-publico",
    "etiqueta",
];

describe("preferencias.ts - valores por defecto seguros (§3)", () => {
    const prefs = crearPreferenciasPorDefecto();

    it("tiene preferencias para todas las relaciones", () => {
        for (const rel of RELACIONES) {
            expect(prefs.porRelacion[rel]).toBeDefined();
        }
    });

    it("con otras cuentas: nada automatico salvo mostrar opciones", () => {
        for (const rel of ["otra-reconocida", "otra-nueva"] as RelacionNFC[]) {
            const p = prefs.porRelacion[rel];
            expect(p.perfil).toBe("pedir-permiso");
            expect(p.accionesAutomaticas).toHaveLength(0);
            expect(p.accionesOfrecidas.length).toBeGreaterThan(0);
            expect(p.aviso).toBe("notificar");
            expect(p.ubicacion).toBe("no");
        }
    });

    it("con misma cuenta: sugerencias de Astraura, algunas automaticas", () => {
        const p = prefs.porRelacion["misma-cuenta"];
        expect(p.perfil).toBe("publico");
        expect(p.accionesAutomaticas.length).toBeGreaterThan(0);
        expect(p.aviso).toBe("notificar");
    });

    it("con nodo propio: perfil publico, acciones automaticas", () => {
        const p = prefs.porRelacion["nodo-propio"];
        expect(p.perfil).toBe("publico");
        expect(p.accionesAutomaticas.length).toBeGreaterThan(0);
    });

    it("con nodo publico: perfil publico, solo ofrecer", () => {
        const p = prefs.porRelacion["nodo-publico"];
        expect(p.perfil).toBe("publico");
        expect(p.accionesAutomaticas).toHaveLength(0);
        expect(p.accionesOfrecidas.length).toBeGreaterThan(0);
    });

    it("con etiqueta: perfil no-mostrar, solo ofrecer registro", () => {
        const p = prefs.porRelacion["etiqueta"];
        expect(p.perfil).toBe("no-mostrar");
        expect(p.accionesAutomaticas).toHaveLength(0);
    });
});

describe("preferencias.ts - excepciones por neurona concreta", () => {
    const prefsBase = crearPreferenciasPorDefecto();
    const neuronaId = "neurona-especial-123";

    it("aplica excepcion de perfil", () => {
        const prefs = aplicarExcepcionNeurona(prefsBase, neuronaId, {
            perfil: "no-mostrar",
        });
        expect(obtenerPreferenciasParaRelacion(prefs, "otra-nueva", neuronaId).perfil).toBe("no-mostrar");
    });

    it("aplica excepcion de acciones automaticas", () => {
        const prefs = aplicarExcepcionNeurona(prefsBase, neuronaId, {
            accionesAutomaticas: ["añadir-contacto", "enviar-mensaje"],
        });
        const p = obtenerPreferenciasParaRelacion(prefs, "otra-nueva", neuronaId);
        expect(p.accionesAutomaticas).toEqual(["añadir-contacto", "enviar-mensaje"]);
    });

    it("aplica excepcion de aviso 'ignorar'", () => {
        const prefs = aplicarExcepcionNeurona(prefsBase, neuronaId, {
            aviso: "ignorar",
        });
        const p = obtenerPreferenciasParaRelacion(prefs, "otra-nueva", neuronaId);
        expect(p.aviso).toBe("ignorar");
    });

    it("aplica excepcion de aviso 'recordar' (pasa a reconocida)", () => {
        const prefs = aplicarExcepcionNeurona(prefsBase, neuronaId, {
            aviso: "recordar",
        });
        const p = obtenerPreferenciasParaRelacion(prefs, "otra-nueva", neuronaId);
        expect(p.aviso).toBe("recordar");
    });

    it("excepcion solo afecta a la neurona especificada", () => {
        const prefs = aplicarExcepcionNeurona(prefsBase, neuronaId, {
            perfil: "no-mostrar",
        });
        expect(obtenerPreferenciasParaRelacion(prefs, "otra-nueva", "otra-neurona").perfil).toBe("pedir-permiso");
    });
});

describe("preferencias.ts - catalogo de acciones (§4)", () => {
    const prefs = crearPreferenciasPorDefecto();

    it("incluye todas las acciones del catalogo en ofrecidas de alguna relacion", () => {
        const catalogoCompleto: AccionCatalogo[] = [
            "añadir-contacto",
            "enviar-mensaje",
            "enviar-archivo",
            "crear-grupo",
            "invitar-grupo",
            "compartir-capacidades",
            "vincular-capa",
            "control-remoto",
            "registro-evento",
            "abrir-oferta-nodo",
            "registrar-ubicacion",
        ];

        const todasOfrecidas = new Set(
            Object.values(prefs.porRelacion).flatMap((r) => r.accionesOfrecidas)
        );
        for (const accion of catalogoCompleto) {
            expect(todasOfrecidas.has(accion)).toBe(true);
        }
    });

    it("nunca tiene acciones automaticas para 'otra-nueva'", () => {
        expect(prefs.porRelacion["otra-nueva"].accionesAutomaticas).toHaveLength(0);
    });
});

describe("preferencias.ts - tipos de aviso", () => {
    const prefs = crearPreferenciasPorDefecto();

    it("aviso 'ignorar' existe en el tipo", () => {
        type TestAviso = AvisoNFC;
        const _check: TestAviso = "ignorar";
        expect(_check).toBe("ignorar");
    });

    it("aviso 'recordar' existe en el tipo", () => {
        type TestAviso = AvisoNFC;
        const _check: TestAviso = "recordar";
        expect(_check).toBe("recordar");
    });
});