// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLAVE_PERFIL_ICONOS,
    EVENTO_PERFIL_ICONOS,
    guardarPerfilIconos,
    leerPerfilIconos,
    quitarPlantillaDelPerfil,
    suscribirPerfilIconos,
    _reiniciarCacheAlmacen,
} from "../almacen";
import { perfilVacio, VERSION_DISENO } from "../modelo";
import { plantillaDeSerie } from "../plantillas-serie";
import { esImagenPermitida, reducirAPng, paletaDeBlob } from "../imagen";

beforeEach(() => {
    window.localStorage.clear();
    _reiniciarCacheAlmacen();
});

describe("almacén del perfil de iconos", () => {
    it("sin nada guardado, perfil vacío", () => {
        expect(leerPerfilIconos().plantilla).toBeNull();
    });

    it("guardar y leer una plantilla, y avisar a los oyentes", () => {
        const oyente = vi.fn();
        const baja = suscribirPerfilIconos(oyente);
        const ok = guardarPerfilIconos({ v: VERSION_DISENO, plantilla: plantillaDeSerie("serie-trinity")!, actualizado: 7 });
        expect(ok).toBe(true);
        expect(oyente).toHaveBeenCalledTimes(1);
        expect(leerPerfilIconos().plantilla!.id).toBe("serie-trinity");
        baja();
        guardarPerfilIconos(perfilVacio(8));
        expect(oyente).toHaveBeenCalledTimes(1);
    });

    it("devuelve la misma referencia mientras no cambie lo guardado", () => {
        guardarPerfilIconos({ v: VERSION_DISENO, plantilla: plantillaDeSerie("serie-monocromo")!, actualizado: 1 });
        expect(leerPerfilIconos()).toBe(leerPerfilIconos());
    });

    it("quitar la plantilla ESCRIBE un perfil vacío (para que la cuenta lo propague)", () => {
        guardarPerfilIconos({ v: VERSION_DISENO, plantilla: plantillaDeSerie("serie-trinity")!, actualizado: 1 });
        expect(quitarPlantillaDelPerfil()).toBe(true);
        const crudo = window.localStorage.getItem(CLAVE_PERFIL_ICONOS);
        expect(crudo).not.toBeNull();
        expect(JSON.parse(crudo!).plantilla).toBeNull();
        expect(leerPerfilIconos().plantilla).toBeNull();
    });

    it("un valor corrupto o venido de otra cuenta se normaliza, no rompe", () => {
        window.localStorage.setItem(CLAVE_PERFIL_ICONOS, "{no json");
        expect(leerPerfilIconos().plantilla).toBeNull();
        _reiniciarCacheAlmacen();
        window.localStorage.setItem(CLAVE_PERFIL_ICONOS, JSON.stringify({ plantilla: { nombre: "Hostil", porDefecto: { glifo: { tipo: "imagen", src: "https://rastreo.example/x.gif" } } } }));
        expect(leerPerfilIconos().plantilla).toBeNull();
    });

    it("si el almacenamiento está bloqueado, no lanza", () => {
        const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("lleno"); });
        expect(guardarPerfilIconos(perfilVacio())).toBe(false);
        spy.mockRestore();
    });

    it("el evento propio existe y se despacha al guardar", () => {
        const f = vi.fn();
        window.addEventListener(EVENTO_PERFIL_ICONOS, f);
        guardarPerfilIconos(perfilVacio(1));
        window.removeEventListener(EVENTO_PERFIL_ICONOS, f);
        expect(f).toHaveBeenCalled();
    });
});

describe("imágenes", () => {
    it("solo acepta mapas de bits razonables", () => {
        expect(esImagenPermitida({ type: "image/png", size: 1000 }).ok).toBe(true);
        expect(esImagenPermitida({ type: "image/svg+xml", size: 1000 }).ok).toBe(false);
        expect(esImagenPermitida({ type: "text/html", size: 10 }).ok).toBe(false);
        expect(esImagenPermitida({ type: "image/png", size: 6 * 1024 * 1024 })).toMatchObject({ ok: false });
    });
    it("sin lienzo en el navegador no inventa nada: devuelve null / vacío", async () => {
        const b = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
        expect(await reducirAPng(b)).toBeNull();
        expect(await paletaDeBlob(b)).toEqual([]);
    });
});
