/**
 * Pruebas de la «Voz del Mando» (Ola 275 · Tarea V1 · 2026-09-07).
 *
 * - `anunciosDe` convierte un `esperando_aprobacion` en prioridad 1 con el
 *   motivo en la frase, e ignora `latido`/`arranque` y lo desactivado.
 * - `planificar` respeta el silencio salvo UN aviso urgente (prioridad 1).
 * - `asignarVozAutomatica` es determinista por hash del id.
 * - `validarPreferenciasVoz` acota el silencio a un mínimo de 5 segundos.
 */

import { describe, expect, it } from "vitest";

import {
    PREFERENCIAS_VOZ_POR_DEFECTO,
    anunciosDe,
    asignarVozAutomatica,
    planificar,
    resumenParaLeer,
    validarPreferenciasVoz,
    type PreferenciasVozMando,
} from "@/lib/mando/voz-mando";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Preferencias activas con todo habilitado para las pruebas. */
function prefs(extra?: Partial<PreferenciasVozMando>): PreferenciasVozMando {
    const base = validarPreferenciasVoz({ ...PREFERENCIAS_VOZ_POR_DEFECTO, activa: true, anunciar: { ...PREFERENCIAS_VOZ_POR_DEFECTO.anunciar, integradas: true } });
    return extra ? { ...base, ...extra } : base;
}

function evento(tipo: string, extra?: Partial<EventoRelevo>): EventoRelevo {
    return { id: `e-${tipo}-1`, t: "2026-09-07T10:00:00Z", quien: "enjambre", tipo, tarea: "H2", texto: "", ...extra };
}

describe("anunciosDe", () => {
    it("esperando_aprobacion → prioridad 1 y la frase lleva el motivo", () => {
        const e = evento("esperando_aprobacion", { datos: { motivo: "revisión bloqueante confirmada" } });
        const [a] = anunciosDe([e], prefs(), new Set(), {});
        expect(a.prioridad).toBe(1);
        expect(a.texto).toContain("H2");
        expect(a.texto).toContain("visto bueno");
        expect(a.texto).toContain("revisión bloqueante confirmada");
    });

    it("no anuncia latidos ni arranques sueltos", () => {
        const a = anunciosDe(
            [evento("latido"), evento("arranque"), evento("", { id: "raro" })],
            prefs(),
            new Set(),
            {},
        );
        expect(a).toHaveLength(0);
    });

    it("no repite claves ya anunciadas", () => {
        const e = evento("fallida");
        const a = anunciosDe([e], prefs(), new Set([e.id]), {});
        expect(a).toHaveLength(0);
    });

    it("con las integradas desactivadas, el evento integrada no aparece", () => {
        const p = prefs();
        p.anunciar.integradas = false;
        const a = anunciosDe([evento("integrada")], p, new Set(), {});
        expect(a).toHaveLength(0);
    });

    it("apaga del todo si la voz no está activa", () => {
        const p = prefs({ activa: false });
        expect(anunciosDe([evento("fallida")], p, new Set(), {})).toHaveLength(0);
    });

    it("usa la voz del agente si el mapa la tiene", () => {
        const e = evento("fallida", { datos: { modelo: "xkiro/qwen3-coder-plus" } });
        const [a] = anunciosDe([e], prefs(), new Set(), { "xkiro/qwen3-coder-plus": "fem-iris" });
        expect(a.timbreId).toBe("fem-iris");
    });

    it("proveedor caído con relevo nombra al sustituto", () => {
        const e = evento("proveedor_caido", { datos: { proveedor: "nim", sustituto: "xkiro" } });
        const [a] = anunciosDe([e], prefs(), new Set(), {});
        expect(a.prioridad).toBe(2);
        expect(a.texto).toBe("Proveedor NVIDIA caído; sigo con xKiro.");
    });

    it("ola terminada con recuento en letras", () => {
        const e = evento("fin", { datos: { ola: "265", integradas: 4, fallidas: 1 } });
        const [a] = anunciosDe([e], prefs(), new Set(), {});
        expect(a.prioridad).toBe(3);
        expect(a.texto).toBe("Ola 265 terminada: cuatro integradas, una fallidas.");
    });
});

describe("planificar", () => {
    const mk = (clave: string, prioridad: 1 | 2 | 3) => ({ clave, prioridad, texto: clave });
    const input = [mk("a", 2), mk("b", 2), mk("c", 2)];

    it("dentro del silencio no cabe nada que no sea urgente", () => {
        // A 10 s del último aviso con 20 s de silencio: nada sin prioridad 1.
        expect(planificar(input, 10_000, 0, 20)).toEqual([]);
    });

    it("respetado el silencio caben todos", () => {
        const r = planificar(input, 100_000, 0, 20);
        expect(r).toHaveLength(3);
    });

    it("una prioridad 1 se salta el silencio una sola vez", () => {
        const urgente = [mk("urgente-1", 1), mk("urgente-2", 1), mk("normal", 3)];
        // Sin silencio cumplido: pasa el primero urgente, el resto no.
        const r = planificar(urgente, 5_000, 0, 20);
        expect(r.map((x) => x.clave)).toEqual(["urgente-1"]);
    });

    it("sin anuncios no devuelve nada", () => {
        expect(planificar([], 0, 0, 20)).toEqual([]);
    });
});

describe("asignarVozAutomatica", () => {
    const catalogo = ["fem-aurora", "fem-luna", "masc-orion", "masc-atlas", "neu-zenit", "neu-eco"];

    it("es determinista: mismo id → mismo timbre", () => {
        const a = asignarVozAutomatica("xkiro/qwen3-coder-plus", "escritor", catalogo);
        const b = asignarVozAutomatica("xkiro/qwen3-coder-plus", "escritor", catalogo);
        expect(a.timbreId).toBe(b.timbreId);
        expect(catalogo).toContain(a.timbreId);
    });

    it("ids distintos tienden a voces distintas y siempre del catálogo", () => {
        const ids = ["a", "b", "c", "d", "e", "f"].map((id) => asignarVozAutomatica(id, "escritor", catalogo));
        for (const v of ids) expect(catalogo).toContain(v.timbreId);
        // Con 6 agentes y 6 timbres, al menos 2 voces diferentes deben salir.
        expect(new Set(ids.map((v) => v.timbreId)).size).toBeGreaterThan(1);
    });

    it("con catálogo vacío cae a la voz base neutra", () => {
        expect(asignarVozAutomatica("x", "proceso", []).timbreId).toBe("neu-zenit");
    });
});

describe("validarPreferenciasVoz", () => {
    it("corrige un silencio de 1 a 5 segundos", () => {
        expect(validarPreferenciasVoz({ activa: true, silencioS: 1 }).silencioS).toBe(5);
    });

    it("acota el volumen entre 0.2 y 1", () => {
        expect(validarPreferenciasVoz({ volumenRelativo: 3 }).volumenRelativo).toBe(1);
        expect(validarPreferenciasVoz({ volumenRelativo: 0 }).volumenRelativo).toBe(0.2);
    });

    it("ante basura devuelve los valores por defecto", () => {
        expect(validarPreferenciasVoz(null)).toEqual(PREFERENCIAS_VOZ_POR_DEFECTO);
        expect(validarPreferenciasVoz("texto").activa).toBe(false);
    });
});

describe("resumenParaLeer", () => {
    it("resume ola, proveedores y pendientes de publicación", () => {
        const r = resumenParaLeer({
            olaActiva: "275",
            cuentas: { integradas: 3, enCurso: 2, fallidas: 1, pendientes: 4 },
            proveedoresCaidos: ["nim"],
            sinPublicar: 12,
        });
        expect(r).toContain("ola 275");
        expect(r).toContain("tres integradas");
        expect(r).toContain("NVIDIA");
        expect(r).toContain("doce commits");
    });
});
