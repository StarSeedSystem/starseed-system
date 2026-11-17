/**
 * RST1116A · la fuente que se PIDE viaja en la orden «pantalla-iniciar» y la instantánea enseña la fuente REAL
 * que contestó el aparato. Lo que se pide nunca se confunde con lo que se obtuvo: si el aparato dice otra cosa,
 * la instantánea lo dice tal cual (o no dice nada si el dato no es válido).
 */
import { describe, expect, it } from "vitest";
import { crearPantallaDestino, type DepsDestino } from "../pantalla-destino";
import { definicion, type Args } from "../niveles";
import type { FuentePedida } from "../fuente-pantalla";
import type { RespuestaOrden } from "../orden";

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const validar = (a: Args) => definicion("pantalla-iniciar")!.validar(a);

function montar(fuente: FuentePedida | undefined, respuesta: unknown = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 }) {
    const enviadas: { nombre: string; args: Args }[] = [];
    const deps: DepsDestino = {
        mandar: async (nombre, args) => {
            enviadas.push({ nombre, args });
            if (nombre === "abrir-sesion") return ok({ sesion: TOKEN, nivel: "ver" });
            if (nombre === "pantalla-iniciar") return ok(respuesta);
            return ok();
        },
        firmar: async () => null,
        iceServers: async () => [],
        // La negociación se corta aquí a propósito: la fuente ya quedó puesta en la instantánea antes de negociar.
        crearPeer: () => {
            throw new Error("sin peer");
        },
        flujoDe: () => null,
        ahora: () => 1,
    };
    return { destino: crearPantallaDestino("tableta", { fuente, deps }), enviadas };
}

const iniciarDe = (enviadas: { nombre: string; args: Args }[]) => enviadas.find((e) => e.nombre === "pantalla-iniciar")!;

describe("RST1116A · la fuente pedida llega a la orden", () => {
    it("con «proyeccion» la orden lleva fuente:proyeccion", async () => {
        const { destino, enviadas } = montar("proyeccion");
        await destino.iniciar();
        expect(iniciarDe(enviadas).args).toEqual({ fuente: "proyeccion" });
    });

    it("con «auto» (o sin pedir nada) la orden no lleva el campo: el comportamiento de hoy no cambia", async () => {
        for (const fuente of ["auto", undefined] as const) {
            const { destino, enviadas } = montar(fuente);
            await destino.iniciar();
            const args = iniciarDe(enviadas).args;
            expect(args).toEqual({});
            expect("fuente" in args).toBe(false);
        }
    });
});

describe("RST1116A · el vocabulario admite solo dos valores de fuente", () => {
    it("acepta auto y proyeccion, y los copia tal cual", () => {
        expect(validar({ fuente: "proyeccion" })).toEqual({ fuente: "proyeccion" });
        expect(validar({ fuente: "auto" })).toEqual({ fuente: "auto" });
        expect(validar({ lado: 1280, calidad: 60, fuente: "proyeccion" })).toEqual({ lado: 1280, calidad: 60, fuente: "proyeccion" });
    });

    it("rechaza cualquier otro valor o tipo: la orden entera se rechaza", () => {
        for (const a of [{ fuente: "otra" }, { fuente: 1 }, { fuente: null }, { fuente: true }, { fuente: "PROYECCION" }, { fuente: "proyeccion", otra: 1 }]) {
            expect(validar(a as Args)).toBeNull();
        }
    });
});

describe("RST1116A · la instantánea dice la fuente REAL", () => {
    it("toma la fuente del resultado cuando es uno de los dos valores válidos", async () => {
        for (const fuente of ["proyeccion", "accesibilidad"] as const) {
            const { destino } = montar("proyeccion", { ok: true, fuente, ancho: 800, alto: 1280, giro: 0 });
            await destino.iniciar();
            expect(destino.instantanea().fuente).toBe(fuente);
        }
    });

    it("ignora una fuente que no reconoce: no se inventa la fuente", async () => {
        for (const basura of ["rara", "", 3, null, undefined]) {
            const { destino } = montar("proyeccion", { ok: true, fuente: basura, ancho: 800, alto: 1280, giro: 0 });
            await destino.iniciar();
            expect(destino.instantanea().fuente).toBeUndefined();
        }
    });
});
