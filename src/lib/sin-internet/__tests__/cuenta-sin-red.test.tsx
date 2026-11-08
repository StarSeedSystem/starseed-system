// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "11111111-2222-4333-8444-555555555555";

type Oyente = (evento: string, sesion: { user?: { id: string } } | null) => void;
const estado = vi.hoisted(() => ({
    sesion: null as { user: { id: string } } | null,
    error: null as unknown,
    oyentes: [] as Oyente[],
    cliente: null as unknown,
}));

vi.mock("@/utils/supabase/client", () => ({ createClient: () => estado.cliente }));

import { _reiniciarUsuarioParaPruebas, sinRedProbable, uidActual } from "@/lib/consumo/usuario";
import { CLAVE_UID_RECORDADO, esErrorDeRed, olvidarUid, uidRecordado } from "../uid-recordado";
import { _ponerInstantaneaParaPruebas, crearInstantanea } from "../instantanea-cuenta";
import { crearAlmacenMemoria } from "@/lib/identidad/almacen";
import { avatarLocalSinRed, guardarPerfilSinRed, leerPerfilSinRed, perfilParaSinRed } from "../perfil-sin-red";

function clienteConGetSession() {
    return {
        auth: {
            getSession: vi.fn(async () => ({ data: { session: estado.sesion }, error: estado.error })),
            onAuthStateChange: vi.fn((cb: Oyente) => {
                estado.oyentes.push(cb);
                return { data: { subscription: { unsubscribe: () => undefined } } };
            }),
        },
    };
}

beforeEach(() => {
    window.localStorage.clear();
    estado.sesion = null;
    estado.error = null;
    estado.oyentes = [];
    estado.cliente = clienteConGetSession();
    _reiniciarUsuarioParaPruebas();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe("la cuenta sigue siendo la misma al reabrir sin internet", () => {
    it("con sesión viva recuerda el id (solo el id) y lo devuelve", async () => {
        estado.sesion = { user: { id: UID } };
        expect(await uidActual()).toBe(UID);
        expect(uidRecordado()).toBe(UID);
        const guardado = window.localStorage.getItem(CLAVE_UID_RECORDADO)!;
        expect(Object.keys(JSON.parse(guardado)).sort()).toEqual(["en", "uid"]);
    });

    it("token caducado + fallo de RED al renovar: uidActual devuelve la cuenta recordada y no cachea «sin usuario»", async () => {
        estado.sesion = { user: { id: UID } };
        await uidActual(); // en línea: se recuerda
        _reiniciarUsuarioParaPruebas();
        estado.sesion = null;
        estado.error = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
        expect(await uidActual()).toBe(UID);
        expect(sinRedProbable()).toBe(true);
        // vuelve la red y la sesión: se pide de nuevo (no quedó «null» en caché)
        estado.error = null;
        estado.sesion = { user: { id: UID } };
        _reiniciarUsuarioParaPruebas();
        expect(await uidActual()).toBe(UID);
    });

    it("navigator.onLine=false también basta", async () => {
        window.localStorage.setItem(CLAVE_UID_RECORDADO, JSON.stringify({ uid: UID, en: 1 }));
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        expect(await uidActual()).toBe(UID);
    });

    it("EN LÍNEA y sin sesión (cerró sesión) NO se inventa una cuenta", async () => {
        window.localStorage.setItem(CLAVE_UID_RECORDADO, JSON.stringify({ uid: UID, en: 1 }));
        estado.sesion = null;
        estado.error = null;
        expect(await uidActual()).toBeNull();
    });

    it("cerrar sesión borra la cuenta recordada", async () => {
        estado.sesion = { user: { id: UID } };
        await uidActual();
        for (const o of estado.oyentes) o("SIGNED_OUT", null);
        expect(uidRecordado()).toBeNull();
        olvidarUid();
        expect(uidRecordado()).toBeNull();
    });

    it("esErrorDeRed reconoce fallos de red y no rechazos del servidor", () => {
        expect(esErrorDeRed({ name: "AuthRetryableFetchError" })).toBe(true);
        expect(esErrorDeRed({ message: "TypeError: Failed to fetch" })).toBe(true);
        expect(esErrorDeRed({ message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 })).toBe(false);
        expect(esErrorDeRed(null)).toBe(false);
    });
});

describe("perfil y avatar sin internet", () => {
    beforeEach(() => {
        _ponerInstantaneaParaPruebas(crearInstantanea(crearAlmacenMemoria()));
        (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => "blob:http://localhost/avatar-local";
    });
    afterEach(() => _ponerInstantaneaParaPruebas(null));

    it("se guarda en línea (sin secretos, con avatar como blob) y se pinta de vuelta sin red", async () => {
        const traer = vi.fn(async () => new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { "content-type": "image/png" } }));
        guardarPerfilSinRed(UID, { display_name: "Alex", handle: "alex", avatar_url: "https://cdn.x/a.png", access_token: "no" }, { traer: traer as unknown as typeof fetch });
        await vi.waitFor(async () => expect(await avatarLocalSinRed(UID)).not.toBeNull());

        // Arranque en frío sin red: el fetch del avatar ya no se vuelve a pedir.
        const perfil = await leerPerfilSinRed(UID);
        expect(perfil).toEqual({ display_name: "Alex", handle: "alex", avatar_url: "https://cdn.x/a.png" });
        const para = await perfilParaSinRed(UID, perfil);
        expect(para?.display_name).toBe("Alex");
        expect(String(para?.avatar_url)).toMatch(/^blob:/);
        expect(para?.avatar_url_remota).toBe("https://cdn.x/a.png");
        expect(traer).toHaveBeenCalledTimes(1);
    });

    it("sin copia guardada devuelve null (no inventa un perfil)", async () => {
        expect(await perfilParaSinRed(UID, null)).toBeNull();
    });
});
