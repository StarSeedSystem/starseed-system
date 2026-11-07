/**
 * GRP1107A · bóveda de la bandeja de la malla: AES-GCM con clave no extraíble, IV distinto por
 * correo, lo cifrado no deja ver el texto y otra clave no lo abre. Sin IndexedDB (Node), la
 * bandeja cae a memoria y lo dice (`cifrado() === false`).
 */
import { describe, expect, it } from "vitest";
import { almacenCifrado, cifrarCorreo, descifrarCorreo, nuevaClave } from "@/lib/mail/boveda-correo-malla";
import type { CorreoMalla } from "@/lib/mail/correo-malla";

const c: CorreoMalla = {
    id: "correo-000001",
    dir: "sale",
    de: { uid: "u-yo", nombre: "Yo" },
    para: ["u-ana"],
    asunto: "Secreto de prueba",
    cuerpo: "La clave del armario es 1234",
    creado: 1,
    estado: "guardado",
    entregadoA: [],
    recibos: [],
    intentos: 0,
};

describe("bóveda de correos por la malla", () => {
    it("cifra y descifra (ida y vuelta); el texto no se ve; IV distinto cada vez", async () => {
        const k = await nuevaClave();
        expect(k.extractable).toBe(false);
        const a = await cifrarCorreo(k, c);
        const b = await cifrarCorreo(k, c);
        expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
        const bytes = new TextDecoder("latin1").decode(new Uint8Array(a.ct));
        expect(bytes).not.toContain("armario");
        expect(bytes).not.toContain("Secreto");
        expect(await descifrarCorreo(k, a)).toEqual(c);
    });

    it("otra clave o un registro dañado no se abre (null, sin lanzar)", async () => {
        const k = await nuevaClave();
        const otra = await nuevaClave();
        const reg = await cifrarCorreo(k, c);
        expect(await descifrarCorreo(otra, reg)).toBeNull();
        const danado = new Uint8Array(reg.ct.slice(0));
        danado[0] ^= 0xff;
        expect(await descifrarCorreo(k, { ...reg, ct: danado.buffer })).toBeNull();
        expect(await descifrarCorreo(k, { ...reg, id: "correo-otro01" })).toBeNull();
    });

    it("sin IndexedDB: guarda en memoria y lo dice", async () => {
        const a = almacenCifrado();
        expect(await a.guardar(c)).toBe(true);
        expect(await a.cargar()).toEqual([c]);
        expect(a.cifrado()).toBe(false);
        await a.borrar(c.id);
        expect(await a.cargar()).toEqual([]);
    });
});
