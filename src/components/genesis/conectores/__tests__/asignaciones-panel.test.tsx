/**
 * Pruebas PURAS del panel de asignaciones (GCA1019N): peldaño y motivo de cada
 * candidato, orden por arrastre, alta y baja en la cadena, «Restaurar sugeridas»
 * y la decisión de guardar (aplicar o proponer en PoliGenesis democrático).
 */
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import {
    ETIQUETA_PELDANO,
    agregarACadena,
    decidirGuardado,
    detallePeldano,
    moverEnCadena,
    quitarDeCadena,
    restaurarSugeridas,
} from "../asignaciones-panel";

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
    return {
        id: overrides.id ?? "opcion",
        nombre: overrides.nombre ?? "Opción",
        tipo: overrides.tipo ?? "modelo",
        papeles: overrides.papeles ?? ["escritor"],
        gratis: overrides.gratis === undefined ? null : overrides.gratis,
        requiereCuenta: overrides.requiereCuenta ?? false,
        enlaceAlta: null,
        enlaceClave: null,
        variables: [],
        privacidad: overrides.privacidad ?? "desconocida",
        licencia: null,
        verificado: null,
        fuente: "prueba",
    };
}

describe("detallePeldano", () => {
    it("etiqueta local, contenedor, gratis y pago a partir del catálogo", () => {
        expect(detallePeldano(opcion({ privacidad: "local" })).peldano).toBe(1);
        expect(detallePeldano(opcion({ tipo: "contenedor" })).peldano).toBe(4);
        expect(detallePeldano(opcion({ gratis: { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10/min" } })).peldano).toBe(5);
        expect(detallePeldano(opcion({ gratis: null })).peldano).toBe(6);
        expect(ETIQUETA_PELDANO).toEqual({ 1: "local", 2: "local", 3: "malla", 4: "contenedor", 5: "gratis", 6: "pago" });
    });

    it("usa el peldaño y el motivo medidos del candidato, incluida la malla", () => {
        const detalle = detallePeldano(opcion(), { peldano: 3, motivo: "Disponible en la bolsa de la malla" });
        expect(detalle).toEqual({ peldano: 3, etiqueta: "malla", motivo: "Disponible en la bolsa de la malla" });
    });

    it("nunca inventa un límite gratis: sin nota lo dice sin verificar", () => {
        const detalle = detallePeldano(opcion({ gratis: { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "" } }));
        expect(detalle.motivo).toContain("límite sin verificar");
    });

    it("no falla si la opción no está en el catálogo", () => {
        expect(detallePeldano(undefined).peldano).toBe(6);
    });
});

describe("moverEnCadena", () => {
    it("reordena por arrastre sin mutar la cadena original", () => {
        const original = ["a", "b", "c"];
        expect(moverEnCadena(original, 0, 2)).toEqual(["b", "c", "a"]);
        expect(original).toEqual(["a", "b", "c"]);
    });

    it("ignora índices fuera de rango o un destino igual al origen", () => {
        expect(moverEnCadena(["a", "b"], -1, 1)).toEqual(["a", "b"]);
        expect(moverEnCadena(["a", "b"], 0, 5)).toEqual(["a", "b"]);
        expect(moverEnCadena(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    });
});

describe("alta y baja de la cadena", () => {
    it("añade al final y evita duplicados o ids vacíos", () => {
        expect(agregarACadena(["a"], "b")).toEqual(["a", "b"]);
        expect(agregarACadena(["a"], " a ")).toEqual(["a"]);
        expect(agregarACadena(["a"], "   ")).toEqual(["a"]);
    });

    it("quita el eslabón pedido y deja el resto", () => {
        expect(quitarDeCadena(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    });

    it("restaura las sugeridas limpias y sin repetir", () => {
        expect(restaurarSugeridas([" local ", "gratis", "local", "", "  "])).toEqual(["local", "gratis"]);
    });
});

describe("decidirGuardado", () => {
    it("en un Genesis jerárquico aplica el cambio", () => {
        const cambio = decidirGuardado("jerarquico", "escritor", ["local", "gratis"]);
        expect(cambio).toMatchObject({ accion: "aplicar", clave: "escritor", cadena: ["local", "gratis"] });
    });

    it("en PoliGenesis democrático crea una propuesta en vez de aplicar", () => {
        const cambio = decidirGuardado("democratico", "diseno", ["local"]);
        expect(cambio.accion).toBe("proponer");
        expect(cambio.motivo).toContain("propone a votación");
    });

    it("entrega una copia de la cadena para no compartir referencia", () => {
        const cadena = ["local"];
        const cambio = decidirGuardado("jerarquico", "chat", cadena);
        cadena.push("gratis");
        expect(cambio.cadena).toEqual(["local"]);
    });
});
