import { describe, expect, it } from "vitest";
import {
    decidirEncuentro,
    type DecisionNFC,
} from "@/lib/nfc/decidir";
import { crearPreferenciasPorDefecto, aplicarExcepcionNeurona } from "@/lib/nfc/preferencias";
import type { TarjetaNeurona } from "@/lib/nfc/tarjeta";
import type { PreferenciasNFC, RelacionNFC } from "@/lib/nfc/preferencias";

function tarjetaBase(sobreescrituras: Partial<TarjetaNeurona> = {}): TarjetaNeurona {
    return {
        version: 1,
        neuronaId: "neurona-ajena",
        identidadCuenta: { tipo: "hash", valor: "hash-cuenta-ajena" },
        claveEfimeraPublica: new Uint8Array(32).fill(1),
        firma: new Uint8Array(64).fill(2),
        nonce: new Uint8Array(16).fill(3),
        timestamp: Date.now(),
        ofertas: [
            { tipo: "capacidad", valor: "almacenamiento", datos: { gb: 50 } },
            { tipo: "senal", valor: "internet", datos: { tipo: "mesh" } },
        ],
        transportes: [
            { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
            { tipo: "wifi-direct", direccion: "192.168.1.50" },
        ],
        ...sobreescrituras,
    };
}

function tarjetaPropiaBase(sobreescrituras: Partial<TarjetaNeurona> = {}): TarjetaNeurona {
    return {
        version: 1,
        neuronaId: "neurona-propia",
        identidadCuenta: { tipo: "hash", valor: "hash-cuenta-propria" },
        claveEfimeraPublica: new Uint8Array(32).fill(4),
        firma: new Uint8Array(64).fill(5),
        nonce: new Uint8Array(16).fill(6),
        timestamp: Date.now(),
        ofertas: [],
        transportes: [],
        ...sobreescrituras,
    };
}

describe("decidir.ts · misma cuenta", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase({ neuronaId: "neurona-1", identidadCuenta: { tipo: "hash", valor: "misma-cuenta" } });
    const ajena = tarjetaBase({ neuronaId: "neurona-2", identidadCuenta: { tipo: "hash", valor: "misma-cuenta" } });

    it("muestra perfil público", () => {
        const decision = decidirEncuentro(propia, ajena, "misma-cuenta", prefs);
        expect(decision.perfilVisible).toBe(true);
    });

    it("ofrece acciones del catálogo", () => {
        const decision = decidirEncuentro(propia, ajena, "misma-cuenta", prefs);
        expect(decision.accionesOfrecidas.length).toBeGreaterThan(0);
    });

    it("tiene acciones automáticas (sugerencias de Astraura)", () => {
        const decision = decidirEncuentro(propia, ajena, "misma-cuenta", prefs);
        expect(decision.accionesAutomaticas.length).toBeGreaterThan(0);
    });

    it("notifica el encuentro", () => {
        const decision = decidirEncuentro(propia, ajena, "misma-cuenta", prefs);
        expect(decision.aviso).toBe("notificar");
    });
});

describe("decidir.ts · otra cuenta reconocida", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ identidadCuenta: { tipo: "hash", valor: "cuenta-reconocida" } });

    it("pide permiso para mostrar perfil", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-reconocida", prefs);
        expect(decision.perfilVisible).toBe(false);
        expect(decision.pedirPermisoPerfil).toBe(true);
    });

    it("ofrece acciones pero ninguna automática", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-reconocida", prefs);
        expect(decision.accionesOfrecidas.length).toBeGreaterThan(0);
        expect(decision.accionesAutomaticas).toHaveLength(0);
    });
});

describe("decidir.ts · otra cuenta nueva (§3: nunca automático, solo mostrar opciones)", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ identidadCuenta: { tipo: "hash", valor: "cuenta-nueva" } });

    it("nunca automático con desconocidas", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.accionesAutomaticas).toHaveLength(0);
    });

    it("siempre muestra opciones ofrecidas", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.accionesOfrecidas.length).toBeGreaterThan(0);
    });

    it("pide permiso para perfil", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.pedirPermisoPerfil).toBe(true);
    });

    it("notifica el encuentro", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.aviso).toBe("notificar");
    });
});

describe("decidir.ts · nodo propio", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ neuronaId: "nodo-mio", identidadCuenta: { tipo: "nada" } });

    it("perfil público y acciones automáticas", () => {
        const decision = decidirEncuentro(propia, ajena, "nodo-propio", prefs);
        expect(decision.perfilVisible).toBe(true);
        expect(decision.accionesAutomaticas.length).toBeGreaterThan(0);
    });

    it("incluye 'abrir-oferta-nodo' en ofrecidas", () => {
        const decision = decidirEncuentro(propia, ajena, "nodo-propio", prefs);
        expect(decision.accionesOfrecidas).toContain("abrir-oferta-nodo");
    });
});

describe("decidir.ts · nodo público", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ neuronaId: "nodo-publico", identidadCuenta: { tipo: "nada" } });

    it("perfil público, solo ofrecer", () => {
        const decision = decidirEncuentro(propia, ajena, "nodo-publico", prefs);
        expect(decision.perfilVisible).toBe(true);
        expect(decision.accionesAutomaticas).toHaveLength(0);
        expect(decision.accionesOfrecidas.length).toBeGreaterThan(0);
    });
});

describe("decidir.ts · etiqueta pasiva", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ neuronaId: "etiqueta-1", identidadCuenta: { tipo: "nada" } });

    it("no muestra perfil, solo ofrecer registro", () => {
        const decision = decidirEncuentro(propia, ajena, "etiqueta", prefs);
        expect(decision.perfilVisible).toBe(false);
        expect(decision.accionesOfrecidas).toContain("registrar-ubicacion");
    });
});

describe("decidir.ts · excepcion 'ignorar' anula todo", () => {
    const prefsBase = crearPreferenciasPorDefecto();
    const prefs = aplicarExcepcionNeurona(prefsBase, "neurona-ignorada", { aviso: "ignorar" });
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ neuronaId: "neurona-ignorada" });

    it("no muestra perfil, no ofrece acciones, no notifica", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.perfilVisible).toBe(false);
        expect(decision.accionesOfrecidas).toHaveLength(0);
        expect(decision.accionesAutomaticas).toHaveLength(0);
        expect(decision.aviso).toBe("ignorar");
    });
});

describe("decidir.ts · excepcion 'recordar' cambia a reconocida", () => {
    const prefsBase = crearPreferenciasPorDefecto();
    const prefs = aplicarExcepcionNeurona(prefsBase, "neurona-recordar", { aviso: "recordar" });
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({ neuronaId: "neurona-recordar" });

    it("aplica preferencias de 'otra-reconocida'", () => {
        const decision = decidirEncuentro(propia, ajena, "otra-nueva", prefs);
        expect(decision.pedirPermisoPerfil).toBe(true);
        expect(decision.accionesAutomaticas).toHaveLength(0);
        expect(decision.accionesOfrecidas.length).toBeGreaterThan(0);
    });
});

describe("decidir.ts · decisión incluye mejor transporte", () => {
    const prefs = crearPreferenciasPorDefecto();
    const propia = tarjetaPropiaBase();
    const ajena = tarjetaBase({
        transportes: [
            { tipo: "ble", direccion: "aa:bb:cc:dd:ee:ff" },
            { tipo: "wifi-direct", direccion: "192.168.1.50" },
            { tipo: "malla", direccion: "mesh-1" },
        ],
    });

    it("devuelve transporte recomendado", () => {
        const decision = decidirEncuentro(propia, ajena, "misma-cuenta", prefs);
        expect(decision.transporteRecomendado).toBeDefined();
        expect(["ble", "wifi-direct", "malla"]).toContain(decision.transporteRecomendado?.tipo);
    });
});