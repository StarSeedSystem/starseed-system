import { describe, expect, it } from "vitest";
import { DEFAULTS, fusionar, validar } from "../director-config";

describe("DEFAULTS", () => {
    it("trae los valores de config_director.py", () => {
        expect(DEFAULTS).toEqual({
            espera_aprobacion_min: 10,
            intervalo_s: 180,
            trabajadores: 5,
            tope_por_relanzamiento: 20,
            reintentos_por_pasada: 3,
            escalada: { tope_haiku_dia: 20, tope_sonnet_dia: 5, activa: true },
            proveedores_apartados: [],
            aviso_checkin: true,
            disco_min_gb: 5,
            optimizador: {
                activo: true,
                modo: "actuar",
                intervalo_s: 600,
                max_cambios_dia: 12,
                max_tareas_dia: 6,
                enfriamiento_min: 60,
                max_runs_nube_dia: 12,
            },
            diseno: {
                activo: true,
                umbral: 75,
                juez_visual: true,
                max_capturas_tarea: 14,
                intervalo_s: 120,
            },
            produccion: {
                activo: true,
                modo: "seco",
                intervalo_s: 120,
                ventana_min: 20,
                max_publicaciones_dia: 24,
                expres_alex: true,
                umbral_jev: 0.7,
                umbral_diseno: 75,
                migraciones: "aditivas",
                max_tags_nativos_semana: 1,
                revertir_auto: true,
            },
        });
    });
});

describe("validar", () => {
    it("una entrada que no es objeto falla", () => {
        const r = validar("no es un objeto");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores.length).toBeGreaterThan(0);
    });

    it("objeto vacío es válido y devuelve DEFAULTS", () => {
        const r = validar({});
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.valor).toEqual(DEFAULTS);
    });

    it("acepta una configuración parcial válida y rellena el resto con DEFAULTS", () => {
        const r = validar({ trabajadores: 8 });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.trabajadores).toBe(8);
            expect(r.valor.intervalo_s).toBe(DEFAULTS.intervalo_s);
        }
    });

    it("rechaza un entero negativo con mensaje en español y nombre del campo", () => {
        const r = validar({ trabajadores: -1 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'trabajadores' debe ser un entero >= 0");
    });

    it("rechaza un valor no entero", () => {
        const r = validar({ intervalo_s: 1.5 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores[0]).toContain("intervalo_s");
    });

    it("rechaza proveedores_apartados que no sea lista de cadenas", () => {
        const r = validar({ proveedores_apartados: ["ok", 3] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'proveedores_apartados' debe ser una lista de cadenas de texto");
    });

    it("acepta proveedores_apartados válido", () => {
        const r = validar({ proveedores_apartados: ["xkiro", "nim"] });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.valor.proveedores_apartados).toEqual(["xkiro", "nim"]);
    });

    it("rechaza aviso_checkin que no sea booleano", () => {
        const r = validar({ aviso_checkin: "sí" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'aviso_checkin' debe ser un booleano");
    });

    it("rechaza escalada que no sea objeto", () => {
        const r = validar({ escalada: "no" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'escalada' debe ser un objeto");
    });

    it("valida escalada campo a campo y conserva los válidos", () => {
        const r = validar({ escalada: { tope_haiku_dia: -5, activa: false } });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'escalada.tope_haiku_dia' debe ser un entero >= 0");
    });

    it("acepta una escalada parcial válida y rellena lo que falta con DEFAULTS.escalada", () => {
        const r = validar({ escalada: { activa: false } });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.escalada).toEqual({ tope_haiku_dia: 20, tope_sonnet_dia: 5, activa: false });
        }
    });

    it("rechaza modo de optimizador que no sea 'actuar' ni 'proponer'", () => {
        const r = validar({ optimizador: { modo: "detener" } });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'optimizador.modo' debe ser 'actuar' o 'proponer'");
    });

    it("rechaza intervalo_s fuera de rango", () => {
        const r = validar({ optimizador: { intervalo_s: 50 } });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores[0]).toContain("intervalo_s");
    });

    it("rechaza max_cambios_dia negativo", () => {
        const r = validar({ optimizador: { max_cambios_dia: -1 } });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores[0]).toContain("max_cambios_dia");
    });

    it("acepta un bloque optimizador completo y válido", () => {
        const r = validar({ optimizador: { activo: false, modo: "proponer", intervalo_s: 120, max_cambios_dia: 0, max_tareas_dia: 20, enfriamiento_min: 1440, max_runs_nube_dia: 0 } });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.optimizador.modo).toBe("proponer");
            expect(r.valor.optimizador.intervalo_s).toBe(120);
        }
    });

    it("acepta un bloque diseño completo y válido", () => {
        const r = validar({ diseno: { activo: false, umbral: 100, juez_visual: false, max_capturas_tarea: 60, intervalo_s: 3600 } });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.diseno.umbral).toBe(100);
            expect(r.valor.diseno.intervalo_s).toBe(3600);
        }
    });

    it("acepta los bordes del rango de diseno", () => {
        const r = validar({ diseno: { umbral: 0, max_capturas_tarea: 1, intervalo_s: 30 } });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.diseno.umbral).toBe(0);
            expect(r.valor.diseno.max_capturas_tarea).toBe(1);
            expect(r.valor.diseno.intervalo_s).toBe(30);
        }
    });

    it("rechaza umbral de diseno fuera de 0..100 y ni siquiera entero", () => {
        for (const malo of [-1, 101, 1.5, "75"]) {
            const r = validar({ diseno: { umbral: malo } });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.errores).toContain("'diseno.umbral' debe ser entero entre 0 y 100");
        }
    });

    it("rechaza max_capturas_tarea e intervalo_s fuera de rango", () => {
        const r = validar({ diseno: { max_capturas_tarea: 0, intervalo_s: 3601 } });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errores).toContain("'diseno.max_capturas_tarea' debe ser entero entre 1 y 60");
            expect(r.errores).toContain("'diseno.intervalo_s' debe ser entero entre 30 y 3600");
        }
    });

    it("rechaza activo/juez_visual que no sean booleanos", () => {
        const r = validar({ diseno: { activo: 1, juez_visual: "sí" } });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errores).toContain("'diseno.activo' debe ser un booleano");
            expect(r.errores).toContain("'diseno.juez_visual' debe ser un booleano");
        }
    });

    it("rechaza un bloque diseno que no sea objeto", () => {
        const r = validar({ diseno: 42 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'diseno' debe ser un objeto");
    });
});

describe("fusionar", () => {
    it("conserva la base cuando el parcial no es un objeto", () => {
        expect(fusionar(DEFAULTS, null)).toEqual(DEFAULTS);
        expect(fusionar(DEFAULTS, "texto")).toEqual(DEFAULTS);
    });

    it("descarta valores inválidos y conserva el valor de base (no siempre DEFAULTS)", () => {
        const guardado = fusionar(DEFAULTS, { trabajadores: 2 });
        const resultado = fusionar(guardado, { trabajadores: -9, intervalo_s: 300 });
        expect(resultado.trabajadores).toBe(2); // inválido: conserva lo ya guardado, no DEFAULTS
        expect(resultado.intervalo_s).toBe(300); // válido: se aplica
    });

    it("fusiona escalada campo a campo sin pisar los demás campos", () => {
        const resultado = fusionar(DEFAULTS, { escalada: { tope_sonnet_dia: 9 } });
        expect(resultado.escalada).toEqual({ tope_haiku_dia: 20, tope_sonnet_dia: 9, activa: true });
    });

    it("no muta el arreglo proveedores_apartados de la base", () => {
        const base = { ...DEFAULTS, proveedores_apartados: ["a"] };
        const resultado = fusionar(base, {});
        resultado.proveedores_apartados.push("b");
        expect(base.proveedores_apartados).toEqual(["a"]);
    });

    it("fusiona optimizador campo a campo sin pisar los demás", () => {
        const resultado = fusionar(DEFAULTS, { optimizador: { modo: "proponer", intervalo_s: 300 } });
        expect(resultado.optimizador.modo).toBe("proponer");
        expect(resultado.optimizador.intervalo_s).toBe(300);
        expect(resultado.optimizador.activo).toBe(true);
    });

    it("guardado conserva el bloque optimizador válido", () => {
        const guardado = fusionar(DEFAULTS, { optimizador: { activo: false, modo: "actuar", intervalo_s: 600 } });
        expect(guardado.optimizador.activo).toBe(false);
        expect(guardado.optimizador.modo).toBe("actuar");
        expect(guardado.optimizador.intervalo_s).toBe(600);
        expect(guardado.optimizador.max_cambios_dia).toBe(12);
    });

    it("fusiona diseno parcial: lo válido entra, lo inválido conserva la base", () => {
        const r = fusionar(DEFAULTS, { diseno: { umbral: 80, max_capturas_tarea: 0, intervalo_s: 300 } });
        expect(r.diseno.umbral).toBe(80);
        expect(r.diseno.max_capturas_tarea).toBe(14);
        expect(r.diseno.intervalo_s).toBe(300);
        expect(r.diseno.activo).toBe(true);
        expect(r.diseno.juez_visual).toBe(true);
    });

    it("un diseno que no es objeto conserva la base intacta", () => {
        const r = fusionar(DEFAULTS, { diseno: "no" });
        expect(r.diseno).toEqual(DEFAULTS.diseno);
    });
});

describe("produccion (§7)", () => {
    it("trae los valores por defecto del contrato", () => {
        const r = validar({});
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.valor.produccion).toEqual({
            activo: true,
            modo: "seco",
            intervalo_s: 120,
            ventana_min: 20,
            max_publicaciones_dia: 24,
            expres_alex: true,
            umbral_jev: 0.7,
            umbral_diseno: 75,
            migraciones: "aditivas",
            max_tags_nativos_semana: 1,
            revertir_auto: true,
        });
    });

    it("acepta un bloque produccion completo y válido en los bordes", () => {
        const r = validar({
            produccion: {
                activo: false, modo: "auto", intervalo_s: 30, ventana_min: 240,
                max_publicaciones_dia: 100, expres_alex: false, umbral_jev: 0.99,
                umbral_diseno: 100, migraciones: "ninguna", max_tags_nativos_semana: 7,
                revertir_auto: false,
            },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.valor.produccion.modo).toBe("auto");
            expect(r.valor.produccion.umbral_jev).toBe(0.99);
            expect(r.valor.produccion.migraciones).toBe("ninguna");
        }
    });

    it("rechaza modo y migraciones fuera de los conjuntos válidos", () => {
        for (const malo of ["publicar", "", 3, null]) {
            const r = validar({ produccion: { modo: malo } });
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.errores).toContain("'produccion.modo' debe ser 'seco', 'canario' o 'auto'");
        }
        const m = validar({ produccion: { migraciones: "destructivas" } });
        expect(m.ok).toBe(false);
        if (!m.ok) expect(m.errores).toContain("'produccion.migraciones' debe ser 'aditivas' o 'ninguna'");
    });

    it("rechaza rangos enteros fuera de sus márgenes", () => {
        const casos: [string, [number, number]][] = [
            ["intervalo_s", [30, 3600]],
            ["ventana_min", [0, 240]],
            ["max_publicaciones_dia", [0, 100]],
            ["umbral_diseno", [0, 100]],
            ["max_tags_nativos_semana", [0, 7]],
        ];
        for (const [k, [minV, maxV]] of casos) {
            const r = validar({ produccion: { [k]: maxV + 1 } });
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.errores).toContain(`'produccion.${k}' debe ser entero entre ${minV} y ${maxV}`);
            }
        }
    });

    it("rechaza umbral_jev fuera de 0.5..0.99 o que no sea número", () => {
        for (const malo of [0.49, 1.0, "0.7", true, null]) {
            const r = validar({ produccion: { umbral_jev: malo } });
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.errores).toContain("'produccion.umbral_jev' debe ser un número entre 0.5 y 0.99");
            }
        }
    });

    it("rechaza booleanos que no son booleanos", () => {
        const r = validar({ produccion: { activo: 1, expres_alex: "sí", revertir_auto: 0 } });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errores).toContain("'produccion.activo' debe ser un booleano");
            expect(r.errores).toContain("'produccion.expres_alex' debe ser un booleano");
            expect(r.errores).toContain("'produccion.revertir_auto' debe ser un booleano");
        }
    });

    it("un bloque que no es objeto da error claro", () => {
        const r = validar({ produccion: 42 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores).toContain("'produccion' debe ser un objeto");
    });

    it("fusión válida parcial conserva el resto", () => {
        const r = fusionar(DEFAULTS, { produccion: { modo: "canario", intervalo_s: 300 } });
        expect(r.produccion.modo).toBe("canario");
        expect(r.produccion.intervalo_s).toBe(300);
        expect(r.produccion.ventana_min).toBe(20);
        expect(r.produccion.activo).toBe(true);
    });

    it("un produccion que no es objeto conserva la base intacta", () => {
        const r = fusionar(DEFAULTS, { produccion: "no" });
        expect(r.produccion).toEqual(DEFAULTS.produccion);
    });
});
