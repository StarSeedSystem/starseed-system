import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearAlmacenMemoria, type AlmacenMensajes } from "../almacen";
import { crearMotorMensajes, type MotorMensajes } from "../motor";
import { crearFirmante, firmarOperacion, leerOperacion, aplicarOperacion } from "../operaciones";
import { compararHlc, crearRelojHibrido, hlcDeMs } from "../reloj-hibrido";
import { bandejaDesdeAlmacen, CLAVE_BANDEJA_V1, CLAVE_RESPALDO, migrarDesdeLocalStorage } from "../migracion";
import { idServidorDe, pendientesDeSubida, unificarHistorial } from "../fusion";
import { subirPendientes, type DepsSubida } from "../subida";
import type { DmMessage } from "@/lib/messages/dm";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";

/*
 * F1 · Mensajería completa sin internet (MSJ1108C). Dos motores en memoria se hablan SOLO por un
 * canal simulado (ninguna llamada a fetch): texto en markdown, adjunto, cita, edición y borrado
 * firmados. Además: migración de la bandeja vieja, subida idempotente y orden entre relojes distintos.
 */

function firmanteDe() {
    let par: { publica: CryptoKey; privada: CryptoKey } | undefined;
    return crearFirmante({ leer: async () => par, escribir: async (p) => void (par = p) });
}

function par(opts?: { relojA?: () => number; relojB?: () => number }) {
    const fetchEspia = vi.fn(() => {
        throw new Error("sin internet");
    });
    vi.stubGlobal("fetch", fetchEspia);
    let n = 0;
    const motores: Record<string, MotorMensajes> = {};
    const almacenes: Record<string, AlmacenMensajes> = { ana: crearAlmacenMemoria(), beto: crearAlmacenMemoria() };
    const crear = (uid: string, ahora: () => number) =>
        crearMotorMensajes({
            almacen: almacenes[uid],
            uid,
            neurona: `n-${uid}`,
            reloj: crearRelojHibrido(`n-${uid}`, ahora),
            firmante: firmanteDe(),
            ahora,
            nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
            enviar: async (destino, _canal, cuerpo) => {
                await motores[destino]?.recibir(JSON.parse(JSON.stringify(cuerpo)));
                return { ok: !!motores[destino], via: undefined };
            },
        });
    motores.ana = crear("ana", opts?.relojA ?? (() => 1_000_000));
    motores.beto = crear("beto", opts?.relojB ?? (() => 1_000_000));
    return { motores, almacenes, fetchEspia };
}

afterEach(() => vi.unstubAllGlobals());

describe("dos motores sin internet", () => {
    it("intercambian texto markdown, un adjunto, una cita, una edición y un borrado", async () => {
        const { motores, fetchEspia } = par();
        const { ana, beto } = motores;
        const md = "**hola** _beto_\n- uno\n- dos";
        const m1 = await ana.enviar({ hilo: "h1", destinatarios: ["beto"], texto: md });
        expect((await beto.lista("dm:h1"))[0].texto).toBe(md);

        const adj = { id: "arch_1", nombre: "mapa.png", tipo: "image/png", tamano: 2048, modo: "p2p" as const };
        const m2 = await beto.enviar({ hilo: "h1", destinatarios: ["ana"], texto: "", adjunto: adj });
        expect((await ana.lista("dm:h1")).find((m) => m.id === m2.id)?.adjunto?.nombre).toBe("mapa.png");

        const m3 = await ana.enviar({ hilo: "h1", destinatarios: ["beto"], texto: "gracias", respuestaA: { id: m2.id, de: "beto", x: "mapa.png" } });
        const enBeto = (await beto.lista("dm:h1")).find((m) => m.id === m3.id)!;
        expect(enBeto.respuestaA).toEqual({ id: m2.id, de: "beto", x: "mapa.png" });

        expect(await ana.editar(m1.id, "**hola** _Beto_")).toBe(true);
        const editado = (await beto.lista("dm:h1")).find((m) => m.id === m1.id)!;
        expect(editado.texto).toBe("**hola** _Beto_");
        expect(editado.editadoEn).toBeTruthy();

        expect(await ana.borrar(m3.id)).toBe(true);
        const borrado = (await beto.lista("dm:h1")).find((m) => m.id === m3.id)!;
        expect(borrado.borrado).toBe(true);
        expect(borrado.texto).toBe("");
        expect(fetchEspia).not.toHaveBeenCalled();
    });

    it("solo el autor edita: una operación de otra cuenta, o con la firma rota, no cambia nada", async () => {
        const { motores } = par();
        const m = await motores.ana.enviar({ hilo: "h2", destinatarios: ["beto"], texto: "original" });
        // Beto no puede editar el mensaje de Ana desde su motor.
        expect(await motores.beto.editar(m.id, "falso")).toBe(false);
        // Una operación fabricada a mano con la cuenta de Ana pero firmada por otra clave de Beto, con la firma alterada.
        const op = await firmarOperacion(firmanteDe(), { t: "editar", mid: m.id, h: "h2", autor: "ana", hlc: hlcDeMs(2_000_000), txt: "falso" });
        const rota = { ...op, txt: "otro texto" };
        expect(await motores.beto.recibir({ v: 1, mid: m.id, h: "h2", txt: "", de: { u: "ana" }, op: rota })).toBe("rechazado");
        expect((await motores.beto.lista("dm:h2"))[0].texto).toBe("original");
        expect(leerOperacion({ ...op, firma: "" })).toBeNull();
    });

    it("una edición que llega antes que su mensaje espera y se aplica al llegar", async () => {
        const { motores } = par();
        const f = firmanteDe();
        const op = await firmarOperacion(f, { t: "editar", mid: "m-x", h: "h3", autor: "ana", hlc: hlcDeMs(1_500_000), txt: "nuevo" });
        expect(await motores.beto.recibir({ v: 1, mid: "m-x", h: "h3", txt: "", de: { u: "ana" }, op })).toBe("pendiente");
        await motores.beto.recibir({ v: 1, mid: "m-x", h: "h3", txt: "viejo", at: 1, de: { u: "ana" } });
        expect((await motores.beto.lista("dm:h3"))[0].texto).toBe("nuevo");
    });

    it("entre dos ediciones gana la de reloj mayor aunque lleguen al revés; borrar domina", async () => {
        const f = firmanteDe();
        const base: MensajeMalla = { id: "m1", clave: "dm:h", dir: "entra", texto: "a", at: 1, estado: "recibido", deUid: "ana" };
        const ctx = { clavesDe: () => [] as string[], fijar: () => undefined };
        const quien = { miUid: "beto", miNeurona: "n-b" };
        const e2 = await firmarOperacion(f, { t: "editar", mid: "m1", autor: "ana", hlc: hlcDeMs(3000), txt: "dos" });
        const e1 = await firmarOperacion(f, { t: "editar", mid: "m1", autor: "ana", hlc: hlcDeMs(2000), txt: "uno" });
        const r2 = await aplicarOperacion(base, e2, quien, ctx);
        expect(r2.ok && r2.m.texto).toBe("dos");
        if (!r2.ok) throw new Error("x");
        expect((await aplicarOperacion(r2.m, e1, quien, ctx)).ok).toBe(false);
        const del = await firmarOperacion(f, { t: "borrar", mid: "m1", autor: "ana", hlc: hlcDeMs(1000) });
        const r3 = await aplicarOperacion(r2.m, del, quien, ctx);
        expect(r3.ok && r3.m.borrado).toBe(true);
    });
});

describe("orden con relojes distintos", () => {
    it("el HLC mantiene la causalidad aunque la tableta vaya 10 minutos atrasada", async () => {
        const { motores } = par({ relojA: () => 2_000_000, relojB: () => 2_000_000 - 600_000 });
        const a = await motores.ana.enviar({ hilo: "h", destinatarios: ["beto"], texto: "pregunta" });
        const b = await motores.beto.enviar({ hilo: "h", destinatarios: ["ana"], texto: "respuesta" });
        // El reloj de Beto estaba atrasado, pero al haber visto el mensaje de Ana su HLC avanzó.
        expect(compararHlc(a.hlc!, b.hlc!)).toBeLessThan(0);
        const orden = (await motores.ana.lista("dm:h")).map((m) => m.texto);
        expect(orden).toEqual(["pregunta", "respuesta"]);
    });

    it("el reloj no se arrastra por una hora absurda de otro aparato", () => {
        const r = crearRelojHibrido("n", () => 1_000_000_000_000);
        r.observar(hlcDeMs(9_000_000_000_000, "raro"));
        expect(compararHlc(r.tic(), hlcDeMs(2_000_000_000_000))).toBeLessThan(0);
    });

    it("unificarHistorial ordena servidor y malla juntos y desempata por HLC si las horas casi coinciden", () => {
        const s: DmMessage = srv("a1", "2026-11-08T10:00:00.000Z", "del servidor");
        const locales: MensajeMalla[] = [
            { id: "00000000-0000-4000-8000-000000000001", clave: "dm:h", dir: "sale", texto: "tarde", at: Date.parse("2026-11-08T10:05:00Z"), estado: "enviado", hlc: hlcDeMs(Date.parse("2026-11-08T10:05:00Z")) },
            { id: "00000000-0000-4000-8000-000000000002", clave: "dm:h", dir: "sale", texto: "temprano", at: Date.parse("2026-11-08T09:00:00Z"), estado: "enviado" },
        ];
        const u = unificarHistorial([s], locales, { hiloId: "h", miUid: "yo", miembros: new Set(["yo"]) });
        expect(u.map((x) => x.mensaje.body)).toEqual(["temprano", "del servidor", "tarde"]);
        expect(u.map((x) => x.origen)).toEqual(["malla", "servidor", "malla"]);
    });
});

function srv(id: string, creado: string, body: string, extra: Partial<DmMessage> = {}): DmMessage {
    return { id, threadId: "h", sender: "yo", body, attachments: [], replyTo: null, kind: "user", editedAt: null, deleted: false, createdAt: creado, formato: null, ...extra };
}

/* ═══════════════════════ Migración ═══════════════════════ */

function lsFalso(inicial: Record<string, string> = {}) {
    const m = new Map(Object.entries(inicial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), mapa: m };
}

/** Forma real de la bandeja que escribía `buzon.ts` (MSJ1107A/NEU1107A): conversaciones n:, c: y dm:. */
function bandejaReal() {
    const via = { medio: "p2p-lan", direccion: "sale", enlace: "Tableta de Alex + Wi-Fi local", enlaceId: "lan:tableta", servidor: "tu red", latenciaMs: 12, latenciaFuente: "acuse", confirmado: true, confirmadoPor: "destino", en: 1762600000000 };
    const mensajes = (clave: string, n: number) =>
        Array.from({ length: n }, (_, i) => ({
            id: `${clave}-${i}`,
            clave,
            dir: i % 2 ? "entra" : "sale",
            texto: `mensaje ${i} de ${clave}`,
            at: 1762500000000 + i * 60_000,
            estado: i % 2 ? "recibido" : "confirmado",
            via,
            ...(i === 3 ? { adjunto: { id: "arch_9", nombre: "foto.jpg", tipo: "image/jpeg", tamano: 4096, modo: "p2p" }, archivo: { fase: "guardado", guardado: true } } : {}),
            ...(i === 5 ? { estado: "enviando" } : {}),
        }));
    return {
        v: 1,
        conv: {
            "n:tableta": { mensajes: mensajes("n:tableta", 450), leidoHasta: 1762500000000 + 100 * 60_000 },
            "c:ana": { mensajes: mensajes("c:ana", 3), leidoHasta: 0 },
            "dm:h1": { mensajes: mensajes("dm:h1", 6), leidoHasta: 5 },
        },
        vias: { "srv-1": via },
    };
}

describe("migración desde starseed.mensajeria.malla.v1", () => {
    it("copia el respaldo literal, importa TODO (también por encima del tope de 300) y no toca la clave vieja", async () => {
        const crudo = JSON.stringify(bandejaReal());
        const ls = lsFalso({ [CLAVE_BANDEJA_V1]: crudo });
        const alm = crearAlmacenMemoria();
        const r = await migrarDesdeLocalStorage(alm, ls);
        expect(r.importados).toBe(459);
        expect(r.descartados).toBe(0);
        expect(r.respaldoCreado).toBe(true);
        expect(ls.mapa.get(CLAVE_RESPALDO)).toBe(crudo);
        expect(ls.mapa.get(CLAVE_BANDEJA_V1)).toBe(crudo);
        expect((await alm.todos()).length).toBe(459);
        const e = await bandejaDesdeAlmacen(alm, 300);
        expect(e.conv["n:tableta"].mensajes.length).toBe(300); // solo lo que se muestra; el almacén conserva los 450
        expect(e.conv["n:tableta"].leidoHasta).toBe(1762500000000 + 100 * 60_000);
        expect(e.conv["dm:h1"].mensajes[3].adjunto?.nombre).toBe("foto.jpg");
        expect(e.conv["dm:h1"].mensajes[5].estado).toBe("en-espera"); // lo que salía al cerrar se reintenta
        expect(e.vias["srv-1"].enlaceId).toBe("lan:tableta");
    });

    it("es idempotente, no pisa el respaldo, respeta lápidas y recoge lo que llegue después a la clave vieja", async () => {
        const base = bandejaReal();
        const ls = lsFalso({ [CLAVE_BANDEJA_V1]: JSON.stringify(base) });
        const alm = crearAlmacenMemoria();
        await migrarDesdeLocalStorage(alm, ls);
        const respaldo = ls.mapa.get(CLAVE_RESPALDO);
        // La persona quita un mensaje de este aparato: lápida.
        const reg = (await alm.obtener("dm:h1-0"))!;
        await alm.poner([{ ...reg, lapida: true }]);
        // Otro camino (rescate de origen) añade un mensaje a la clave vieja.
        const nuevo = { ...base, conv: { ...base.conv, "c:ana": { ...base.conv["c:ana"], mensajes: [...base.conv["c:ana"].mensajes, { id: "rescatado", clave: "c:ana", dir: "entra", texto: "del Mac", at: 1, estado: "recibido" }] } } };
        ls.setItem(CLAVE_BANDEJA_V1, JSON.stringify(nuevo));
        const r2 = await migrarDesdeLocalStorage(alm, ls);
        expect(r2.importados).toBe(1);
        expect(r2.respaldoCreado).toBe(false);
        expect(ls.mapa.get(CLAVE_RESPALDO)).toBe(respaldo);
        const e = await bandejaDesdeAlmacen(alm, 300);
        expect(e.conv["dm:h1"].mensajes.some((m) => m.id === "dm:h1-0")).toBe(false);
        expect(e.conv["c:ana"].mensajes.some((m) => m.id === "rescatado")).toBe(true);
    });

    it("JSON roto o vacío no pierde nada ni lanza; los mensajes inválidos se cuentan", async () => {
        const alm = crearAlmacenMemoria();
        expect((await migrarDesdeLocalStorage(alm, lsFalso())).hayDatosViejos).toBe(false);
        expect((await migrarDesdeLocalStorage(alm, lsFalso({ [CLAVE_BANDEJA_V1]: "{no json" }))).importados).toBe(0);
        const parcial = { v: 1, conv: { "n:x": { mensajes: [{ id: "ok", clave: "n:x", dir: "sale", texto: "a", at: 1, estado: "enviado" }, { id: 7 }], leidoHasta: 0 } }, vias: {} };
        const r = await migrarDesdeLocalStorage(alm, lsFalso({ [CLAVE_BANDEJA_V1]: JSON.stringify(parcial) }));
        expect(r.importados).toBe(1);
        expect(r.descartados).toBe(1);
    });
});

/* ═══════════════════════ Subida idempotente ═══════════════════════ */

function servidorFalso() {
    const filas = new Map<string, { hilo: string; body: string; createdAt: string; replyTo: string | null; editado?: boolean; borrado?: boolean }>();
    const deps: DepsSubida = {
        subir: async (hilo, m) => {
            if (filas.has(m.id)) return "existia";
            filas.set(m.id, { hilo, body: m.body, createdAt: m.createdAt, replyTo: m.replyTo });
            return "subido";
        },
        editar: async (id, body) => {
            const f = filas.get(id);
            if (!f) return false;
            f.body = body;
            f.editado = true;
            return true;
        },
        borrar: async (id) => {
            const f = filas.get(id);
            if (!f) return false;
            f.borrado = true;
            f.body = "";
            return true;
        },
    };
    return { filas, deps };
}

describe("reconciliación con el servidor", () => {
    const A = "00000000-0000-4000-8000-00000000000a";
    const B = "00000000-0000-4000-8000-00000000000b";
    const locales = (): MensajeMalla[] => [
        { id: A, clave: "dm:h", dir: "sale", texto: "uno", at: 1000, estado: "enviado", hlc: hlcDeMs(1000) },
        { id: B, clave: "dm:h", dir: "sale", texto: "dos", at: 2000, estado: "confirmado", hlc: hlcDeMs(2000), respuestaA: { id: A, x: "uno" } },
        { id: "no-uuid", clave: "dm:h", dir: "sale", texto: "tres", at: 3000, estado: "enviado" },
        { id: "ajeno", clave: "dm:h", dir: "entra", deUid: "beto", texto: "de beto", at: 4000, estado: "recibido" },
        { id: "esperando", clave: "dm:h", dir: "sale", texto: "x", at: 5000, estado: "en-espera" },
    ];

    it("sube solo lo propio ya enviado, en orden, con el mismo id, y repetir no duplica", async () => {
        const { filas, deps } = servidorFalso();
        const marcas: Array<[string, Partial<MensajeMalla>]> = [];
        const l = locales();
        const aplicar = (_c: string, id: string, c: Partial<MensajeMalla>) => {
            marcas.push([id, c]);
            const i = l.findIndex((x) => x.id === id);
            l[i] = { ...l[i], ...c };
        };
        expect(pendientesDeSubida(l, "yo").map((m) => m.id)).toEqual([A, B, "no-uuid"]);
        const r1 = await subirPendientes(l, "yo", new Set(), deps, aplicar);
        expect(r1).toMatchObject({ subidos: 3, existian: 0, fallos: 0 });
        expect([...filas.keys()]).toEqual([A, B, idServidorDe("no-uuid")]);
        expect(filas.get(B)!.replyTo).toBe(A); // el padre ya estaba arriba
        expect(filas.get(A)!.createdAt).toBe(new Date(1000).toISOString());
        const r2 = await subirPendientes(l, "yo", new Set(), deps, aplicar);
        expect(r2.subidos).toBe(0);
        expect(filas.size).toBe(3);
        // Otro aparato de la misma cuenta, que no sabía que ya se subió: el servidor responde «existia».
        const otro = await subirPendientes(locales(), "yo", new Set(), deps, () => undefined);
        expect(otro).toMatchObject({ subidos: 0, existian: 3 });
        expect(filas.size).toBe(3);
    });

    it("las ediciones y borrados posteriores llegan al servidor; lo borrado antes de subir no sube", async () => {
        const { filas, deps } = servidorFalso();
        let l = locales();
        const aplicar = (_c: string, id: string, c: Partial<MensajeMalla>) => void (l = l.map((x) => (x.id === id ? { ...x, ...c } : x)));
        await subirPendientes(l, "yo", new Set(), deps, aplicar);
        l = l.map((x) => (x.id === A ? { ...x, texto: "uno (editado)", opHlc: hlcDeMs(9000), editadoEn: 9000 } : x.id === B ? { ...x, borrado: true, borradoHlc: hlcDeMs(9100), texto: "" } : x));
        l.push({ id: "00000000-0000-4000-8000-0000000000cc", clave: "dm:h", dir: "sale", texto: "", borrado: true, borradoHlc: hlcDeMs(9200), at: 8000, estado: "enviado" });
        const r = await subirPendientes(l, "yo", new Set(), deps, aplicar);
        expect(r.operaciones).toBe(2);
        expect(filas.get(A)).toMatchObject({ body: "uno (editado)", editado: true });
        expect(filas.get(B)).toMatchObject({ borrado: true });
        expect(filas.has("00000000-0000-4000-8000-0000000000cc")).toBe(false);
    });

    it("el hilo muestra UNA vez el mensaje que está en los dos sitios, con la vía de la malla y la cita resuelta", () => {
        const via = { medio: "local", direccion: "sale", enlace: "LAN", enlaceId: "lan:x", servidor: "red", latenciaMs: 5, latenciaFuente: "acuse", confirmado: true, en: 1 } as unknown as MensajeMalla["via"];
        const l = locales().map((m) => (m.id === A ? { ...m, via, subido: 1 } : m));
        const delServidor = [srv(A, new Date(1000).toISOString(), "uno")];
        const u = unificarHistorial(delServidor, l, { hiloId: "h", miUid: "yo", miembros: new Set(["yo", "beto"]) });
        const unos = u.filter((x) => x.mensaje.body === "uno");
        expect(unos).toHaveLength(1);
        expect(unos[0].origen).toBe("ambos");
        expect(unos[0].local?.via).toBe(via);
        // La cita de B apunta al mensaje padre con el id que la interfaz conoce (el del servidor).
        expect(u.find((x) => x.mensaje.body === "dos")!.mensaje.replyTo).toBe(A);
        expect(u.find((x) => x.mensaje.body === "de beto")).toBeTruthy();
    });

    it("idServidorDe conserva los UUID y deriva uno estable y válido para los demás", () => {
        expect(idServidorDe(A.toUpperCase())).toBe(A);
        const d = idServidorDe("mm-abc-123");
        expect(d).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(idServidorDe("mm-abc-123")).toBe(d);
        expect(idServidorDe("mm-abc-124")).not.toBe(d);
    });
});

beforeEach(() => undefined);
