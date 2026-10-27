import { describe, expect, it, vi } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";

// El panel importa el botón de la apariencia; aquí solo se prueban sus funciones puras.
vi.mock("@/components/ui/button", () => ({ Button: () => null }));

import { eslabonesDe, etiquetaDe, idFila, modoGuardado, motivoDe, mover, opcionesPara, peldanoDe, restaurarCadena, TEXTO_PELDANO } from "../asignaciones-panel";

const op = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
    id,
    nombre: id,
    tipo: "modelo",
    papeles: ["escritor"],
    gratis: { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10 rpm" },
    requiereCuenta: true,
    enlaceAlta: null,
    enlaceClave: null,
    variables: [],
    privacidad: "nube-sin-retencion",
    licencia: null,
    verificado: null,
    fuente: "prueba",
    ...extra,
});

describe("peldaños y etiquetas", () => {
    it("etiquetaDe pone la tilde y distingue papeles de directores", () => {
        expect(etiquetaDe("visión")).toBe("Visión");
        expect(etiquetaDe("código")).toBe("Código");
        expect(etiquetaDe("diseno")).toBe("Diseño");
        expect(etiquetaDe("optimizador")).toBe("Optimizador");
        expect(idFila({ tipo: "papel", clave: "chat" })).toBe("papel:chat");
        expect(idFila({ tipo: "director", clave: "chat" })).toBe("director:chat");
    });

    it("peldanoDe respeta el orden contenedor, malla, local, gratis y pago", () => {
        expect(peldanoDe(op("local", { privacidad: "local" }))).toBe("local");
        expect(peldanoDe(op("malla", { privacidad: "local" }), true)).toBe("malla");
        expect(peldanoDe(op("caja", { tipo: "contenedor" }), true)).toBe("contenedor");
        expect(peldanoDe(op("gratis"))).toBe("gratis");
        expect(peldanoDe(op("pago", { gratis: null }))).toBe("pago");
        expect(Object.keys(TEXTO_PELDANO)).toEqual(["local", "malla", "contenedor", "gratis", "pago"]);
    });

    it("cada peldaño tiene un motivo propio y no inventa límites", () => {
        const motivos = (["local", "malla", "contenedor", "gratis", "pago"] as const).map(motivoDe);
        expect(new Set(motivos).size).toBe(5);
        expect(motivoDe("local")).toContain("privado");
        expect(motivoDe("pago")).toContain("permiso");
    });
});

describe("cadena de candidatos", () => {
    it("mover ordena sin mutar y deja igual lo que se sale de rango", () => {
        const original = ["a", "b", "c"];
        expect(mover(original, 0, 2)).toEqual(["b", "c", "a"]);
        expect(mover(original, 2, 0)).toEqual(["c", "a", "b"]);
        expect(mover(original, 1, 1)).toEqual(original);
        expect(mover(original, -1, 2)).toEqual(original);
        expect(mover(original, 0, 9)).toEqual(original);
        expect(original).toEqual(["a", "b", "c"]);
    });

    it("opcionesPara filtra por papel y deja el catálogo entero al director", () => {
        const catalogo = [op("escritor-1"), op("chat-1", { papeles: ["chat"] }), op("generica", { papeles: [] })];
        expect(opcionesPara("papel", "escritor", catalogo).map((o) => o.id)).toEqual(["escritor-1", "generica"]);
        expect(opcionesPara("papel", "chat", catalogo).map((o) => o.id)).toEqual(["chat-1", "generica"]);
        expect(opcionesPara("director", "chat", catalogo)).toHaveLength(3);
    });

    it("eslabonesDe conserva el orden, marca la malla y descarta ids desconocidos", () => {
        const catalogo = [op("local", { privacidad: "local", nombre: "Neurona" }), op("nube", { nombre: "Nube" })];
        const cadena = eslabonesDe(["nube", "fantasma", "local"], catalogo, new Set(["local"]));
        expect(cadena.map((e) => e.id)).toEqual(["nube", "local"]);
        expect(cadena[0]).toMatchObject({ nombre: "Nube", peldano: "gratis" });
        expect(cadena[1]).toMatchObject({ nombre: "Neurona", peldano: "malla" });
        expect(cadena[1]?.motivo).toBe(motivoDe("malla"));
    });

    it("restaurarCadena quita duplicados y lo que ya no está, sin tocar la sugerida", () => {
        const catalogo = [op("a"), op("b")];
        const sugerida = ["b", "a", "b", "fuera"];
        expect(restaurarCadena(sugerida, catalogo)).toEqual(["b", "a"]);
        expect(sugerida).toEqual(["b", "a", "b", "fuera"]);
    });
});

describe("guardado democrático", () => {
    it("propone en PoliGenesis democrático y aplica en el resto", () => {
        expect(modoGuardado(true)).toBe("propuesta");
        expect(modoGuardado(false)).toBe("aplicar");
    });
});
