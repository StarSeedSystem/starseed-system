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
});
