import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import type { DatosNavegador } from "@/lib/xr/capacidades";
import { DATOS_SIN_SONDEO, TOPE_SONDEO_MS, sondearNavegador } from "../sondeo-navegador";
import type { EntornoNavegador, XRInyectable } from "../sondeo-navegador";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

const entorno = (extra: Partial<EntornoNavegador> = {}): EntornoNavegador => ({
    ua: WIN, seguro: true, maxTouchPoints: 0, webgl2: () => true, webgpu: false, standalone: false, digitalGoods: false, ...extra,
});
const xrDe = (vr: boolean, ar: boolean, conOferta = false): XRInyectable => ({
    isSessionSupported: async (m) => (m === "immersive-vr" ? vr : ar),
    ...(conOferta ? { offerSession: () => undefined } : {}),
});
/** Un navegador que contesta lo que sea (para probar respuestas que no son booleanas). */
const xrQueResponde = (valor: unknown): XRInyectable => ({ isSessionSupported: () => Promise.resolve(valor).then((v) => v as boolean) });
/** Un `navigator.xr` malformado (sin lo que el tipo exige). */
const xrRaro = (parcial: object): XRInyectable => parcial as XRInyectable;
const tuberia = (d: DatosNavegador, o?: Parameters<typeof evaluarCapacidades>[1]) => {
    const capacidades = evaluarCapacidades(d, o);
    return { capacidades, plan: planificarEntrada(capacidades, { instalada: d.instalada }) };
};

afterEach(() => { vi.useRealTimers(); });

describe("sondearNavegador · datos del núcleo", () => {
    it("Quest 3 instalada con VR, AR y offerSession: las 10 claves exactas de DatosNavegador", async () => {
        const d = await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true, true), standalone: true }));
        expect(d).toEqual({ ua: QUEST3, seguro: true, tieneXR: true, vr: true, ar: true, ofreceSesion: true, tactil: false, webgl2: true, webgpu: false, instalada: true });
        expect(Object.keys(d).sort()).toEqual(Object.keys(DATOS_SIN_SONDEO).sort());
    });

    it("pasado por el núcleo, Quest instalada es visor con VR y AR y se abre sola", async () => {
        const { capacidades, plan } = tuberia(await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true), standalone: true })));
        expect(capacidades.visor).toBe(true);
        expect(capacidades.modos).toEqual(expect.arrayContaining(["vr-inmersivo", "ar-passthrough"]));
        expect(plan.estrategia).toBe("auto-al-abrir");
    });

    it("Quest sin instalar: con offerSession lo ofrece el navegador; sin él, botón universal que pide un gesto", async () => {
        const conOferta = tuberia(await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true, true) })));
        expect(conOferta.plan.estrategia).toBe("oferta-navegador");
        const sinOferta = tuberia(await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true) })));
        expect(sinOferta.plan.estrategia).toBe("boton-universal");
        expect(sinOferta.plan.requiereGesto).toBe(true);
    });

    it("auto-al-abrir SOLO con Quest instalada: ni un Pixel con VR instalado ni un Quest sin instalar", async () => {
        const pixel = tuberia(await sondearNavegador(entorno({ ua: PIXEL, xr: xrDe(true, true), standalone: true, maxTouchPoints: 5 })));
        expect(pixel.plan.estrategia).not.toBe("auto-al-abrir");
        const quest = tuberia(await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true) })));
        expect(quest.plan.estrategia).not.toBe("auto-al-abrir");
    });

    it("iPhone sin navigator.xr: ni VR ni AR (false, no «comprobando»), táctil y aviso de Safari", async () => {
        const d = await sondearNavegador(entorno({ ua: IPHONE, maxTouchPoints: 5 }));
        expect(d).toMatchObject({ tieneXR: false, vr: false, ar: false, tactil: true });
        const { capacidades } = tuberia(d);
        expect(capacidades.recomendado).toBe("3d-pantalla");
        expect(capacidades.avisos.join(" ")).toMatch(/Safari/);
        expect(capacidades.avisos.join(" ")).not.toMatch(/Aún se está comprobando/);
    });

    it("distingue Vision Pro (UA de Mac + VR), iPad (UA de Mac + táctil) y un Chrome de Mac sin visor", async () => {
        const vision = await sondearNavegador(entorno({ ua: MAC, xr: xrDe(true, false) }));
        expect(tuberia(vision).capacidades.plataforma).toBe("visionos");
        const ipad = await sondearNavegador(entorno({ ua: MAC, maxTouchPoints: 5 }));
        expect(tuberia(ipad).capacidades.plataforma).toBe("ios");
        const chrome = await sondearNavegador(entorno({ ua: MAC, xr: xrDe(false, false) }));
        expect(tuberia(chrome).capacidades.plataforma).toBe("escritorio");
    });

    it("sin https no hay sesión inmersiva y se explica", async () => {
        const { capacidades } = tuberia(await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true), seguro: false })));
        expect(capacidades.modos).not.toContain("vr-inmersivo");
        expect(capacidades.avisos.join(" ")).toMatch(/https/);
    });

    it("instalada vale por cualquiera de las dos señales: app standalone o PWA de Quest", async () => {
        expect((await sondearNavegador(entorno({ standalone: true }))).instalada).toBe(true);
        expect((await sondearNavegador(entorno({ digitalGoods: true }))).instalada).toBe(true);
        expect((await sondearNavegador(entorno())).instalada).toBe(false);
    });

    it("ofreceSesion solo si offerSession es una función (no por la marca ni por un valor cualquiera)", async () => {
        const conValor = (offerSession: unknown): XRInyectable => ({ isSessionSupported: async () => true, offerSession });
        expect((await sondearNavegador(entorno({ ua: QUEST3, xr: conValor(() => undefined) }))).ofreceSesion).toBe(true);
        expect((await sondearNavegador(entorno({ ua: QUEST3, xr: conValor(true) }))).ofreceSesion).toBe(false);
        expect((await sondearNavegador(entorno({ ua: QUEST3, xr: conValor({}) }))).ofreceSesion).toBe(false);
        expect((await sondearNavegador(entorno({ ua: QUEST3, xr: xrDe(true, true) }))).ofreceSesion).toBe(false);
    });

    it("un navigator.xr sin isSessionSupported no cuenta como WebXR", async () => {
        const raro = xrRaro({ offerSession: () => undefined });
        expect(await sondearNavegador(entorno({ xr: raro }))).toMatchObject({ tieneXR: false, vr: false, ar: false });
    });

    it("táctil con más de un punto, WebGPU y WebGL2 mapeados; un WebGL2 que lanza es false sin romper nada", async () => {
        expect((await sondearNavegador(entorno({ maxTouchPoints: 0 }))).tactil).toBe(false);
        expect((await sondearNavegador(entorno({ maxTouchPoints: 1 }))).tactil).toBe(false);
        expect((await sondearNavegador(entorno({ maxTouchPoints: 5 }))).tactil).toBe(true);
        expect((await sondearNavegador(entorno({ webgpu: true }))).webgpu).toBe(true);
        const roto = await sondearNavegador(entorno({ ua: QUEST3, webgl2: () => { throw new Error("sin contexto"); } }));
        expect(roto).toMatchObject({ webgl2: false, ua: QUEST3, seguro: true });
    });
});

describe("sondearNavegador · fallos del navegador", () => {
    it("isSessionSupported que RECHAZA da false y la otra consulta sigue", async () => {
        const xr: XRInyectable = { isSessionSupported: (m) => (m === "immersive-vr" ? Promise.reject(new Error("no")) : Promise.resolve(true)) };
        expect(await sondearNavegador(entorno({ xr }))).toMatchObject({ tieneXR: true, vr: false, ar: true });
    });

    it("isSessionSupported que LANZA de forma síncrona da false y se conservan ua, seguro y el resto", async () => {
        const xr: XRInyectable = { isSessionSupported: () => { throw new Error("explota"); } };
        expect(await sondearNavegador(entorno({ ua: QUEST3, xr }))).toMatchObject({ ua: QUEST3, seguro: true, tieneXR: true, vr: false, ar: false, webgl2: true });
    });

    it("una respuesta que no es booleana (texto, undefined) no se da por buena", async () => {
        expect(await sondearNavegador(entorno({ xr: xrQueResponde("sí") }))).toMatchObject({ vr: false, ar: false });
        expect(await sondearNavegador(entorno({ xr: xrQueResponde(undefined) }))).toMatchObject({ vr: false, ar: false });
    });

    it("si nunca contesta: null exactamente a los 1500 ms y no deja relojes vivos", async () => {
        vi.useFakeTimers();
        const xr: XRInyectable = { isSessionSupported: () => new Promise<boolean>(() => undefined) };
        let datos: DatosNavegador | undefined;
        const pendiente = sondearNavegador(entorno({ xr })).then((d) => { datos = d; });
        await vi.advanceTimersByTimeAsync(TOPE_SONDEO_MS - 1);
        expect(datos).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        await pendiente;
        expect(TOPE_SONDEO_MS).toBe(1500);
        expect(datos).toMatchObject({ tieneXR: true, vr: null, ar: null });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("si contesta rápido tampoco deja el reloj del tope", async () => {
        vi.useFakeTimers();
        const d = await sondearNavegador(entorno({ xr: xrDe(true, false) }));
        expect(d).toMatchObject({ vr: true, ar: false });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("un VR que contesta y un AR que no: VR resuelto y AR null", async () => {
        vi.useFakeTimers();
        const xr: XRInyectable = { isSessionSupported: (m) => (m === "immersive-vr" ? Promise.resolve(true) : new Promise<boolean>(() => undefined)) };
        const pendiente = sondearNavegador(entorno({ xr }));
        await vi.advanceTimersByTimeAsync(TOPE_SONDEO_MS);
        expect(await pendiente).toMatchObject({ vr: true, ar: null });
    });
});

describe("sondearNavegador · sin navegador", () => {
    it("sin window y sin argumento: todo falso, vr/ar null, sin lanzar, y es una COPIA", async () => {
        expect(typeof window).toBe("undefined");
        const d = await sondearNavegador();
        expect(d).toEqual(DATOS_SIN_SONDEO);
        expect(d).not.toBe(DATOS_SIN_SONDEO);
        d.vr = true;
        expect(DATOS_SIN_SONDEO.vr).toBeNull();
        expect(await sondearNavegador()).not.toBe(d);
    });

    it("los datos sin sondear están congelados", () => {
        expect(Object.isFrozen(DATOS_SIN_SONDEO)).toBe(true);
    });
});
