/**
 * CTL1117J · S3 · el aviso de que otra neurona pide control: solo con la orden verificada, con tres salidas, con topes
 * y sin encender ni aceptar nada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { LimiteAvisos, _vaciarAvisosPeticion, avisosPeticionAbiertos, crearAvisador, mostrarAvisoPeticion, textosPeticion, type PeticionControl, type SalidasAviso } from "../aviso-peticion";
import { claveParadaNativa, palabrasMotivo } from "../palabras";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const TOKEN = "c".repeat(32);

let reloj: number;
let n = 0;
let seq = 0;
let permiso: PermisoControl;
let puerta: PuertaControl;
let mac: { privada: CryptoKey; spki: string; huella: string };
let avisos: PeticionControl[];
let respuestaAviso: "si" | "ya" | void;

async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}, con = mac.privada) {
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
        nonce: `nonce-ctl1117j-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, con, bytes));
    return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
}
const presentar = (o: Partial<CargaOrden> = {}, con = mac.privada) => firmar("presentarse", { spki: mac.spki, nombre: "Mac de Alex", neurona: "aaaa0000-0000-4000-8000-000000000001" }, o, con);

beforeEach(async () => {
    reloj = Date.parse("2026-11-18T02:00:00Z");
    seq = 0;
    avisos = [];
    respuestaAviso = "si";
    permiso = permisoDeFabrica();
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
    puerta = new PuertaControl({
        subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
        ejecutar: async () => ({}), anotar: () => undefined, azarHex: () => "d".repeat(32),
        nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: TOKEN }), orden: async () => ({ ok: true }), anotar: () => undefined, parar: async () => undefined } as never,
        avisarPeticion: (p) => {
            avisos.push(p);
            return respuestaAviso;
        },
    });
});

describe("la puerta avisa solo con la orden verificada", () => {
    it("presentarse con el permiso APAGADO: avisa («apagado»), queda pendiente y no se enciende ni acepta nada", async () => {
        const r = await puerta.recibir(await presentar());
        expect(r).toMatchObject({ ok: true, motivo: "pendiente", resultado: { aviso: "si" } });
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ tipo: "presentarse", estado: "apagado", nombre: "Mac de Alex", de: mac.huella });
        expect(permiso.encendido).toBe(false);
        expect(permiso.controladores).toHaveLength(0);
        expect(permiso.pendientes).toHaveLength(1);
    });
    it("presentarse con el permiso encendido: «por-aceptar»", async () => {
        permiso = { ...permiso, encendido: true };
        await puerta.recibir(await presentar());
        expect(avisos[0]).toMatchObject({ estado: "por-aceptar" });
        expect(permiso.controladores).toHaveLength(0);
    });
    it("presentarse sin poder verificarse (firma de otra clave, otra cuenta, otro destino, caducada): ningún aviso", async () => {
        const otra = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
        expect((await puerta.recibir(await presentar({}, otra.privateKey))).motivo).toBe("firma");
        expect((await puerta.recibir(await presentar({ cuenta: "otra-cuenta" }))).motivo).toBe("otra-cuenta");
        expect((await puerta.recibir(await presentar({ para: "bbbb0000-0000-4000-8000-000000000009" }))).motivo).toBe("otro-destino");
        expect((await puerta.recibir(await presentar({ t: new Date(reloj - 3_600_000).toISOString(), caduca: new Date(reloj - 3_000_000).toISOString() }))).motivo).toBe("caducada");
        expect(avisos).toHaveLength(0);
    });
    it("abrir-sesion con el permiso apagado de un controlador ya aceptado: avisa, contesta «permiso-apagado» y dice que avisó", async () => {
        await puerta.recibir(await presentar());
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: false };
        avisos.length = 0;
        const r = await puerta.recibir(await firmar("abrir-sesion"));
        expect(r).toMatchObject({ ok: false, motivo: "permiso-apagado", resultado: { detalle: { aviso: "si" } } });
        expect(avisos).toEqual([expect.objectContaining({ tipo: "abrir-sesion", estado: "apagado", nivel: "controlar" })]);
        expect(claveParadaNativa(r.motivo, r.resultado)).toBe("permiso-apagado-avisado");
        expect(palabrasMotivo("permiso-apagado-avisado")).toBe("La otra neurona tiene el control apagado; ya se lo avisamos a su dueño.");
        expect(permiso.encendido).toBe(false);
    });
    it("abrir-sesion apagada de quien no se puede verificar (no aceptado, firma falsa, otro destino): ningún aviso y la respuesta no promete nada", async () => {
        const sin = await puerta.recibir(await firmar("abrir-sesion"));
        expect(sin.motivo).toBe("permiso-apagado");
        expect(claveParadaNativa(sin.motivo, sin.resultado)).toBe("permiso-apagado");
        await puerta.recibir(await presentar());
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: false };
        const otra = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
        avisos.length = 0;
        await puerta.recibir(await firmar("abrir-sesion", {}, {}, otra.privateKey));
        await puerta.recibir(await firmar("abrir-sesion", {}, { para: "bbbb0000-0000-4000-8000-000000000009" }));
        expect(avisos).toHaveLength(0);
    });
    it("otras órdenes con el permiso apagado no avisan", async () => {
        await puerta.recibir(await presentar());
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: false };
        avisos.length = 0;
        await puerta.recibir(await firmar("leer-estado"));
        expect(avisos).toHaveLength(0);
    });
    it("sesión abierta con el permiso encendido: avisa «abierta» una vez (renovarla no repite)", async () => {
        await puerta.recibir(await presentar());
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true };
        avisos.length = 0;
        expect((await puerta.recibir(await firmar("abrir-sesion"))).ok).toBe(true);
        expect((await puerta.recibir(await firmar("abrir-sesion"))).ok).toBe(true);
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ estado: "abierta", nombre: "Mac de Alex" });
    });
    it("si el aviso falla, la puerta sigue igual", async () => {
        const mala = new PuertaControl({ ...(puerta as unknown as { d: ConstructorParameters<typeof PuertaControl>[0] }).d, avisarPeticion: () => { throw new Error("x"); } });
        expect((await mala.recibir(await presentar())).ok).toBe(true);
    });
});

describe("topes: uno por minuto y seis por hora por quien manda", () => {
    it("lo callado se cuenta y UNA línea dice cuántos fueron", () => {
        vi.useFakeTimers();
        try {
            let t = 1_000_000;
            const lineas: string[] = [];
            const l = new LimiteAvisos(() => t, (x) => lineas.push(x), (f, ms) => setTimeout(f, ms));
            expect(l.permitir("a".repeat(64))).toBe(true);
            t += 10_000;
            expect(l.permitir("a".repeat(64))).toBe(false);
            t += 10_000;
            expect(l.permitir("a".repeat(64))).toBe(false);
            expect(l.permitir("b".repeat(64))).toBe(true); // otro aparato tiene su cuenta
            vi.advanceTimersByTime(60_000);
            expect(lineas).toEqual([`control-aviso suprimidos=2 de=${"a".repeat(8)} tope=60s-6h`]);
            t += 70_000;
            expect(l.permitir("a".repeat(64))).toBe(true);
            expect(lineas).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });
    it("seis por hora aunque pase un minuto entre ellos; a la hora vuelve", () => {
        let t = 0;
        const lineas: string[] = [];
        const l = new LimiteAvisos(() => t, (x) => lineas.push(x), () => undefined);
        const de = "c".repeat(64);
        const ok: boolean[] = [];
        for (let i = 0; i < 8; i++) {
            ok.push(l.permitir(de));
            t += 61_000;
        }
        expect(ok).toEqual([true, true, true, true, true, true, false, false]);
        t += 3_600_000;
        expect(l.permitir(de)).toBe(true);
        expect(lineas).toEqual([`control-aviso suprimidos=2 de=${"c".repeat(8)} tope=60s-6h`]);
    });
});

describe("las tres salidas", () => {
    const pet: PeticionControl = { de: "e".repeat(64), nombre: "Mac de Alex", tipo: "abrir-sesion", nivel: "controlar", estado: "apagado", desde: 5 };
    afterEach(() => _vaciarAvisosPeticion());
    it("ventana, sistema y centro reciben el mismo aviso, con nombre y código de 8, y el registro dice el resultado", async () => {
        const recibido: string[] = [];
        const salidas: SalidasAviso = {
            dentro: (a) => void recibido.push(`dentro:${a.titulo}`),
            sistema: async (a) => void recibido.push(`sistema:${a.titulo}`),
            centro: (a) => void recibido.push(`centro:${a.id}`),
        };
        const lineas: string[] = [];
        const av = crearAvisador({ ahora: () => 1000, anotar: (l) => void lineas.push(l), salidas, resolver: async () => ({ codigo: "ABCD-EFGH-IJKL", alcance: "total" }) });
        expect(av(pet)).toBe("si");
        expect(av(pet)).toBe("ya"); // segundo en menos de 60 s
        await vi.waitFor(() => expect(lineas.some((l) => l.startsWith("control-aviso de="))).toBe(true));
        expect(recibido.filter((x) => x.startsWith("dentro")).length).toBe(1);
        expect(recibido[0]).toContain("Mac de Alex pide el control total de esta neurona");
        expect(lineas.find((l) => l.startsWith("control-aviso de="))).toBe("control-aviso de=eeeeeeee tipo=abrir-sesion estado=apagado nivel=controlar alcance=total dentro=si centro=si sistema=si");
    });
    it("una salida que falla no tumba a las otras y queda dicha", async () => {
        const lineas: string[] = [];
        const av = crearAvisador({
            ahora: () => 1,
            anotar: (l) => void lineas.push(l),
            salidas: { dentro: () => undefined, sistema: async () => ({ ok: false, motivo: "sin-permiso-del-sistema" }), centro: () => { throw new Error("roto"); } },
            resolver: async () => { throw new Error("sin local"); },
        });
        av(pet);
        await vi.waitFor(() => expect(lineas).toHaveLength(1));
        expect(lineas[0]).toContain("dentro=si centro=no:roto sistema=no:sin-permiso-del-sistema");
    });
    it("la ventana guarda un aviso por aparato y el último gana", () => {
        const base = { id: "1", de8: "eeeeeeee", nombre: "x", codigo: null, tipo: "abrir-sesion", nivel: "controlar", estado: "apagado", alcance: "total", desde: 1, titulo: "t", cuerpo: "c", boton: "b", ruta: "/senales#control-entre-neuronas" } as const;
        mostrarAvisoPeticion({ ...base });
        mostrarAvisoPeticion({ ...base, id: "2", estado: "abierta" });
        expect(avisosPeticionAbiertos().map((a) => a.id)).toEqual(["2"]);
    });
});

describe("las palabras dicen la verdad de cada estado", () => {
    const base = { nombre: "Mac de Alex", de8: "1a2b3c4d", codigo: "ABCD-EFGH-IJKL", tipo: "abrir-sesion" as const, nivel: "controlar" as const, alcance: "total" as const, desde: Date.parse("2026-11-18T02:00:00Z") };
    it("apagado: la frase exacta y un botón al ajuste; con «total» lo dice", () => {
        const t = textosPeticion({ ...base, estado: "apagado" });
        expect(t.cuerpo).toContain("Esta neurona tiene apagado “Control entre mis neuronas”. Solo tú puedes encenderlo, aquí.");
        expect(t.cuerpo).toContain("control total");
        expect(t.titulo).toContain("el control total");
        expect(t.boton).toBe("Abrir el ajuste");
    });
    it("por aceptar: dice qué hacer aquí y el código", () => {
        const t = textosPeticion({ ...base, estado: "por-aceptar", tipo: "presentarse" });
        expect(t.cuerpo).toContain("acéptala tú, aquí");
        expect(t.cuerpo).toContain("ABCD-EFGH-IJKL");
    });
    it("«Protegido» no promete control total; «ver» solo ve", () => {
        expect(textosPeticion({ ...base, estado: "apagado", alcance: "protegido" }).titulo).not.toContain("total");
        expect(textosPeticion({ ...base, estado: "apagado", alcance: "protegido" }).cuerpo).toContain("Protegido");
        const v = textosPeticion({ ...base, estado: "apagado", nivel: "ver" });
        expect(v.titulo).toContain("ver esta neurona");
        expect(v.cuerpo).not.toContain("control total");
    });
    it("abierta: quién controla desde cuándo", () => {
        const t = textosPeticion({ ...base, estado: "abierta" });
        expect(t.titulo).toBe("Mac de Alex controla esta neurona");
        expect(t.cuerpo).toContain("1a2b3c4d");
        expect(t.cuerpo).toContain("desde las");
    });
});
