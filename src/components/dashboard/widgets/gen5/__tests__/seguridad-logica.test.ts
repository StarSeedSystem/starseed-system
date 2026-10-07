// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { comprobaciones, escanearAlmacen, puntuacion, type SenalesSeguridad } from "../_catalogo/seguridad";
import { enmascararCorreo, mapearFaceta, etiquetaVisibilidad } from "../_catalogo/identidad";

// (2026-10-07) Las claves de EJEMPLO se montan en tiempo de ejecución: escritas enteras en el
// archivo, la protección de secretos de GitHub bloquearía cualquier empuje que llevara este
// commit (CLAUDE.md, trampa 12). Ninguna es real.
const parte = (...t: string[]) => t.join("");

const base: SenalesSeguridad = { metodo: "ninguno", minutosInactividad: 0, alAbrir: false, passkey: false, cifrada: true, biometria: null, persistente: null };

describe("Escudo · comprobaciones puras", () => {
    it("sin bloqueo es un fallo; con PIN sin inactividad, atención", () => {
        const a = comprobaciones(base, null, null);
        expect(a.find((c) => c.id === "bloqueo")?.estado).toBe("mal");
        expect(puntuacion(a).nivel).toBe("mal");
        const b = comprobaciones({ ...base, metodo: "pin" }, null, null);
        expect(b.find((c) => c.id === "bloqueo")?.titulo).toBe("Bloqueo con PIN");
        expect(b.find((c) => c.id === "inactividad")?.estado).toBe("atencion");
    });
    it("lo informativo no cuenta en la puntuación y todo bien es «bien»", () => {
        const cs = comprobaciones({ ...base, metodo: "biometria", minutosInactividad: 5, persistente: true }, { hoy: 10, presupuesto: 8000, pausa: false, bloqueadas: 0 }, { claves: 2, hallazgos: 0, graves: 0, boveda: 1, en: 0 });
        const p = puntuacion(cs);
        expect(p.bien).toBe(p.total);
        expect(p.nivel).toBe("bien");
    });
    it("el tráfico por encima del 70 % pide atención y la pausa del guardián se dice", () => {
        expect(comprobaciones(base, { hoy: 6000, presupuesto: 8000, pausa: false, bloqueadas: 3 }, null).find((c) => c.id === "nube")?.estado).toBe("atencion");
        expect(comprobaciones(base, { hoy: 1, presupuesto: 8000, pausa: true, bloqueadas: 0 }, null).find((c) => c.id === "nube")?.titulo).toMatch(/pausa/);
    });
    it("el escaneo solo lee claves con nombre sospechoso y nunca las bóvedas ni la sesión", () => {
        localStorage.clear();
        localStorage.setItem("starseed.ai.providers", parte("sk-pr", "oj-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"));
        localStorage.setItem("sb-abc-auth-token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnopqrstuvwxyz");
        localStorage.setItem("starseed.integration.home-assistant", JSON.stringify({ apiKey: parte("sk-pr", "oj-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy") }));
        localStorage.setItem("notas", parte("sk-pr", "oj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"));
        const e = escanearAlmacen();
        expect(e.claves).toBe(0);
        expect(e.hallazgos).toBe(0);
        expect(e.boveda).toBe(1);
        localStorage.setItem("mi.token", parte("sk-pr", "oj-abcdefghijklmnopqrstuvwxyz0123456789ABCD"));
        expect(escanearAlmacen().hallazgos).toBeGreaterThan(0);
    });
});

describe("Identidad · piezas puras", () => {
    it("enmascara el correo y mapea facetas con valores seguros", () => {
        expect(enmascararCorreo("alexbordon@gmail.com")).toBe("al…on@gmail.com");
        expect(enmascararCorreo("ana@x.org")).toBe("a…@x.org");
        expect(enmascararCorreo(null)).toBe("");
        const f = mapearFaceta({ id: 7, name: "", visibility: "rara", is_default: true });
        expect(f).toMatchObject({ id: "7", nombre: "Sin nombre", visibilidad: "public", principal: true });
        expect(etiquetaVisibilidad("contacts")).toBe("solo contactos");
    });
});
