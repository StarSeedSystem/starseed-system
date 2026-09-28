import { describe, expect, it } from "vitest";
import { abrirSesionEscena, autorDeClave, type AlmacenEscena, type SesionEscena } from "@/lib/vivo/espacial/sesion";
import type { ConexionEscena, EventoEscena, FilaCambiada } from "@/lib/vivo/espacial/canal";
import { crearObjeto, docVacio, sanearDoc, sanearObjeto, type DocEscena, type ObjetoEscena } from "@/lib/vivo/espacial/modelo";
import { aplicarObjetos } from "@/lib/vivo/espacial/fusion";
import type { FilaEscena } from "@/lib/vivo/espacial/persistencia";

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
        cancelar: (id: unknown) => {
            tareas.delete(id as number);
        },
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
        m: new Set<(e: EventoEscena, p: unknown) => void>(),
        p: new Set<(e: Record<string, unknown>) => void>(),
        f: new Set<(f: FilaCambiada) => void>(),
        s: new Set<(ok: boolean) => void>(),
    };
    const enviados: { evento: EventoEscena; payload: Record<string, unknown> }[] = [];
    const estado = { meta: null as Record<string, unknown> | null, cerrado: false };
    const conexion: ConexionEscena = {
        tema: "t",
        suscrito: () => true,
        enviar: (evento, payload) => {
            enviados.push({ evento, payload });
        },
        publicarPresencia: (m) => {
            estado.meta = m;
        },
        onPresencia: (cb) => (oy.p.add(cb), () => oy.p.delete(cb)),
        onMensaje: (cb) => (oy.m.add(cb), () => oy.m.delete(cb)),
        onFila: (cb) => (oy.f.add(cb), () => oy.f.delete(cb)),
        onSuscrito: (cb) => (oy.s.add(cb), () => oy.s.delete(cb)),
        cerrar: () => {
            estado.cerrado = true;
        },
    };
    return {
        conexion,
        enviados,
        estado,
        mensaje: (e: EventoEscena, p: Record<string, unknown>) => oy.m.forEach((cb) => cb(e, p)),
        presencia: (e: Record<string, unknown>) => oy.p.forEach((cb) => cb(e)),
        fila: (f: FilaCambiada) => oy.f.forEach((cb) => cb(f)),
        suscrito: (ok: boolean) => oy.s.forEach((cb) => cb(ok)),
        de: (evento: EventoEscena) => enviados.filter((x) => x.evento === evento),
    };
}

function almacenFalso(docInicial: DocEscena = docVacio(), opciones: { editar?: boolean; rlsNiega?: boolean } = {}) {
    const fila = { rev: 3, doc: docInicial };
    let escrituras = 0;
    const almacen: AlmacenEscena = {
        async leer(id) {
            const f: FilaEscena = {
                id,
                titulo: "Mi escena",
                dueno: "dueno",
                acceso: "invite",
                rev: fila.rev,
                doc: sanearDoc(JSON.parse(JSON.stringify(fila.doc))).doc,
                descartados: 0,
                actualizada: "",
            };
            return { fila: f };
        },
        async guardar(_id, rev, doc) {
            if (opciones.rlsNiega || rev !== fila.rev) return { ok: false, conflicto: true };
            escrituras += 1;
            fila.rev += 1;
            fila.doc = JSON.parse(JSON.stringify(doc));
            return { ok: true, rev: fila.rev };
        },
        async puedeEditar() {
            return opciones.editar ?? true;
        },
    };
    return { almacen, fila, escrituras: () => escrituras };
}

const ID = "11111111-2222-3333-4444-555555555555";

function abrir(almacen: AlmacenEscena, canal: ReturnType<typeof canalFalso>, r: ReturnType<typeof reloj>, clave = "yo:1", fuente: "espacio" | "llamada" = "espacio"): SesionEscena {
    return abrirSesionEscena({
        fuente: fuente === "espacio" ? { tipo: "espacio", id: ID } : { tipo: "llamada", sesionId: "ses-1" },
        identidad: { clave, uid: null, nombre: "Yo" },
        deps: { almacen, abrirCanal: () => canal.conexion, ...r, aleatorio: () => 0.5 },
    });
}

function ajeno(id: string, actualizado: number, nombre = "de Ana"): ObjetoEscena {
    return sanearObjeto({ ...crearObjeto("esfera", { nombre }, { actualizado, por: "dAna", id }) })!;
}

// ───────────────────────── Pruebas ─────────────────────────

describe("sesión de escena guardada", () => {
    it("carga la fila, guarda con espera ≥ 600 ms y agrupa ráfagas en una sola escritura", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        expect(s.tienda.obtener()).toMatchObject({ fase: "lista", titulo: "Mi escena", puedeEditar: true, guardado: "guardado" });

        const o = s.anadir("caja")!;
        expect(s.tienda.obtener().doc.objetos[o.id]).toBeDefined();
        expect(s.tienda.obtener().guardado).toBe("pendiente");
        for (let i = 0; i < 5; i++) {
            s.actualizar(o.id, { pos: [i, 0.5, 0] });
            await r.avanzar(100);
        }
        // La última edición fue hace 100 ms: el guardado sale 800 ms después de ELLA.
        await r.avanzar(699);
        expect(a.escrituras()).toBe(0);
        await r.avanzar(1);
        expect(a.escrituras()).toBe(1);
        expect(a.fila.doc.objetos[o.id].pos).toEqual([4, 0.5, 0]);
        expect(s.tienda.obtener().guardado).toBe("guardado");
        // A solas no se emiten cambios por el canal (nadie los recibiría).
        expect(c.de("cambios")).toHaveLength(0);
        s.cerrar();
        expect(c.estado.cerrado).toBe(true);
    });

    it("si otra persona guardó antes, relee, fusiona y no pisa su trabajo", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        const mio = s.anadir("caja")!;
        // Mientras espero, Ana guarda su esfera en la base.
        a.fila.doc = aplicarObjetos(a.fila.doc, [ajeno("o_ana", 5)]).doc;
        a.fila.rev += 1;
        await r.avanzar(800);
        expect(a.escrituras()).toBe(1);
        expect(Object.keys(a.fila.doc.objetos).sort()).toEqual([mio.id, "o_ana"].sort());
        expect(s.tienda.obtener().doc.objetos.o_ana).toBeDefined();
        s.cerrar();
    });

    it("lo que llega por broadcast se ve «sin confirmar», no lo guardo yo y la base lo confirma", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        const x = ajeno("o_x", 2_000_000);
        c.mensaje("cambios", { de: "ana:9", objetos: [x] });
        expect(s.tienda.obtener().doc.objetos.o_x).toBeDefined();
        expect(s.tienda.obtener().sinConfirmar).toBe(1);
        await r.avanzar(2_000);
        expect(a.escrituras()).toBe(0); // nunca guardo lo ajeno
        c.fila({ rev: 10, doc: aplicarObjetos(docVacio(), [x]).doc, titulo: null, acceso: null });
        expect(s.tienda.obtener().sinConfirmar).toBe(0);
        expect(s.tienda.obtener().doc.objetos.o_x).toBeDefined();
        s.cerrar();
    });

    it("lo ajeno que la base nunca confirma se retira pasados 20 s (tras releer una vez)", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        c.mensaje("cambios", { de: "intruso:1", objetos: [ajeno("o_falso", 2_000_000)] });
        expect(s.tienda.obtener().doc.objetos.o_falso).toBeDefined();
        await r.avanzar(20_100);
        expect(s.tienda.obtener().doc.objetos.o_falso).toBeUndefined();
        expect(s.tienda.obtener().sinConfirmar).toBe(0);
        expect(a.escrituras()).toBe(0);
        s.cerrar();
    });

    it("sin permiso de edición: no añade nada y lo dice", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso(docVacio(), { editar: false });
        const s = abrir(a.almacen, c, r);
        await vaciar();
        expect(s.tienda.obtener()).toMatchObject({ puedeEditar: false, guardado: "lectura" });
        expect(s.anadir("caja")).toBeNull();
        expect(s.tienda.obtener().aviso).toMatch(/Solo puedes mirar/);
        await r.avanzar(5_000);
        expect(a.escrituras()).toBe(0);
        s.cerrar();
    });

    it("si la base rechaza la escritura sin que nadie más escribiera, pasa a solo lectura", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso(docVacio(), { rlsNiega: true });
        const s = abrir(a.almacen, c, r);
        await vaciar();
        s.anadir("cono");
        await r.avanzar(800);
        expect(s.tienda.obtener()).toMatchObject({ puedeEditar: false, guardado: "lectura" });
        s.cerrar();
    });

    it("con gente dentro, emite cambios, vista previa de arrastres y poses estranguladas", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r);
        await vaciar();
        c.presencia({ "yo:1": [{ nombre: "Yo" }], "ana:9": [{ nombre: "Ana", desde: 1 }] });
        expect(s.avatares.obtener().otros.map((x) => x.nombre)).toEqual(["Ana"]);
        const o = s.anadir("toro")!;
        expect(c.de("cambios")).toHaveLength(1);
        for (let i = 0; i < 30; i++) {
            s.previsualizar(o.id, { pos: [i, 0, 0], rot: [0, 0, 0], esc: [1, 1, 1] });
            await r.avanzar(16);
        }
        await r.avanzar(200);
        expect(c.de("arrastre").length).toBeLessThanOrEqual(6);
        for (let i = 0; i < 60; i++) {
            s.emitirPose({ p: [i * 0.1, 1.6, 0], q: [0, 0, 0, 1] });
            await r.avanzar(1000 / 60);
        }
        expect(c.de("pose").length).toBeLessThanOrEqual(11);
        // Oculta: ni una pose más.
        s.visibilidad(false);
        const antes = c.de("pose").length;
        for (let i = 0; i < 30; i++) s.emitirPose({ p: [50 + i, 1.6, 0], q: [0, 0, 0, 1] });
        await r.avanzar(1000);
        expect(c.de("pose").length).toBe(antes);
        // Las poses recibidas se guardan fuera de React y se olvidan al salir la persona.
        c.mensaje("pose", { de: "ana:9", p: [1, 2, 3], q: [0, 0, 0, 1] });
        expect(s.poses.get("ana:9")?.pose.p).toEqual([1, 2, 3]);
        c.presencia({ "yo:1": [{ nombre: "Yo" }] });
        expect(s.poses.has("ana:9")).toBe(false);
        s.cerrar();
    });
});

describe("snapshot estable (useSyncExternalStore)", () => {
    it("getSnapshot devuelve el mismo objeto mientras nada cambia, aunque lleguen mensajes inocuos", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso(aplicarObjetos(docVacio(), [ajeno("o_1", 50)]).doc);
        const s = abrir(a.almacen, c, r);
        await vaciar();
        const snap = s.tienda.obtener();
        expect(s.tienda.obtener()).toBe(snap);
        // Una versión vieja de un objeto, una pose y un eco mío no cambian nada.
        c.mensaje("cambios", { de: "ana:9", objetos: [ajeno("o_1", 10)] });
        c.mensaje("pose", { de: "ana:9", p: [0, 0, 0], q: [0, 0, 0, 1] });
        c.mensaje("cambios", { de: "yo:1", objetos: [ajeno("o_2", 99_999_999)] });
        c.fila({ rev: 1, doc: docVacio(), titulo: null, acceso: null }); // rev viejo
        expect(s.tienda.obtener()).toBe(snap);
        const avatares = s.avatares.obtener();
        c.presencia({ "yo:1": [{}] });
        expect(s.avatares.obtener()).toBe(avatares);
        c.presencia({ "ana:9": [{ nombre: "Ana" }] });
        const conAna = s.avatares.obtener();
        c.presencia({ "ana:9": [{ nombre: "Ana" }] });
        expect(s.avatares.obtener()).toBe(conAna);
        s.cerrar();
    });
});

describe("sala efímera de una llamada", () => {
    it("pide el estado al entrar, fusiona lo que le mandan y responde a quien llega después", async () => {
        const r = reloj();
        const c = canalFalso();
        const a = almacenFalso();
        const s = abrir(a.almacen, c, r, "yo:1", "llamada");
        await vaciar();
        expect(s.tienda.obtener()).toMatchObject({ fase: "lista", persistente: false, guardado: "efimera", puedeEditar: true });
        c.suscrito(true);
        expect(c.de("pedir-estado")).toHaveLength(1);
        const suyo = ajeno("o_s", 7);
        c.mensaje("estado", { de: "ana:9", rid: "x", doc: aplicarObjetos(docVacio(), [suyo]).doc });
        expect(s.tienda.obtener().doc.objetos.o_s).toBeDefined();

        // Llega Leo y pide el estado: respondo tras una espera… salvo que otra persona responda antes.
        c.mensaje("pedir-estado", { de: "leo:3", rid: "r1" });
        c.mensaje("estado", { de: "ana:9", rid: "r1", doc: docVacio() });
        await r.avanzar(1_000);
        expect(c.de("estado")).toHaveLength(0);
        c.mensaje("pedir-estado", { de: "leo:3", rid: "r2" });
        await r.avanzar(1_000);
        expect(c.de("estado")).toHaveLength(1);
        expect(a.escrituras()).toBe(0); // nunca toca la base
        s.cerrar();
    });

    it("en la sala efímera los cambios de los demás se aplican al momento", async () => {
        const r = reloj();
        const c = canalFalso();
        const s = abrir(almacenFalso().almacen, c, r, "yo:1", "llamada");
        await vaciar();
        c.mensaje("cambios", { de: "ana:9", objetos: [ajeno("o_a", 5)] });
        expect(s.tienda.obtener()).toMatchObject({ sinConfirmar: 0 });
        expect(s.tienda.obtener().doc.objetos.o_a).toBeDefined();
        s.cerrar();
    });
});

describe("autor", () => {
    it("el autor de una edición no lleva el uid dentro", () => {
        const uid = "8f14e45f-ceea-467a-9575-6d2ab1c0e8a1";
        expect(autorDeClave(`${uid}:abc`)).not.toContain(uid);
        expect(autorDeClave("a:1")).toBe(autorDeClave("a:1"));
    });
});
