/**
 * Pruebas del panel «Novedades de modelos» (Ola 1016M · vigia-modelos.md §6).
 * Todas sobre funciones puras: la respuesta de ejemplo del vigía vive dentro de la
 * prueba, sin red, sin disco y sin procesos.
 */
import { describe, it, expect } from "vitest";
import { accionesDeTexto, agruparPorArea, nombreMasReciente, superponerAccion } from "@/lib/mando/novedades-modelos";

const PASADA = {
    fecha: "2026-10-28",
    areas: [
        {
            area: "imagen", nombre: "Imágenes", catalogo: "src/lib/imagenes/modelos.ts",
            aceptados: [{
                id: "Qwen/Qwen-Image-2.1-Turbo", decision: "aceptado", motivo: "nuevo y con licencia conocida",
                clase: "personal", personal: true, gated: false, licencia: "qwen-research", tamanio_gb: 14.19,
                medios: [
                    { medio: "navegador", cabe: false, archivo: "q2_k.gguf", bytes: 2470000000, motor: null },
                    { medio: "mac", cabe: true, archivo: "q4_k_m.gguf", bytes: 4200000000, motor: "sdcpp" },
                ],
            }],
            descartados: [{
                id: "Comfy-Org/Qwen-Image-2.1-comfy", decision: "descartado",
                motivo: "ya está en el catálogo, en una cola o lo vimos antes",
                clase: "desconocida", licencia: "", tamanio_gb: null, medios: [],
            }],
        },
        {
            area: "voz", nombre: "Voz", catalogo: "src/lib/library/packages.ts",
            aceptados: [{
                id: "mit-turbo", decision: "aceptado", motivo: "nuevo y con licencia conocida",
                clase: "libre", licencia: "apache-2.0", tamanio_gb: 0.9,
                medios: [{ medio: "navegador", cabe: true, archivo: "peso.onnx", bytes: 900000000, motor: "onnx" }],
            }],
            descartados: [],
        },
    ],
};

describe("agruparPorArea", () => {
    it("agrupa la pasada por área con clase, tamaño, medios y estado", () => {
        const registro = agruparPorArea(PASADA);
        expect(registro.fecha).toBe("2026-10-28");
        expect(registro.areas.map((a) => a.id)).toEqual(["imagen", "voz"]);
        const turbo = registro.areas[0].candidatos[0];
        expect(turbo.id).toBe("Qwen/Qwen-Image-2.1-Turbo");
        expect(turbo.clase).toBe("personal");
        expect(turbo.licencia).toBe("qwen-research");
        expect(turbo.tamanoGb).toBe(14.19);
        expect(turbo.estado).toBe("propuesto");
        expect(turbo.medios.filter((m) => m.cabe).map((m) => m.medio)).toEqual(["mac"]);
        const yaCatalogo = registro.areas[0].candidatos[1];
        expect(yaCatalogo.estado).toBe("en_catalogo");
        expect(yaCatalogo.motivo).toContain("catálogo");
        expect(registro.areas[1].candidatos[0].clase).toBe("libre");
    });

    it("lo que no es una pasada del vigía sale vacío, sin inventar nada", () => {
        expect(agruparPorArea(null)).toEqual({ fecha: null, areas: [] });
        expect(agruparPorArea({ areas: "no" })).toEqual({ fecha: null, areas: [] });
        expect(agruparPorArea({ areas: [{ sin: "id" }, "ruido", 42] })).toEqual({ fecha: null, areas: [] });
        const conClaseRara = agruparPorArea({
            areas: [{ area: "3d", aceptados: [{ id: "x/y", decision: "aceptado", clase: "gratis", licencia: "mit" }] }],
        });
        expect(conClaseRara.areas[0].candidatos[0].clase).toBe("desconocida");
    });
});

describe("acciones del panel", () => {
    it("encolar y descartar cambian el estado de la ficha y dejan el resto igual", () => {
        const areas = agruparPorArea(PASADA).areas;
        const encoladas = superponerAccion(areas, "imagen", "Qwen/Qwen-Image-2.1-Turbo", "encolar");
        const ficha = encoladas[0].candidatos.find((f) => f.id === "Qwen/Qwen-Image-2.1-Turbo");
        expect(ficha?.estado).toBe("encolado");
        expect(ficha?.motivo).toContain("Encolada");
        expect(encoladas[1].candidatos[0].estado).toBe("propuesto");
        const descartadas = superponerAccion(areas, "voz", "mit-turbo", "descartar", "no aporta nada medible");
        const otra = descartadas[1].candidatos.find((f) => f.id === "mit-turbo");
        expect(otra?.estado).toBe("descartado");
        expect(otra?.motivo).toBe("no aporta nada medible");
    });

    it("una acción sobre ficha o área que no existe no cambia nada", () => {
        const areas = agruparPorArea(PASADA).areas;
        expect(superponerAccion(areas, "otra", "x", "encolar")).toEqual(areas);
        expect(superponerAccion(areas, "imagen", "no/existe", "descartar")).toEqual(areas);
    });
    it("la última acción por ficha manda (como el estado escrito en disco)", () => {
        const id = "Qwen/Qwen-Image-2.1-Turbo";
        const finales = [
            { area: "imagen", id, accion: "descartar" as const, cuando: "t1" },
            { area: "imagen", id, accion: "encolar" as const, cuando: "t2" },
        ].reduce((acc, a) => superponerAccion(acc, a.area, a.id, a.accion), agruparPorArea(PASADA).areas);
        expect(finales[0].candidatos.find((f) => f.id === id)?.estado).toBe("encolado");
    });
});

describe("leer el estado escrito y elegir el último archivo", () => {
    it("lee las acciones válidas e ignora lo que no lo sea", () => {
        const texto = JSON.stringify([
            { area: "imagen", id: "Qwen/Qwen-Image-2.1-Turbo", accion: "encolar", cuando: "2026-10-28T09:00:00Z" },
            { area: "imagen", id: "sin-accion", accion: "borrar", cuando: "" },
            "ruido",
        ]);
        const acciones = accionesDeTexto(texto);
        expect(acciones).toHaveLength(1);
        expect(acciones[0].id).toBe("Qwen/Qwen-Image-2.1-Turbo");
        expect(acciones[0].motivo).toBeUndefined();
        expect(accionesDeTexto("no es json")).toEqual([]);
        expect(accionesDeTexto(null)).toEqual([]);
        expect(accionesDeTexto('{"areas": []}')).toEqual([]);
    });

    it("elige el último archivo de pasada y ignora lo que no lo sea", () => {
        expect(nombreMasReciente(["novedades-2026-10-27.json", "novedades-2026-10-28.json", "otro.json"]))
            .toBe("novedades-2026-10-28.json");
        expect(nombreMasReciente([])).toBeNull();
        expect(nombreMasReciente(["estado.json", "novedades.json"])).toBeNull();
    });
});
