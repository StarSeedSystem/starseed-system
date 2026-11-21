import { describe, expect, it } from "vitest";

import {
    fusionarMensajes,
    type MensajeUnificado,
    type FuenteCrossMedia,
    ordenarPorTiempo,
    filtrarPorFuente,
    mensajeAUnificado,
    tipoMensajeUnificado,
} from "../hilo-unificado";

import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";
import type { CanalId } from "@/lib/mando/chat-director-tipos";

type MensajeConFuente = MensajeDirector & { fuente: string };

const M = (id: string, t: string, de: string, rol: "alex" | "director", tipo: string, texto: string, canal: CanalId, fuente: string): MensajeConFuente => ({
    id, t, de, rol, tipo: tipo as any, texto, canal, fuente,
});

const ALEX = M("md-1-1000", "2026-11-13T10:00:00Z", "alex", "alex", "mensaje", "Hola", "mando", "direccion");
const HERMES = M("cn-2-1000", "2026-11-13T10:01:00Z", "hermes", "director", "respuesta", "Hola", "hermes", "puente:hermes-avisos");
const PET = M("cn-3-1000", "2026-11-13T10:02:00Z", "astra", "director", "informe", "OK", "mando", "puente:peticiones");
const AVISO = M("cn-4-1000", "2026-11-13T10:03:00Z", "dir", "director", "aviso", "Ola", "mando", "puente:avisos-directores");

describe("hilo-unificado - funciones puras", () => {
    it("fusionarMensajes combina sin duplicados y ordena", () => {
        const r = fusionarMensajes([[ALEX, HERMES], [PET], [AVISO, ALEX]]);
        expect(r).toHaveLength(4);
        expect(r.map((m) => m.id)).toEqual([ALEX.id, HERMES.id, PET.id, AVISO.id]);
    });

    it("ordenarPorTiempo ordena por epoch ascendente", () => {
        const unificados = [AVISO, ALEX, PET, HERMES].map(mensajeAUnificado);
        const r = ordenarPorTiempo(unificados);
        expect(r.map((m) => m.id)).toEqual([ALEX.id, HERMES.id, PET.id, AVISO.id]);
    });

    it("filtrarPorFuente filtra por cada fuente normalizada", () => {
        const t = [ALEX, HERMES, PET, AVISO].map(mensajeAUnificado);
        expect(filtrarPorFuente(t, "direccion")).toHaveLength(1);
        expect(filtrarPorFuente(t, "hermes-avisos")).toHaveLength(1);
        expect(filtrarPorFuente(t, "peticiones")).toHaveLength(1);
        expect(filtrarPorFuente(t, "avisos-directores")).toHaveLength(1);
        expect(filtrarPorFuente(t, "direccion")).toHaveLength(1);
    });

    it("mensajeAUnificado convierte y marca origen", () => {
        expect(mensajeAUnificado(ALEX)).toMatchObject({ fuente: "direccion", origen: "alex", esDeAlex: true, tipoUnificado: "mensaje" });
        expect(mensajeAUnificado(HERMES)).toMatchObject({ fuente: "hermes-avisos", origen: "hermes", esDeAlex: false, tipoUnificado: "respuesta" });
    });

    it("tipoMensajeUnificado mapea tipos", () => {
        expect(tipoMensajeUnificado("mensaje")).toBe("mensaje");
        expect(tipoMensajeUnificado("respuesta")).toBe("respuesta");
        expect(tipoMensajeUnificado("informe")).toBe("informe");
        expect(tipoMensajeUnificado("aviso")).toBe("aviso");
        expect(tipoMensajeUnificado("actualizacion")).toBe("actualizacion");
        expect(tipoMensajeUnificado("uso")).toBe("uso");
        expect(tipoMensajeUnificado("x")).toBe("mensaje");
    });

    it("FuenteCrossMedia incluye las 4 fuentes", () => {
        const f: FuenteCrossMedia[] = ["direccion", "hermes-avisos", "peticiones", "avisos-directores"];
        expect(f).toHaveLength(4);
    });
});