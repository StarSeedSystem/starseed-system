// src/lib/aurora/voz-starseed/__tests__/nivel-estudio.test.ts
/**
 * Pruebas del nivel «estudio» y de la regla instantánea del motor único
 * (Ola 1018V · VST1018F · contrato `architecture/voz-voicestudio.md` §3-§4).
 *
 * Todo lo probado es PURO: funciones de `niveles.ts` y `licencia-voz.ts` con
 * estado MEDIDO y medidas de latencia FALSAS. Sin red, sin disco, sin reloj,
 * sin audio y sin procesos.
 *
 * La regla instantánea («la primera frase de una conversación sale del motor
 * PERMITIDO con menor latencia MEDIDA que tenga la voz de esa persona; nunca
 * se parte un mensaje entre dos motores») se comprueba componiendo las dos
 * piezas puras del contrato: `motoresPermitidos` (licencia por contexto) y la
 * mediana del «primer sonido» de `medidas-voz.ts` sobre medidas falsas.
 */

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
    type NivelVoz,
    type UsoVoz,
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

/** El buen estado MEDIDO: VoiceStudio vivo con los GB libres del mínimo. */
function estadoEstudio(extra: Partial<EstadoEstudio> = {}): EstadoEstudio {
    return {
        voicestudioVivo: true,
        memoriaLibreGB: RAM_MIN_ESTUDIO_GB,
        servidaPorOtraNeurona: false,
        ...extra,
    };
}

/** Una medida falsa, bien formada, de esta neurona. */
function medida(motor: string, valorMs: number): MedidaVoz {
    return {
        neurona: "n-self",
        motor,
        tipo: "primer-sonido",
        valor: valorMs,
        timestamp: 1_700_000_000_000,
    };
}

/**
 * Mediana del «primer sonido» MEDIDO por motor: la latencia que la regla
 * instantánea compara. Pura y con medidas falsas: ni la lista ni el orden
 * importan a la hora de programarla, porque nada la anota.
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
 *     (licencia por contexto; nada no comercial fuera de lo personal).
 *  2. De los permitidos gana el de MENOR latencia medida (mediana del
 *     «primer sonido»); sin medida, no compite.
 *  3. La elección es UNA por mensaje y determinista: el mensaje entero suena
 *     por el mismo motor, nunca partido entre dos. En empate manda el primero
 *     de la lista, para que dos frases iguales no salgan de motores distintos.
 * Devuelve `null` cuando no hay elegido: manda la cadena histórica de niveles.
 */
function eleccionPrimeraFrase(
    motores: readonly MotorInfo[],
    medidas: readonly MedidaVoz[],
    contexto: ContextoLicenciaVoz,
    capas: CapasPrefs = {},
): MotorInfo | null {
    const { permitidos } = motoresPermitidos([...motores], contexto, capas);
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

    it("descarta lo no válido: VoiceStudio muerto, memoria bajo el mínimo o desconocida", () => {
        expect(estudioDisponible(estadoEstudio({ voicestudioVivo: false }))).toBe(false);
        expect(estudioDisponible(estadoEstudio({ memoriaLibreGB: RAM_MIN_ESTUDIO_GB - 0.5 }))).toBe(false);
        expect(estudioDisponible(estadoEstudio({ memoriaLibreGB: null }))).toBe(false);
    });

    it("con los GB LIBRES del mínimo hay estudio, y también servido por otra neurona con menos", () => {
        expect(estudioDisponible(estadoEstudio())).toBe(true);
        expect(estudioDisponible(estadoEstudio({ memoriaLibreGB: 16 }))).toBe(true);
        expect(
            estudioDisponible(estadoEstudio({ memoriaLibreGB: 2, servidaPorOtraNeurona: true })),
        ).toBe(true);
    });

    it("servida por otra neurona basta aunque la memoria propia sea desconocida o cero", () => {
        expect(
            estudioDisponible(estadoEstudio({ memoriaLibreGB: null, servidaPorOtraNeurona: true })),
        ).toBe(true);
        expect(
            estudioDisponible({ voicestudioVivo: true, memoriaLibreGB: 0, servidaPorOtraNeurona: true }),
        ).toBe(true);
        expect(
            nivelPorDefecto(
                caps({ daemonLocal: true }),
                { voicestudioVivo: true, memoriaLibreGB: null, servidaPorOtraNeurona: true },
            ),
        ).toBe("estudio");
    });

    it("lo servido solo cuenta si quien lo sirve está vivo: el estado muerto descalifica", () => {
        expect(
            estudioDisponible({ voicestudioVivo: false, memoriaLibreGB: null, servidaPorOtraNeurona: true }),
        ).toBe(false);
        expect(
            nivelPorDefecto(
                caps({ daemonLocal: true }),
                { voicestudioVivo: false, memoriaLibreGB: null, servidaPorOtraNeurona: true },
                "audiolibro",
            ),
        ).not.toBe("estudio");
    });

    it("el mínimo del contrato son 8 GB y la ficha del nivel existe y va por encima de «alta»", () => {
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

    it.each(CASOS_USO)("%s: ¿compite? %p y tope %p", (uso, deEstudio, tope) => {
        expect(estudioSegunUso(uso)).toBe(deEstudio);
        expect(nivelTopeSegunUso(uso)).toBe(tope);
    });

    it("acotarNivel BAJA al tope, pero NUNCA sube un nivel que ya cayó", () => {
        expect(acotarNivel("estudio", "alta")).toBe("alta");
        expect(acotarNivel("alta", "alta")).toBe("alta");
        expect(acotarNivel("nube", "alta")).toBe("nube");
        expect(acotarNivel("ligera", "alta")).toBe("ligera");
        expect(acotarNivel("minima", "alta")).toBe("minima");
    });

    it("con el estado medido bueno: conversación y aviso suenan «alta» y la lectura larga llega a «estudio»", () => {
        const buenas = caps({ daemonLocal: true, memoriaGB: 16 });
        expect(nivelPorDefecto(buenas, estadoEstudio(), "conversacion")).toBe("alta");
        expect(nivelPorDefecto(buenas, estadoEstudio(), "aviso")).toBe("alta");
        expect(nivelPorDefecto(buenas, estadoEstudio(), "lectura")).toBe("estudio");
        expect(nivelPorDefecto(buenas, estadoEstudio(), "doblaje")).toBe("estudio");
        expect(nivelPorDefecto(buenas, estadoEstudio(), "audiolibro")).toBe("estudio");
    });

    it("sin estado MEDIDO manda la regla histórica: demonio + 8 GB de RAM, acotado por el uso", () => {
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 8 }), undefined, "conversacion"),
        ).toBe("alta");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 16 }), undefined, "audiolibro"),
        ).toBe("estudio");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 4 }), undefined, "audiolibro"),
        ).toBe("alta");
    });

    it("VoiceStudio medido muerto con audiolibro: «alta», no se inventa estudio ni se cae más", () => {
        const muerto = estadoEstudio({ voicestudioVivo: false, memoriaLibreGB: 16 });
        expect(nivelPorDefecto(caps({ daemonLocal: true }), muerto, "audiolibro")).toBe("alta");
    });

    it("estudio disponible pero sin uso declarado: no se acota nada (compatibilidad)", () => {
        expect(nivelPorDefecto(caps({ daemonLocal: true }), estadoEstudio(), undefined)).toBe(
            "estudio",
        );
    });

    it("lectura, doblaje y audiolibros ofertan «estudio» el primero", () => {
        const buenas = caps({ daemonLocal: true });
        for (const uso of ["lectura", "doblaje", "audiolibro"] as const satisfies readonly UsoVoz[]) {
            expect(nivelesDisponibles(buenas, estadoEstudio(), uso)[0]).toBe("estudio");
        }
    });

    it("la frontera de la regla histórica es exactamente 8 GB de RAM", () => {
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 8 }), undefined, "audiolibro"),
        ).toBe("estudio");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 6 }), undefined, "audiolibro"),
        ).toBe("alta");
        expect(
            nivelPorDefecto(caps({ daemonLocal: true, memoriaGB: 8 }), undefined, "conversacion"),
        ).toBe("alta");
    });
});

describe("la cadena de niveles con el estado medido", () => {
    it("con estudio medido la lista empieza arriba del todo y siempre incluye «minima»", () => {
        const lista = nivelesDisponibles(caps({ daemonLocal: true }), estadoEstudio(), undefined);
        expect(lista).toEqual(["estudio", "alta", "nube", "ligera", "minima"]);
    });

    it("con uso «aviso» el mejor acotado es «alta» y «estudio» desaparece de la lista", () => {
        const lista = nivelesDisponibles(caps({ daemonLocal: true }), estadoEstudio(), "aviso");
        expect(lista[0]).toBe("alta");
        expect(lista).not.toContain("estudio");
        expect(lista[lista.length - 1]).toBe("minima");
    });

    it("el descenso grácil sigue la cadena del contrato: estudio → alta → … → minima → null", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(siguienteNivel("alta")).toBe("nube");
        expect(siguienteNivel("nube")).toBe("ligera");
        expect(siguienteNivel("ligera")).toBe("minima");
        expect(siguienteNivel("minima")).toBeNull();
    });
});

describe("primera frase instantánea · la elección con medidas falsas (contrato §4)", () => {
    /** Catálogo falso: el personal es el más rápido medida; el libre tarda más. */
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

    it("en lo personal gana el PERMITIDO con menor latencia medida (mediana, no mínimo)", () => {
        expect(medianaPrimerSonido(MEDIDAS).get("supertonic")).toBe(210);
        expect(eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" })?.id).toBe(
            "omnivoice",
        );
    });

    it("fuera de lo personal el personal más rápido NUNCA gana: manda el libre más rápido", () => {
        for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
            const elegido = eleccionPrimeraFrase(CATALOGO, MEDIDAS, contexto);
            expect(elegido).not.toBeNull();
            expect(elegido?.id).toBe("kittentts");
            expect(elegido?.claseLicencia).toBe("libre");
        }
    });

    it("una condicionada con la condición sin cumplir no compite, aunque sea la más rápida", () => {
        const catalogo: MotorInfo[] = [
            { id: "supertonic", claseLicencia: "condicionada" },
            { id: "kokoro", claseLicencia: "libre" },
        ];
        const medidas = [medida("supertonic", 5), medida("kokoro", 400)];
        const elegido = eleccionPrimeraFrase(catalogo, medidas, "personal", { persona: "personal" });
        expect(elegido?.id).toBe("kokoro");
    });

    it("un motor sin medida no compite, aunque su licencia lo permita: lo MEDIDO manda", () => {
        const sinMedir: MotorInfo[] = [
            { id: "supertonic", claseLicencia: "condicionada", condicionCumplida: true },
            { id: "kokoro", claseLicencia: "libre" },
        ];
        // Solo kokoro tiene «primer sonido» medido en ESTA neurona.
        expect(
            eleccionPrimeraFrase(sinMedir, [medida("kokoro", 400)], "personal", {
                persona: "personal",
            })?.id,
        ).toBe("kokoro");
        // Con medida propia y autorizada (capa comunidad condicionada), la
        // condicionada permitida sí gana si es más rápida.
        const medidas = [medida("kokoro", 400), medida("supertonic", 210)];
        expect(
            eleccionPrimeraFrase(sinMedir, medidas, "personal", {
                persona: "personal",
                comunidad: "condicionada",
            })?.id,
        ).toBe("supertonic");
    });

    it("sin medidas no hay elección: manda la cadena histórica de niveles y nada se rompe", () => {
        expect(eleccionPrimeraFrase(CATALOGO, [], "personal", { persona: "personal" })).toBeNull();
        expect(eleccionPrimeraFrase(CATALOGO, [], "publico")).toBeNull();
    });

    it("la elección es UNA por mensaje (determinista): el mensaje entero sale del mismo motor", () => {
        const primera = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" });
        const segunda = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", { persona: "personal" });
        expect(primera).toEqual(segunda);
        // En empate de mediana manda el primero de la lista permitida: dos frases
        // iguales no acaban en motores distintos.
        const conEmpate = eleccionPrimeraFrase(
            CATALOGO,
            [medida("kokoro", 400), medida("kittentts", 400)],
            "personal",
            { persona: "personal" },
        );
        expect(conEmpate?.id).toBe("kokoro");
    });

    it("las capas solo pueden RESTRINGIR: una neurona que filtra expulsa al personal más rápido", () => {
        const neuronaFiltro: CapasPrefs = { persona: "personal", neurona: "condicionada" };
        const elegido = eleccionPrimeraFrase(CATALOGO, MEDIDAS, "personal", neuronaFiltro);
        expect(elegido?.id).toBe("kittentts");
        expect(elegido?.claseLicencia).toBe("libre");
    });
});
