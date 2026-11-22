import { describe, expect, it } from "vitest";

import type { CanalId, RolMensaje, TipoMensaje } from "@/lib/mando/chat-director-tipos";

import {
    FUENTES_CROSS_MEDIA,
    TIPOS_UNIFICADOS,
    claveDeFuente,
    esDeAlex,
    filtrarPorFuente,
    fuentesLegibles,
    fusionarMensajes,
    mensajeAUnificado,
    normalizarFuente,
    ordenarPorTiempo,
    tipoUnificadoDe,
    type MensajeConFuente,
} from "../hilo-unificado";

function m(parcial: Partial<MensajeConFuente> & { id: string; t: string }): MensajeConFuente {
    const base: Omit<MensajeConFuente, "id" | "t"> = {
        de: "director",
        rol: "director" as RolMensaje,
        tipo: "mensaje" as TipoMensaje,
        texto: "…",
        canal: "mando" as CanalId,
    };
    return { ...base, ...parcial };
}

const ALEX = m({ id: "md-1-1000", t: "2026-11-13T10:00:00Z", de: "alex", rol: "alex", texto: "Hola", fuente: "direccion" });
const HERMES = m({ id: "cn-2-1000", t: "2026-11-13T10:01:00Z", de: "hermes", tipo: "respuesta", texto: "Hola", canal: "hermes", fuente: "puente:hermes-avisos" });
const PETICION = m({ id: "cn-3-1000", t: "2026-11-13T10:02:00Z", de: "astra", tipo: "informe", texto: "OK", fuente: "puente:peticiones" });
const AVISO = m({ id: "cn-4-1000", t: "2026-11-13T10:03:00Z", de: "vigilante", tipo: "aviso", texto: "Ola", fuente: "puente:avisos-directores" });

describe("hilo-unificado · normalización de la fuente", () => {
    it("acepta las claves de GEN1113 con y sin el prefijo «puente:»", () => {
        expect(normalizarFuente("direccion")).toBe("direccion");
        expect(normalizarFuente("mando")).toBe("direccion");
        expect(normalizarFuente("puente:hermes-avisos")).toBe("hermes-avisos");
        expect(normalizarFuente("hermes-avisos")).toBe("hermes-avisos");
        expect(normalizarFuente("puente:peticiones")).toBe("peticiones");
        expect(normalizarFuente("puente:avisos-directores")).toBe("avisos-directores");
    });

    it("una fuente ausente o desconocida cae en «direccion»", () => {
        expect(normalizarFuente(undefined)).toBe("direccion");
        expect(normalizarFuente("")).toBe("direccion");
        expect(normalizarFuente("otra-cosa")).toBe("direccion");
    });
});

describe("hilo-unificado · tipos y autoría", () => {
    it("mapea los tipos del contrato y cae en «mensaje»", () => {
        for (const t of TIPOS_UNIFICADOS) expect(tipoUnificadoDe(t)).toBe(t);
        expect(tipoUnificadoDe("otro")).toBe("mensaje");
    });

    it("reconoce a Alex también cuando escribe desde Genesis o por el puente de Telegram", () => {
        expect(esDeAlex(ALEX)).toBe(true);
        expect(esDeAlex(m({ id: "x", t: ALEX.t, de: "telegram-puente" }))).toBe(true);
        expect(esDeAlex(m({ id: "y", t: ALEX.t, de: "genesis-web-123" }))).toBe(true);
        expect(esDeAlex(HERMES)).toBe(false);
    });
});

describe("hilo-unificado · conversión y fusión", () => {
    it("convierte un mensaje y conserva fuente, origen, canal y metadatos", () => {
        expect(mensajeAUnificado(HERMES)).toMatchObject({
            id: HERMES.id,
            fuente: "hermes-avisos",
            origen: "hermes",
            esDeAlex: false,
            tipoUnificado: "respuesta",
            canal: "hermes",
        });
        expect(mensajeAUnificado(ALEX)).toMatchObject({ fuente: "direccion", esDeAlex: true, tipoUnificado: "mensaje" });
    });

    it("fusiona las cuatro fuentes sin duplicados por id y ordena por hora", () => {
        const r = fusionarMensajes([[ALEX, HERMES], [PETICION], [AVISO, ALEX]]);
        expect(r.map((x) => x.id)).toEqual([ALEX.id, HERMES.id, PETICION.id, AVISO.id]);
        expect(r.map((x) => x.fuente)).toEqual(["direccion", "hermes-avisos", "peticiones", "avisos-directores"]);
    });

    it("si un id se repite, manda la primera aparición con fuente conocida", () => {
        const sinFuente = m({ id: ALEX.id, t: ALEX.t, de: "alex", rol: "alex" });
        const r = fusionarMensajes([[sinFuente], [ALEX]]);
        expect(r).toHaveLength(1);
        expect(r[0]!.fuente).toBe("direccion");
    });

    it("descarta registros sin id o sin forma", () => {
        const roto = { t: ALEX.t } as unknown as MensajeConFuente;
        const r = fusionarMensajes([[ALEX, roto], [null as unknown as MensajeConFuente]]);
        expect(r.map((x) => x.id)).toEqual([ALEX.id]);
    });
});

describe("hilo-unificado · qué puede leer cada rol", () => {
    it("un dueño lee las cuatro fuentes; un desarrollador, solo dirección y avisos", () => {
        expect(fuentesLegibles(true)).toEqual(["direccion", "hermes-avisos", "peticiones", "avisos-directores"]);
        expect(fuentesLegibles(false)).toEqual(["direccion", "avisos-directores"]);
    });

    it("la clave de feed es «direccion» o «puente:<clave>»", () => {
        expect(claveDeFuente("direccion")).toBe("direccion");
        expect(claveDeFuente("hermes-avisos")).toBe("puente:hermes-avisos");
        expect(claveDeFuente("peticiones")).toBe("puente:peticiones");
        expect(claveDeFuente("avisos-directores")).toBe("puente:avisos-directores");
    });
});

describe("hilo-unificado · orden y filtro", () => {
    it("ordena por hora ascendente y desempata por id", () => {
        const t = [AVISO, ALEX, PETICION, HERMES].map(mensajeAUnificado);
        expect(ordenarPorTiempo(t).map((x) => x.id)).toEqual([ALEX.id, HERMES.id, PETICION.id, AVISO.id]);
        const mismoTiempo = [
            m({ id: "b", t: "2026-11-13T10:00:00Z" }),
            m({ id: "a", t: "2026-11-13T10:00:00Z" }),
        ].map(mensajeAUnificado);
        expect(ordenarPorTiempo(mismoTiempo).map((x) => x.id)).toEqual(["a", "b"]);
    });

    it("filtra por cada una de las cuatro fuentes", () => {
        const t = [ALEX, HERMES, PETICION, AVISO].map(mensajeAUnificado);
        for (const f of FUENTES_CROSS_MEDIA) expect(filtrarPorFuente(t, f)).toHaveLength(1);
        expect(filtrarPorFuente(t, "direccion")[0]!.id).toBe(ALEX.id);
    });
});
