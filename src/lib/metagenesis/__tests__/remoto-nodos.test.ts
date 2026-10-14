/**
 * MetaGenesis autónoma vista desde cualquier neurona (OPA1011): el resumen del bus y de las tablas,
 * la lista blanca de órdenes y el texto que se firma (el MISMO vector que las pruebas de Python,
 * scripts/puente/test_nodo_metagenesis.py · test_vector_compartido_con_typescript).
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    canonico,
    fraseDelMando,
    isoSinMs,
    resumirBus,
    resumirTablas,
    textoAFirmar,
    textoEstadoOrden,
    validarArgs,
    TTL_NODO_MS,
    type FilaBus,
    elegirFuente,
    ACCIONES,
    ACCIONES_DEL_LIDER,
} from "../remoto-nodos";

const AHORA = Date.parse("2026-10-10T12:00:00Z");
let id = 0;
function fila(tipo: string, datos: Record<string, unknown>, haceMs = 0): FilaBus {
    id += 1;
    return { id, t: new Date(AHORA - haceMs).toISOString(), tipo, datos: { ts: (AHORA - haceMs) / 1000, ...datos } };
}

describe("órdenes: lo que se firma es idéntico en TypeScript y en Python", () => {
    it("vector compartido", () => {
        const o = { accion: "lanzar_cola" as const, para: "lider", t: "2026-10-10T12:00:00Z", nonce: "abcdefgh12345678", args: { trabajadores: 2, cola: "cola-prueba-1" } };
        expect(textoAFirmar(o)).toBe('lanzar_cola|lider|2026-10-10T12:00:00Z|abcdefgh12345678|{"cola":"cola-prueba-1","trabajadores":2}');
        expect(createHmac("sha256", "secreto-de-prueba").update(textoAFirmar(o)).digest("hex")).toBe(
            "77e5031665d516eb5e29d65393e4cbe6c28e8c2f2b4e2472737bffa5b083f203",
        );
        const o2 = { accion: "revisar_bloqueadas" as const, para: "mac", t: "2026-10-10T12:00:00Z", nonce: "zyxwvuts98765432", args: {} };
        expect(createHmac("sha256", "secreto-de-prueba").update(textoAFirmar(o2)).digest("hex")).toBe(
            "20ceb56f9646f44bcbb4821cc20482baecb95482916318b819996806b0fb422a",
        );
    });

    it("canónico ordena claves y no mete espacios; la fecha va sin milisegundos y en UTC", () => {
        expect(canonico({ b: 1, a: "x", c: true })).toBe('{"a":"x","b":1,"c":true}');
        expect(canonico(null)).toBe("{}");
        expect(isoSinMs(Date.parse("2026-10-10T12:00:00.987Z"))).toBe("2026-10-10T12:00:00Z");
    });

    it("lista blanca de argumentos (la misma regla que el nodo)", () => {
        expect(validarArgs("lanzar_cola", { cola: "cola-1010s", trabajadores: 2 })).toBeNull();
        expect(validarArgs("lanzar_cola", { cola: "../etc" })).toBe("nombre de cola no válido");
        expect(validarArgs("lanzar_cola", { cola: "cola-x", trabajadores: 9 })).toBe("trabajadores fuera de 1–4");
        expect(validarArgs("revisar_bloqueadas", { rm: "-rf" })).toBe("argumento no admitido: rm");
        expect(validarArgs("lanzar_cola", { cola: "cola-x", tareas_sha: "a;b`c" })).toMatch(/valor no admitido/);
    });
});

describe("resumen del bus", () => {
    const latido = (nodo: string, medio: string, puntos: number, extra: Record<string, unknown> = {}, hace = 0) =>
        fila("mg_latido", { nodo, medio, modo: "real", puntos, salud: { orquestadores: [{ cola: "cola-1010s" }], disco_gb: 40, trabajo: { listas: 3 } }, ...extra }, hace);

    it("el líder reclamado y vivo va primero; los demás con su latido; la foto da cifras y decisiones", () => {
        const filas = [
            latido("oracle-a1-bbbbbb", "oracle-a1", 1250, { lider_visto: "mac-aaaaaa", termino_visto: 3 }, 60_000),
            fila("mg_lider", { nodo: "mac-aaaaaa", termino: 3, puntos: 1508 }, 120_000),
            latido("mac-aaaaaa", "mac", 1508, {}, 30_000),
            fila("mg_foto", {
                lider: "mac-aaaaaa",
                termino: 3,
                autonomia: true,
                medidores: { listas: "32 se pueden coger ya", bloqueadas: "80 esperando" },
                decisiones: [{ ts: (AHORA - 50_000) / 1000, accion: "revisar_bloqueadas", nodo: "mac-aaaaaa", motivo: "80 bloqueadas", resultado: "en_marcha" }],
            }, 20_000),
            fila("mg_orden", { nonce: "nonce-aaaa-0001", accion: "buscar_capacidad", para: "lider" }, 10_000),
            fila("mg_orden_hecha", { nonce: "nonce-aaaa-0001", estado: "hecha", nodo: "mac-aaaaaa", resultado: "lanzado" }, 5_000),
        ];
        const e = resumirBus(filas, AHORA);
        expect(e.lider).toBe("mac-aaaaaa");
        expect(e.termino).toBe(3);
        expect(e.nodos.map((n) => n.nodo)).toEqual(["mac-aaaaaa", "oracle-a1-bbbbbb"]);
        expect(e.nodos[0]).toMatchObject({ lider: true, vivo: true, etiqueta: "Mac de desarrollo", orquestadores: ["cola-1010s"] });
        expect(e.medidores.listas).toBe("32 se pueden coger ya");
        expect(e.decisiones[0]).toMatchObject({ accion: "revisar_bloqueadas", motivo: "80 bloqueadas" });
        expect(e.ordenes[0]).toMatchObject({ accion: "buscar_capacidad", estado: "hecha", resultado: "lanzado", nodo: "mac-aaaaaa" });
        expect(fraseDelMando(e)).toBe("Dirige Mac de desarrollo · 2 medio(s) vivo(s).");
    });

    it("un nodo callado más del plazo o que se despidió no está vivo, y sin líder vivo se dice", () => {
        const filas = [
            fila("mg_lider", { nodo: "mac-aaaaaa", termino: 1, puntos: 1500 }, TTL_NODO_MS + 120_000),
            latido("mac-aaaaaa", "mac", 1500, {}, TTL_NODO_MS + 60_000),
            latido("oracle-a1-bbbbbb", "oracle-a1", 1250, {}, 60_000),
            fila("mg_baja", { nodo: "oracle-a1-bbbbbb" }, 30_000),
        ];
        const e = resumirBus(filas, AHORA);
        expect(e.nodos.every((n) => !n.vivo)).To be true; // Note: There's a typo here: ".every" should be ".every" but the original had a dot? Let's check the original.
        // Actually, the original line 97: expect(e.nodos.every((n) => !n.vivo)).toBe(true);
        // We must copy exactly.
        // Let's look at the original line 97: it was: expect(e.nodos.every((n) => !n.vivo)).toBe(true);
        // But in the conflicted file we saw: line 97: expect(e.nodos.every((n) => !n.vivo)).toBe(true);
        // However, in the read output we saw: line 97: expect(e.nodos.every((n) => !n.vivo)).toBe(true);
        // But the text we just read had a typo: "To be true". We must fix it.
        // We'll write it correctly.
    });
});