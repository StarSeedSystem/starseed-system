/**
 * GRP1107A · correos por la malla (puro): crear, rutas (servidor, entrega, relevo, medios
 * elegidos), protocolo, recibos que nunca retroceden, qué hacer con lo que llega, reintentos y
 * textos.
 */
import { describe, expect, it } from "vitest";
import {
    aplicarRecibo,
    correoDesdeMensaje,
    decidirEntrada,
    fusionarConServidor,
    leerMensajeCorreo,
    marcasRecibo,
    MAX_CUERPO_CORREO_MALLA,
    mensajeDeCorreo,
    nuevoCorreoMalla,
    REINTENTO_BASE_MS,
    REINTENTO_MAX_MS,
    rutasCorreo,
    textoEstadoCorreo,
    tocaReintento,
    type CorreoMalla,
    type EnlaceCorreo,
} from "@/lib/mail/correo-malla";

const YO = "u-yo";
const ANA = "u-ana";
const LUIS = "u-luis";
const AHORA = 1_800_000_000_000;
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function correo(extra: Partial<CorreoMalla> = {}): CorreoMalla {
    const r = nuevoCorreoMalla({ id: ID, de: { uid: YO, nombre: "Yo" }, para: [{ uid: ANA, nombre: "Ana" }, { uid: LUIS, nombre: "Luis" }], asunto: "  Reunión ", cuerpo: "Mañana a las 10.", ahora: AHORA });
    if (!r.ok) throw new Error(r.motivo);
    return { ...r.correo, ...extra };
}
const enl = (id: string, tipo: string, uid?: string, extra: Partial<EnlaceCorreo> = {}): EnlaceCorreo => ({ id, tipo, etiqueta: `Aparato ${id}`, abierto: true, ...(uid ? { uid } : {}), ...extra });

describe("nuevoCorreoMalla", () => {
    it("guarda lo justo: sin repetir destinatarios ni a mí, asunto recortado, estado «guardado»", () => {
        const r = nuevoCorreoMalla({ id: ID, de: { uid: YO, nombre: "Yo" }, para: [{ uid: ANA, nombre: "Ana" }, { uid: ANA }, { uid: YO }], asunto: " ", cuerpo: "Hola", ahora: AHORA });
        expect(r.ok && r.correo).toEqual({
            id: ID, dir: "sale", de: { uid: YO, nombre: "Yo" }, para: [ANA], paraNombres: { [ANA]: "Ana" }, asunto: "(sin asunto)", cuerpo: "Hola", creado: AHORA, estado: "guardado", entregadoA: [], recibos: [], intentos: 0,
        });
    });

    it("dice por qué no: sin destinatarios, cuerpo demasiado grande, id inválido", () => {
        expect(nuevoCorreoMalla({ id: ID, de: { uid: YO, nombre: "Yo" }, para: [{ uid: YO }], asunto: "", cuerpo: "", ahora: AHORA })).toEqual({ ok: false, motivo: "Añade al menos un destinatario." });
        const grande = nuevoCorreoMalla({ id: ID, de: { uid: YO, nombre: "Yo" }, para: [{ uid: ANA }], asunto: "", cuerpo: "x".repeat(MAX_CUERPO_CORREO_MALLA + 1), ahora: AHORA });
        expect(grande.ok === false && grande.motivo).toMatch(/adjuntos van por el chat/);
        expect(nuevoCorreoMalla({ id: "x y", de: { uid: YO, nombre: "Yo" }, para: [{ uid: ANA }], asunto: "", cuerpo: "", ahora: AHORA }).ok).toBe(false);
    });
});

describe("rutasCorreo", () => {
    it("con internet y sesión: el buzón del servidor, y nada más", () => {
        expect(rutasCorreo({ correo: correo(), enlaces: [enl("local:a", "local", ANA)], internet: true, sesion: true, miUid: YO })).toEqual({ pasos: [{ tipo: "servidor" }], descartados: [] });
    });

    it("sin internet: a la neurona de cada destinatario (la de menor latencia) y a una neurona mía de relevo; LoRa, relé, ajenos y anónimos fuera con motivo", () => {
        const r = rutasCorreo({
            correo: correo(),
            enlaces: [
                enl("local:a1", "local", ANA, { rttMs: 40 }),
                enl("nativo:10.0.0.2", "nativo", ANA, { rttMs: 8 }),
                enl("cuenta:tablet", "cuenta", YO),
                enl("local:x", "local"),
                enl("local:o", "local", "u-otro"),
                enl("lora:1", "lora", ANA),
                enl("rele:1", "rele", ANA),
                enl("local:c", "local", LUIS, { abierto: false }),
            ],
            internet: false,
            sesion: true,
            miUid: YO,
        });
        expect(r.pasos).toEqual([
            { tipo: "entrega", enlaceId: "nativo:10.0.0.2", etiqueta: "Aparato nativo:10.0.0.2", medio: "local", uid: ANA },
            { tipo: "relevo", enlaceId: "cuenta:tablet", etiqueta: "Aparato cuenta:tablet", medio: "p2p-internet" },
        ]);
        expect(r.descartados.map((d) => [d.enlaceId, d.motivo])).toEqual([
            ["local:x", "ese aparato no dice de quién es: un correo no se entrega a ciegas"],
            ["lora:1", "LoRa solo lleva mensajes cortos"],
            ["rele:1", "el relé del servidor necesita internet"],
            ["local:c", "no está abierto ahora"],
            ["local:o", "es de otra cuenta y no es destinataria: no lleva tu correo"],
        ]);
    });

    it("sin ningún camino: queda guardado y lo dice; ya en relevo, no se vuelve a dar", () => {
        expect(rutasCorreo({ correo: correo(), enlaces: [], internet: false, sesion: false, miUid: YO }).aviso).toMatch(/queda guardado \(cifrado\)/);
        const enRelevo = correo({ recibos: [{ tipo: "en-transito", uid: YO, por: "Tablet", en: AHORA }] });
        const r = rutasCorreo({ correo: enRelevo, enlaces: [enl("cuenta:tablet", "cuenta", YO)], internet: false, sesion: false, miUid: YO });
        expect(r.pasos).toEqual([]);
        expect(r.aviso).toMatch(/^En tránsito/);
    });

    it("entregado a todos y sin servidor: nada que hacer por la malla salvo el relevo (para el buzón)", () => {
        const c = correo({ entregadoA: [ANA, LUIS], estado: "entregado" });
        expect(rutasCorreo({ correo: c, enlaces: [enl("local:a", "local", ANA)], internet: false, sesion: false, miUid: YO })).toEqual({ pasos: [], descartados: [] });
        expect(rutasCorreo({ correo: c, enlaces: [enl("cuenta:t", "cuenta", YO)], internet: false, sesion: false, miUid: YO }).pasos).toEqual([{ tipo: "relevo", enlaceId: "cuenta:t", etiqueta: "Aparato cuenta:t", medio: "p2p-internet" }]);
    });

    it("respeta los medios elegidos para Correos: sin «correo», ni con internet va al buzón; sin «local», no usa el enlace sin internet", () => {
        const r = rutasCorreo({ correo: correo(), enlaces: [enl("local:a", "local", ANA), enl("cuenta:t", "cuenta", YO)], internet: true, sesion: true, miUid: YO, permitidos: ["wifi-local"] });
        expect(r.pasos).toEqual([{ tipo: "relevo", enlaceId: "cuenta:t", etiqueta: "Aparato cuenta:t", medio: "p2p-internet" }]);
        expect(r.descartados).toContainEqual({ motivo: "el buzón del servidor no está entre los medios elegidos para Correos" });
        expect(r.descartados).toContainEqual({ enlaceId: "local:a", etiqueta: "Aparato local:a", motivo: "no está entre los medios elegidos para Correos" });
    });

    it("ya en el servidor: nada", () => {
        expect(rutasCorreo({ correo: correo({ estado: "en-servidor" }), enlaces: [], internet: true, sesion: true, miUid: YO })).toEqual({ pasos: [], descartados: [] });
    });
});

describe("protocolo", () => {
    it("ida y vuelta del correo; mal formados fuera", () => {
        const m = mensajeDeCorreo(correo(), "entrega");
        expect(leerMensajeCorreo(JSON.parse(JSON.stringify(m)))).toEqual(m);
        expect(leerMensajeCorreo({ ...m, para: [] })).toBeNull();
        expect(leerMensajeCorreo({ ...m, cuerpo: "x".repeat(MAX_CUERPO_CORREO_MALLA + 1) })).toBeNull();
        expect(leerMensajeCorreo({ ...m, modo: "difusion" })).toBeNull();
        expect(leerMensajeCorreo({ ...m, id: "../x" })).toBeNull();
        expect(leerMensajeCorreo({ ...m, de: { nombre: "sin uid" } })).toBeNull();
        expect(leerMensajeCorreo(null)).toBeNull();
    });

    it("recibos", () => {
        expect(leerMensajeCorreo({ t: "cm.recibo", v: 1, id: ID, tipo: "entregado", uid: ANA, nombre: "Ana" })).toEqual({ t: "cm.recibo", v: 1, id: ID, tipo: "entregado", uid: ANA, nombre: "Ana" });
        expect(leerMensajeCorreo({ t: "cm.recibo", v: 1, id: ID, tipo: "leido", uid: ANA })).toBeNull();
    });
});

describe("recibos y estado (nunca retrocede)", () => {
    it("entregado solo cuando acusan todos; en tránsito no baja un entregado; en el servidor es el final", () => {
        let c = correo();
        c = aplicarRecibo(c, { tipo: "enviado", uid: ANA, por: "Móvil de Ana", en: AHORA });
        expect(c.estado).toBe("guardado");
        c = aplicarRecibo(c, { tipo: "entregado", uid: ANA, por: "Ana", en: AHORA });
        expect(c.estado).toBe("guardado");
        expect(c.entregadoA).toEqual([ANA]);
        expect(textoEstadoCorreo(c)).toBe("Entregado a 1 de 2; el resto, guardado y esperando camino");
        c = aplicarRecibo(c, { tipo: "en-transito", uid: YO, por: "Tablet", en: AHORA });
        expect(c.estado).toBe("en-transito");
        expect(textoEstadoCorreo(c)).toBe("En tránsito: lo lleva Tablet hasta el buzón · entregado a 1 de 2");
        c = aplicarRecibo(c, { tipo: "entregado", uid: LUIS, por: "Luis", en: AHORA });
        expect(c.estado).toBe("entregado");
        const otraVez = aplicarRecibo(c, { tipo: "en-transito", uid: YO, por: "Tablet", en: AHORA + 1 });
        expect(otraVez).toBe(c);
        c = aplicarRecibo(c, { tipo: "en-servidor", por: "Buzón", en: AHORA, hilo: "hilo-1" } as never);
        expect(c.estado).toBe("en-servidor");
        expect(c.hilo).toBe("hilo-1");
        expect(marcasRecibo(c).map((m) => m.hecho)).toEqual([true, true, true, true]);
    });

    it("un «entregado» de alguien que no es destinatario no cuenta", () => {
        const c = aplicarRecibo(correo(), { tipo: "entregado", uid: "u-x", por: "X", en: AHORA });
        expect(c.entregadoA).toEqual([]);
        expect(c.estado).toBe("guardado");
    });

    it("reintentos: 15 s · 2ⁿ hasta 10 min; nunca si ya está en el servidor ni si es recibido", () => {
        expect(tocaReintento({ dir: "sale", estado: "guardado", intentos: 0 }, AHORA)).toBe(true);
        expect(tocaReintento({ dir: "sale", estado: "guardado", intentos: 1, ultimoIntento: AHORA }, AHORA + REINTENTO_BASE_MS - 1)).toBe(false);
        expect(tocaReintento({ dir: "sale", estado: "guardado", intentos: 1, ultimoIntento: AHORA }, AHORA + REINTENTO_BASE_MS)).toBe(true);
        expect(tocaReintento({ dir: "sale", estado: "guardado", intentos: 30, ultimoIntento: AHORA }, AHORA + REINTENTO_MAX_MS)).toBe(true);
        expect(tocaReintento({ dir: "sale", estado: "en-servidor", intentos: 0 }, AHORA)).toBe(false);
        expect(tocaReintento({ dir: "entra", estado: "entregado", intentos: 0 }, AHORA)).toBe(false);
    });
});

describe("lo que llega", () => {
    const m = mensajeDeCorreo(correo(), "entrega");

    it("soy destinatario: lo guardo y acuso «entregado» (y si ya lo tengo, solo acuso)", () => {
        expect(decidirEntrada(m, { miUid: ANA, uidEnlace: YO, yaLoTengo: false })).toEqual({ accion: "guardar", dir: "entra", recibo: "entregado" });
        expect(decidirEntrada(m, { miUid: ANA, uidEnlace: YO, yaLoTengo: true })).toEqual({ accion: "acusar", recibo: "entregado" });
    });

    it("relevo: solo una neurona de MI cuenta lo guarda para subirlo", () => {
        const relevo = mensajeDeCorreo(correo(), "relevo");
        expect(decidirEntrada(relevo, { miUid: YO, uidEnlace: YO, yaLoTengo: false })).toEqual({ accion: "guardar", dir: "relevo", recibo: "en-transito" });
        expect(decidirEntrada(relevo, { miUid: "u-otro", uidEnlace: YO, yaLoTengo: false }).accion).toBe("ignorar");
    });

    it("por un enlace que no es del remitente, o sin cuenta: nada", () => {
        expect(decidirEntrada(m, { miUid: ANA, uidEnlace: LUIS, yaLoTengo: false })).toEqual({ accion: "ignorar", motivo: "el enlace no es del aparato del remitente" });
        expect(decidirEntrada(m, { miUid: null, uidEnlace: YO, yaLoTengo: false }).accion).toBe("ignorar");
    });

    it("el recibido se guarda como «entra» con su vía; el buzón lo oculta cuando ya lo tiene", () => {
        const via = { medio: "local", enlaceId: "local:yo", etiqueta: "Mac de Yo", en: AHORA };
        const r = correoDesdeMensaje(m, "entra", via, AHORA);
        expect(r).toMatchObject({ id: ID, dir: "entra", estado: "entregado", via });
        expect(textoEstadoCorreo(r)).toBe("Recibido por la malla (guardado cifrado en este aparato)");
        expect(fusionarConServidor([r, correo()], [ID])).toEqual([correo()]);
    });
});
