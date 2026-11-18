/**
 * CTL1118B · la puerta de control mira la cuenta de AHORA en cada orden que entra.
 *
 * Lo que pasó (nodo Linux recién instalado, 18-11): la app arrancó el canal antes de que la persona iniciara sesión, se quedó
 * sin cuenta y contestó «otra-cuenta» a todo hasta reiniciar la app.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ uid: null as string | null, oyente: null as null | ((m: { cuerpo: unknown }) => void), vistas: [] as (string | null)[] }));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => estado.uid }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "aaaa0002-0000-4000-8000-000000000003" }));
vi.mock("@/ai/astraura/mesh/recipient-crypto", () => ({ decryptEnvelopeFor: async () => null, encryptEnvelopeFor: async () => null }));
vi.mock("../nativo", () => ({
    puenteNativoControl: async () => ({ disponible: () => false, abrir: async () => ({ ok: false }), orden: async () => ({ ok: false }), anotar: () => undefined, parar: async () => undefined }),
    alPararNativo: async () => () => undefined,
}));
vi.mock("../aviso-peticion", () => ({ crearAvisador: () => () => "si" }));
vi.mock("../aviso-peticion-salidas", () => ({ SALIDAS_REALES: {}, resolverLocal: () => null }));
vi.mock("../pantalla-origen", () => ({ registrarPuerta: () => undefined, revisarOrigen: () => undefined }));
vi.mock("@/lib/malla/transporte-universal", () => ({
    alRecibirMensaje: (_canal: string, f: (m: { cuerpo: unknown }) => void) => {
        estado.oyente = f;
        return () => undefined;
    },
    enviarMensaje: async () => undefined,
}));
vi.mock("../sesion", async (orig) => {
    const real = await orig<typeof import("../sesion")>();
    class PuertaEspia {
        constructor(private readonly d: { cuentaPropia: () => string | null }) {}
        async recibirSellado() {
            estado.vistas.push(this.d.cuentaPropia());
            return { respuesta: { tipo: "respuesta", nonce: "", ok: false, motivo: "forma" }, kr: null, orden: null };
        }
        sesionActiva() {
            return null;
        }
    }
    return { ...real, PuertaControl: PuertaEspia };
});

describe("CTL1118B · la cuenta de la puerta no se queda con la del arranque", () => {
    beforeEach(() => {
        estado.vistas.length = 0;
    });

    it("sin sesión al arrancar y con sesión después: la orden siguiente ya ve la cuenta; al cerrar sesión vuelve a no tenerla", async () => {
        estado.uid = null;
        const { iniciarCanalControl } = await import("../canal");
        await iniciarCanalControl();
        expect(estado.oyente).toBeTypeOf("function");

        estado.oyente!({ cuerpo: { v: 3 } });
        await vi.waitFor(() => expect(estado.vistas).toEqual([null]));

        estado.uid = "cuenta-alex"; // la persona inicia sesión DESPUÉS de abrir la app
        estado.oyente!({ cuerpo: { v: 3 } });
        await vi.waitFor(() => expect(estado.vistas).toEqual([null, "cuenta-alex"]));

        estado.uid = null; // cierra sesión: la puerta deja de tener cuenta («otra-cuenta» para todos)
        estado.oyente!({ cuerpo: { v: 3 } });
        await vi.waitFor(() => expect(estado.vistas).toEqual([null, "cuenta-alex", null]));
    });
});
