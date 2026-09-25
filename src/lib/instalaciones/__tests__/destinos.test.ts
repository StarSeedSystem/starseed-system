import { describe, expect, it } from "vitest";

import {
    conEstado,
    destinosDeApp,
    esDestino,
    etiquetaDestino,
    fusionarDestinos,
    nuevoIdDestino,
    pendientesPara,
    type DestinoInstalacion,
} from "../destinos";

function d(parcial: Partial<DestinoInstalacion> & { id: string }): DestinoInstalacion {
    return {
        appId: "audiomorphic",
        appNombre: "Audiomorphic",
        tipo: "web",
        estado: "instalada",
        creada: 1,
        actualizada: 1,
        ...parcial,
    };
}

describe("fusionarDestinos", () => {
    it("por id gana la versión con `actualizada` más reciente, venga del lado que venga", () => {
        const local = [d({ id: "a", estado: "pedida", actualizada: 10 })];
        const nube = [d({ id: "a", estado: "descargada", actualizada: 20 })];
        expect(fusionarDestinos(local, nube)[0].estado).toBe("descargada");
        expect(fusionarDestinos(nube, local)[0].estado).toBe("descargada");
    });

    it("nunca pierde un destino que solo existe en un lado y ordena por reciente", () => {
        const r = fusionarDestinos([d({ id: "a", actualizada: 5 })], [d({ id: "b", actualizada: 9 })]);
        expect(r.map((x) => x.id)).toEqual(["b", "a"]);
    });

    it("descarta lo mal formado que llega de la nube y respeta el tope", () => {
        const basura = { id: "x", appId: 3 } as unknown as DestinoInstalacion;
        expect(fusionarDestinos([basura], [d({ id: "a" })]).map((x) => x.id)).toEqual(["a"]);
        const muchos = Array.from({ length: 10 }, (_, i) => d({ id: `n${i}`, actualizada: i }));
        expect(fusionarDestinos(muchos, [], 3).map((x) => x.id)).toEqual(["n9", "n8", "n7"]);
    });
});

describe("consultas", () => {
    const lista = [
        d({ id: "1", tipo: "neurona", neuronaId: "yo", estado: "pedida" }),
        d({ id: "2", tipo: "neurona", neuronaId: "otra", estado: "pedida" }),
        d({ id: "3", tipo: "neurona", neuronaId: "yo", estado: "descargada" }),
        d({ id: "4", tipo: "web", estado: "cancelada" }),
        d({ id: "5", appId: "omnifrecuencias", tipo: "web" }),
    ];

    it("pendientesPara solo devuelve lo pedido PARA esta neurona", () => {
        expect(pendientesPara("yo", lista).map((x) => x.id)).toEqual(["1"]);
    });

    it("destinosDeApp ignora los cancelados", () => {
        expect(destinosDeApp("audiomorphic", lista).map((x) => x.id)).toEqual(["1", "2", "3"]);
    });
});

describe("conEstado, etiquetas e ids", () => {
    it("conEstado siempre avanza `actualizada` para ganar la fusión", () => {
        const base = d({ id: "a", actualizada: 5000 });
        expect(conEstado(base, "cancelada", {}, 100).actualizada).toBe(5001);
        expect(conEstado(base, "cancelada", { archivo: "x.apk" }, 9000)).toMatchObject({ estado: "cancelada", archivo: "x.apk", actualizada: 9000 });
    });

    it("etiquetaDestino distingue este dispositivo, otra neurona y perfil", () => {
        expect(etiquetaDestino(d({ id: "a" }))).toBe("En la web (servidores StarSeed)");
        expect(etiquetaDestino(d({ id: "a", tipo: "neurona", neuronaId: "yo", neuronaNombre: "Mac" }), "yo")).toBe("Este dispositivo (Mac)");
        expect(etiquetaDestino(d({ id: "a", tipo: "neurona", neuronaId: "m", neuronaNombre: "Móvil de Ana", perfilNombre: "Arte" }), "yo")).toBe(
            "Móvil de Ana · perfil Arte",
        );
    });

    it("los ids nuevos son únicos y válidos", () => {
        const ids = new Set(Array.from({ length: 50 }, () => nuevoIdDestino(123)));
        expect(ids.size).toBe(50);
        expect(esDestino(d({ id: [...ids][0] }))).toBe(true);
    });
});
