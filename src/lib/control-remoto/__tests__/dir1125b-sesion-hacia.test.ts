/** DIR1125B · «Terminar control» termina de verdad y mirar si te aceptaron no deja una sesión abierta. */
import { afterEach, describe, expect, it } from "vitest";
import { SesionHacia } from "../canal";
import { RegistroSesiones } from "../registro-sesiones";
import type { RespuestaOrden } from "../orden";
import { ActorBanco } from "@/lib/banco-llamadas/actor";

const NEURONA = "11111111-1111-4111-8111-111111111111";
const resp = (ok: boolean, motivo: string, resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok, motivo, resultado });

function aparato() {
    const vistas: string[] = [];
    const abiertas = new Set<string>();
    let n = 0;
    const mandar = async (_para: string, nombre: string, _args: unknown, o: { sesion?: string | null }): Promise<RespuestaOrden> => {
        vistas.push(nombre);
        if (nombre === "abrir-sesion") {
            n += 1;
            abiertas.add(`tok-${n}`);
            return resp(true, "ok", { sesion: `tok-${n}`, nivel: "controlar" });
        }
        if (nombre === "cerrar-sesion") {
            abiertas.delete(String(o.sesion));
            return resp(true, "ok");
        }
        if (!o.sesion || !abiertas.has(o.sesion)) return resp(false, "sin-sesion");
        return resp(true, "ok", {});
    };
    return { vistas, abiertas, mandar: mandar as unknown as ConstructorParameters<typeof SesionHacia>[1] };
}

const vivas: SesionHacia[] = [];
afterEach(async () => {
    for (const s of vivas.splice(0)) await s.cerrar();
});

describe("DIR1125B · SesionHacia", () => {
    it("sondear abre, pregunta y cierra: no queda ninguna sesión de control abierta", async () => {
        const a = aparato();
        const reg = new RegistroSesiones();
        const s = new SesionHacia(NEURONA, a.mandar, reg);
        vivas.push(s);
        expect((await s.sondear()).ok).toBe(true);
        expect(a.vistas).toEqual(["abrir-sesion", "leer-estado", "cerrar-sesion"]);
        expect(a.abiertas.size).toBe(0);
        expect(reg.sesionesSalientes().length).toBe(0);
    });

    it("si no la aceptaron, sondear lo dice y tampoco deja nada", async () => {
        const reg = new RegistroSesiones();
        const vistas: string[] = [];
        const mandar = (async (_p: string, nombre: string) => {
            vistas.push(nombre);
            return resp(false, "no-autorizado");
        }) as unknown as ConstructorParameters<typeof SesionHacia>[1];
        const s = new SesionHacia(NEURONA, mandar, reg);
        vivas.push(s);
        const r = await s.sondear();
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("no-autorizado");
        expect(vistas).toEqual(["abrir-sesion"]);
        expect(reg.sesionesSalientes().length).toBe(0);
    });

    it("con la sesión ya tomada aquí (serie armada), sondear no la cierra", async () => {
        const a = aparato();
        const reg = new RegistroSesiones();
        const s = new SesionHacia(NEURONA, a.mandar, reg);
        vivas.push(s);
        expect((await s.orden("leer-estado")).ok).toBe(true);
        expect((await s.sondear()).ok).toBe(true);
        expect(a.vistas.includes("cerrar-sesion")).toBe(false);
        expect(a.abiertas.size).toBe(1);
    });

    it("tras detener, el latido no resucita la sesión que cerró la persona", async () => {
        const a = aparato();
        const reg = new RegistroSesiones();
        const s = new SesionHacia(NEURONA, a.mandar, reg);
        vivas.push(s);
        expect((await s.orden("leer-estado")).ok).toBe(true);
        s.detener();
        a.abiertas.clear(); // el aparato ya la cerró
        expect(await s.latir()).toBe(false);
        expect(a.vistas.filter((x) => x === "abrir-sesion").length).toBe(1);
    });
});

describe("DIR1125B · el banco mira si te aceptaron sin abrir una sesión que se quede", () => {
    it("comprobar usa sondear cuando no hay serie armada", async () => {
        let sondeos = 0;
        let ordenes = 0;
        const deps = {
            ahora: () => 1_000,
            dormir: async () => undefined,
            leer: async () => null,
            marcar: () => undefined,
            tableta: () => ({
                orden: async () => {
                    ordenes += 1;
                    return resp(true, "ok");
                },
                sondear: async () => {
                    sondeos += 1;
                    return resp(true, "ok");
                },
            }),
            yo: () => null,
            publicar: () => undefined,
            llave: async () => ({ tiene: true, codigo: "AAAA" }),
            local: async () => resp(true, "ok"),
        } as unknown as ConstructorParameters<typeof ActorBanco>[0];
        const actor = new ActorBanco(deps);
        await actor.comprobar(NEURONA);
        expect(sondeos).toBe(1);
        expect(ordenes).toBe(0);
    });
});
