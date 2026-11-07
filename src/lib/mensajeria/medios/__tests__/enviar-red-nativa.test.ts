/**
 * (MLL1107A) Un mensaje a una neurona de tu cuenta que está en la MISMA red: el canal local de la app
 * nativa se asegura antes de elegir el medio (también con internet) y, si no se puede usar, la vía dice
 * por qué. Caso real del 07-11: la Mac (app 0.5.0) mandó a la tablet por «Servidor StarSeed» sin decir
 * nada del canal local. Contrato: architecture/datos-por-la-malla.md §6.6.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/malla/transporte-universal", () => ({
    prepararEnlaceNativo: vi.fn(),
    enlacesDisponibles: vi.fn(),
}));

import * as transporte from "@/lib/malla/transporte-universal";
import { candidatoRedNativaSinEnlace, candidatoServidor, candidatosMalla, conDiagnosticoNativo } from "../enviar";
import { etiquetaVia, mediosParaEnviar } from "../medios";
import type { CandidatoMedio, PreferenciasMedio } from "../tipos";

const auto: PreferenciasMedio = { modo: "auto", elegidos: [], siNinguno: "esperar" };
const TABLET = "e0b9faf2-b6d8-44c2-9d6c-a99f000178f7";
const SIN_RESPUESTA = {
    estado: "sin-respuesta",
    ip: "192.168.0.12",
    motivo: "se oye en 192.168.0.12, pero su app no contestó al saludo firmado (app 0.5.0 o anterior, sin vínculo ni clave de tu cuenta, o firma distinta)",
};

const enlaceNativo = {
    id: "nativo:192.168.0.12",
    tipo: "nativo",
    etiqueta: "Maggaboard · red local",
    alcanza: { neuronDeviceId: TABLET },
    abierto: true,
    sinInternet: true,
    ruta: "misma-red-local",
    rttMs: 9,
    capacidadKbps: null,
    admite: { mensaje: true, archivo: true, flujo: false },
    consentido: true,
};

beforeEach(() => {
    vi.mocked(transporte.prepararEnlaceNativo).mockReset();
    vi.mocked(transporte.enlacesDisponibles).mockReset();
});

describe("conDiagnosticoNativo — por qué no fue por la red local", () => {
    it("sin enlace nativo hacia ese destino, el motivo del canal va como descarte y sale por el servidor", () => {
        const c = conDiagnosticoNativo([], SIN_RESPUESTA);
        const plan = mediosParaEnviar(auto, [...c, candidatoServidor(true)], { tipo: "neurona" });
        expect(plan.pasos.map((p) => p.medio)).toEqual(["servidor"]);
        expect(plan.descartados).toContainEqual({
            medio: "local",
            enlaceId: "nativo:192.168.0.12",
            etiqueta: "Red local (app nativa)",
            motivo: SIN_RESPUESTA.motivo,
        });
    });

    it("en el navegador (null) o con el enlace ya ligado no añade nada", () => {
        const base: CandidatoMedio[] = [{ enlaceId: "nativo:192.168.0.12", medio: "local", etiqueta: "x", abierto: true, llega: true, rttMs: 3, ruta: "misma-red-local" }];
        expect(conDiagnosticoNativo(base, null)).toBe(base);
        expect(conDiagnosticoNativo(base, { estado: "ligada", ip: "192.168.0.12", motivo: "ligada" })).toBe(base);
        expect(conDiagnosticoNativo(base, SIN_RESPUESTA)).toBe(base);
    });

    it("un enlace nativo hacia OTRA neurona no tapa el motivo", () => {
        const otra: CandidatoMedio = { enlaceId: "nativo:192.168.0.40", medio: "local", etiqueta: "Mac vieja", abierto: true, llega: false, rttMs: null, ruta: null };
        expect(conDiagnosticoNativo([otra], SIN_RESPUESTA)).toEqual([otra, candidatoRedNativaSinEnlace(SIN_RESPUESTA)]);
    });
});

describe("candidatosMalla — a una neurona, primero se asegura el canal local", () => {
    it("ligada: con internet, en automático va PRIMERO por la red local y la pastilla lo dice", async () => {
        vi.mocked(transporte.prepararEnlaceNativo).mockResolvedValue({ estado: "ligada", ip: "192.168.0.12", motivo: "ligada en 192.168.0.12 (misma cuenta)", esperadoMs: 40 });
        vi.mocked(transporte.enlacesDisponibles).mockResolvedValue([enlaceNativo] as never);
        const c = await candidatosMalla({ neuronDeviceId: TABLET });
        expect(transporte.prepararEnlaceNativo).toHaveBeenCalledWith(TABLET, undefined);
        const plan = mediosParaEnviar(auto, [...c, candidatoServidor(true)], { tipo: "neurona" });
        expect(plan.pasos.map((p) => p.enlaceId)).toEqual(["nativo:192.168.0.12", "servidor"]);
        expect(
            etiquetaVia({ medio: "local", direccion: "sale", enlaceId: "nativo:192.168.0.12", latenciaMs: 9, latenciaFuente: "acuse", confirmado: true, en: 1 }),
        ).toBe("Mesh · Red local (app nativa) · 9 ms ✓");
    });

    it("la otra app no contesta (0.5.0): el servidor lleva el mensaje y la vía guarda el porqué", async () => {
        vi.mocked(transporte.prepararEnlaceNativo).mockResolvedValue({ ...SIN_RESPUESTA, esperadoMs: 0 });
        vi.mocked(transporte.enlacesDisponibles).mockResolvedValue([]);
        const c = await candidatosMalla({ neuronDeviceId: TABLET }, { esperarNativoMs: 800 });
        expect(transporte.prepararEnlaceNativo).toHaveBeenCalledWith(TABLET, 800);
        expect(c).toEqual([candidatoRedNativaSinEnlace(SIN_RESPUESTA)]);
    });

    it("a una cuenta (chats de personas) no se espera al canal local", async () => {
        vi.mocked(transporte.enlacesDisponibles).mockResolvedValue([]);
        expect(await candidatosMalla({ uid: "ana" })).toEqual([]);
        expect(transporte.prepararEnlaceNativo).not.toHaveBeenCalled();
    });
});
