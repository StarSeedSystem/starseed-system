import { describe, expect, it } from "vitest";

import {
    creadaDesde,
    decidirPrimerArranque,
    esNeuronaNueva,
    esRutaPropia,
    MARGEN_ARRANQUE_MS,
    resumenSincronizado,
    type EntradaPrimerArranque,
    type EstadoNeurona,
} from "../primer-arranque";

const conocida: EstadoNeurona = { configuradaAqui: false, enCuenta: true, creadaEnEsteArranque: false, tieneNombreOAjustes: true };

const base = (parcial: Partial<EntradaPrimerArranque> = {}): EntradaPrimerArranque => ({
    ruta: "/escritorios",
    esConsola: false,
    sesion: "sin-sesion",
    modo: "nativa",
    introSaltada: false,
    avisoWebCerrado: false,
    ritoEnCurso: false,
    tienePerfil: null,
    neurona: null,
    neuronaPospuesta: false,
    ...parcial,
});

describe("decidirPrimerArranque · sin sesión", () => {
    it("en la app nativa abre la bienvenida a pantalla completa", () => {
        expect(decidirPrimerArranque(base())).toEqual({ tipo: "acceso", forma: "completa" });
    });

    it("en la web instalada (PWA) también", () => {
        expect(decidirPrimerArranque(base({ modo: "pwa" }))).toEqual({ tipo: "acceso", forma: "completa" });
    });

    it("en una web normal solo un aviso discreto, y nada si ya se cerró en esta visita", () => {
        expect(decidirPrimerArranque(base({ modo: "web" }))).toEqual({ tipo: "acceso", forma: "discreta" });
        expect(decidirPrimerArranque(base({ modo: "web", avisoWebCerrado: true }))).toEqual({ tipo: "nada", motivo: "aviso-cerrado" });
    });

    it("si se saltó con «Explorar sin cuenta» no vuelve a abrirse sola en este dispositivo", () => {
        expect(decidirPrimerArranque(base({ introSaltada: true }))).toEqual({ tipo: "nada", motivo: "saltada" });
        expect(decidirPrimerArranque(base({ introSaltada: true, modo: "web" })).tipo).toBe("nada");
    });

    it("espera mientras se comprueba la sesión", () => {
        expect(decidirPrimerArranque(base({ sesion: "comprobando" }))).toEqual({ tipo: "esperar" });
    });
});

describe("decidirPrimerArranque · nunca encima de quien ya manda", () => {
    it("en la consola (/mando) no abre nada", () => {
        expect(decidirPrimerArranque(base({ ruta: "/mando", esConsola: true }))).toEqual({ tipo: "nada", motivo: "consola" });
    });

    it("en las rutas de acceso y del rito no abre nada", () => {
        for (const ruta of ["/login", "/bienvenida", "/onboarding", "/auth/callback"]) {
            expect(decidirPrimerArranque(base({ ruta })).tipo).toBe("nada");
        }
    });

    it("con un rito de bienvenida en curso manda el rito", () => {
        expect(decidirPrimerArranque(base({ ritoEnCurso: true }))).toEqual({ tipo: "nada", motivo: "rito" });
    });

    it("a un invitado que eligió explorar no se le insiste", () => {
        expect(decidirPrimerArranque(base({ sesion: "invitado" }))).toEqual({ tipo: "nada", motivo: "invitado" });
    });
});

describe("decidirPrimerArranque · con cuenta", () => {
    const cuenta = (parcial: Partial<EntradaPrimerArranque> = {}) => base({ sesion: "cuenta", tienePerfil: true, neurona: conocida, ...parcial });

    it("espera a saber el perfil y la neurona", () => {
        expect(decidirPrimerArranque(cuenta({ tienePerfil: null }))).toEqual({ tipo: "esperar" });
        expect(decidirPrimerArranque(cuenta({ neurona: null }))).toEqual({ tipo: "esperar" });
    });

    it("una cuenta recién nacida sin perfil la lleva el asistente de alta", () => {
        expect(decidirPrimerArranque(cuenta({ tienePerfil: false }))).toEqual({ tipo: "nada", motivo: "cuenta-nueva" });
    });

    it("neurona que no estaba en la cuenta → ajustes de la nueva neurona", () => {
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, enCuenta: false } }))).toEqual({ tipo: "neurona-nueva" });
    });

    it("neurona que nació en este arranque → ajustes de la nueva neurona", () => {
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, creadaEnEsteArranque: true } }))).toEqual({ tipo: "neurona-nueva" });
    });

    it("neurona sin nombre ni ajustes guardados → ajustes de la nueva neurona", () => {
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, tieneNombreOAjustes: false } }))).toEqual({ tipo: "neurona-nueva" });
    });

    it("neurona conocida → nada", () => {
        expect(decidirPrimerArranque(cuenta())).toEqual({ tipo: "nada", motivo: "conocida" });
    });

    it("ya configurada aquí o pospuesta en esta visita → nada", () => {
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, enCuenta: false, configuradaAqui: true } })).tipo).toBe("nada");
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, enCuenta: false }, neuronaPospuesta: true }))).toEqual({
            tipo: "nada",
            motivo: "neurona-pospuesta",
        });
    });

    it("la consola también gana con sesión", () => {
        expect(decidirPrimerArranque(cuenta({ neurona: { ...conocida, enCuenta: false }, esConsola: true, ruta: "/mando" })).tipo).toBe("nada");
    });
});

describe("piezas", () => {
    it("esNeuronaNueva", () => {
        expect(esNeuronaNueva(conocida)).toBe(false);
        expect(esNeuronaNueva({ ...conocida, enCuenta: false })).toBe(true);
        expect(esNeuronaNueva({ ...conocida, enCuenta: false, configuradaAqui: true })).toBe(false);
    });

    it("esRutaPropia no confunde prefijos parecidos", () => {
        expect(esRutaPropia("/login")).toBe(true);
        expect(esRutaPropia("/auth/callback")).toBe(true);
        expect(esRutaPropia("/loginx")).toBe(false);
        expect(esRutaPropia("/escritorios")).toBe(false);
        expect(esRutaPropia(null)).toBe(false);
    });

    it("creadaDesde: la fila es de este arranque si nació después de abrir la app (con margen)", () => {
        const arranque = Date.parse("2026-09-25T10:00:00Z");
        expect(creadaDesde("2026-09-25T10:00:05Z", arranque)).toBe(true);
        expect(creadaDesde(new Date(arranque - MARGEN_ARRANQUE_MS + 1000).toISOString(), arranque)).toBe(true);
        expect(creadaDesde("2026-08-01T10:00:00Z", arranque)).toBe(false);
        expect(creadaDesde(null, arranque)).toBe(false);
        expect(creadaDesde("no-es-fecha", arranque)).toBe(false);
    });

    it("resumenSincronizado dice lo que llegó y lo dice bien en singular y plural", () => {
        expect(resumenSincronizado({ escritorios: 3, biblioteca: 12, apps: 1, ajustes: true })).toBe(
            "Ya llegó de tu cuenta: 3 escritorios, 12 elementos de la biblioteca, 1 app y tus ajustes.",
        );
        expect(resumenSincronizado({ escritorios: 1, biblioteca: 0, apps: 0, ajustes: false })).toBe("Ya llegó de tu cuenta: 1 escritorio.");
        expect(resumenSincronizado({ escritorios: 0, biblioteca: 0, apps: 0, ajustes: false })).toMatch(/Todavía no ha llegado nada/);
    });
});
