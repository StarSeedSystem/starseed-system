/**
 * GEN1114E · la clave del aparato y la firma (contrato GEN1114 §3.2, §3.3, §3.4, §3.6 y §9 GEN1114E).
 * WebCrypto de verdad (el de Node) e IndexedDB de mentira (`idb-falso.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    _reiniciarFirmaAparato,
    actualizarEstadoAparato,
    aparatoLocal,
    base32,
    claveAparatoPerdida,
    codigoDe,
    configurarFirmaAparato,
    crearClaveAparato,
    cuentaDeSesion,
    deB64url,
    firmarEntrada,
    olvidarAparato,
    puedeOfrecer,
    riesgoDeEntrada,
    soporteFirma,
    ErrorFirma,
    BD_FIRMA,
    ALMACEN_FIRMA,
} from "../firma-aparato";
import { crearIdbFalso, crearMarcaFalsa, crearRespaldo, type Respaldo } from "./idb-falso";
import type { CargaFirmada, EntradaChat } from "../tipos";

const CUENTA = "00000000-0000-4000-8000-000000000001";
const AHORA = Date.parse("2026-11-13T10:00:00.000Z");
const subtle = globalThis.crypto.subtle;

let respaldo: Respaldo;
let marca: ReturnType<typeof crearMarcaFalsa>;

function montar(r: Respaldo = respaldo, m = marca) {
    _reiniciarFirmaAparato();
    configurarFirmaAparato({ indexedDB: crearIdbFalso(r), subtle, marca: m, ahora: () => AHORA, seguro: true });
}

beforeEach(() => {
    respaldo = crearRespaldo();
    marca = crearMarcaFalsa();
    montar();
});
afterEach(() => _reiniciarFirmaAparato());

function entrada(extra: Partial<EntradaChat> = {}): EntradaChat {
    return { v: 1, nonce: "AAAAAAAAAAAAAAAAAAAAAA", t: new Date(AHORA).toISOString(), fuente: "direccion", accion: "decir", texto: "Prueba GEN1114 firmada", ...extra };
}
const ctx = { cuenta: CUENTA, destino: "mac" as const, chat: "genesis", chatNombre: "GENESIS · StarSeed OS", ahora: AHORA };

/** La clave guardada, leída por dentro del IndexedDB de mentira (como haría un script de la página). */
function claveGuardada(r: Respaldo = respaldo): CryptoKey {
    return (r.bases.get(BD_FIRMA)!.almacenes.get(ALMACEN_FIRMA)!.get("clave") as { privada: CryptoKey }).privada;
}

async function publicaDe(spkiB64: string): Promise<CryptoKey> {
    return subtle.importKey("spki", deB64url(spkiB64), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
}

describe("§3.3 · código de emparejar (vectores del contrato)", () => {
    it("coincide byte a byte con los tres vectores", async () => {
        const h1 = "17a3b6ff31fccb5586b758b98e5cfcc2c4c4b68aa103288765360cfd0f64d80c";
        const h2 = "c76ee5500e9143562f96ddaf2abbdb08c0676ce7f7a4e36edd644a9ba6cf8164";
        expect(await codigoDe(h1, "00000000-0000-4000-8000-000000000001")).toBe("7ETY-DGGK-DY2F");
        expect(await codigoDe(h1, "00000000-0000-4000-8000-000000000002")).toBe("S7GP-KAWW-7Y5T");
        expect(await codigoDe(h2, "00000000-0000-4000-8000-000000000001")).toBe("VYR2-W7RQ-DW2P");
        // La cuenta y la huella se pasan a minúsculas: el mismo código.
        expect(await codigoDe(h1.toUpperCase(), "00000000-0000-4000-8000-000000000001".toUpperCase())).toBe("7ETY-DGGK-DY2F");
    });

    it("las huellas de los vectores son sha256 de un texto (control) y base32 es RFC 4648", async () => {
        expect(base32(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
        expect(base32(new Uint8Array([]))).toBe("");
    });
});

describe("§3.2 · la clave no se puede exportar y vive en IndexedDB", () => {
    it("se crea con extractable:false; exportKey(pkcs8) y (jwk) fallan; la pública da la huella y el código", async () => {
        const gen = vi.spyOn(subtle, "generateKey");
        const { aparato, spki } = await crearClaveAparato("iPhone de Alex", CUENTA);
        expect(gen).toHaveBeenCalledWith({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
        gen.mockRestore();
        const privada = claveGuardada();
        expect(privada.extractable).toBe(false);
        await expect(subtle.exportKey("pkcs8", privada)).rejects.toThrow();
        await expect(subtle.exportKey("jwk", privada)).rejects.toThrow();
        const der = deB64url(spki);
        const huella = [...new Uint8Array(await subtle.digest("SHA-256", der))].map((b) => b.toString(16).padStart(2, "0")).join("");
        expect(aparato.huella).toBe(huella);
        expect(aparato.codigo).toBe(await codigoDe(huella, CUENTA));
        expect(aparato.codigo).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
        expect(aparato).toMatchObject({ cuenta: CUENTA, nombre: "iPhone de Alex", estado: "sin-emparejar", nivel: "texto", seq: 0 });
        // Vive en la base y el almacén del contrato, como objeto (no como texto).
        expect(respaldo.bases.has("starseed-genesis-firma")).toBe(true);
        expect(respaldo.bases.get("starseed-genesis-firma")!.almacenes.has("aparato")).toBe(true);
        expect(JSON.stringify(marca.datos.get("starseed.chats-genesis.aparato.v1"))).not.toContain("privada");
    });

    it("tras «recargar» (otra conexión al mismo almacén y módulo vuelto a montar) sigue firmando y la firma verifica", async () => {
        const { spki } = await crearClaveAparato("Mac", CUENTA);
        montar(); // recarga: nada en memoria, todo del almacén
        const a = await aparatoLocal();
        expect(a?.estado).toBe("sin-emparejar");
        const f = await firmarEntrada(entrada(), ctx);
        const ok = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await publicaDe(spki), deB64url(f.firma), deB64url(f.carga));
        expect(ok).toBe(true);
        expect(f.firma).toHaveLength(86);
        expect(f.aparato).toBe(a!.huella);
    });

    it("con una clave EMPAREJADA, crear otra se niega (olvidar primero)", async () => {
        await crearClaveAparato("Mac", CUENTA);
        await actualizarEstadoAparato({ estado: "emparejado" });
        await expect(crearClaveAparato("Otra", CUENTA)).rejects.toMatchObject({ codigo: "ya-emparejado" });
        await olvidarAparato();
        expect(await aparatoLocal()).toBeNull();
        expect(await claveAparatoPerdida()).toBeNull(); // olvidada a propósito: no es una pérdida
        await expect(crearClaveAparato("Otra", CUENTA)).resolves.toBeTruthy();
    });

    it("nombre y cuenta obligatorios", async () => {
        await expect(crearClaveAparato("  ", CUENTA)).rejects.toMatchObject({ codigo: "nombre" });
        await expect(crearClaveAparato("Mac", "")).rejects.toMatchObject({ codigo: "sin-cuenta" });
        const { aparato } = await crearClaveAparato("x".repeat(70), CUENTA);
        expect([...aparato.nombre]).toHaveLength(60);
    });
});

describe("§3.9 · clave perdida: se dice, nunca se rehace sola", () => {
    it("IndexedDB vaciado con la marca viva → aparatoLocal null y claveAparatoPerdida con la fecha", async () => {
        await crearClaveAparato("iPhone de Alex", CUENTA);
        await actualizarEstadoAparato({ estado: "emparejado", nivel: "completo" });
        const huella = (await aparatoLocal())!.huella;
        // El navegador borra la base (iOS, «borrar datos del sitio»), la marca de localStorage queda.
        const r2 = crearRespaldo();
        montar(r2, marca);
        expect(await aparatoLocal()).toBeNull();
        const perdida = await claveAparatoPerdida();
        expect(perdida).toMatchObject({ huella, nombre: "iPhone de Alex", estado: "emparejado" });
        expect(perdida!.vistoPorUltima).toBe(new Date(AHORA).toISOString());
        // Nadie creó una clave nueva a escondidas.
        expect(r2.bases.get(BD_FIRMA)?.almacenes.get(ALMACEN_FIRMA)?.get("clave")).toBeUndefined();
        await expect(firmarEntrada(entrada(), ctx)).rejects.toMatchObject({ codigo: "clave-perdida" });
        // Una clave nueva (cuando la persona pulsa «Emparejar») empieza sin emparejar y de nivel texto.
        const { aparato } = await crearClaveAparato("iPhone de Alex", CUENTA);
        expect(aparato.huella).not.toBe(huella);
        expect(aparato).toMatchObject({ estado: "sin-emparejar", nivel: "texto" });
        expect(await claveAparatoPerdida()).toBeNull();
    });

    it("un registro roto (la CryptoKey no está) también cuenta como perdida", async () => {
        await crearClaveAparato("Mac", CUENTA);
        const almacen = respaldo.bases.get(BD_FIRMA)!.almacenes.get(ALMACEN_FIRMA)!;
        almacen.set("clave", { ...(almacen.get("clave") as object), privada: { texto: "no es una clave" } });
        expect(await aparatoLocal()).toBeNull();
        expect(await claveAparatoPerdida()).not.toBeNull();
    });
});

describe("§3.4 · seq único, reservado y cerrado antes de firmar", () => {
    it("la transacción de seq se confirma ANTES de llamar a sign", async () => {
        await crearClaveAparato("Mac", CUENTA);
        const vistos: { enCurso: boolean; diario: string }[] = [];
        const sign = vi.spyOn(subtle, "sign").mockImplementation(async function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto["sign"]>) {
            vistos.push({ enCurso: respaldo.enCurso !== null, diario: respaldo.diario.slice(-1)[0] });
            sign.mockRestore();
            return subtle.sign(...args);
        });
        const f = await firmarEntrada(entrada(), ctx);
        expect(vistos).toEqual([{ enCurso: false, diario: "fin:readwrite" }]);
        const carga = JSON.parse(new TextDecoder().decode(deB64url(f.carga))) as CargaFirmada;
        expect(carga.seq).toBe(1);
        expect(respaldo.bases.get(BD_FIRMA)!.almacenes.get(ALMACEN_FIRMA)!.get("seq")).toBe(1);
    });

    it("dos «pestañas» (dos módulos y dos conexiones al mismo almacén) firmando a la vez reciben números distintos, y persisten", async () => {
        await crearClaveAparato("Mac", CUENTA);
        vi.resetModules();
        const pestanaA = await import("../firma-aparato");
        vi.resetModules();
        const pestanaB = await import("../firma-aparato");
        expect(pestanaA).not.toBe(pestanaB);
        for (const p of [pestanaA, pestanaB]) p.configurarFirmaAparato({ indexedDB: crearIdbFalso(respaldo), subtle, marca, ahora: () => AHORA, seguro: true });
        const firmas = await Promise.all(
            Array.from({ length: 10 }, (_, i) => (i % 2 ? pestanaA : pestanaB).firmarEntrada(entrada({ nonce: `N${String(i).padStart(21, "0")}` }), ctx)),
        );
        const seqs = firmas.map((f) => (JSON.parse(new TextDecoder().decode(deB64url(f.carga))) as CargaFirmada).seq);
        expect(new Set(seqs).size).toBe(10);
        expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        montar(); // recarga: el contador sigue
        expect((await aparatoLocal())!.seq).toBe(10);
        const siguiente = await firmarEntrada(entrada(), ctx);
        expect((JSON.parse(new TextDecoder().decode(deB64url(siguiente.carga))) as CargaFirmada).seq).toBe(11);
    });
});

describe("§3.4 · la carga firmada", () => {
    it("lleva todos los campos, chatNombre tal cual, entrada.v === 1 y se verifica sobre los MISMOS bytes", async () => {
        const { spki, aparato } = await crearClaveAparato("Mac", CUENTA);
        const e = entrada({ texto: "ñandú 🌱 «comillas» ‮" });
        const f = await firmarEntrada(e, { ...ctx, chatNombre: "Hermes" , chat: "genesis.canal.hermes" });
        expect(f.v).toBe(2);
        expect(f.carga).toMatch(/^[A-Za-z0-9_-]+$/);
        const bytes = deB64url(f.carga);
        const carga = JSON.parse(new TextDecoder().decode(bytes)) as CargaFirmada;
        expect(Object.keys(carga)).toEqual(["aud", "cuenta", "aparato", "seq", "t", "caduca", "destino", "chat", "chatNombre", "entrada"]);
        expect(carga).toMatchObject({ aud: "starseed.genesis.chats.v1", cuenta: CUENTA, aparato: aparato.huella, destino: "mac", chat: "genesis.canal.hermes", chatNombre: "Hermes" });
        expect(carga.entrada).toEqual(e);
        expect(carga.entrada.v).toBe(1);
        // Los bytes de `carga` son exactamente JSON.stringify de la carga: nadie los vuelve a serializar.
        expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(carga));
        expect(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await publicaDe(spki), deB64url(f.firma), bytes)).toBe(true);
        // Un byte cambiado ya no verifica.
        const malo = bytes.slice();
        malo[10] ^= 1;
        expect(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await publicaDe(spki), deB64url(f.firma), malo)).toBe(false);
    });

    it("caduca: t + 30 min si es alto; t + 7 días si es bajo", async () => {
        await crearClaveAparato("Mac", CUENTA);
        const cargaDe = async (e: EntradaChat, destino: "mac" | "a1" = "mac") =>
            JSON.parse(new TextDecoder().decode(deB64url((await firmarEntrada(e, { ...ctx, destino })).carga))) as CargaFirmada;
        const alto = await cargaDe(entrada({ fuente: "puente:hermes-avisos", accion: "texto", texto: "hola Hermes" }));
        expect(Date.parse(alto.caduca) - Date.parse(alto.t)).toBe(1800_000);
        const bajo = await cargaDe(entrada());
        expect(Date.parse(bajo.caduca) - Date.parse(bajo.t)).toBe(7 * 86_400_000);
        const peticion = await cargaDe(entrada({ fuente: "puente:peticiones", accion: "texto", texto: "x" }), "a1");
        expect(Date.parse(peticion.caduca) - Date.parse(peticion.t)).toBeLessThanOrEqual(1800_000);
    });

    it("se niega con otra cuenta, sin chat, con un nombre de más de 80, con destino que no cuadra o sin v:1", async () => {
        await crearClaveAparato("Mac", CUENTA);
        await expect(firmarEntrada(entrada(), { ...ctx, cuenta: "00000000-0000-4000-8000-000000000002" })).rejects.toMatchObject({ codigo: "otra-cuenta" });
        await expect(firmarEntrada(entrada(), { ...ctx, chat: "" })).rejects.toMatchObject({ codigo: "sin-chat" });
        await expect(firmarEntrada(entrada(), { ...ctx, chat: "puente:hermes-avisos" })).rejects.toMatchObject({ codigo: "sin-chat" });
        await expect(firmarEntrada(entrada(), { ...ctx, chatNombre: "" })).rejects.toMatchObject({ codigo: "sin-chat" });
        await expect(firmarEntrada(entrada(), { ...ctx, chatNombre: "x".repeat(81) })).rejects.toMatchObject({ codigo: "sin-chat" });
        await expect(firmarEntrada(entrada(), { ...ctx, destino: "a1" })).rejects.toMatchObject({ codigo: "destino" });
        await expect(firmarEntrada({ ...entrada(), v: 2 as unknown as 1 }, ctx)).rejects.toMatchObject({ codigo: "forma" });
        await expect(firmarEntrada(entrada({ texto: "é".repeat(8000), canales: Array(4000).fill("mando") }), ctx)).rejects.toMatchObject({ codigo: "grande" });
        expect(new ErrorFirma("x", "y")).toBeInstanceOf(Error);
    });
});

describe("§3.6 · riesgoDeEntrada (tabla del contrato)", () => {
    const casos: [Omit<EntradaChat, "v" | "nonce" | "t">, "bajo" | "alto"][] = [
        [{ fuente: "direccion", accion: "decir", texto: "x" }, "bajo"],
        [{ fuente: "direccion", accion: "decir", texto: "x", canales: ["mando"] }, "bajo"],
        [{ fuente: "direccion", accion: "decir", texto: "x", canales: [] }, "bajo"],
        [{ fuente: "direccion", accion: "decir", texto: "x", canales: ["mando"], modelo: "director-presidente/auto" }, "alto"],
        [{ fuente: "direccion", accion: "decir", texto: "x", canales: ["hermes"] }, "alto"],
        [{ fuente: "direccion", accion: "decir", texto: "x", canales: ["mando", "director-presidente"] }, "alto"],
        [{ fuente: "direccion", accion: "responder", respondeA: "md-1763028000000-ab12" }, "alto"],
        [{ fuente: "direccion", accion: "reenviar", reenviar: "md-1763028000000-ab12", canales: ["mando"] }, "alto"],
        [{ fuente: "direccion", accion: "revocarme" }, "bajo"],
        [{ fuente: "direccion", accion: "revocar-aparato", huella: "a".repeat(64) }, "bajo"],
        ...(["estado", "olas", "cola", "puertas", "agentes", "ayuda"] as const).map(
            (n) => [{ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: n, args: [] } }, "bajo"] as [Omit<EntradaChat, "v" | "nonce" | "t">, "bajo"],
        ),
        [{ fuente: "puente:hermes-avisos", accion: "texto", texto: "hola Hermes" }, "alto"],
        ...(["decir", "a", "aprobar", "rechazar", "soltar", "reasignar"] as const).map(
            (n) => [{ fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: n, args: ["T1"] } }, "alto"] as [Omit<EntradaChat, "v" | "nonce" | "t">, "alto"],
        ),
        [{ fuente: "puente:peticiones", accion: "orden", orden: { nombre: "estado", args: [] } }, "bajo"],
        [{ fuente: "puente:peticiones", accion: "orden", orden: { nombre: "ayuda", args: [] } }, "bajo"],
        [{ fuente: "puente:peticiones", accion: "texto", texto: "haz esto" }, "alto"],
        ...(["encargos", "pausa", "sigue", "cancela"] as const).map(
            (n) => [{ fuente: "puente:peticiones", accion: "orden", orden: { nombre: n, args: [] } }, "alto"] as [Omit<EntradaChat, "v" | "nonce" | "t">, "alto"],
        ),
        [{ fuente: "puente:peticiones", accion: "orden", orden: { nombre: "olas", args: [] } }, "alto"],
        [{ fuente: "puente:avisos-directores" as "direccion", accion: "texto", texto: "x" }, "alto"],
        [{ fuente: "direccion", accion: "otra" as "decir" }, "alto"],
    ];
    it.each(casos)("%j → %s", (e, esperado) => {
        expect(riesgoDeEntrada(e)).toBe(esperado);
    });
    it("basura → alto", () => {
        expect(riesgoDeEntrada(null as unknown as EntradaChat)).toBe("alto");
        expect(riesgoDeEntrada({ fuente: "puente:hermes-avisos", accion: "orden" } as EntradaChat)).toBe("alto");
    });
});

describe("cuentaDeSesion y puedeOfrecer", () => {
    const jwt = (payload: unknown) => `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.firma`;
    it("saca el sub sin verificar; basura → null", () => {
        expect(cuentaDeSesion(jwt({ sub: CUENTA, role: "authenticated" }))).toBe(CUENTA);
        expect(cuentaDeSesion(jwt({ sub: "ñ-cuenta" }))).toBe("ñ-cuenta");
        expect(cuentaDeSesion("no-es-un-jwt")).toBeNull();
        expect(cuentaDeSesion(jwt({ rol: "x" }))).toBeNull();
        expect(cuentaDeSesion("a.%%%.b")).toBeNull();
        expect(cuentaDeSesion(undefined as unknown as string)).toBeNull();
    });
    it("un aparato «texto» solo ofrece lo bajo; sin emparejar, nada", () => {
        const base = { huella: "a".repeat(64), codigo: "AAAA-AAAA-AAAA", cuenta: CUENTA, nombre: "x", creado: "", seq: 0 };
        const hermes = { fuente: "puente:hermes-avisos" as const, accion: "texto" as const, texto: "x" };
        const estado = { fuente: "puente:hermes-avisos" as const, accion: "orden" as const, orden: { nombre: "estado", args: [] } };
        expect(puedeOfrecer({ ...base, nivel: "texto", estado: "emparejado" }, hermes)).toBe(false);
        expect(puedeOfrecer({ ...base, nivel: "texto", estado: "emparejado" }, estado)).toBe(true);
        expect(puedeOfrecer({ ...base, nivel: "completo", estado: "emparejado" }, hermes)).toBe(true);
        expect(puedeOfrecer({ ...base, nivel: "completo", estado: "pendiente" }, estado)).toBe(false);
        expect(puedeOfrecer(null, estado)).toBe(false);
    });
});

describe("soporteFirma", () => {
    it("dice por qué no se puede", async () => {
        expect(await soporteFirma()).toEqual({ ok: true });
        configurarFirmaAparato({ seguro: false });
        expect(await soporteFirma()).toEqual({ ok: false, motivo: "contexto-inseguro" });
        configurarFirmaAparato({ seguro: true, subtle: null });
        expect(await soporteFirma()).toEqual({ ok: false, motivo: "sin-webcrypto" });
        configurarFirmaAparato({ subtle, indexedDB: null });
        expect(await soporteFirma()).toEqual({ ok: false, motivo: "sin-indexeddb" });
        configurarFirmaAparato({ indexedDB: crearIdbFalso(crearRespaldo(), { romper: true }) });
        expect(await soporteFirma()).toEqual({ ok: false, motivo: "sin-indexeddb" });
        await expect(crearClaveAparato("Mac", CUENTA)).rejects.toMatchObject({ codigo: "sin-indexeddb" });
        expect(await aparatoLocal()).toBeNull();
    });
});
