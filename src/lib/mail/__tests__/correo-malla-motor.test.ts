/**
 * GRP1107A · motor de correos por la malla con tres aparatos en memoria (mi Mac, mi tablet y la
 * neurona de Ana): se guarda ANTES de salir, se entrega a la neurona del destinatario con recibo,
 * se pasa a una neurona mía de relevo que lo sube al buzón al tener internet (sin duplicar), nadie
 * acusa por otro y nada se pierde si no hay camino.
 */
import { describe, expect, it } from "vitest";
import { crearMotorCorreoMalla, type MotorCorreoMalla } from "@/lib/mail/correo-malla-motor";
import { almacenEnMemoria, type AlmacenCorreoMalla } from "@/lib/mail/boveda-correo-malla";
import type { CorreoMalla, EnlaceCorreo, MsgCorreoMalla } from "@/lib/mail/correo-malla";

interface Nodo {
    nombre: string;
    uid: string;
    motor: MotorCorreoMalla;
    almacen: AlmacenCorreoMalla;
    red: { internet: boolean; sesion: boolean };
    enlaces: Array<EnlaceCorreo & { hacia?: Nodo; vuelta?: string }>;
    subidas: string[];
    enviados: Array<{ enlaceId: string; cuerpo: MsgCorreoMalla }>;
}

let reloj = 1_800_000_000_000;
let ids = 0;
/** El «servidor»: hilos por id de malla (subir dos veces no duplica). */
const buzon = new Map<string, string>();

function nodo(nombre: string, uid: string): Nodo {
    const n = { nombre, uid, red: { internet: false, sesion: true }, enlaces: [], subidas: [], enviados: [] } as unknown as Nodo;
    n.almacen = almacenEnMemoria();
    n.motor = crearMotorCorreoMalla({
        almacen: n.almacen,
        ahora: () => reloj,
        nuevoId: () => `correo-${String(++ids).padStart(6, "0")}`,
        identidad: async () => ({ uid, nombre }),
        red: async () => n.red,
        enlaces: async () => n.enlaces.map(({ hacia: _h, vuelta: _v, ...e }) => e),
        async enviarPorEnlace(enlaceId, cuerpo) {
            n.enviados.push({ enlaceId, cuerpo });
            const l = n.enlaces.find((e) => e.id === enlaceId);
            if (!l?.hacia || !l.abierto || !l.vuelta) return { ok: false, confirmado: false, detalle: "enlace cerrado" };
            const otro = l.hacia;
            const back = otro.enlaces.find((e) => e.id === l.vuelta);
            await otro.motor.recibir({ cuerpo: JSON.parse(JSON.stringify(cuerpo)), origen: { enlaceId: l.vuelta, etiqueta: back?.etiqueta ?? "?", tipo: back?.tipo ?? "local" } });
            return { ok: true, confirmado: true };
        },
        async subirAlServidor(c: CorreoMalla) {
            n.subidas.push(c.id);
            if (!n.red.internet) return { ok: false, motivo: "sin internet" };
            if (!buzon.has(c.id)) buzon.set(c.id, `hilo-${buzon.size + 1}`);
            return { ok: true, hilo: buzon.get(c.id) };
        },
    });
    return n;
}

/** Enlace de ida y vuelta entre dos aparatos (cada uno dice de quién es). */
function enlazar(a: Nodo, b: Nodo, tipo = "local"): void {
    const ida = `${tipo}:${a.nombre}->${b.nombre}`;
    const vuelta = `${tipo}:${b.nombre}->${a.nombre}`;
    a.enlaces.push({ id: ida, tipo, etiqueta: b.nombre, abierto: true, uid: b.uid, hacia: b, vuelta });
    b.enlaces.push({ id: vuelta, tipo, etiqueta: a.nombre, abierto: true, uid: a.uid, hacia: a, vuelta: ida });
}

function preparar() {
    buzon.clear();
    ids = 0;
    reloj = 1_800_000_000_000;
    return { mac: nodo("Mac de Yo", "u-yo"), tablet: nodo("Tablet de Yo", "u-yo"), ana: nodo("Móvil de Ana", "u-ana") };
}

describe("correos por la malla", () => {
    it("sin ningún camino: queda guardado (antes de intentar nada) y lo dice", async () => {
        const { mac } = preparar();
        const r = await mac.motor.enviar({ para: [{ uid: "u-ana", nombre: "Ana" }], asunto: "Hola", cuerpo: "¿Mañana?" });
        expect(r.ok).toBe(true);
        const guardados = await mac.almacen.cargar();
        expect(guardados).toHaveLength(1);
        expect(guardados[0]).toMatchObject({ estado: "guardado", asunto: "Hola", intentos: 1 });
        expect(guardados[0].aviso).toMatch(/queda guardado \(cifrado\)/);
    });

    it("entrega directa a la neurona de Ana: ella lo guarda y acusa; aquí, «Entregado»", async () => {
        const { mac, ana } = preparar();
        enlazar(mac, ana);
        const r = await mac.motor.enviar({ para: [{ uid: "u-ana", nombre: "Ana" }], asunto: "Hola", cuerpo: "¿Mañana?" });
        const mio = mac.motor.lista()[0];
        expect(mio.estado).toBe("entregado");
        expect(mio.entregadoA).toEqual(["u-ana"]);
        expect(mio.via).toMatchObject({ medio: "local", etiqueta: "Móvil de Ana" });
        expect(mio.aviso).toBeUndefined();
        const suyo = ana.motor.lista()[0];
        expect(suyo).toMatchObject({ id: r.correo?.id, dir: "entra", asunto: "Hola", cuerpo: "¿Mañana?", de: { uid: "u-yo", nombre: "Mac de Yo" } });
        // Reintentar no lo duplica en su bandeja (solo vuelve a acusar).
        mac.red.internet = false;
        await mac.motor.tic(true);
        expect(ana.motor.lista()).toHaveLength(1);
    });

    it("relevo: una neurona mía lo guarda («en tránsito»), lo sube al tener internet y el recibo vuelve; subirlo otra vez no duplica", async () => {
        const { mac, tablet } = preparar();
        enlazar(mac, tablet, "cuenta");
        await mac.motor.enviar({ para: [{ uid: "u-ana", nombre: "Ana" }], asunto: "Acta", cuerpo: "Adjunto el acta." });
        await new Promise((r) => setTimeout(r, 0)); // el primer intento de la tablet (sin internet) termina
        expect(mac.motor.lista()[0].estado).toBe("en-transito");
        expect(tablet.motor.lista()[0].aviso).toBe("Esperando internet para subirlo al buzón.");
        expect(tablet.motor.lista()[0]).toMatchObject({ dir: "relevo", estado: "en-transito" });
        // La tablet gana internet: lo sube y avisa a la Mac por la malla.
        tablet.red.internet = true;
        await tablet.motor.tic(true);
        expect(tablet.motor.lista()[0]).toMatchObject({ estado: "en-servidor", hilo: "hilo-1" });
        expect(mac.motor.lista()[0]).toMatchObject({ estado: "en-servidor", hilo: "hilo-1" });
        // La Mac vuelve a tener internet: no hay nada que subir; y si se subiera, el buzón no lo duplica.
        mac.red.internet = true;
        await mac.motor.tic(true);
        expect(mac.subidas).toEqual([]);
        expect(buzon.size).toBe(1);
    });

    it("con internet: directo al buzón; el estado es «en el servidor»", async () => {
        const { mac } = preparar();
        mac.red.internet = true;
        await mac.motor.enviar({ para: [{ uid: "u-ana" }], asunto: "A", cuerpo: "B" });
        expect(mac.motor.lista()[0]).toMatchObject({ estado: "en-servidor", hilo: "hilo-1" });
    });

    it("entregado por la malla y luego, al volver internet, también al buzón (reconciliar)", async () => {
        const { mac, ana } = preparar();
        enlazar(mac, ana);
        await mac.motor.enviar({ para: [{ uid: "u-ana" }], asunto: "A", cuerpo: "B" });
        expect(mac.motor.lista()[0].estado).toBe("entregado");
        reloj += 60_000;
        mac.red.internet = true;
        await mac.motor.tic();
        expect(mac.motor.lista()[0]).toMatchObject({ estado: "en-servidor" });
        expect(buzon.size).toBe(1);
    });

    it("nadie acusa por otro: un «entregado» que llega por un enlace de otra cuenta no cuenta", async () => {
        const { mac, ana } = preparar();
        const intruso = nodo("Intruso", "u-x");
        enlazar(mac, intruso);
        await mac.motor.enviar({ para: [{ uid: "u-ana" }], asunto: "A", cuerpo: "B" });
        const id = mac.motor.lista()[0].id;
        const l = intruso.enlaces[0];
        await mac.motor.recibir({ cuerpo: { t: "cm.recibo", v: 1, id, tipo: "entregado", uid: "u-ana", nombre: "Ana" }, origen: { enlaceId: l.vuelta as string, etiqueta: "Intruso", tipo: "local" } });
        expect(mac.motor.lista()[0].estado).toBe("guardado");
        expect(mac.motor.lista()[0].entregadoA).toEqual([]);
        expect(ana.motor.lista()).toEqual([]);
    });

    it("un correo para otra persona que llega por la malla no se guarda ni se acusa", async () => {
        const { mac, ana } = preparar();
        enlazar(mac, ana);
        const l = ana.enlaces[0];
        await ana.motor.recibir({
            cuerpo: { t: "cm.correo", v: 1, id: "correo-999999", de: { uid: "u-yo", nombre: "Yo" }, para: ["u-luis"], asunto: "x", cuerpo: "y", creado: reloj, modo: "entrega" },
            origen: { enlaceId: l.id, etiqueta: "Mac de Yo", tipo: "local" },
        });
        expect(ana.motor.lista()).toEqual([]);
        expect(ana.enviados).toEqual([]);
    });
});
