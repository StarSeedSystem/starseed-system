import { describe, expect, it } from "vitest";
import capasJson from "../../../../config/capas-astraura.json";
import { catalogoRecursos, modelosDeCapas } from "../catalogo";

type Cruda = Record<string, unknown>;
const CONFIG = capasJson as { capas: Cruda[] };
const COLIBRI = CONFIG.capas.filter((c) => String(c.id).startsWith("colibri-") && c.estado !== "retirado");
const capas = modelosDeCapas(capasJson);
const colibri = capas.filter((m) => m.runtime === "colibri");
const porId = new Map(capas.map((m) => [m.id, m]));
const cruda = (id: string): Cruda => COLIBRI.find((c) => c.id === id) as Cruda;
const arribaCent = (x: number): number => Math.ceil(x * 100 - 1e-9) / 100;

describe("catálogo de recursos · capas de Colibri", () => {
    it("mapea todas las entradas colibri del JSON, sin las retiradas", () => {
        expect(colibri.map((m) => m.id).sort()).toEqual(COLIBRI.map((c) => String(c.id)).sort());
        expect(colibri).toHaveLength(9);
    });

    it("runtime colibri, arquitecturas arm64/x86_64 y servidor OpenAI en 4480", () => {
        for (const m of colibri) {
            expect(m.runtime, m.id).toBe("colibri");
            expect(m.arquitecturas, m.id).toEqual(["arm64", "x86_64"]);
            expect(m.servidor, m.id).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
            expect(m.almacenamiento.soloLocal, m.id).toBe(true);
        }
    });

    it("traduce cada capa a sus capacidades (juicio, palabra, razón y profunda)", () => {
        for (const m of colibri) {
            const capa = String(cruda(m.id).capa);
            if (capa === "juicio") expect(m.capacidades, m.id).toEqual(["decision"]);
            if (capa === "palabra") expect(m.capacidades, m.id).toEqual(["texto"]);
            if (capa === "razon") expect(m.capacidades, m.id).toEqual(["texto", "razon", "codigo"]);
            if (capa === "profunda") {
                expect(m.capacidades.slice(0, 3), m.id).toEqual(["texto", "razon", "codigo"]);
                expect(m.capacidades.includes("vision"), m.id).toBe(/visi[oó]n/i.test(String(cruda(m.id).modelo)));
            }
        }
    });

    it("bits int4 = 4 e int8 = 8; «por-verificar» queda en pruebas", () => {
        for (const m of colibri) {
            const int8 = /int8|q8|(^|[^0-9])8[-_ ]?bit/i.test(`${m.id} ${m.nombre}`);
            expect(m.bits, m.id).toBe(int8 ? 8 : 4);
            expect(m.estado, m.id).toBe("en-pruebas");
            expect(m.disco.verificado, m.id).toBe(false);
        }
    });

    it("los MoE con streaming_disco leen del disco y el resto se carga entero", () => {
        for (const m of colibri) {
            const streaming = cruda(m.id).streaming_disco === true;
            const modo = m.almacenamiento.modo as string;
            expect(modo, m.id).toBe(streaming ? "streaming" : "carga-completa");
            expect(m.almacenamiento.lecturaMinMBs, m.id).toBe(streaming ? 500 : undefined);
        }
        expect(colibri.filter((m) => (m.almacenamiento.modo as string) === "streaming")).toHaveLength(3);
        expect(colibri.every((m) => m.formato === "safetensors"), "el formato es el real de las capas").toBe(true);
    });

    it("tamaños de disco y RAM salen de la config (GB decimales y MiB de RAM)", () => {
        for (const m of colibri) {
            const c = cruda(m.id);
            expect(m.disco.gb, m.id).toBe(arribaCent(Number(c.disco_mb) / 1000));
            expect(m.ramMinGb, m.id).toBe(arribaCent(Number(c.ram_min_mb) / 1024));
        }
    });

    it("todos sirven por servidor; razón y profunda solo por servidor", () => {
        for (const m of colibri) {
            expect(m.medios, m.id).toContain("servidor");
            if (["razon", "profunda"].includes(String(cruda(m.id).capa))) expect(m.medios, m.id).toEqual(["servidor"]);
        }
    });

    it("Laya decide y Qwen3-Coder razona y escribe código", () => {
        const laya = porId.get("colibri-laya");
        expect(laya?.nombre).toContain("Laya");
        expect(laya?.capacidades).toEqual(["decision"]);
        expect(laya?.bits).toBe(4);
        const coder = porId.get("colibri-qwen3-coder-30b");
        expect(coder?.capacidades).toEqual(["texto", "razon", "codigo"]);
        expect(coder?.bits).toBe(4);
        expect(coder?.servidor?.url).toContain(":4480");
    });

    it("entra completo en el catálogo ordenado, sin duplicados", () => {
        const cat = catalogoRecursos();
        const ids = cat.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const m of colibri) expect(ids, m.id).toContain(m.id);
    });
});
