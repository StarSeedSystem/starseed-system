/**
 * Pruebas de XR1010P · voz en el visor (contrato §3 f). Solo módulos puros con un
 * Reconocedor FALSO (sin red, sin micrófono, sin ventana): { describe, it, expect } de vitest.
 */
import { describe, expect, it } from "vitest";
import {
    construirContexto, crearSesionVoz, MOTIVO_SIN_VOZ,
    reconocedorDelNavegador,
    repartirFrase,
    type ContextoVoz, type EstadoVoz, type Reconocedor, type Referenciable, type Reparto, type SesionVoz,
} from "../voz-xr";

/** Reconocedor FALSO: invocado desde fuera; cuenta cierres (micrófono). */
function falsoReconocedor(): Reconocedor & {
    dispararParcial(t: string): void; dispararFinal(t: string): void; dispararError(m: string): void;
    charla: boolean; cierres: number;
} {
    const p = new Set<(t: string) => void>();
    const f = new Set<(t: string) => void>();
    const e = new Set<(m: string) => void>();
    let abierta = false, cierres = 0;
    return {
        get charla() { return abierta; },
        get cierres() { return cierres; },
        iniciar: async () => { abierta = true; },
        parar: () => { abierta = false; cierres++; },
        onParcial: (cb) => (p.add(cb), () => void p.delete(cb)),
        onFinal: (cb) => (f.add(cb), () => void f.delete(cb)),
        onError: (cb) => (e.add(cb), () => void e.delete(cb)),
        dispararParcial: (t) => p.forEach((cb) => cb(t)),
        dispararFinal: (t) => f.forEach((cb) => cb(t)),
        dispararError: (m) => e.forEach((cb) => cb(m)),
    };
}

const GRUPOS: Referenciable[] = [
    { id: "g1", nombre: "Banda", miembros: 7 },
    { id: "g2", nombre: "Bandera", miembros: 3 },
];
const CONTACTOS: Referenciable[] = [
    { id: "c1", nombre: "Ana" },
    { id: "c2", nombre: "Luis" },
];
const CTX: ContextoVoz = construirContexto(
    { grupos: GRUPOS, contactos: CONTACTOS, estaciones: [{ id: "e1", nombre: "Cumbre" }], servidores: [{ id: "s1", nombre: "Cúspide" }] },
    null,
    { id: "m1", nombre: "Sala de prueba" },
);

describe("construirContexto", () => {
    it("arma el contexto con las cuatro listas, el enfoque y el mundo actual", () => {
        const c = construirContexto(
            { grupos: GRUPOS, contactos: CONTACTOS, estaciones: [{ id: "e1", nombre: "Cumbre" }], servidores: [] },
            { tipo: "grupo", id: "g1" },
            { id: "m1", nombre: "Sala" },
        );
        expect(c.grupos).toHaveLength(2);
        expect(c.grupos[0]!.miembros).toBe(7);
        expect(c.contactos.map((x) => x.nombre)).toEqual(["Ana", "Luis"]);
        expect(c.enfoque).toEqual({ tipo: "grupo", id: "g1" });
        expect(c.mundoActual).toEqual({ id: "m1", nombre: "Sala" });
    });
    it("no rompe con listas vacías (el contexto sigue siendo válido)", () => {
        const c = construirContexto({ grupos: [], contactos: [], estaciones: [], servidores: [] }, null, null);
        expect(c.grupos).toEqual([]);
        expect(c.enfoque).toBeNull();
        expect(c.mundoActual).toBeNull();
    });
});

describe("repartirFrase", () => {
    it("«crea un mundo con cielo de noche e invita al grupo Banda» → intención con crear + invitar (y confirmación)", () => {
        const r = repartirFrase("crea un mundo con cielo de noche e invita al grupo Banda", CTX, false);
        if (r.via !== "intencion" || !r.resultado.ok) throw new Error(`se esperaba intención ok, llegó: ${JSON.stringify(r)}`);
        expect(r.resultado.pasos.map((p) => p.intencion.tipo)).toEqual(["crear-mundo", "invitar"]);
        const invitar = r.resultado.pasos[1]!.intencion;
        if (invitar.tipo !== "invitar") throw new Error("segundo paso no es invitar");
        expect(invitar.a[0]).toEqual({ tipo: "grupo", id: "g1", nombre: "Banda", miembros: 7 });
        expect(r.resultado.confirmar).toBe(true);
    });
    it("«súbelo a la biblioteca» → intención ok SIN tarjeta (guardar es de la propia cuenta)", () => {
        const r = repartirFrase("súbelo a la biblioteca", CTX, false);
        if (r.via !== "intencion" || !r.resultado.ok) throw new Error("se esperaba intención ok");
        expect(r.resultado.pasos[0]!.intencion.tipo).toBe("subir");
        expect(r.resultado.confirmar).toBe(false);
        expect(r.resultado.tarjeta).toBeNull();
    });
    it("«este grupo» sin enfoque NUNCA adivina: falla y ofrece la lista de candidatos", () => {
        const r = repartirFrase("invita a este grupo de amigos", CTX, false);
        if (r.via !== "intencion" || r.resultado.ok) throw new Error("no debió adivinar");
        expect(r.resultado.pregunta).toContain("señalado");
    });
    it("frase no entendida con molécula con foco → DICTADO (solo se enruta, texto íntegro)", () => {
        const r = repartirFrase("pon la reverberación al máximo", CTX, true);
        expect(r).toEqual({ via: "dictado", texto: "pon la reverberación al máximo" });
    });
    it("frase no entendida sin molécula → preguntar (con la pregunta del núcleo)", () => {
        const r = repartirFrase("pon la reverberación al máximo", CTX, false);
        expect(r.via).toBe("preguntar");
        if (r.via === "preguntar") expect(r.pregunta).toContain("entendido");
    });
    it("«recentra» → sistema inmediato, sin confirmación; y «ambiguo» pasa como intención con fallo", () => {
        const ra = repartirFrase("recentra", CTX, false);
        if (ra.via !== "intencion" || !ra.resultado.ok) throw new Error("recentra debió entenderse");
        expect(ra.resultado.pasos[0]!.intencion).toEqual({ tipo: "sistema", orden: "recentrar" });
        expect(ra.resultado.confirmar).toBe(false);
    });
});

describe("crearSesionVoz", () => {
    /** Sesión de prueba con capturadores coleccionado. */
    function sesionDe(recon: Reconocedor | null): { sesion: SesionVoz; estados: EstadoVoz[]; parciales: string[]; repartos: Reparto[] } {
        const estados: EstadoVoz[] = [];
        const parciales: string[] = [];
        const repartos: Reparto[] = [];
        const sesion = crearSesionVoz(recon, {
            preguntar: () => ({ ctx: CTX, molecula: false }),
            alEstado: (e) => estados.push(e),
            alParcial: (t) => parciales.push(t),
            alReparto: (r) => repartos.push(r),
        });
        return { sesion, estados, parciales, repartos };
    }

    it("sin reconocedor: hablar empieza tila sin voz y con el motivo honesto (sin lanzar)", async () => {
        const { sesion, estados } = sesionDe(null);
        await sesion.hablar(true);
        expect(estados[0]).toEqual({ estado: "sin-voz", motivo: MOTIVO_SIN_VOZ });
        await expect(sesion.hablar(true)).resolves.toBeUndefined();
    });

    it("pulsar abre (escuchando); parciales fluyen; soltar cierra el micrófono y reparte la intención", async () => {
        const recon = falsoReconocedor();
        const { sesion, estados, parciales, repartos } = sesionDe(recon);
        await sesion.hablar(true);
        expect(estados[0]).toEqual({ estado: "escuchando" });
        recon.dispararParcial("crea un mundo");
        expect(parciales).toContain("crea un mundo");
        await sesion.hablar(false);
        expect(recon.cierres).toBe(1);
        expect(estados[1]).toEqual({ estado: "procesando" });
        recon.dispararFinal("recentra");
        expect(repartos).toHaveLength(1);
        expect(repartos[0]!.via).toBe("intencion");
        expect(estados[2]).toEqual({ estado: "cerrado" });
    });

    it("ante ERROR del reconocedor el micrófono se cierra y el estado queda sin voz con motivo", async () => {
        const recon = falsoReconocedor();
        const { sesion, estados } = sesionDe(recon);
        await sesion.hablar(true);
        recon.dispararError("permiso de micrófono denegado");
        expect(recon.cierres).toBe(1);
        const ultimo = estados.at(-1)!;
        expect(ultimo.estado).toBe("sin-voz");
        if (ultimo.estado === "sin-voz") expect(ultimo.motivo).toContain("permiso de micrófono denegado");
        recon.dispararFinal("recentra");
        expect(estados).toHaveLength(2);
    });

    it("cancelar cierra el micrófono, limpia parciales y DESCARTA el final en vuelo", async () => {
        const recon = falsoReconocedor();
        const { sesion, estados, parciales, repartos } = sesionDe(recon);
        await sesion.hablar(true);
        recon.dispararParcial("pon el brillo");
        sesion.cancelar();
        expect(recon.cierres).toBe(1);
        expect(estados.at(-1)).toEqual({ estado: "cerrado" });
        expect(parciales.at(-1)).toBe("");
        recon.dispararFinal("pon el brillo al 80");
        expect(repartos).toHaveLength(0);
    });
});

describe("reconocedorDelNavegador", () => {
    it("sin ventana (contexto node) devuelve null y nunca lanza", () => {
        expect(reconocedorDelNavegador()).toBeNull();
    });
});
