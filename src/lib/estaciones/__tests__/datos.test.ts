import { describe, it, expect, beforeEach } from "vitest";
import {
    listarEstaciones,
    obtenerEstacion,
    publicarEstacion,
    editarEstacion,
    latirEstacion,
    pausarEstacion,
    terminarEstacion,
    denunciarEstacion,
    ocultasLocales,
    ocultarLocal,
} from "../datos";
import type { ClienteSupabase } from "../datos";
import type { BorradorEstacion } from "../tipos";

const fila = {
    id: "e1",
    owner_id: "u1",
    ambito_tipo: "persona",
    entidad_ref: null,
    titulo: "Radio prueba",
    descripcion: "",
    tipo: "audio",
    fuente: "enlace",
    enlace: "https://radio.ejemplo.com/stream",
    formato: "audio",
    imagen: null,
    idioma: "es",
    categorias: ["musica"],
    licencia: "cc0",
    visibilidad: "publica",
    empieza_en: null,
    termina_en: null,
    ultimo_latido: null,
    pausada: false,
    en_malla: false,
    espectadores: 0,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
};

interface RegistroOps {
    llamadas: string[];
    filtros: Array<[string, unknown]>;
    payload: Record<string, unknown> | null;
}

function clienteFalso(cfg: {
    filas?: unknown[];
    error?: { message: string } | null;
    usuario?: { id: string } | null;
    lanzar?: boolean;
}): { cliente: ClienteSupabase; ops: RegistroOps } {
    const ops: RegistroOps = { llamadas: [], filtros: [], payload: null };
    const cadena: Record<string, unknown> = {};
    const metodos = ["from", "select", "insert", "update", "delete", "order", "limit", "single", "maybeSingle"];
    for (const m of metodos) {
        cadena[m] = (...args: unknown[]) => {
            ops.llamadas.push(m + ":" + String(args[0] ?? ""));
            if (m === "insert" || m === "update") ops.payload = args[0] as Record<string, unknown>;
            return cadena;
        };
    }
    cadena.eq = (k: string, v: unknown) => { ops.filtros.push([k, v]); return cadena; };
    cadena.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        if (cfg.lanzar) return Promise.reject(new Error("red caída")).then(ok, ko);
        const uno = (cadena as Record<string, unknown>).__uno;
        const data = uno ? (cfg.filas?.[0] ?? null) : (cfg.filas ?? []);
        return Promise.resolve({ data, error: cfg.error ?? null }).then(ok, ko);
    };
    const marcarUno = () => { cadena.__uno = true; return cadena; };
    cadena.single = marcarUno;
    cadena.maybeSingle = marcarUno;
    const cliente = {
        auth: { getUser: async () => ({ data: { user: cfg.usuario ?? null } }) },
        from: (tabla: string) => { ops.llamadas.push("from:" + tabla); return cadena; },
    } as unknown as ClienteSupabase;
    return { cliente, ops };
}

const borrador: BorradorEstacion = {
    titulo: "Radio prueba",
    tipo: "audio",
    fuente: "enlace",
    enlace: "https://radio.ejemplo.com/stream",
    licencia: "cc0",
};

const conSesion = { usuario: { id: "u1" }, filas: [fila] };

describe("listarEstaciones", () => {
    it("devuelve estaciones y aplica filtros", async () => {
        const { cliente, ops } = clienteFalso({ filas: [fila] });
        const r = await listarEstaciones({ tipo: "audio", ambito: "ent1", limite: 10 }, cliente);
        expect(r).toHaveLength(1);
        expect(ops.filtros).toContainEqual(["tipo", "audio"]);
        expect(ops.filtros).toContainEqual(["entidad_ref", "ent1"]);
    });
    it("devuelve [] ante error o red caída", async () => {
        const { cliente } = clienteFalso({ error: { message: "rls" } });
        expect(await listarEstaciones({}, cliente)).toEqual([]);
        const c2 = clienteFalso({ lanzar: true });
        expect(await listarEstaciones({}, c2.cliente)).toEqual([]);
    });
});

describe("obtenerEstacion", () => {
    it("devuelve la estación o null", async () => {
        expect(await obtenerEstacion("e1", clienteFalso({ filas: [fila] }).cliente)).toEqual(fila);
        expect(await obtenerEstacion("zzz", clienteFalso({ filas: [] }).cliente)).toBeNull();
    });
});

describe("publicarEstacion", () => {
    it("publica guardando el formato detectado", async () => {
        const { cliente, ops } = clienteFalso(conSesion);
        const r = await publicarEstacion(borrador, cliente);
        expect(r.ok).toBe(true);
        expect(ops.payload).not.toBeNull();
        expect((ops.payload as Record<string, unknown>).formato).toBe("audio");
        expect((ops.payload as Record<string, unknown>).owner_id).toBe("u1");
    });
    it("rechaza un borrador inválido sin tocar la base", async () => {
        const { cliente, ops } = clienteFalso(conSesion);
        const r = await publicarEstacion({ ...borrador, titulo: "x" }, cliente);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("título");
        expect(ops.llamadas.some((l) => l.startsWith("insert"))).toBe(false);
    });
    it("pide sesión y tolera la red caída", async () => {
        const sinSesion = clienteFalso({ filas: [fila] });
        const r1 = await publicarEstacion(borrador, sinSesion.cliente);
        expect(r1).toEqual({ ok: false, error: "Entra con tu cuenta para publicar una estación." });
        const caida = clienteFalso({ ...conSesion, lanzar: true });
        const r2 = await publicarEstacion(borrador, caida.cliente);
        expect(r2.ok).toBe(false);
    });
});

describe("editarEstacion", () => {
    it("escribe solo las claves del parche y recalcula formato", async () => {
        const { cliente, ops } = clienteFalso(conSesion);
        const r = await editarEstacion("e1", { titulo: "Nuevo título" }, cliente);
        expect(r.ok).toBe(true);
        expect(Object.keys(ops.payload as object)).toEqual(["titulo"]);
    });
    it("rechaza parche inválido", async () => {
        const { cliente } = clienteFalso(conSesion);
        const r = await editarEstacion("e1", { titulo: "x" }, cliente);
        expect(r.ok).toBe(false);
    });
});

describe("latido, pausa, término y denuncia", () => {
    it("latirEstacion pone ultimo_latido y espectadores", async () => {
        const { cliente, ops } = clienteFalso(conSesion);
        expect(await latirEstacion("e1", 7, cliente)).toBe(true);
        expect(typeof (ops.payload as Record<string, unknown>).ultimo_latido).toBe("string");
        expect((ops.payload as Record<string, unknown>).espectadores).toBe(7);
    });
    it("pausarEstacion y terminarEstacion actualizan sus campos", async () => {
        const p = clienteFalso(conSesion);
        expect(await pausarEstacion("e1", true, p.cliente)).toBe(true);
        expect((p.ops.payload as Record<string, unknown>).pausada).toBe(true);
        const t = clienteFalso(conSesion);
        expect(await terminarEstacion("e1", t.cliente)).toBe(true);
        expect(typeof (t.ops.payload as Record<string, unknown>).termina_en).toBe("string");
        expect(await terminarEstacion("", t.cliente)).toBe(false);
    });
    it("denunciarEstacion requiere sesión y recorta el motivo", async () => {
        expect(await denunciarEstacion("e1", "spam", clienteFalso({}).cliente)).toBe(false);
        const { cliente, ops } = clienteFalso({ usuario: { id: "u2" } });
        expect(await denunciarEstacion("e1", "x".repeat(500), cliente)).toBe(true);
        const p = ops.payload as Record<string, unknown>;
        expect((p.motivo as string).length).toBe(300);
        expect(p.estacion_id).toBe("e1");
    });
});

describe("ocultasLocales / ocultarLocal", () => {
    const almacen = new Map<string, string>();
    beforeEach(() => {
        almacen.clear();
        (globalThis as Record<string, unknown>).localStorage = {
            getItem: (k: string) => almacen.get(k) ?? null,
            setItem: (k: string, v: string) => void almacen.set(k, v),
        };
    });
    it("acomula ids y los lee", () => {
        expect(ocultasLocales().size).toBe(0);
        ocultarLocal("e1");
        ocultarLocal("e1");
        ocultarLocal("e2");
        const set = ocultasLocales();
        expect(set.has("e1")).toBe(true);
        expect(set.has("e2")).toBe(true);
        expect(set.size).toBe(2);
    });
    it("tolera JSON roto y ausencia de almacenamiento", () => {
        almacen.set("starseed.estaciones.ocultas.v1", "{roto");
        expect(ocultasLocales().size).toBe(0);
        delete (globalThis as Record<string, unknown>).localStorage;
        expect(ocultasLocales().size).toBe(0);
        expect(() => ocultarLocal("e3")).not.toThrow();
    });
});
