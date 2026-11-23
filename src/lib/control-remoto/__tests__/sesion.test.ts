/**
 * ORD1114P · la puerta del aparato controlado frente a cada abuso de la revisión de seguridad
 * (contrato control-remoto-entre-neuronas §1 y §2.4). Firmas ECDSA reales con WebCrypto.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, sanearPermiso, type PermisoControl, SESION_INACTIVA_MS } from "../sesion";
import { definicion } from "../niveles";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const NEURONA_MAC = "aaaa0000-0000-4000-8000-000000000001";

interface Aparato {
    privada: CryptoKey;
    spki: string;
    huella: string;
    seq: number;
}

async function aparato(): Promise<Aparato> {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    return { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))!, seq: 0 };
}

let reloj = Date.parse("2026-11-14T20:00:00Z");
let nonceN = 0;

async function firmar(a: Aparato, accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}, firmante?: Aparato) {
    a.seq += 1;
    const carga: CargaOrden = {
        aud: AUD_CONTROL,
        v: 1,
        de: a.huella,
        cuenta: CUENTA,
        para: TABLETA,
        nivel: "controlar",
        sesion: null,
        seq: a.seq,
        nonce: `nonce-de-prueba-${String(++nonceN).padStart(6, "0")}`,
        t: new Date(reloj).toISOString(),
        caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: accion, args },
        ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, (firmante ?? a).privada, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}

let permiso: PermisoControl;
let lineas: string[];
let ejecutadas: string[];
let puerta: PuertaControl;
let mac: Aparato;

async function nuevaPuerta(cuentaPropia = CUENTA, nativoPropio: Record<string, unknown> = {}) {
    lineas = [];
    ejecutadas = [];
    let n = 0;
    puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => cuentaPropia,
        neuronaPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => {
            permiso = p;
        },
        ejecutar: async (nombre) => {
            ejecutadas.push(nombre);
            if (nombre === "leer-estado") return { ruta: "/mensajes" };
            return { hecho: true };
        },
        anotar: (l) => lineas.push(l),
        azarHex: () => (++n).toString(16).padStart(32, "0"),
        // ORD1114Q: lado nativo falso con indicador (la sesión y su token salen de «Rust»).
        nativo: {
            disponible: () => true,
            abrir: async () => ({ ok: true, token: (++n).toString(16).padStart(32, "0") }),
            orden: async () => ({ ok: true }),
            anotar: () => undefined,
            parar: async () => undefined,
            ...nativoPropio,
        } as never,
    });
}

/** La Mac se presenta, el dueño la acepta en la tableta y enciende el permiso. */
async function emparejar(nivel: "ver" | "controlar" = "controlar") {
    const r = await puerta.recibir(await firmar(mac, "presentarse", { spki: mac.spki, nombre: "Mac", neurona: NEURONA_MAC }));
    expect(r.motivo).toBe("pendiente");
    permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel };
}

async function abrirSesion(): Promise<string> {
    const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
    expect(r.ok).toBe(true);
    return (r.resultado as { sesion: string }).sesion;
}

beforeEach(async () => {
    reloj = Date.parse("2026-11-14T20:00:00Z");
    permiso = permisoDeFabrica();
    mac = await aparato();
    await nuevaPuerta();
});

describe("puerta de control entre neuronas", () => {
    it("viene apagada de fábrica y nada se acepta sin el permiso del dueño en este aparato", async () => {
        expect(sanearPermiso(undefined).encendido).toBe(false);
        expect(sanearPermiso({ encendido: "true" }).encendido).toBe(false);
        await emparejar();
        permiso = { ...permiso, encendido: false };
        const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect(r).toMatchObject({ ok: false, motivo: "permiso-apagado" });
        expect(ejecutadas).toEqual([]);
    });

    it("presentarse nunca concede: queda pendiente hasta que el dueño acepta aquí", async () => {
        permiso = { ...permiso, encendido: true };
        await puerta.recibir(await firmar(mac, "presentarse", { spki: mac.spki, nombre: "Mac", neurona: NEURONA_MAC }));
        expect(permiso.pendientes).toHaveLength(1);
        const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect(r.motivo).toBe("no-autorizado");
    });

    it("una sesión aceptada ejecuta las órdenes de la lista y anota una línea por orden", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const r = await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion }));
        expect(r).toMatchObject({ ok: true, resultado: { ruta: "/mensajes" } });
        expect(ejecutadas).toEqual(["leer-estado"]);
        expect(lineas.at(-1)).toMatch(/^orden leer-estado de=[0-9a-f]{8} nivel=controlar resultado=ok$/);
    });

    it("rechaza una firma mala o ausente", async () => {
        await emparejar();
        const intruso = await aparato();
        const mala = await firmar(mac, "abrir-sesion", {}, {}, intruso); // firmada con otra clave
        expect((await puerta.recibir(mala)).motivo).toBe("firma");
        const sin = { ...(await firmar(mac, "abrir-sesion")), firma: "" };
        expect((await puerta.recibir(sin)).motivo).toBe("forma");
        const alterada = await firmar(mac, "abrir-sesion");
        const bytes = JSON.parse(Buffer.from(alterada.carga, "base64url").toString());
        bytes.accion.nombre = "colgar";
        const cambiada = { ...alterada, carga: b64url(new TextEncoder().encode(JSON.stringify(bytes))) };
        expect((await puerta.recibir(cambiada)).motivo).toBe("firma");
        expect(ejecutadas).toEqual([]);
    });

    it("rechaza un aparato de otra cuenta, también si se presenta", async () => {
        await emparejar();
        const ajeno = await aparato();
        const r1 = await puerta.recibir(await firmar(ajeno, "presentarse", { spki: ajeno.spki, nombre: "Otro", neurona: NEURONA_MAC }, { cuenta: "otra-cuenta" }));
        expect(r1.motivo).toBe("otra-cuenta");
        const r2 = await puerta.recibir(await firmar(ajeno, "abrir-sesion", {}, { cuenta: "otra-cuenta" }));
        expect(r2.motivo).toBe("otra-cuenta");
        // Si miente y dice ser de la cuenta, no está fijado por el dueño.
        const r3 = await puerta.recibir(await firmar(ajeno, "abrir-sesion"));
        expect(r3.motivo).toBe("no-autorizado");
    });

    it("rechaza una orden repetida (mismo seq o mismo nonce)", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const o = await firmar(mac, "colgar", {}, { sesion });
        expect((await puerta.recibir(o)).ok).toBe(true);
        expect((await puerta.recibir(o)).motivo).toBe("repetida");
        mac.seq -= 2; // seq hacia atrás (ya visto) con nonce nuevo
        expect((await puerta.recibir(await firmar(mac, "colgar", {}, { sesion }))).motivo).toBe("repetida");
        expect(ejecutadas).toEqual(["colgar"]);
    });

    it("rechaza una orden caducada, del futuro o con vida demasiado larga", async () => {
        await emparejar();
        const vieja = await firmar(mac, "abrir-sesion", {}, { t: new Date(reloj - 10 * 60_000).toISOString(), caduca: new Date(reloj - 9 * 60_000).toISOString() });
        expect((await puerta.recibir(vieja)).motivo).toBe("caducada");
        const futura = await firmar(mac, "abrir-sesion", {}, { t: new Date(reloj + 6 * 60_000).toISOString(), caduca: new Date(reloj + 7 * 60_000).toISOString() });
        expect((await puerta.recibir(futura)).motivo).toBe("caducada");
        const larga = await firmar(mac, "abrir-sesion", {}, { caduca: new Date(reloj + 60 * 60_000).toISOString() });
        expect((await puerta.recibir(larga)).motivo).toBe("caducada");
    });

    it("rechaza lo que pasa del nivel concedido", async () => {
        await emparejar("ver");
        const r = await puerta.recibir(await firmar(mac, "abrir-sesion", {}, { nivel: "controlar" }));
        expect(r.motivo).toBe("nivel");
        const r2 = await puerta.recibir(await firmar(mac, "abrir-sesion", {}, { nivel: "ver" }));
        const sesion = (r2.resultado as { sesion: string }).sesion;
        expect((r2.resultado as { capacidades: string[] }).capacidades).not.toContain("llamar");
        const r3 = await puerta.recibir(await firmar(mac, "colgar", {}, { sesion, nivel: "ver" }));
        expect(r3.motivo).toBe("nivel");
        // «modificar» y «administrar» no existen en la fase 1 aunque el permiso guardado lo dijera.
        permiso = { ...permiso, nivel: "controlar" };
        const r4 = await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion, nivel: "modificar" }));
        expect(r4.motivo).toBe("nivel");
        expect(ejecutadas).toEqual([]);
    });

    it("rechaza lo que pasa del tope de órdenes por segundo", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const motivos: string[] = [];
        for (let i = 0; i < 7; i++) motivos.push((await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion }))).motivo);
        expect(motivos.filter((m) => m === "limite").length).toBeGreaterThanOrEqual(2);
        reloj += 1500;
        expect((await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion }))).ok).toBe(true);
    });

    it("revocar a mitad de sesión corta en el acto y apaga el permiso", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        expect(puerta.sesionActiva()).not.toBeNull();
        puerta.revocar();
        expect(puerta.sesionActiva()).toBeNull();
        expect(permiso.encendido).toBe(false);
        const r = await puerta.recibir(await firmar(mac, "colgar", {}, { sesion }));
        expect(r.motivo).toBe("permiso-apagado");
        expect(ejecutadas).toEqual([]);
        expect(lineas.some((l) => l.includes("resultado=revocado"))).toBe(true);
    });

    it("una orden desconocida se rechaza, nunca se adivina; y argumentos fuera de tipo tampoco pasan", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const pasa = () => (reloj += 400);
        expect((await puerta.recibir(await firmar(mac, "ejecutar-shell", { cmd: "ls" }, { sesion }))).motivo).toBe("accion-desconocida");
        pasa();
        expect((await puerta.recibir(await firmar(mac, "toString", {}, { sesion }))).motivo).toBe("accion-desconocida");
        pasa();
        expect((await puerta.recibir(await firmar(mac, "abrir-ruta", { ruta: "https://malo.example" }, { sesion }))).motivo).toBe("argumentos");
        pasa();
        expect((await puerta.recibir(await firmar(mac, "abrir-ruta", { ruta: "/../x" }, { sesion }))).motivo).toBe("argumentos");
        pasa();
        expect((await puerta.recibir(await firmar(mac, "llamar", { neurona: NEURONA_MAC, tipo: "video", extra: 1 }, { sesion }))).motivo).toBe("argumentos");
        expect(ejecutadas).toEqual([]);
    });

    it("sin sesión, con la de otro token o caducada por inactividad, no se ejecuta", async () => {
        await emparejar();
        expect((await puerta.recibir(await firmar(mac, "colgar"))).ok).toBe(false);
        const sesion = await abrirSesion();
        expect((await puerta.recibir(await firmar(mac, "colgar", {}, { sesion: "f".repeat(32) }))).motivo).toBe("sin-sesion");
        reloj += SESION_INACTIVA_MS + 1000;
        expect((await puerta.recibir(await firmar(mac, "colgar", {}, { sesion }))).motivo).toBe("sesion-caducada");
        expect(ejecutadas).toEqual([]);
    });

    it("una orden para otra neurona no se ejecuta aquí", async () => {
        await emparejar();
        expect((await puerta.recibir(await firmar(mac, "abrir-sesion", {}, { para: NEURONA_MAC }))).motivo).toBe("otro-destino");
    });

    it("la simulación de corte IP queda marcada SIMULACION en el registro", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        await puerta.recibir(await firmar(mac, "simular-corte-ip", {}, { sesion }));
        expect(lineas.at(-1)).toMatch(/simular-corte-ip .*resultado=ok SIMULACION$/);
        expect(definicion("simular-corte-ip")?.simulacion).toBe(true);
    });
});


describe("IND1115F · el rechazo por falta de indicador dice qué falta", () => {
    it("la respuesta, la línea de registro y quien manda ven la lista y el paso; sigue sin haber sesión", async () => {
        await nuevaPuerta(CUENTA, {
            abrir: async () => ({ ok: false, motivo: "sin-indicador-nativo", detalle: { falta: "superposicion", paso: "primer-plano", error: "superposicion:sin-permiso", tras: "412" } }),
        });
        await emparejar();
        const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("sin-indicador-nativo");
        expect((r.resultado as { detalle: Record<string, string> }).detalle).toEqual({ falta: "superposicion", paso: "primer-plano", error: "superposicion:sin-permiso", tras: "412" });
        const linea = lineas.find((l) => l.includes("resultado=rechazo:sin-indicador-nativo")) ?? "";
        expect(linea).toContain("falta=superposicion");
        expect(linea).toContain("paso=primer-plano");
        expect(puerta.sesionActiva()).toBeNull();
    });

    it("FSG1116 · A2: lo nativo recibe la orden firmada «abrir-sesion» tal como llegó, para comprobarla allí", async () => {
        const recibidos: unknown[] = [];
        await nuevaPuerta(CUENTA, {
            abrir: async (_de: string, _nombre: string, _nivel: string, sobre: unknown) => {
                recibidos.push(sobre);
                return { ok: true, token: "b".repeat(32) };
            },
        });
        await emparejar();
        const sobre = await firmar(mac, "abrir-sesion");
        const r = await puerta.recibir(sobre);
        expect(r.ok).toBe(true);
        expect(recibidos).toEqual([sobre]);
    });

    it("sin detalle (escritorio, navegador) todo queda como antes", async () => {
        await nuevaPuerta(CUENTA, { abrir: async () => ({ ok: false, motivo: "sin-indicador-nativo" }) });
        await emparejar();
        const r = await puerta.recibir(await firmar(mac, "abrir-sesion"));
        expect(r).toMatchObject({ ok: false, motivo: "sin-indicador-nativo" });
        expect(r.resultado).toBeUndefined();
        expect(lineas.some((l) => l.endsWith("resultado=rechazo:sin-indicador-nativo"))).toBe(true);
    });
});

describe("CTL1124 · multicontrolador simultáneo y ventana deslizante de seq", () => {
    it("admite múltiples neuronas de la cuenta controlando simultáneamente y cerrar una no tira a otra", async () => {
        await emparejar();
        const linux = await aparato();
        await puerta.recibir(await firmar(linux, "presentarse", { spki: linux.spki, nombre: "Maggabox", neurona: "aaaa0000-0000-4000-8000-000000000002" }));
        permiso = { ...aceptarPendiente(permiso, linux.huella), encendido: true, nivel: "controlar" };

        const sMac = await abrirSesion();
        const rLinux = await puerta.recibir(await firmar(linux, "abrir-sesion"));
        expect(rLinux.ok).toBe(true);
        const sLinux = (rLinux.resultado as { sesion: string }).sesion;
        expect(sLinux).not.toBe(sMac);
        expect(puerta.sesionesActivas()).toHaveLength(2);

        expect((await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion: sMac }))).ok).toBe(true);
        expect((await puerta.recibir(await firmar(linux, "leer-estado", {}, { sesion: sLinux }))).ok).toBe(true);

        // Cerrar una sesión deja activa a la otra.
        expect((await puerta.recibir(await firmar(linux, "cerrar-sesion", {}, { sesion: sLinux }))).ok).toBe(true);
        expect(puerta.sesionesActivas()).toHaveLength(1);
        expect((await puerta.recibir(await firmar(mac, "leer-estado", {}, { sesion: sMac }))).ok).toBe(true);
        expect((await puerta.recibir(await firmar(linux, "leer-estado", {}, { sesion: sLinux }))).motivo).toBe("sin-sesion");
    });

    it("acepta paquetes levemente desordenados dentro de la ventana deslizante pero rechaza replays", async () => {
        await emparejar();
        const sesion = await abrirSesion();
        const futuro = await firmar(mac, "leer-estado", {}, { sesion, seq: 10 });
        const intermedio = await firmar(mac, "leer-estado", {}, { sesion, seq: 8 });
        expect((await puerta.recibir(futuro)).ok).toBe(true);
        expect((await puerta.recibir(intermedio)).ok).toBe(true);
        // Repetir el mismo seq intermedio (aunque con nonce nuevo) sí se rechaza.
        const replay = await firmar(mac, "leer-estado", {}, { sesion, seq: 8 });
        expect((await puerta.recibir(replay)).motivo).toBe("repetida");
    });
});
