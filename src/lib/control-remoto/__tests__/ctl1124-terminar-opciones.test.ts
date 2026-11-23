/**
 * CTL1124B · Terminar una sesión concreta en multisesión (sin cortar las demás ni quitar permiso)
 * y terminar directamente una sesión saliente desde RegistroSesiones aunque tenga varios usos.
 */
import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { RegistroSesiones } from "../registro-sesiones";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const OBJETIVO = "bbbb0001-0000-4000-8000-000000000001";

async function crearControlador(id: string) {
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    const huella = (await huellaDeSpki(subtle, spki))!;
    let seq = 0;
    const firmar = async (accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) => {
        const reloj = Date.parse("2026-11-23T12:00:00Z");
        const carga: CargaOrden = {
            aud: AUD_CONTROL,
            v: 1,
            de: huella,
            cuenta: CUENTA,
            para: OBJETIVO,
            nivel: "controlar",
            sesion: null,
            seq: ++seq,
            nonce: `nonce-${id}-${seq}-${Math.random().toString(36).slice(2)}`,
            t: new Date(reloj).toISOString(),
            caduca: new Date(reloj + 60_000).toISOString(),
            accion: { nombre: accion, args },
            ...o,
        };
        const bytes = new TextEncoder().encode(JSON.stringify(carga));
        const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, bytes));
        return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
    };
    return { huella, spki, firmar };
}

describe("CTL1124B · terminarToken y RegistroSesiones.terminar", () => {
    it("terminarToken desconecta solo al controlador elegido, mantiene vivo el resto y conserva el permiso", async () => {
        let permiso: PermisoControl = permisoDeFabrica();
        const paradas: Array<{ motivo: string; token?: string }> = [];
        let contadorTokens = 0;
        const mac = await crearControlador("mac");
        const linux = await crearControlador("linux");
        const puerta = new PuertaControl({
            subtle,
            ahora: () => Date.parse("2026-11-23T12:00:00Z"),
            cuentaPropia: () => CUENTA,
            neuronaPropia: () => OBJETIVO,
            leerPermiso: () => permiso,
            guardarPermiso: (p) => void (permiso = p),
            ejecutar: async () => ({ hecho: true }),
            anotar: () => undefined,
            azarHex: () => "c".repeat(32),
            nativo: {
                disponible: () => true,
                abrir: async () => ({ ok: true, token: (++contadorTokens).toString(16).padStart(32, "a") }),
                orden: async () => ({ ok: true }),
                anotar: () => undefined,
                parar: async (motivo: string, token?: string) => void paradas.push({ motivo, token }),
            } as never,
        });

        await puerta.recibir(await mac.firmar("presentarse", { spki: mac.spki, nombre: "MaggaBook", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
        await puerta.recibir(await linux.firmar("presentarse", { spki: linux.spki, nombre: "MaggaBox", neurona: "aaaa0000-0000-4000-8000-000000000002" }));
        permiso = aceptarPendiente(permiso, mac.huella);
        permiso = { ...aceptarPendiente(permiso, linux.huella), encendido: true, nivel: "controlar" };

        const rMac = await puerta.recibir(await mac.firmar("abrir-sesion"));
        const rLinux = await puerta.recibir(await linux.firmar("abrir-sesion"));
        expect(rMac.ok).toBe(true);
        expect(rLinux.ok).toBe(true);
        const tokMac = (rMac.resultado as { sesion: string }).sesion;
        const tokLinux = (rLinux.resultado as { sesion: string }).sesion;
        expect(puerta.sesionesActivas()).toHaveLength(2);

        expect(puerta.terminarToken(tokMac)).toBe(true);
        expect(puerta.terminarToken("inexistente")).toBe(false);
        expect(permiso.encendido).toBe(true);
        expect(permiso.controladores).toHaveLength(2);
        expect(puerta.sesionesActivas().map((s) => s.token)).toEqual([tokLinux]);
        expect(paradas).toEqual([{ motivo: "terminado-por-el-dueno", token: tokMac }]);

        // Mac recibe parada-nativa terminal; Linux sigue operando normalmente
        expect(await puerta.recibir(await mac.firmar("leer-estado", {}, { sesion: tokMac }))).toMatchObject({
            ok: false,
            motivo: "parada-nativa",
            resultado: { detalle: { motivo: "terminado-por-el-dueno" } },
        });
        expect(await puerta.recibir(await linux.firmar("leer-estado", {}, { sesion: tokLinux }))).toMatchObject({ ok: true });
    });

    it("RegistroSesiones notifica cambios y terminar() corta la sesión aunque tenga fuertes > 1", async () => {
        let t = 1000;
        const reg = new RegistroSesiones(() => ++t, async () => undefined);
        const oyente = vi.fn();
        const quitarOyente = reg.suscribir(oyente);

        const enviadas: string[] = [];
        const mandar = vi.fn(async (nombre: string) => {
            enviadas.push(nombre);
            return { tipo: "respuesta" as const, nonce: "", ok: true, motivo: "ok", resultado: { sesion: "tok-saliente-1234", nivel: "controlar" } };
        });

        await reg.abrir("n1", mandar);
        await reg.abrir("n1", mandar); // fuertes = 2
        expect(reg.sesionesSalientes()).toHaveLength(1);
        expect(reg.sesionesSalientes()[0]).toMatchObject({ para: "n1", token: "tok-saliente-1234", fuertes: 2 });

        const ok = await reg.terminar("N1", mandar);
        expect(ok).toBe(true);
        expect(reg.sesionesSalientes()).toEqual([]);
        expect(enviadas).toEqual(["abrir-sesion", "pantalla-parar", "cerrar-sesion"]);
        expect(oyente).toHaveBeenCalled();

        quitarOyente();
        expect(await reg.terminar("N1", mandar)).toBe(false);
    });
});
