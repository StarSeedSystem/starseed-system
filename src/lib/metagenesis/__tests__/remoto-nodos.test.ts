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

    it("el latido con `capacidades_taller` deja el NeuronaTaller del nodo; sin bloque queda null (G3D1011D)", () => {
        const conTaller = {
            version: 1,
            hierro: { gpu: "nvidia", ramGB: 64, vramGB: 16, blender: true, permiteEspacioHf: false, claveExterna: false },
            capacidades: ["cpu", "cuda-8gb", "cuda-16gb"],
        };
        const e = resumirBus([latido("mac-aaaaaa", "mac", 10, { capacidades_taller: conTaller })], AHORA);
        expect(e.nodos[0].taller).toMatchObject({ id: "mac-aaaaaa", viva: true, hierro: { gpu: "nvidia", vramGB: 16 } });
        const sin = resumirBus([latido("oracle-a1-bbbbbb", "oracle-a1", 5)], AHORA);
        expect(sin.nodos[0].taller).toBeNull();
    });

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
        expect(e.nodos.every((n) => !n.vivo)).toBe(true);
        expect(e.lider).toBeNull();
        expect(fraseDelMando(e)).toMatch(/Ningún medio/);
    });

    it("dos reclamos del mismo término: gana el de más puntos (como en Python)", () => {
        const filas = [
            fila("mg_lider", { nodo: "nube-cowork-cccccc", termino: 4, puntos: 1080 }),
            fila("mg_lider", { nodo: "oracle-a1-bbbbbb", termino: 4, puntos: 1250 }),
            latido("oracle-a1-bbbbbb", "oracle-a1", 1250),
            latido("nube-cowork-cccccc", "nube-cowork", 1080),
        ];
        expect(resumirBus(filas, AHORA).lider).toBe("oracle-a1-bbbbbb");
    });

    it("una orden sin respuesta en 15 min se da por caducada; un líder en seco se avisa", () => {
        const filas = [
            fila("mg_orden", { nonce: "nonce-vieja-001", accion: "continuar", para: "lider" }, 16 * 60_000),
            fila("mg_lider", { nodo: "mac-aaaaaa", termino: 1, puntos: 500 }),
            latido("mac-aaaaaa", "mac", 500, { modo: "seco" }),
        ];
        const e = resumirBus(filas, AHORA);
        expect(e.ordenes[0].estado).toBe("caducada");
        expect(textoEstadoOrden("caducada")).toBe("nadie la recogió a tiempo");
        expect(e.liderSeco).toBe(true);
        expect(fraseDelMando(e)).toMatch(/modo de prueba/);
    });
});

describe("textoEstadoOrden", () => {
    it("cada estado mapea al texto correcto", () => {
        const estados = {
            pendiente: "esperando a un nodo",
            tomada: "la tiene un nodo",
            hecha: "hecha",
            en_marcha: "en marcha",
            seca: "solo simulada (nodo en prueba)",
            nada: "no hacía falta",
            rechazada: "rechazada",
            fallo: "falló",
            caducada: "nadie la recogió a tiempo",
        };
        Object.entries(estados).forEach(([estado, esperado]) => {
            expect(textoEstadoOrden(estado)).toBe(esperado);
        });
    });

    it("estado desconocido se devuelve tal cual", () => {
        expect(textoEstadoOrden("estado-unknown")).toBe("estado-unknown");
    });
});

describe("resumen de las tablas (modo tablas)", () => {
    it("el arriendo vigente manda y las órdenes traen quién las tomó", () => {
        const e = resumirTablas(
            {
                arriendo: { lider: "oracle-a1-bbbbbb", termino: 7, expira: new Date(AHORA + 600_000).toISOString(), foto: { autonomia: false, medidores: { listas: "4" } }, foto_en: new Date(AHORA - 60_000).toISOString() },
                nodos: [
                    { nodo: "oracle-a1-bbbbbb", medio: "oracle-a1", modo: "real", puntos: 1250, datos: { salud: { disco_gb: 80 } }, ultimo_latido: new Date(AHORA - 30_000).toISOString() },
                    { nodo: "mac-aaaaaa", medio: "mac", modo: "real", puntos: 1508, datos: null, ultimo_latido: new Date(AHORA - 2 * TTL_NODO_MS).toISOString() },
                ],
                ordenes: [{ id: 9, creada_en: new Date(AHORA - 30_000).toISOString(), accion: "reactivar", para: "lider", estado: "en_marcha", resultado: "lanzado", tomada_por: "oracle-a1-bbbbbb" }],
            },
            AHORA,
        );
        expect(e.modo).toBe("tablas");
        expect(e.lider).toBe("oracle-a1-bbbbbb");
        expect(e.nodos[0]).toMatchObject({ nodo: "oracle-a1-bbbbbb", lider: true, vivo: true, disco_gb: 80 });
        expect(e.nodos[1].vivo).toBe(false);
        expect(e.autonomia).toBe(false);
        expect(e.ordenes[0]).toMatchObject({ clave: "9", nodo: "oracle-a1-bbbbbb", estado: "en_marcha" });
        expect(fraseDelMando(e)).toMatch(/autonomía está en pausa/);
    });

    it("con el arriendo caducado no hay líder", () => {
        const e = resumirTablas({ arriendo: { lider: "mac-aaaaaa", termino: 2, expira: new Date(AHORA - 1000).toISOString(), foto: null, foto_en: null }, nodos: [], ordenes: [] }, AHORA);
        expect(e.lider).toBeNull();
    });
});

describe("elegirFuente: donde hay alguien vivo (2026-10-13)", () => {
    const estado = (vivos: boolean[], modo: "bus" | "tablas") => ({
        modo, lider: null, termino: 0, autonomia: null, medidores: {}, decisiones: [], ordenes: [],
        fotoHaceMs: null, liderSeco: false,
        nodos: vivos.map((vivo, i) => ({
            nodo: `n${i}`, medio: "mac", etiqueta: "", modo: "real", vivo, lider: false, hace_ms: null, puntos: null,
            orquestadores: [], caidos: [], disco_gb: null, ram_libre_mb: null, trabajo: {}, enCurso: [], contenedor: null,
        })),
    });

    it("tablas sin latidos y bus con nodos vivos → bus", () => {
        expect(elegirFuente(estado([false, false], "tablas"), estado([true, true], "bus"))).toBe("bus");
    });

    it("alguien vivo en las tablas → tablas", () => {
        expect(elegirFuente(estado([true], "tablas"), estado([true], "bus"))).toBe("tablas");
    });

    it("nadie vivo en ninguna → tablas si existen; si no, bus", () => {
        expect(elegirFuente(estado([false], "tablas"), estado([false], "bus"))).toBe("tablas");
        expect(elegirFuente(null, estado([false], "bus"))).toBe("bus");
    });

    it("bus con 2 vivos y tablas con 1 → bus", () => {
        expect(elegirFuente(estado([true], "tablas"), estado([true, true], "bus"))).toBe("bus");
    });

    it("1 vivo en cada fuente → tablas (igualdad)", () => {
        expect(elegirFuente(estado([true], "tablas"), estado([true], "bus"))).toBe("tablas");
    });
});

describe("ACCIONES: etiquetas y argumentos correctos", () => {
    it("tienen las etiquetas y argumentos correctos", () => {
        expect(ACCIONES.desconectar.etiqueta).toBe("Desconectar");
        // Honesto: no lo «quita del enjambre» (no lo hace) ni promete traspaso (COL1012E/G/H aún no están cableados).
        expect(ACCIONES.desconectar.explica).toBe(
            "Deja de ofrecer este aparato como contenedor y avisa de que se desconecta. El traspaso del trabajo a otro contenedor aún no está activo.",
        );
        expect(ACCIONES.desconectar.confirmar).toBe(true);
        expect(ACCIONES.desconectar.args).toEqual([]);

        expect(ACCIONES.contenedor.etiqueta).toBe("Usar como contenedor");
        expect(ACCIONES.contenedor.explica).toBe(
            "Apunta si este aparato se ofrece como contenedor de agentes (con cuántos). El nodo lo guarda y lo publica en su latido.",
        );
        expect(ACCIONES.contenedor.confirmar).toBeUndefined();
        expect(ACCIONES.contenedor.args).toEqual(["activo", "trabajadores"]);
    });
});

describe("textoEstadoOrden", () => {
    it("cada estado mapea al texto correcto (excepto caducada, que ya se prueba)", () => {
        expect(textoEstadoOrden("pendiente")).toBe("esperando a un nodo");
        expect(textoEstadoOrden("tomada")).toBe("la tiene un nodo");
        expect(textoEstadoOrden("hecha")).toBe("hecha");
        expect(textoEstadoOrden("en_marcha")).toBe("en marcha");
        expect(textoEstadoOrden("seca")).toBe("solo simulada (nodo en prueba)");
        expect(textoEstadoOrden("nada")).toBe("no hacía falta");
        expect(textoEstadoOrden("rechazada")).toBe("rechazada");
        expect(textoEstadoOrden("fallo")).toBe("falló");
    });

    it("estado desconocido se devuelve tal cual", () => {
        expect(textoEstadoOrden("desconocido")).toBe("desconocido");
        expect(textoEstadoOrden("")).toBe("");
        expect(textoEstadoOrden("otro estado")).toBe("otro estado");
    });
});