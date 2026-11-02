// Pruebas del nivel «estudio» y de la regla instantánea del motor único
// (Ola 1018V · VST1018F · contrato `architecture/voz-voicestudio.md` §3-§4).
//
// Todo lo probado es PURO: tipos y funciones de `niveles.ts` y `licencia-voz.ts`
// con estado MEDIDO y medidas de latencia FALSAS. Sin red, sin disco, sin
// reloj, sin audio y sin procesos.
//
// La regla instantánea («la primera frase de una conversación sale del motor
// PERMITIDO con menor latencia MEDIDA que tenga la voz de esa persona; nunca se
// parte un mensaje entre dos motores») se comprueba componiendo las dos piezas
// puras que ya existen: `motoresPermitidos` (licencia por contexto) y la mediana
// del «primer sonido» de `medidas-voz.ts` sobre medidas falsas.

import { describe, expect, it } from "vitest";

import type { Capacidades } from "../capacidades";
import {
    acotarNivel,
    estudioDisponible,
    estudioSegunUso,
    nivelPorDefecto,
    nivelTopeSegunUso,
    nivelesDisponibles,
    RAM_MIN_ESTUDIO_GB,
    siguienteNivel,
    NIVELES,
    type EstadoEstudio,
    type UsoVoz,
    type NivelVoz,
} from "../niveles";
import { motoresPermitidos, type MotorInfo, type ContextoLicenciaVoz } from "../licencia-voz";
import type { CapasPrefs } from "@/lib/modelos/preferencias-capas";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

/** Capacidades base (las más pobres): cada prueba solo toca lo que le importa. */
function caps(extra: Partial<Capacidades> = {}): Capacidades {
    return {
        memoriaGB: null,
        nucleos: null,
        webgpu: false,
        wasmSimd: false,
        movil: false,
        daemonLocal: false,
        ...extra,
    };
}

/** El buen estado MEDIDO: VoiceStudio vivo con los 8 GB libres del mínimo. */
function estudio(extra: Partial<EstadoEstudio> = {}): EstadoEstudio {
    return {
        voicestudioVivo: true,
        memoriaLibreGB: RAM_MIN_ESTUDIO_GB,
        servidaPorOtraNeurona: false,
        ...extra,
    };
}

/** Una medida falsa de «primer sonido» de un motor de esta neurona. */
function medida(motor: string, valorMs: number, extra: Partial<MedidaVoz> = {}): MedidaVoz {
    return {
        neurona: "n-self",
        motor,
        tipo: "primer-sonido",
        valor: valorMs,
        timestamp: 1_700_000_000_000,
        ...extra,
    };
}

/**
 * Mediana del «primer sonido» MEDIDO por motor: la latencia que la regla
 * instantánea compara. Pura, sobre medidas falsas.
 */
function medianaPrimerSonido(medidas: readonly MedidaVoz[]): Map<string, number> {
    const porMotor = new Map<string, number[]>();
    for (const m of medidas) {
        if (m.tipo !== "primer-sonido" || !Number.isFinite(m.valor) || m.valor <= 0) continue;
        const lista = porMotor.get(m.motor) ?? [];
        lista.push(m.valor);
        porMotor.set(m.motor, lista);
    }
    const mediana = new Map<string, number>();
    for (const [motor, valores] of porMotor) {
        const orden = [...valores].sort((a, b) => a - b);
        const mitad = Math.floor(orden.length / 2);
        mediana.set(
            motor,
            orden.length % 2 === 1 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2,
        );
    }
    return mediana;
}

/**
 * La regla instantánea del contrato §4 compuesta sobre las piezas puras:
 *  1. `motoresPermitidos` decide qué motores pueden sonar en el contexto
 *     (licencia por contexto; nada personal fuera de lo personal).
 *  2. De los permitidos, gana el de MENOR latencia medida (mediana del
 *     «primer sonido»). Sin medida, no compite.
 *  3. La elección es UNA por mensaje y determinista: el mensaje entero suena
 *     por el mismo motor, nunca partido entre dos.
 * Devuelve `null` cuando no hay elegido (manda la cadena histórica de niveles).
 */
function eleccionPrimeraFrase(
    motores: readonly MotorInfo[],
    medidas: readonly MedidaVoz[],
    contexto: ContextoLicenciaVoz,
    capas: CapasPrefs = {},
): MotorInfo | null {
    const { permitidos } = motoresPermitidos([...motores], contexto, capas);
    if (!permitidos.length) return null;
    const mediana = medianaPrimerSonido(medidas);
    let mejor: MotorInfo | null = null;
    let mejorMs = Number.POSITIVE_INFINITY;
    for (const motor of permitidos) {
        const ms = mediana.get(motor.id);
        if (ms === undefined || ms >= mejorMs) continue;
        mejor = motor;
        mejorMs = ms;
    }
    return mejor;
}

describe("nivel «estudio» · la disponibilidad viene MEDIDA, no declarada", () => {
    it("sin estado de VoiceStudio no hay estudio, aunque el demonio local viva", () => {
        expect(estudioDisponible(undefined)).toBe(false);
        expect(estudioDisponible()).toBe(false);
    });

    it("descarta lo no válido: VoiceStudio muerto, memoria bajo los 8 GB o desconocida", () => {
        expect(estudioDisponible(estudio({ voicestudioVivo: false }))).toBe(false);
        expect(estudioDisponible(estudio({ memoriaLibreGB: RAM_MIN_ESTUDIO_GB - 0.5 }))).toBe(false);
        expect(estudioDisponible(estudio({ memoriaLibreGB: null }))).toBe(false);
    });

    it("con 8 GB LIBRES medidos hay estudio, y también servido por otra neurona con menos", () => {
        expect(estudioDisponible(estudio())).toBe(true);
        expect(estudioDisponible(estudio({ memoriaLibreGB: 16 }))).toBe(true);
        expect(
            estudioDisponible(estudio({ memoriaLibreGB: 2, servidaPorOtraNeurona: true })),
        ).toBe(true);
    });

    it("el mínimo declarado del contrato son 8 GB y la ficha del nivel existe", () => {
        expect(RAM_MIN_ESTUDIO_GB).toBe(8);
        expect(NIVELES.estudio.etiqueta).toBe("Estudio");
        expect(NIVELES.estudio.ramMB).toBeGreaterThan(NIVELES.alta.ramMB);
    });
});

describe("«estudio» solo para lectura, doblaje y audiolibros (contrato §4)", () => {
    const CASOS_USO: ReadonlyArray<[UsoVoz, boolean, NivelVoz | null]> = [
        ["conversacion", false, "alta"],
        ["aviso", false, "alta"],
        ["lectura", true, null],
        ["doblaje", true, null],
        ["audiolibro", true, null],
    ];

    it.each(CASOS_USO)("%s → usoDeEstudio %p y tope %p", (uso, deEstudio, tope) => {
        expect(estudioSegunUso(uso)).toBe(deEstudio);
        expect(nivelTopeSegunUso(uso)).toBe(tope);
    });

    it("acotarNivel baja al tope pero NUNCA sube un nivel que ya cayó", () => {
        expect(acotarNivel("estudio", "alta")).toBe("alta");
        expect(acotarNivel("alta", "alta")).toBe("alta");
        expect(acotarNivel("nube", "alta")).toBe("nube");
        expect(acotarNivel("ligera", "alta")).toBe("ligera");
        expect(acotarNivel("minima", "alta")).toBe("minima");
    });

    it("con el estado medido bueno: conversación suena «alta» y lectura llega a «estudio»", () => {
        const capsBuenas = caps({ daemonLocal: true, memoriaGB: 16 });
        expect(nivelPorDefecto(capsBuenas, estudio(), "conversacion")).toBe("alta");
        expect(nivelPorDefecto(capsBuenas, estudio(), "aviso")).toBe("alta");
        expect(nivelPorDefecto(capsBuenas, estudio(), "lectura")).toBe("estudio");
        expect(nivelPorDefecto(capsBuenas, estudio(), "doblaje")).toBe("estudio");
        expect(nivelPorDefecto(capsBuenas, estudio(), "audiolibro")).toBe("estudio");
    });

    it("sin estado MEDIDO manda la regla histórica: demonio + 8 GB, acotado por el uso", () => {
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 8 }), undefined, "conversacion"),
        ).toBe("alta");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 16 }), undefined, "lectura"),
        ).toBe("estudio");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 4 }), undefined, "lectura"),
        ).toBe("alta");
    });

    it("estudio disponible pero sin uso declarado: no se acota nada (compatibilidad)", () => {
        expect(nivelPorDefecto(caps({ daemonLocal: true }), estudio(), undefined)).toBe("estudio");
    });
});

describe("cadena de niveles con el estado medido", () => {
    it("nivelesDisponibles empieza en el mejor nivel y siempre incluye «minima»", () => {
        const lista = nivelesDisponibles(caps({ daemonLocal: true }), estudio(), undefined);
        expect(lista[0]).toBe("estudio");
        expect(lista[lista.length - 1]).toBe("minima");
        expect(lista).toEqual(["estudio", "alta", "nube", "ligera", "minima"]);
    });

    it("con uso «aviso» el mejor acotado es «alta» y «estudio» desaparece de la lista", () => {
        const lista = nivelesDisponibles(caps({ daemonLocal: true }), estudio(), "aviso");
        expect(lista[0]).toBe("alta");
        expect(lista).not.toContain("estudio");
    });

    it("el descenso grácil sigue la cadena de contrato, estudio → alta → … → minima → null", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(siguienteNivel("alta")).toBe("nube");
        expect(siguienteNivel("nube")).toBe("ligera");
        expect(siguienteNivel("ligera")).toBe("minima");
        expect(siguienteNivel("minima")).toBeNull();
    });
});

describe("primera frase instantánea · la elección con medidas falsas (contrato §4)", () => {
    /** Catálogo falso: el personal es el más rápido, el libre tarda más. */
    const CATALOGO: MotorInfo[] = [
        { id: "omnivoice", claseLicencia: "personal" },
        { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
        { id: "kokoro", claseLicencia: "libre" },
        { id: "kittentts", claseLicencia: "libre" },
    ];

    const MEDIDAS: MedidaVoz[] = [
        medida("omnivoice", 120),
        medida("supertonic", 200),
        medida("supertonic", 220),
        medida("kokoro", 400),
        medida("kittentts", 350),
    ];

    it("en lo personal gana el PERMITIDO con MENOR latencia medida (mediana)", () => {
        const elegido = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" });
        expect(elegido?.id).toBe("omnivoice");
    });

    it("fuera de lo personal el personal más rápido NUNCA gana: manda el libre más rápido", () => {
        for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
            expect(eleccionPrimeraFrase(CATALOGO, MEDIDAS, contexto)?.id).toBe("kittentts");
        }
    });

    it("una condicionada con la condición sin cumplir no compite aunque sea la más rápida", () => {
        const rápidoIncumplido: MedidaVoz[] = [medida("supertonic", 5)];
        const catalogo: MotorInfo[] = [
            { id: "supertonic", claseLicencia: "condicionada" },
            { id: "kokoro", claseLicencia: "libre" },
        ];
        const medidas = [medida("kokoro", 400), ...rápidoIncumplido];
        expect(eleccionPrimeraFrase(catalogo, medidas, "personal", { persona: "personal" })?.id).toBe("kokoro");
    });

    it("un motor sin medida no compite, aunque su licencia lo permita", () => {
        const sinMedir: MotorInfo[] = [
            { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
            { id: "kokoro", claseLicencia: "libre" },
        ];
        expect(eleccionPrimeraFrase(sinMedir, MEDIDAS, "personal", { persona: "condicionada" })?.id).toBe("kokoro");
    });

    it("sin medidas no hay elección: manda la cadena histórica y nada se rompe", () => {
        expect(eleccionPrimeraFrase(CATALOGO, [], "personal", { persona: "personal" })).toBeNull();
    });

    it("la elección es UNA por mensaje: determinista, el mensaje entero sale del mismo motor", () => {
        const primera = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" });
        const segunda = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" });
        expect(primera).toEqual(segunda);
        expect(primera?.id).toBe("omnivoice");
    });

    it("las capas solo pueden RESTRINGIR: la neurona que filtra expulsa al personal más rápido", () => {
        const conNeuronaFiltro: CapasPrefs = { persona: "personal", neurona: "condicionada" };
        expect(
            eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", conNeuronaFiltro)?.id,
        ).toBe("kittentts");
    });
});
