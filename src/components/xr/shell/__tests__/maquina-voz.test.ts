import { describe, expect, it } from "vitest";
import { entenderVoz, type ContextoVoz } from "../../../../lib/xr/intenciones-voz";
import { FLUJO_INICIAL, siguiente, type Efecto, type EstadoFlujo } from "../maquina-voz";
const CTX: ContextoVoz = { grupos: [{ id: "g1", nombre: "Banda", miembros: 6 }], contactos: [], estaciones: [], servidores: [], enfoque: { tipo: "grupo", id: "g1" }, mundoActual: { id: "m1", nombre: "Ensayo" } };
const SIN: ContextoVoz = { ...CTX, grupos: [{ id: "g2", nombre: "Amigos", miembros: 4 }], enfoque: null };
const FRASE = "crea un mundo virtual con cielo de noche y gravedad cero e invita a este grupo de amigos";
const FRASE3 = `${FRASE} y súbelo a la biblioteca`;
const desde = (frase: string, ctx: ContextoVoz = CTX) => {
    const a = siguiente(FLUJO_INICIAL, { tipo: "frase", texto: frase });
    return siguiente(a.estado, { tipo: "resultado", resultado: entenderVoz(frase, ctx) });
};
const confirmar = (e: EstadoFlujo) => siguiente(e, { tipo: "respuesta", respuesta: "confirmar" });
interface Fake { orden: string[]; deshechos: string[]; falla?: string; motivo?: string }
function correr(estado: EstadoFlujo, efectos: Efecto[], fake: Fake): EstadoFlujo {
    let s = estado; const cola = [...efectos];
    while (cola.length) {
        const ef = cola.shift()!; if (ef.tipo !== "ejecutar-paso") continue;
        const t = ef.paso.intencion.tipo; fake.orden.push(t);
        const out = fake.falla === t ? siguiente(s, { tipo: "paso-fallo", motivo: fake.motivo ?? "no se pudo" })
            : siguiente(s, { tipo: "paso-ok", resumen: `hecho ${t}`, deshacer: async () => { fake.deshechos.push(t); } });
        s = out.estado; cola.push(...out.efectos);
    }
    return s;
}
describe("máquina de voz XR1010T", () => {
    it("entiende la orden de Alex en 2-3 pasos", () => {
        const r = entenderVoz(FRASE, CTX);
        expect(r.ok && r.pasos.length).toBeGreaterThanOrEqual(2);
        if (r.ok) expect(r.pasos.length).toBeLessThanOrEqual(3);
    });
    it("frase lanza entender y el resultado confirmable muestra UNA tarjeta", () => {
        const a = siguiente(FLUJO_INICIAL, { tipo: "frase", texto: FRASE });
        expect(a.estado.tipo).toBe("entendiendo");
        expect(a.efectos).toEqual([{ tipo: "entender", frase: FRASE }]);
        const t = desde(FRASE);
        expect(t.estado.tipo).toBe("tarjeta");
        expect(t.efectos).toEqual([{ tipo: "mostrar-tarjeta" }]);
    });
    it("confirmar una vez crea, invita y termina en hecho con resumen", () => {
        const c = confirmar(desde(FRASE).estado); const f: Fake = { orden: [], deshechos: [] };
        expect(c.efectos[0]).toMatchObject({ tipo: "ejecutar-paso", indice: 0, total: 2 });
        const fin = correr(c.estado, c.efectos, f);
        expect(f.orden).toEqual(["crear-mundo", "invitar"]);
        expect(fin.tipo === "hecho" && fin.resumen).toContain("hecho crear-mundo");
        if (fin.tipo === "hecho") expect(fin.deshacer).toHaveLength(2);
    });
    it("sin grupo señalado pregunta con candidatos y NO ejecuta", () => {
        const r = desde(FRASE, SIN);
        expect(r.estado.tipo).toBe("tarjeta");
        if (r.estado.tipo === "tarjeta") { expect(r.estado.modo).toBe("preguntar"); if (!r.estado.resultado.ok) expect(r.estado.resultado.candidatos?.[0].id).toBe("g2"); }
        expect(r.efectos.some((e) => e.tipo === "ejecutar-paso")).toBe(false);
    });
    it("elegir candidato reentiende con el enfoque señalado", () => {
        const e = siguiente(desde(FRASE, SIN).estado, { tipo: "respuesta", respuesta: { elegir: "g2" } });
        expect(e.estado.tipo).toBe("entendiendo");
        expect(e.efectos).toEqual([{ tipo: "entender", frase: FRASE, enfoque: { tipo: "grupo", id: "g2" } }]);
    });
    it("confirmar el elegido crea e invita", () => {
        const r = desde(FRASE, SIN);
        const el = siguiente(r.estado, { tipo: "respuesta", respuesta: { elegir: "g2" } });
        const rr = siguiente(el.estado, { tipo: "resultado", resultado: entenderVoz(FRASE, { ...SIN, enfoque: { tipo: "grupo", id: "g2" } }) });
        expect(rr.estado.tipo).toBe("tarjeta");
        const c = confirmar(rr.estado); const f: Fake = { orden: [], deshechos: [] };
        expect(correr(c.estado, c.efectos, f).tipo).toBe("hecho");
        expect(f.orden).toEqual(["crear-mundo", "invitar"]);
    });
    it("cancelar tras el primer paso deshace lo ejecutado", async () => {
        const c = confirmar(desde(FRASE).estado); const f: Fake = { orden: [], deshechos: [] };
        const s1 = siguiente(c.estado, { tipo: "paso-ok", resumen: "hecho crear-mundo", deshacer: async () => { f.deshechos.push("crear-mundo"); } });
        const x = siguiente(s1.estado, { tipo: "cancelar" });
        expect(x.estado.tipo).toBe("reposo");
        const d = x.efectos.find((e) => e.tipo === "deshacer");
        if (d?.tipo === "deshacer") for (const u of d.pasos) await u();
        expect(f.deshechos).toEqual(["crear-mundo"]);
    });
    it("si falla la invitación deja el mundo creado y lo dice", () => {
        const c = confirmar(desde(FRASE).estado); const f: Fake = { orden: [], deshechos: [], falla: "invitar" };
        const fin = correr(c.estado, c.efectos, f);
        expect(fin.tipo).toBe("fallo");
        if (fin.tipo === "fallo") { expect(fin.motivo).toContain("Se hizo"); expect(fin.motivo).toContain("invitar"); expect(fin.hechos).toHaveLength(1); }
        expect(f.deshechos).toEqual([]);
    });
    it("deshacer tras hecho revierte en orden inverso", async () => {
        const c = confirmar(desde(FRASE3).estado); const f: Fake = { orden: [], deshechos: [] };
        const fin = correr(c.estado, c.efectos, f);
        expect(f.orden).toEqual(["crear-mundo", "invitar", "subir"]);
        const x = siguiente(fin, { tipo: "deshacer" });
        const d = x.efectos.find((e) => e.tipo === "deshacer");
        if (d?.tipo === "deshacer") for (const u of d.pasos) await u();
        expect(f.deshechos).toEqual(["subir", "invitar", "crear-mundo"]);
        expect(x.estado.tipo).toBe("reposo");
    });
    it("«súbelo a la biblioteca» se ejecuta sin tarjeta", () => {
        const r = desde("subelo a la biblioteca");
        expect(r.estado.tipo).toBe("ejecutando");
        expect(r.efectos.some((e) => e.tipo === "mostrar-tarjeta")).toBe(false);
    });
    it("«publícalo para todo el mundo» pide tarjeta", () => {
        const r = desde("publicalo para todo el mundo");
        expect(r.estado.tipo).toBe("tarjeta");
        expect(r.efectos).toEqual([{ tipo: "mostrar-tarjeta" }]);
    });
    it("sin consentimiento la publicación termina en fallo", () => {
        const c = confirmar(desde("publicalo para todo el mundo").estado);
        const f: Fake = { orden: [], deshechos: [], falla: "subir", motivo: "necesita tu permiso" };
        const fin = correr(c.estado, c.efectos, f);
        expect(fin.tipo === "fallo" && fin.motivo).toContain("permiso");
    });
    it("una frase no entendida abre pregunta y no ejecuta", () => {
        const r = desde("comprame una pizza");
        expect(r.estado.tipo).toBe("tarjeta");
        if (r.estado.tipo === "tarjeta") expect(r.estado.modo).toBe("preguntar");
        expect(r.efectos.some((e) => e.tipo === "ejecutar-paso")).toBe(false);
    });
    it("cancelar en la tarjeta no ejecuta ni deshace nada", () => {
        const x = siguiente(desde(FRASE).estado, { tipo: "cancelar" });
        expect(x.estado.tipo).toBe("reposo");
        expect(x.efectos.some((e) => e.tipo === "deshacer" || e.tipo === "ejecutar-paso")).toBe(false);
    });
});
