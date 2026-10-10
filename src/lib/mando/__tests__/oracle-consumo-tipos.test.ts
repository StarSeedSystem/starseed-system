import { describe, expect, it } from "vitest";

import { esConsumoOracle, haceMinutos, leerConsumoOracle, vistaOracle } from "../oracle-consumo-tipos";

/** La forma REAL de ~/.starseed/oracle-consumo.json medida en la Mac el 2026-10-10 (sin ids). */
function doc(extra: Record<string, unknown> = {}) {
    return {
        version: 1,
        leido: "2026-10-10T01:00:16.058035Z",
        ok: true,
        perfil: "DEFAULT",
        region: "mx-queretaro-1",
        consola: "https://cloud.oracle.com/?region=mx-queretaro-1",
        gasto: { mes: 0, previsto: 0, presupuesto: 1, presupuesto_nombre: "starseed-alerta-1usd", calculado: "2026-10-09T23:30:08Z", segun_uso: 0, moneda: "MXN", por_dia: [], fuente: "presupuesto de Oracle", leido: "2026-10-10T01:00:16Z" },
        prueba: { activa: true, credito: 6150, usado: 0, restante: 6150, moneda: "MXN", inicio: "2026-10-07T00:00:00Z", fin: "2026-11-05T23:59:59.999Z", dias_restantes: 26, modelo_pago: "FREE_TRIAL" },
        uso: { salida_gb: 0.0049, unidad_salida: "GB Months", a1_ocpu_h: 96.62, a1_gb_h: 579.75 },
        instancias: [{ nombre: "starseed-a1", forma: "VM.Standard.A1.Flex", ocpus: 2, gb: 12, estado: "RUNNING" }],
        disco: { gb: 100, arranque_gb: 100, bloques_gb: 0 },
        objetos: { gb: 0, cubos: 0 },
        reclamacion: {
            riesgo: true,
            maquinas: [{ nombre: "starseed-a1", medida: true, baja: true, riesgo: true, nivel: "aviso", cpu_p95: 0.52, mem_p95: 5.26, red_p95_pct: 0.0015, puntos: 51, dias: 2.1, reclamable_desde: "2026-10-14T23:00:00Z" }],
        },
        computo: { a1_ocpus: 2, a1_gb: 12, micro: 0, a1_nombre: "starseed-a1", a1_estado: "RUNNING" },
        freno: { activo: false, motivo: "", medido: true },
        margen: { apto: true, cpu_libre_pct: 99.5, mem_libre_gb: 11.4, motivo: "hay margen gratis: 99,5 % de CPU y 11,4 GB libres" },
        errores: [],
        ...extra,
    };
}

const AHORA = Date.parse("2026-10-10T01:10:00Z");

describe("leerConsumoOracle", () => {
    it("valida con lista blanca y nunca deja pasar un id", () => {
        const c = leerConsumoOracle(JSON.stringify(doc({ region: "ocid1.region.oc1..x", secreto: "ocid1.tenancy.oc1..y" })));
        expect(c).not.toBeNull();
        expect(c!.region).toBe("");
        expect(JSON.stringify(c)).not.toContain("ocid1");
        expect(c!.gasto?.moneda).toBe("MXN");
        expect(c!.prueba?.restante).toBe(6150);
        expect(c!.horasA1).toEqual({ ocpuH: 96.62, gbH: 579.75 });
        expect(c!.gasto?.porDia).toEqual([]);
        const conDias = leerConsumoOracle(doc({ gasto: { mes: 0, moneda: "MXN", por_dia: [{ dia: "2026-10-08", coste: 0 }, { dia: "malo", coste: 1 }] } }));
        expect(conDias!.gasto?.porDia).toEqual([{ dia: "2026-10-08", coste: 0 }]);
        expect(c!.reclamacion?.maquinas[0].nivel).toBe("aviso");
        expect(esConsumoOracle(c)).toBe(true);
    });

    it("una consola ajena se sustituye por la de Oracle", () => {
        expect(leerConsumoOracle(doc({ consola: "https://malo.example" }))!.consola).toBe("https://cloud.oracle.com/?region=mx-queretaro-1");
    });

    it("lo que no es un documento devuelve null y no pasa la guarda", () => {
        expect(leerConsumoOracle("no json")).toBeNull();
        expect(leerConsumoOracle({ sin: "leido" })).toBeNull();
        expect(esConsumoOracle({ generadoEn: "x", supabase: {} })).toBe(false);
    });
});

describe("vistaOracle", () => {
    it("cada medida con su límite gratis y el riesgo de reclamación con fecha", () => {
        const v = vistaOracle(leerConsumoOracle(doc())!, AHORA);
        expect(v.estado).toEqual({ texto: "Riesgo de reclamación", tono: "aviso" });
        const por = Object.fromEntries(v.filas.map((f) => [f.id, f]));
        expect(por.gasto.valor).toBe("0,00 / 1,00 MXN");
        expect(por.gasto.tono).toBe("ok");
        expect(por.prueba.valor).toMatch(/quedan 6\.?150 de 6\.?150 MXN/);
        expect(por.a1.valor).toBe("2/2 OCPU · 12/12 GB");
        expect(por.a1.detalle).toContain("CPU p95 0,52 %");
        expect(por.disco.valor).toBe("100 / 200 GB");
        expect(por.objetos.valor).toBe("0 / 20 GB");
        expect(por.salida.valor).toBe("0 GB / 10 TB");
        expect(por.horas.valor).toMatch(/96,6 \/ 1\.?500 OCPU·h/);
        expect(v.reclamacion?.texto).toContain("14 oct");
        expect(v.haceMin).toBe(9);
        expect(v.viejo).toBe(false);
    });

    it("con gasto > 0 el estado es freno y la barra de gasto en peligro", () => {
        const v = vistaOracle(
            leerConsumoOracle(doc({ gasto: { mes: 0.4, previsto: 1.2, presupuesto: 1, moneda: "MXN" }, freno: { activo: true, motivo: "x" } }))!,
            AHORA,
        );
        expect(v.estado.texto).toBe("Gasto > 0 · freno");
        expect(v.filas.find((f) => f.id === "gasto")?.tono).toBe("peligro");
    });

    it("lo no medido se dice como «sin medir», nunca como cero", () => {
        const v = vistaOracle(leerConsumoOracle(doc({ gasto: null, disco: null, objetos: null, uso: null, reclamacion: null }))!, AHORA);
        expect(v.estado.texto).toBe("Sin medir");
        for (const id of ["gasto", "disco", "objetos", "salida"]) {
            const f = v.filas.find((x) => x.id === id)!;
            expect(f.valor).toBe("sin medir");
            expect(f.fraccion).toBeNull();
        }
    });

    it("sin riesgo y al día = gratis", () => {
        const sano = doc();
        sano.reclamacion = { riesgo: false, maquinas: [{ ...sano.reclamacion.maquinas[0], riesgo: false, nivel: "no", mem_p95: 40 }] };
        const v = vistaOracle(leerConsumoOracle(sano)!, AHORA);
        expect(v.estado).toEqual({ texto: "Gratis · 0,00 MXN", tono: "ok" });
        expect(v.reclamacion?.tono).toBe("ok");
    });

    it("una lectura de más de 45 min es vieja", () => {
        expect(haceMinutos("2026-10-10T00:00:00Z", AHORA)).toBe(70);
        const v = vistaOracle(leerConsumoOracle(doc({ reclamacion: null, leido: "2026-10-10T00:00:00Z" }))!, AHORA);
        expect(v.viejo).toBe(true);
        expect(v.estado.texto).toBe("Lectura vieja");
    });
});

describe("el medidor de crédito «oracle» en las pastillas de Genesis", () => {
    it("textoExtras dice el freno y el riesgo de reclamación con su fecha", async () => {
        const { textoExtras } = await import("../creditos-pago-tipos");
        const base = { id: "oracle", proveedor: "oracle", nombre: "Oracle Cloud · Always Free", tipo: "saldo", ventanas: [], saldo: null };
        expect(textoExtras({ ...base, extras: { riesgo_reclamacion: true, reclamable_desde: "2026-10-14T23:00:00Z" } })).toContain(
            "riesgo de reclamación desde el 14 oct",
        );
        expect(textoExtras({ ...base, extras: { freno: true } })).toContain("freno: el gasto pasó de 0");
        expect(textoExtras({ ...base, extras: { freno: false, riesgo_reclamacion: false } })).toEqual([]);
    });
});
