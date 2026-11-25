import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PuertaControl, MOTIVO_TERMINADO, type DepsPuerta, type SesionActiva, type PermisoControl, type Controlador, finDeLimite, duracionDeLimite, limiteNormalizado, FILTRO_PROPIA, FILTRO_OTRA_CUENTA, type LimiteSesion, type FiltroPermisos } from "../sesion";
import { SesionHacia, RegistroSesiones, type MandarSesion, type SesionSaliente } from "../canal";
import { opcionInicial, finElegido, opcionesPara, topeMinimos, textoRestante } from "@/components/control-remoto/banda-control";
import { leerOrden, verificarFirma, huellaDeSpki, DESFASE_MAX_MS, VIDA_ORDEN_MS } from "../orden";

vi.mock("../orden", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        leerOrden: vi.fn(),
        verificarFirma: vi.fn(),
        huellaDeSpki: vi.fn(),
    };
});

function crearDepsPuerta(overrides: Partial<DepsPuerta> = {}): DepsPuerta & { mocks: { nativoAbrir: ReturnType<typeof vi.fn>; nativoParar: ReturnType<typeof vi.fn>; nativoOrden: ReturnType<typeof vi.fn> } } {
    const permiso: PermisoControl = { encendido: true, nivel: "controlar", controladores: [], pendientes: [] };
    let sesiones = new Map<string, SesionActiva>();
    let terminadoPor = new Set<string>();
    let caducadaPor: "latidos" | "limite" | null = null;
    let aMano: string | null = null;

    const nativoAbrir = vi.fn().mockResolvedValue({ ok: true, token: "token-test" });
    const nativoParar = vi.fn().mockResolvedValue(undefined);
    const nativoOrden = vi.fn().mockResolvedValue({ ok: true });

    const deps = {
        subtle: globalThis.crypto.subtle,
        ahora: () => Date.now(),
        cuentaPropia: () => "cuenta-test",
        neuronaPropia: () => "neurona-test",
        leerPermiso: () => permiso,
        guardarPermiso: (p: PermisoControl) => { permiso.encendido = p.encendido; permiso.nivel = p.nivel; permiso.controladores = p.controladores; permiso.pendientes = p.pendientes; },
        ejecutar: vi.fn().mockResolvedValue({ ok: true }),
        anotar: vi.fn(),
        azarHex: () => "0000000000000000",
        alCambiar: vi.fn(),
        nativo: {
            disponible: () => true,
            abrir: nativoAbrir,
            parar: nativoParar,
            orden: nativoOrden,
            anotar: vi.fn(),
        },
        abrirSobre: vi.fn().mockResolvedValue({ ok: true, orden: {}, kr: new Uint8Array(16) }),
        avisarPeticion: vi.fn().mockReturnValue("si"),
        ...overrides,
    };
    return { ...deps, mocks: { nativoAbrir, nativoParar, nativoOrden } } as DepsPuerta & { mocks: { nativoAbrir: ReturnType<typeof vi.fn>; nativoParar: ReturnType<typeof vi.fn>; nativoOrden: ReturnType<typeof vi.fn> } };
}

function b64urlEncode(str: string): string {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function crearOrdenValida(overrides: Partial<{
    de: string;
    cuenta: string;
    para: string;
    nivel: "ver" | "controlar";
    seq: number;
    nonce: string;
    accion: { nombre: string; args: Record<string, unknown> };
}> = {}) {
    const ahora = Date.now();
    const carga = {
        aud: "starseed.control-neuronas.v1",
        v: 1,
        de: overrides.de ?? "abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
        cuenta: overrides.cuenta ?? "cuenta-test",
        para: overrides.para ?? "neurona-test",
        nivel: overrides.nivel ?? "controlar",
        sesion: null,
        seq: overrides.seq ?? 1,
        nonce: overrides.nonce ?? "nonce-valido-123",
        t: new Date(ahora).toISOString(),
        caduca: new Date(ahora + 120_000).toISOString(),
        accion: overrides.accion ?? { nombre: "abrir-sesion", args: {} },
    };
    const firmaFicticia = b64urlEncode("x".repeat(64));
    return { v: 1, carga: b64urlEncode(JSON.stringify(carga)), firma: firmaFicticia };
}

function crearMandarMock(): MandarSesion {
    return vi.fn().mockImplementation((..._args: unknown[]) => Promise.resolve({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" })) as unknown as MandarSesion;
}

describe("CTL1124F - Control remoto: terminar sesión no reabre sola", () => {
    describe("PuertaControl.terminar / terminarToken", () => {
        beforeEach(() => {
            vi.clearAllMocks();
            (leerOrden as any).mockImplementation((x: any) => {
                if (!x || typeof x !== "object" || x.v !== 1 || typeof x.carga !== "string" || typeof x.firma !== "string") return null;
                try {
                    const cargab64 = x.carga.replace(/-/g, "+").replace(/_/g, "/");
                    const firmab64 = x.firma.replace(/-/g, "+").replace(/_/g, "/");
                    const bytes = Uint8Array.from(atob(cargab64), c => c.charCodeAt(0));
                    const firma = Uint8Array.from(atob(firmab64), c => c.charCodeAt(0));
                    if (firma.length !== 64) return null;
                    const carga = JSON.parse(new TextDecoder().decode(bytes));
                    return { carga, bytes, firma };
                } catch {
                    return null;
                }
            });
            (verificarFirma as any).mockResolvedValue(true);
            (huellaDeSpki as any).mockResolvedValue("abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456");
        });

        it("termina la sesión y marca al controlador en terminadoPor", async () => {
            const deps = crearDepsPuerta();
            const puerta = new PuertaControl(deps);
            
            const controlador: Controlador = {
                huella: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
                spki: "spki-test",
                cuenta: "cuenta-test",
                nombre: "Neurona Test",
                neurona: "neurona-test",
                desde: new Date().toISOString(),
                limite: { tipo: "sin-limite" },
                aceptadoEn: new Date().toISOString(),
            };
            deps.guardarPermiso({ ...deps.leerPermiso(), controladores: [controlador] });
            
            deps.mocks.nativoAbrir.mockResolvedValue({ ok: true, token: "token-123" });
            
            const orden = crearOrdenValida({ accion: { nombre: "abrir-sesion", args: {} } });
            
            const r = await puerta.recibir(orden);
            expect(r.ok).toBe(true);
            expect(puerta.sesionActiva()).not.toBeNull();
            
            puerta.terminar(MOTIVO_TERMINADO);
            
            expect(puerta.sesionActiva()).toBeNull();
            expect(deps.mocks.nativoParar).toHaveBeenCalledWith(MOTIVO_TERMINADO);
        });

        it("terminarToken termina solo la sesión del token dado", async () => {
            const deps = crearDepsPuerta();
            const puerta = new PuertaControl(deps);
            
            const controlador: Controlador = {
                huella: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
                spki: "spki-test",
                cuenta: "cuenta-test",
                nombre: "Neurona Test",
                neurona: "neurona-test",
                desde: new Date().toISOString(),
            };
            deps.guardarPermiso({ ...deps.leerPermiso(), controladores: [controlador] });
            
            deps.mocks.nativoAbrir.mockResolvedValue({ ok: true, token: "token-123" });
            
            const orden = crearOrdenValida({ accion: { nombre: "abrir-sesion", args: {} } });
            
            const r = await puerta.recibir(orden);
            expect(r.ok).toBe(true);
            const token = (r.resultado as { sesion: string }).sesion;
            
            const result = puerta.terminarToken(token, MOTIVO_TERMINADO);
            
            expect(result).toBe(true);
            expect(puerta.sesionActiva()).toBeNull();
        });
    });

    describe("SesionHacia - latido no reabre tras terminar-por-el-dueno", () => {
        let registro: RegistroSesiones;
        let mandarMock: MandarSesion;
        let sesion: SesionHacia;

        beforeEach(() => {
            registro = new RegistroSesiones();
            mandarMock = crearMandarMock();
            sesion = new SesionHacia("neurona-destino", mandarMock, registro);
        });

        afterEach(() => {
            sesion.cerrar();
        });

        it("latir para cuando recibe 'terminado-por-el-dueno' y no reabre", async () => {
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
            
            await sesion.abrir();
            expect(registro.sesionesSalientes().length).toBe(1);
            
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: false, motivo: "parada-nativa", detalle: { motivo: "terminado-por-el-dueno" } });
            
            const result = await sesion.latir();
            
            expect(result).toBe(false);
            expect((sesion as any).token).toBeNull();
        });

        it("latir para cuando recibe 'permiso-apagado' y no reabre", async () => {
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
            
            await sesion.abrir();
            
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: false, motivo: "permiso-apagado" });
            
            const result = await sesion.latir();
            
            expect(result).toBe(false);
            expect((sesion as any).token).toBeNull();
        });

        it("latir para cuando recibe 'limite-cumplido' y no reabre", async () => {
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
            
            await sesion.abrir();
            
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: false, motivo: "limite-cumplido" });
            
            const result = await sesion.latir();
            
            expect(result).toBe(false);
            expect((sesion as any).token).toBeNull();
        });
    });

    describe("RegistroSesiones.terminar", () => {
        it("elimina la sesión y manda cerrar-sesion", async () => {
            const registro = new RegistroSesiones();
            const mandarMock: MandarSesion = vi.fn().mockResolvedValue({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" });
            
            (mandarMock as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
            await registro.abrir("neurona-test", mandarMock);
            
            expect(registro.sesionesSalientes().length).toBe(1);
            
            const result = await registro.terminar("neurona-test", mandarMock);
            
            expect(result).toBe(true);
            expect(registro.sesionesSalientes().length).toBe(0);
            expect(mandarMock).toHaveBeenCalledWith("cerrar-sesion", {}, expect.objectContaining({ sesion: "token-123" }));
        });
    });

    describe("Límites de sesión - funciones puras", () => {
        it("finDeLimite devuelve null para sin-limite", () => {
            const limite: LimiteSesion = { tipo: "sin-limite" };
            expect(finDeLimite(limite, Date.now())).toBeNull();
        });

        it("finDeLimite calcula fin para minutos", () => {
            const limite: LimiteSesion = { tipo: "minutos", minutos: 15 };
            const ahora = Date.now();
            const fin = finDeLimite(limite, ahora);
            expect(fin).toBe(ahora + 15 * 60_000);
        });

        it("duracionDeLimite devuelve null para sin-limite", () => {
            expect(duracionDeLimite({ tipo: "sin-limite" }, Date.now())).toBeNull();
        });

        it("limiteNormalizado respeta el máximo del filtro", () => {
            const filtro: FiltroPermisos = { porDefecto: { tipo: "minutos", minutos: 15 }, maximo: { tipo: "minutos", minutos: 30 } };
            const limite: LimiteSesion = { tipo: "minutos", minutos: 60 };
            const resultado = limiteNormalizado(limite, filtro, Date.now());
            expect(resultado).toEqual({ tipo: "minutos", minutos: 30 });
        });

        it("opcionesPara en propia permite sin-limite", () => {
            expect(opcionesPara(true, null)).toEqual(["sin-limite", "15-min", "1-hora", "hasta"]);
        });

        it("opcionesPara en ajena con tope 15 min solo permite 15-min y hasta", () => {
            expect(opcionesPara(false, 15)).toEqual(["15-min", "hasta"]);
        });

        it("opcionInicial en propia es sin-limite", () => {
            expect(opcionInicial(true, null)).toBe("sin-limite");
        });

        it("opcionInicial en ajena es 15-min", () => {
            expect(opcionInicial(false, 15)).toBe("15-min");
        });

        it("finElegido valida sin-limite en propia", () => {
            const resultado = finElegido("sin-limite", "", Date.now(), null, true);
            expect(resultado.ok).toBe(true);
            expect((resultado as { ok: true; fin: number | null }).fin).toBeNull();
        });

        it("finElegido rechaza sin-limite en ajena con tope", () => {
            const resultado = finElegido("sin-limite", "", Date.now(), 15, false);
            expect(resultado.ok).toBe(false);
        });

        it("topeMinimos devuelve null para propia cuenta", () => {
            expect(topeMinimos({ cuenta: "mi-cuenta" }, "mi-cuenta")).toBeNull();
        });

        it("topeMinimos devuelve 15 para pública sin filtro", () => {
            expect(topeMinimos({ publico: true }, "otra-cuenta")).toBe(15);
        });

        it("textoRestante devuelve null para sin límite", () => {
            expect(textoRestante(null, Date.now())).toBeNull();
        });
    });

    describe("SesionHacia.sondear no deja sesión abierta", () => {
        let registro: RegistroSesiones;
        let mandarMock: MandarSesion;
        let sesion: SesionHacia;

        beforeEach(() => {
            registro = new RegistroSesiones();
            mandarMock = crearMandarMock();
            sesion = new SesionHacia("neurona-destino", mandarMock, registro);
        });

        afterEach(() => {
            sesion.cerrar();
        });

        it("sondear abre y cierra la sesión si no existía", async () => {
            (mandarMock as unknown as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } })
                .mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { estado: "aceptada" } })
                .mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" });
            
            const result = await sesion.sondear();
            
            expect(result.ok).toBe(true);
            expect(registro.sesionesSalientes().length).toBe(0);
        });

        it("sondear no cierra la sesión si ya existía", async () => {
            (mandarMock as unknown as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
            
            await sesion.abrir();
            expect(registro.sesionesSalientes().length).toBe(1);
            
            (mandarMock as unknown as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { estado: "aceptada" } });
            
            const result = await sesion.sondear();
            
            expect(result.ok).toBe(true);
            expect(registro.sesionesSalientes().length).toBe(1);
        });
    });
});