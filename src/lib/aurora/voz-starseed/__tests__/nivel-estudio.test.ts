/**
 * TESTS DE NIVEL «ESTUDIO» Y REGLA INSTANTÁNEA (Ola 1018V · tarea F)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/voz-voicestudio.md` §4:
 *   · El nivel «estudio» SOLO se alcanza con su puerta: VoiceStudio vivo
 *     (medido con `descubrir()`) + demonio local + ≥ 8 GB — o servido por
 *     OTRA neurona de la malla.
 *   · «Estudio» solo para lectura larga, doblaje y audiolibros.
 *   · La primera frase de una conversación sale del motor PERMITIDO con MENOR
 *     latencia medida que tenga la voz de esa persona; nunca se parte un
 *     mensaje entre dos motores.
 *
 * Todo se prueba con funciones PURAS y medidas FALSAS: sin red, sin daemon,
 * sin `vi.mock` de módulos de Node y sin importar ninguna ruta de API.
 */

import { describe, expect, it } from "vitest";
import {
    NIVELES,
    nivelPara,
    nivelPorDefecto,
    puertaEstudioApta,
    siguienteNivel,
    type PuertaEstudio,
} from "@/lib/aurora/voz-starseed/niveles";
import type { Capacidades } from "@/lib/aurora/voz-starseed/capacidades";
import {
    estudioAdmiteContexto,
    elegirPrimeraFrase,
    type CandidatoPrimeraFrase,
    type MedidaPrimeraFrase,
} from "@/lib/aurora/voz-starseed/motor";

/** Capacidades de prueba (mismo contrato que `capacidades.ts`, sin sondeo). */
function caps(s: Partial<Capacidades> = {}): Capacidades {
    return {
        memoriaGB: null,
        nucleos: null,
        webgpu: false,
        wasmSimd: false,
        movil: false,
        daemonLocal: false,
        ...s,
    };
}

describe("puerta del nivel «estudio» (voz-voicestudio §4)", () => {
    const apta = caps({ daemonLocal: true, memoriaGB: 8 });

    it("abre con VoiceStudio vivo, demonio local y 8 GB", () => {
        expect(puertaEstudioApta(apta, { voicestudioVivo: true })).toBe(true);
    });

    it("no abre con menos de 8 GB si ninguna neurona lo sirve", () => {
        expect(puertaEstudioApta(caps({ daemonLocal: true, memoriaGB: 7 }), { voicestudioVivo: true })).toBe(false);
    });

    it("no abre con el demonio muerto, aunque la memoria sea de sobra", () => {
        expect(puertaEstudioApta(caps({ daemonLocal: false, memoriaGB: 16 }), { voicestudioVivo: true })).toBe(false);
    });

    it("no abre sin la medida de `descubrir()`: vivo SE DEMUESTRA, no se supone", () => {
        expect(puertaEstudioApta(apta, { voicestudioVivo: false })).toBe(false);
        expect(puertaEstudioApta(apta, {})).toBe(false);
    });

    it("abre completo si OTRA neurona lo sirve por la malla", () => {
        expect(puertaEstudioApta(caps({ memoriaGB: 3 }), { servidaPorMalla: true })).toBe(true);
    });
});

describe("nivelPorDefecto y nivelPara con la puerta de estudio", () => {
    const apta = caps({ daemonLocal: true, memoriaGB: 8 });
    const justa = caps({ daemonLocal: true, memoriaGB: 7 });

    it("el techo sin puerta medida es «alta», aunque el demonio haya 16 GB libres", () => {
        expect(nivelPara(justa)).toBe("alta");
    });

    it("con la puerta abierta llega al «estudio»", () => {
        const p: PuertaEstudio = { voicestudioVivo: true };
        expect(nivelPorDefecto(apta, p)).toBe("estudio");
        expect(nivelPara(apta, p)).toBe("estudio");
    });

    it("con la demostración de que VoiceStudio dormía, el techo cae a «alta»", () => {
        expect(nivelPorDefecto(apta, { voicestudioVivo: false })).toBe("alta");
    });

    it("el servicio de otra neurona estira el estudio a una neurona de 7 GB", () => {
        expect(nivelPorDefecto(justa, { servidaPorMalla: true })).toBe("estudio");
    });

    it("sin demonio local, el nivel de estudio nunca se ofrece a esta neurona", () => {
        const nivel = nivelPorDefecto(caps({ memoriaGB: 9 }), { voicestudioVivo: true });
        expect(nivel).not.toBe("estudio");
    });

    it("el «estudio» queda ENCIMA de «alta» en la cadena de degradación", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(NIVELES.estudio.ramMB).toBeGreaterThan(NIVELES.alta.ramMB);
    });
});

describe("«estudio» solo para lectura larga, doblaje y audiolibros", () => {
    it("CABE en lectura e Imaginación Intuitiva", () => {
        expect(estudioAdmiteContexto("lectura")).toBe(true);
        expect(estudioAdmiteContexto("imaginacion")).toBe(true);
    });

    it("NO cabe en conversación, aviso ni rito", () => {
        expect(estudioAdmiteContexto("conversacion")).toBe(false);
        expect(estudioAdmiteContexto("aviso")).toBe(false);
        expect(estudioAdmiteContexto("rito")).toBe(false);
    });
});

describe("elegirPrimeraFrase: motor PERMITIDO, menor latencia MEDIDA, voz de esa persona", () => {
    const candidatos: CandidatoPrimeraFrase[] = [
        { motor: "omnivoice", nivel: "alta", clase: "personal" },
        { motor: "kokoro", nivel: "ligera", clase: "libre" },
    ];

    /** Medidas falsas del almacén `medidas-voz.ts`: solo lo que la elección lee. */
    function medida(motor: string, valor: number): MedidaPrimeraFrase {
        return { motor, tipo: "primer-sonido", valor };
    }

    it("sin medidas, gana el primer permitido del orden declarado", () => {
        expect(elegirPrimeraFrase(candidatos, "personal")).toBe("alta");
    });

    it("el motor con menor latencia medida gana, aunque no sea el más «de estudio»", () => {
        const medidas = [medida("omnivoice", 900), medida("kokoro", 300)];
        expect(elegirPrimeraFrase(candidatos, "personal", medidas)).toBe("ligera");
    });

    it("la media de varias medidas decide, no una sola suerte", () => {
        const medidas = [
            medida("omnivoice", 400),
            medida("omnivoice", 600),
            medida("kokoro", 800),
        ];
        expect(elegirPrimeraFrase(candidatos, "personal", medidas)).toBe("alta");
    });

    it("un motor de clase «personal» NO suena fuera del contexto personal", () => {
        const medidas = [medida("omnivoice", 100), medida("kokoro", 2000)];
        expect(elegirPrimeraFrase(candidatos, "grupo", medidas)).toBe("ligera");
        expect(elegirPrimeraFrase(candidatos, "comercial", medidas)).toBe("ligera");
    });

    it("una «condicionada» con su condición cumplida entra en cualquier contexto", () => {
        const conSupertonic: CandidatoPrimeraFrase[] = [
            ...candidatos,
            { motor: "supertonic", nivel: "ligera", clase: "condicionada" },
        ];
        const medidas = [medida("omnivoice", 5000), medida("kokoro", 5000), medida("supertonic", 200)];
        expect(elegirPrimeraFrase(conSupertonic, "comunidad", medidas)).toBe("ligera");
    });

    it("si nada queda permitido, la elección devuelve null y quien llama sigue su cadena", () => {
        const soloPersonal: CandidatoPrimeraFrase[] = [candidatos[0]];
        expect(elegirPrimeraFrase(soloPersonal, "publico", [medida("omnivoice", 50)])).toBeNull();
        expect(elegirPrimeraFrase([], "personal")).toBeNull();
    });

    it("un motor que NO puede sonar la voz de esa persona nunca es elegido", () => {
        const conMudo: CandidatoPrimeraFrase[] = [
            { motor: "otra-voz", nivel: "alta", clase: "libre", tieneVoz: false },
            ...candidatos,
        ];
        const medidas = [medida("otra-voz", 1), medida("kokoro", 90)];
        expect(elegirPrimeraFrase(conMudo, "personal", medidas)).toBe("ligera");
    });
});


