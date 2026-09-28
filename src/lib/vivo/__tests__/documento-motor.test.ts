/**
 * Motor colaborativo con un servidor y un canal FALSOS en memoria: dos pestañas que escriben a la
 * vez, compare-and-swap, lápidas, permisos, seguridad del canal (lo difundido no se guarda en
 * pantalla ajena) y estabilidad de la instantánea (useSyncExternalStore).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BloqueDoc } from "@/lib/mensajeria/formato-tipos";
import {
    SalaColaborativa,
    leerPresentes,
    type CanalColab,
    type OyentesCanal,
    type ResultadoEscritura,
    type TransporteColab,
} from "@/lib/vivo/doc-colaborativo/motor";
import { clavesEntre } from "@/lib/vivo/doc-colaborativo/orden";
import { APP_DOCUMENTO, META_DOCUMENTO_INICIAL, validarBloqueDocumento, validarMetaDocumento, type MetaDocumento } from "@/lib/vivo/documento";

const p = (texto: string): BloqueDoc => ({ tipo: "parrafo", tramos: texto ? [{ texto }] : [] });
const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class Bus {
    miembros = new Map<string, OyentesCanal>();
    presencia: Record<string, unknown[]> = {};
    cortado = false;
    enviados: { de: string; evento: string; carga: Record<string, unknown> }[] = [];
    unir(clave: string, o: OyentesCanal): CanalColab {
        this.miembros.set(clave, o);
        queueMicrotask(() => o.alEstado(true));
        return {
            enviar: (evento, carga) => {
                this.enviados.push({ de: clave, evento, carga });
                if (this.cortado) return;
                for (const [k, m] of this.miembros) if (k !== clave) m.alEvento(evento, clonar(carga));
            },
            anunciar: (estado) => {
                this.presencia[clave] = [clonar(estado)];
                for (const m of this.miembros.values()) m.alPresencia({ ...this.presencia });
            },
            cerrar: () => {
                this.miembros.delete(clave);
                delete this.presencia[clave];
            },
        };
    }
}

class Servidor {
    doc: unknown = { app: APP_DOCUMENTO, v: 1, unidades: [], meta: null };
    rev = 1;
    escrituras = 0;
    editores = new Set(["ana", "luis"]);
    constructor(readonly bus: Bus) {}
    transporte(uid: string): TransporteColab {
        return {
            leer: async () => ({ doc: clonar(this.doc), rev: this.rev }),
            leerRev: async () => this.rev,
            escribir: async (doc, rev): Promise<ResultadoEscritura> => {
                if (!this.editores.has(uid)) return { tipo: "sin-permiso" };
                if (rev !== this.rev) return { tipo: "conflicto", lectura: { doc: clonar(this.doc), rev: this.rev } };
                this.doc = clonar(doc);
                this.rev += 1;
                this.escrituras += 1;
                return { tipo: "ok", rev: this.rev };
            },
            abrirCanal: (clave, oyentes) => this.bus.unir(clave, oyentes),
        };
    }
    textos(): string[] {
        const d = this.doc as { unidades: { orden: string; id: string; borrado?: boolean; datos?: BloqueDoc }[] };
        return [...d.unidades]
            .filter((x) => !x.borrado)
            .sort((a, b) => (a.orden < b.orden ? -1 : a.orden > b.orden ? 1 : a.id < b.id ? -1 : 1))
            .map((x) => (x.datos && "tramos" in x.datos ? x.datos.tramos.map((t) => t.texto).join("") : ""));
    }
}

function sala(servidor: Servidor, uid: string, nombre: string, puedeEditar = true) {
    return new SalaColaborativa<BloqueDoc, MetaDocumento>({
        app: APP_DOCUMENTO,
        transporte: servidor.transporte(uid),
        validarDatos: validarBloqueDocumento,
        validarMeta: validarMetaDocumento,
        metaInicial: META_DOCUMENTO_INICIAL,
        yo: { uid, nombre, color: "#7C5CFF" },
        puedeEditar,
        debounceMs: 600,
        esperaMaxMs: 3000,
        claveTab: `tab-${uid}-${Math.random().toString(36).slice(2, 6)}`,
    });
}

const textos = (s: SalaColaborativa<BloqueDoc, MetaDocumento>) =>
    s.instantanea().unidades.map((x) => (x.datos && "tramos" in x.datos ? x.datos.tramos.map((t) => t.texto).join("") : ""));

async function sembrar(servidor: Servidor, ...lineas: string[]) {
    const claves = clavesEntre(null, null, lineas.length);
    servidor.doc = {
        app: APP_DOCUMENTO,
        v: 1,
        unidades: lineas.map((t, i) => ({ id: `bloque${i}`, orden: claves[i], actualizado: 1, autor: "ana", datos: p(t) })),
        meta: null,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("SalaColaborativa · dos personas a la vez", () => {
    test("ediciones concurrentes en bloques distintos: sobreviven ambas en el servidor y en las dos pantallas", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "uno", "dos", "tres");
        const ana = sala(servidor, "ana", "Ana");
        const luis = sala(servidor, "luis", "Luis");
        ana.iniciar();
        luis.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        expect(textos(ana)).toEqual(["uno", "dos", "tres"]);

        // Sin canal (lo peor): solo el compare-and-swap protege.
        bus.cortado = true;
        ana.cambiar([{ id: "bloque0", datos: p("UNO (Ana)") }]);
        luis.cambiar([{ id: "bloque2", datos: p("TRES (Luis)") }]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(servidor.textos()).toEqual(["UNO (Ana)", "dos", "TRES (Luis)"]);
        expect(servidor.escrituras).toBe(2);

        // Al volver el canal, el aviso «guardado» hace que la otra pestaña relea lo que se perdió.
        bus.cortado = false;
        ana.cambiar([{ id: "bloque1", datos: p("dos (Ana)") }]);
        await vi.advanceTimersByTimeAsync(2000);
        await luis.alVolver();
        expect(textos(ana)).toEqual(["UNO (Ana)", "dos (Ana)", "TRES (Luis)"]);
        expect(textos(luis)).toEqual(["UNO (Ana)", "dos (Ana)", "TRES (Luis)"]);
        ana.cerrar();
        luis.cerrar();
    });

    test("difusión inmediata: lo que escribe una persona se ve en la otra antes de guardarse", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "hola");
        const ana = sala(servidor, "ana", "Ana");
        const luis = sala(servidor, "luis", "Luis");
        ana.iniciar();
        luis.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        ana.cambiar([{ id: "bloque0", datos: p("hola, Luis") }]);
        await vi.advanceTimersByTimeAsync(150); // difusión (~120 ms), aún sin guardar
        expect(servidor.escrituras).toBe(0);
        expect(textos(luis)).toEqual(["hola, Luis"]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(servidor.escrituras).toBe(1);
        ana.cerrar();
        luis.cerrar();
    });

    test("el mismo párrafo: gana la última escritura y se avisa con suavidad a quien pierde", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "párrafo");
        const ana = sala(servidor, "ana", "Ana");
        const luis = sala(servidor, "luis", "Luis");
        const avisosAna: string[] = [];
        ana.alConflicto((c) => avisosAna.push(`${c.autorNombre}:${c.ganaRemoto ? "suya" : "tuya"}`));
        ana.iniciar();
        luis.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        vi.setSystemTime(new Date(1_000_000));
        ana.cambiar([{ id: "bloque0", datos: p("versión de Ana") }]);
        vi.setSystemTime(new Date(1_000_050));
        luis.cambiar([{ id: "bloque0", datos: p("versión de Luis") }]);
        await vi.advanceTimersByTimeAsync(3000);
        expect(servidor.textos()).toEqual(["versión de Luis"]);
        expect(textos(ana)).toEqual(["versión de Luis"]);
        expect(textos(luis)).toEqual(["versión de Luis"]);
        expect(avisosAna).toEqual(["Luis:suya"]);
        ana.cerrar();
        luis.cerrar();
    });

    test("borrar un bloque mientras otra persona escribe en otro: la lápida viaja y el otro sobrevive", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "a", "b", "c");
        const ana = sala(servidor, "ana", "Ana");
        const luis = sala(servidor, "luis", "Luis");
        ana.iniciar();
        luis.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        bus.cortado = true;
        ana.cambiar([{ id: "bloque1", borrar: true }]);
        luis.cambiar([{ id: "bloque2", datos: p("c editado") }]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(servidor.textos()).toEqual(["a", "c editado"]);
        const guardado = servidor.doc as { unidades: { id: string; borrado?: boolean }[] };
        expect(guardado.unidades.find((x) => x.id === "bloque1")?.borrado).toBe(true);
        ana.cerrar();
        luis.cerrar();
    });

    test("seguridad: un lector que difunde cambios falsos no consigue que el editor los guarde", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "original");
        const ana = sala(servidor, "ana", "Ana");
        const intruso = sala(servidor, "mallory", "Mallory", false);
        ana.iniciar();
        intruso.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        // Un lector no puede editar por la API…
        expect(intruso.cambiar([{ id: "bloque0", datos: p("hackeado") }])).toEqual([]);
        // …y si falsifica una difusión, la pantalla del editor la muestra, pero NO la guarda.
        for (const [k, m] of bus.miembros) {
            if (k.includes("ana")) m.alEvento("unidades", { de: "falso", unidades: [{ id: "bloque0", orden: "i", actualizado: 9e12, autor: "mallory", datos: p("hackeado") }] });
        }
        expect(textos(ana)).toEqual(["hackeado"]);
        ana.cambiar([{ id: "nuevo0001", orden: "z", datos: p("línea de Ana") }]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(servidor.textos()).toEqual(["original", "línea de Ana"]);
        ana.cerrar();
        intruso.cerrar();
    });

    test("sin permiso en el servidor: pasa a solo lectura con un mensaje claro y deja de reintentar", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "x");
        servidor.editores.delete("luis");
        const luis = sala(servidor, "luis", "Luis", true);
        luis.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        luis.cambiar([{ id: "bloque0", datos: p("y") }]);
        await vi.advanceTimersByTimeAsync(1000);
        const i = luis.instantanea();
        expect(i.puedeEditar).toBe(false);
        expect(i.guardado).toBe("sin-permiso");
        expect(i.error).toMatch(/permiso/);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(servidor.escrituras).toBe(0);
        luis.cerrar();
    });

    test("un espacio de otro tipo (una pizarra) no se pinta ni se sobrescribe", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        servidor.doc = { blocks: [{ id: "k" }], edges: [], app: "pizarra" };
        const ana = sala(servidor, "ana", "Ana");
        ana.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        expect(ana.instantanea().error).toMatch(/no abre un documento/);
        expect(ana.cambiar([{ id: "nuevo0001", orden: "i", datos: p("x") }])).toEqual([]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(servidor.escrituras).toBe(0);
        ana.cerrar();
    });
});

describe("SalaColaborativa · instantánea estable (useSyncExternalStore)", () => {
    test("misma referencia mientras nada cambia; nueva tras un cambio; un cambio sin efecto no la toca", async () => {
        const bus = new Bus();
        const servidor = new Servidor(bus);
        await sembrar(servidor, "uno");
        const ana = sala(servidor, "ana", "Ana");
        const a = ana.instantanea();
        expect(ana.instantanea()).toBe(a);
        ana.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        const b = ana.instantanea();
        expect(ana.instantanea()).toBe(b);
        expect(ana.instantanea().unidades).toBe(b.unidades);
        let avisos = 0;
        const quitar = ana.suscribir(() => avisos++);
        ana.cambiar([{ id: "bloque0", datos: p("uno") }]); // mismo contenido: no-op
        expect(ana.instantanea()).toBe(b);
        expect(avisos).toBe(0);
        ana.cambiar([{ id: "bloque0", datos: p("dos") }]);
        const c = ana.instantanea();
        expect(c).not.toBe(b);
        expect(ana.instantanea()).toBe(c);
        expect(avisos).toBeGreaterThan(0);
        quitar();
        ana.cerrar();
    });

    test("presencia: se leen las otras pestañas validadas, nunca la propia", () => {
        const lista = leerPresentes(
            {
                yo: [{ uid: "ana", nombre: "Ana" }],
                otra: [{ uid: "luis", nombre: "Luis", color: "#10B981", unidad: "bloque0", modo: "editar", desde: 5, presentando: { id: "diapo1", indice: 2 } }],
                rara: [{ uid: 42, nombre: "", color: "red;background:url(x)", unidad: "<script>", modo: "root" }],
            },
            "yo",
        );
        expect(lista.map((x) => x.clave)).toEqual(["rara", "otra"]);
        expect(lista[1]).toMatchObject({ uid: "luis", color: "#10B981", unidad: "bloque0", modo: "editar", presentando: { id: "diapo1", indice: 2 } });
        expect(lista[0]).toMatchObject({ uid: null, nombre: "Invitado", unidad: null, modo: "ver" });
        expect(lista[0].color).toMatch(/^#[0-9A-F]{6}$/i);
    });
});
