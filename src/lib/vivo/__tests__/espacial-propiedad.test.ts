import { describe, expect, it } from "vitest";
import { abrirSesionEscena, type AlmacenEscena, type SesionEscena } from "@/lib/vivo/espacial/sesion";
import type { ConexionEscena, EventoEscena, FilaCambiada } from "@/lib/vivo/espacial/canal";
import { docVacio, sanearDoc, type DocEscena } from "@/lib/vivo/espacial/modelo";
import { fusionarDocs } from "@/lib/vivo/espacial/fusion";
import type { Propiedades } from "@/lib/salas/propiedad-sala";

// ───────────────────────── Dobles de prueba ─────────────────────────

function reloj() {
    let t = 1_000_000;
    let sig = 0;
    const tareas = new Map<number, { en: number; fn: () => void }>();
    return {
        ahora: () => t,
        programar: (fn: () => void, ms: number) => {
            const id = ++sig;
            tareas.set(id, { en: t + ms, fn });
            return id;
        },
        cancelar: (id: unknown) => tareas.delete(id as number),
        async avanzar(ms: number) {
            const fin = t + ms;
            for (;;) {
                const proxima = [...tareas.entries()].filter(([, v]) => v.en <= fin).sort((a, b) => a[1].en - b[1].en)[0];
                if (!proxima) break;
                t = proxima[1].en;
                tareas.delete(proxima[0]);
                proxima[1].fn();
                await vaciar();
            }
            t = fin;
            await vaciar();
        },
    };
}

async function vaciar() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

function canalFalso() {
    const oy = {
        p: new Set<(e: Record<string, unknown>) => void>(),
        f: new Set<(f: FilaCambiada) => void>(),
    };
    const conexion: ConexionEscena = {
        tema: "t",
        suscrito: () => true,
        enviar: () => {},
        publicarPresencia: () => {},
        onPresencia: (cb) => (oy.p.add(cb), () => oy.p.delete(cb)),
        onMensaje: () => () => {},
        onFila: (cb) => (oy.f.add(cb), () => oy.f.delete(cb)),
        onSuscrito: () => () => {},
        cerrar: () => {},
    };
    return { presencia: (e: Record<string, unknown>) => oy.p.forEach((cb) => cb(e)), fila: (f: FilaCambiada) => oy.f.forEach((cb) => cb(f)), conex: conexion };
}

function almacenFalso(docInicial: DocEscena = docVacio()) {
    const filaDoc: { rev: number; doc: DocEscena } = { rev: 3, doc: docInicial };
    const escrituras: DocEscena[] = [];
    const almacen: AlmacenEscena = {
        async leer(id) {
            return {
                fila: { id, titulo: "Mi escena", dueno: "dueno", acceso: "invite", rev: filaDoc.rev, doc: sanearDoc(JSON.parse(JSON.stringify(filaDoc.doc))).doc, descartados: 0, actualizada: "" },
            };
        },
        async guardar(_id, rev, doc) {
            if (rev !== filaDoc.rev) return { ok: false, conflicto: true };
            filaDoc.rev += 1;
            filaDoc.doc = JSON.parse(JSON.stringify(doc));
            escrituras.push(filaDoc.doc);
            return { ok: true, rev: filaDoc.rev };
        },
        async puedeEditar() {
            return true;
        },
    };
    return { almacen, filaDoc, escrituras };
}

const ID = "11111111-2222-3333-4444-555555555555";

function abrir(almacen: AlmacenEscena, c: ReturnType<typeof canalFalso>, r: ReturnType<typeof reloj>, yo: { clave: string; uid: string | null } = { clave: "yo:1", uid: null }): SesionEscena {
    return abrirSesionEscena({
        fuente: { tipo: "espacio", id: ID },
        identidad: { clave: yo.clave, uid: yo.uid, nombre: "Yo" },
        deps: { almacen, abrirCanal: () => c.conex, ...r, aleatorio: () => 0.5 },
    });
}

function conPieza(doc: DocEscena, id: string, nombre: string): DocEscena {
    const crudo = {
        id,
        tipo: "caja",
        nombre,
        pos: [0, 0.5, 0],
        rot: [0, 0, 0],
        esc: [1, 1, 1],
        material: { color: "#7C5CFF", metalico: 0.1, rugosidad: 0.45, emisivo: 0, opacidad: 1, alambre: false },
        actualizado: 2_000_000,
        por: "dAna",
    };
    return sanearDoc({ ...doc, objetos: { ...doc.objetos, [id]: crudo } }).doc;
}

function conReclamoDeAna(doc: DocEscena, id: string, epoca = 1): DocEscena {
    return { ...doc, propiedades: { ...doc.propiedades, [id]: { dueno: "ana", epoca } } };
}

function filaNueva(a: ReturnType<typeof almacenFalso>, c: ReturnType<typeof canalFalso>) {
    a.filaDoc.rev += 1;
    c.fila({ rev: a.filaDoc.rev, doc: a.filaDoc.doc, titulo: null, acceso: null });
}

// ───────────────────────── Pruebas ─────────────────────────

describe("propiedad por épocas en la escena compartida", () => {
    it("el modelo acarrea los reclamos sanos y la fusión converge a un único dueño en cualquier orden", () => {
        const crudos: Propiedades = {
            o_1: { dueno: "ana", epoca: 2 },
            o_2: { dueno: "inv-x", epoca: 1 },
            basura: { dueno: "   ", epoca: 0 },
        };
        const doc = sanearDoc({ ...docVacio(), propiedades: crudos }).doc;
        expect(Object.keys(doc.propiedades ?? {}).sort()).toEqual(["o_1", "o_2"]);
        // La pieza de Ana,machacada por la mía a la misma época: gana el dueño menor alfabéticamente.
        const mia: Propiedades = { o_1: { dueno: "yo", epoca: 2 } };
        const ab = fusionarDocs({ ...docVacio(), propiedades: doc.propiedades }, { ...docVacio(), propiedades: mia });
        const ba = fusionarDocs({ ...docVacio(), propiedades: mia }, { ...docVacio(), propiedades: doc.propiedades });
        expect(ab.propiedades?.["o_1"]).toEqual({ dueno: "ana", epoca: 2 });
        expect(ba.propiedades?.["o_1"]).toEqual(ab.propiedades?.["o_1"]);
    });

    it("al crear una pieza su creador la reclama; la pieza que Ana reclamó no se deja escribir", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        const mia = s.anadir("caja")!;
        expect(s.tienda.obtener().doc.propiedades?.[mia.id]).toEqual({ dueno: "yo", epoca: 1 });
        // Ana guarda una versión donde esa misma pieza ya es suya (época mayor).
        a.filaDoc.doc = conReclamoDeAna(a.filaDoc.doc, mia.id, 2);
        filaNueva(a, c);
        await vaciar();
        expect(s.tienda.obtener().doc.propiedades?.[mia.id]).toEqual({ dueno: "ana", epoca: 2 });
        expect(s.actualizar(mia.id, { pos: [1, 0.5, 0] })).toBe(false);
        expect(s.tienda.obtener().aviso).toBe("Esa pieza la tiene otra persona; pídesela.");
        s.cerrar();
    });

    it("el dueño de la escena se asigna la pieza de Ana al escribirla (cesión forzada) y el reclamo queda guardado", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r, { clave: "dueno:1", uid: "dueno" });
        await vaciar();
        a.filaDoc.doc = conReclamoDeAna(conPieza(docVacio(), "o_ana", "Esfera"), "o_ana", 1);
        filaNueva(a, c);
        expect(s.actualizar("o_ana", { pos: [1, 1, 1] })).toBe(true);
        expect(s.tienda.obtener().doc.propiedades?.["o_ana"]).toEqual({ dueno: "dueno", epoca: 2 });
        await r.avanzar(800);
        expect(a.escrituras.at(-1)?.propiedades?.["o_ana"]).toEqual({ dueno: "dueno", epoca: 2 });
        s.cerrar();
    });

    it("un editor sin llave de la escena no puede escribir la pieza reclamada de Ana", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r, { clave: "ed1:1", uid: "ed1" });
        await vaciar();
        a.filaDoc.doc = conReclamoDeAna(conPieza(docVacio(), "o_b", "Bola"), "o_b", 1);
        filaNueva(a, c);
        expect(s.actualizar("o_b", { pos: [2, 2, 2] })).toBe(false);
        expect(s.tienda.obtener().doc.propiedades?.["o_b"]).toEqual({ dueno: "ana", epoca: 1 });
        expect(s.tienda.obtener().aviso).toContain("pídesela");
        s.cerrar();
    });

    it("la pieza de quien se va vuelve al dueño de la escena si está dentro (cesión por épocas)", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r, { clave: "dueno:1", uid: "dueno" });
        await vaciar();
        a.filaDoc.doc = conReclamoDeAna(conPieza(docVacio(), "o_c", "Cubo"), "o_c", 1);
        filaNueva(a, c);
        c.presencia({ "dueno:1": [{ nombre: "Dú" }], "ana:9": [{ nombre: "Ana", desde: 1 }] });
        expect(s.tienda.obtener().doc.propiedades?.["o_c"]).toEqual({ dueno: "ana", epoca: 1 });
        c.presencia({ "dueno:1": [{ nombre: "Dú" }] });
        await vaciar();
        expect(s.tienda.obtener().doc.propiedades?.["o_c"]).toEqual({ dueno: "dueno", epoca: 2 });
        s.cerrar();
    });
});
