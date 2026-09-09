/*
 * StarSeed OS · Ola 307 — plantillas de sala.
 *
 * Lo que se comprueba aquí es que abrir una sala útil sea un clic: que cada
 * plantilla diga PARA QUÉ sirve, que sus andamios quepan en el tipo de sala,
 * que el círculo de paz nazca privado (justicia restaurativa, §6) y que la
 * sala construida tenga a quien la abre como dueña.
 */

import { describe, expect, it } from "vitest";
import type { TipoSala } from "@/lib/salas/sala";
import {
    PLANTILLAS,
    capacidadesRequeridas,
    desdePlantilla,
    normalizar,
    plantillasPara,
} from "@/lib/salas/plantillas-sala";

/**
 * Espejo de `CAPACIDADES_POR_TIPO` (`@/lib/salas/sala`, misma ola): qué admite
 * cada tipo de sala. Se declara aquí para que esta prueba no dependa del orden
 * de fusión de las dos piezas; al integrarlas, basta importar la constante.
 */
const CAPACIDADES_ESPERADAS: Record<TipoSala, string[]> = {
    pizarra: ["trazos", "notas", "formas"],
    escritorio: ["ventanas", "archivos"],
    dashboard: ["widgets"],
    escena3d: ["objetos", "anclas", "avatares"],
    xr: ["objetos", "anclas", "avatares"],
};

function porId(id: string) {
    const plantilla = PLANTILLAS.find((p) => p.id === id);
    if (!plantilla) throw new Error(`falta la plantilla «${id}»`);
    return plantilla;
}

describe("plantillas de sala · el catálogo", () => {
    it("ofrece al menos las ocho plantillas, con id único y un porqué escrito", () => {
        expect(PLANTILLAS.length).toBeGreaterThanOrEqual(8);
        expect(new Set(PLANTILLAS.map((p) => p.id)).size).toBe(PLANTILLAS.length);
        for (const p of PLANTILLAS) {
            expect(p.nombre.trim().length).toBeGreaterThan(0);
            expect(p.proposito.trim().length).toBeGreaterThan(0);
            expect(p.porque.trim().length).toBeGreaterThan(20);
            expect(Object.keys(p.rolesSugeridos).length).toBeGreaterThan(0);
        }
    });

    it("cubre los tres ecosistemas y el trabajo de la red", () => {
        for (const id of [
            "asamblea",
            "circulo-de-paz",
            "aula",
            "taller-creativo",
            "panel-de-proyecto",
            "escritorio-de-equipo",
            "mapa-de-comunidad",
            "retrospectiva",
        ]) {
            expect(porId(id).id).toBe(id);
        }
    });
});

describe("plantillas de sala · andamios honestos", () => {
    it("cada elemento usa una capacidad que su tipo de sala admite", () => {
        for (const p of PLANTILLAS) {
            const admitidas = CAPACIDADES_ESPERADAS[p.tipo];
            for (const capacidad of capacidadesRequeridas(p)) {
                expect(admitidas, `${p.id} pide «${capacidad}» a una sala ${p.tipo}`)
                    .toContain(capacidad);
            }
        }
    });

    it("los andamios llegan vacíos y rotulados, sin contenido inventado", () => {
        for (const p of PLANTILLAS) {
            expect(p.elementos.length).toBeGreaterThan(0);
            for (const elemento of p.elementos) {
                expect(typeof elemento.datos.rotulo).toBe("string");
                expect(String(elemento.datos.rotulo).trim().length).toBeGreaterThan(0);
                expect(elemento.datos.vacio).toBe(true);
                for (const clave of Object.keys(elemento.datos)) {
                    expect(["rotulo", "vacio", "fuente"]).toContain(clave);
                }
            }
        }
    });

    it("la asamblea trae propuesta, argumentos, dudas y acuerdos", () => {
        const rotulos = porId("asamblea").elementos.map((e) => normalizar(String(e.datos.rotulo)));
        for (const esperado of ["propuesta", "favor", "contra", "dudas", "acuerdos"]) {
            expect(rotulos.some((r) => r.includes(esperado))).toBe(true);
        }
    });
});

describe("plantillas de sala · el círculo de paz nace privado", () => {
    it("sugiere visibilidad privada y lo explica en su porqué", () => {
        const circulo = porId("circulo-de-paz");
        expect(circulo.visibilidadSugerida).toBe("privada");
        expect(normalizar(circulo.porque)).toContain("privada");
    });

    it("la sala construida desde él también nace privada", () => {
        const sala = desdePlantilla(porId("circulo-de-paz"), "sala-1", "did:starseed:ana", 1000);
        expect(sala.visibilidad).toBe("privada");
    });
});

describe("plantillas de sala · buscar la que encaja", () => {
    it("plantillasPara(«pizarra») deja sólo salas de pizarra", () => {
        const pizarras = plantillasPara("pizarra");
        expect(pizarras.length).toBeGreaterThan(0);
        for (const p of pizarras) expect(p.tipo).toBe("pizarra");
        const ids = pizarras.map((p) => p.id);
        expect(ids).toContain("asamblea");
        expect(ids).toContain("retrospectiva");
        expect(ids).not.toContain("panel-de-proyecto");
    });

    it("ordena por afinidad sin mirar acentos ni mayúsculas", () => {
        expect(plantillasPara(undefined, "CÍRCULO de paz")[0].id).toBe("circulo-de-paz");
        expect(plantillasPara(undefined, "una retrospectiva del equipo")[0].id)
            .toBe("retrospectiva");
        expect(plantillasPara("pizarra", "asamblea del barrio")[0].id).toBe("asamblea");
    });

    it("no descarta opciones: sin propósito o sin coincidencias, siguen todas", () => {
        expect(plantillasPara().length).toBe(PLANTILLAS.length);
        expect(plantillasPara(undefined, "   ").length).toBe(PLANTILLAS.length);
        expect(plantillasPara(undefined, "zzzz qqqq").length).toBe(PLANTILLAS.length);
    });
});

describe("plantillas de sala · construir la sala", () => {
    it("desdePlantilla deja al creador como dueño y copia lo que la plantilla decide", () => {
        const aula = porId("aula");
        const sala = desdePlantilla(aula, "sala-aula-7", "did:starseed:alex", 1757000000000);
        expect(sala.id).toBe("sala-aula-7");
        expect(sala.miembros["did:starseed:alex"]).toBe("dueno");
        expect(Object.keys(sala.miembros)).toHaveLength(1);
        expect(sala.tipo).toBe(aula.tipo);
        expect(sala.titulo).toBe(aula.nombre);
        expect(sala.visibilidad).toBe(aula.visibilidadSugerida);
        expect(sala.proposito).toBe(aula.proposito);
        expect(sala.creadaEn).toBe(1757000000000);
    });

    it("nace en «local»: el transporte real lo decide elegirTransporte, no la plantilla", () => {
        for (const p of PLANTILLAS) {
            expect(desdePlantilla(p, `sala-${p.id}`, "did:starseed:ana", 1).transporte).toBe("local");
        }
    });
});
