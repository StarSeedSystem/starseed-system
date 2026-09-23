import { describe, expect, it } from "vitest";

import {
    definicionDeLinea,
    parsearCommits,
    resumenDeCambios,
    tareaDeAsunto,
    tareasIntegradasEnMain,
    ubicarDefiniciones,
} from "@/lib/mando/integradas";
import { detalleDeMedidor } from "@/lib/mando/medidores";

// (2026-09-23) Alex: «las tareas integradas con su información de los cambios y enlaces a las
// funciones implementadas en su estado actual». Se cuentan desde main, no desde progreso.json
// (de las más recientes, ningún `sha` anotado allí estaba en main).

const conocidas = new Set(["DEDUPE", "MND6", "RM2"]);

describe("tareaDeAsunto", () => {
    it("el commit de integración trae ola, id y título", () => {
        expect(tareaDeAsunto("Ola 237 · piezas que faltaban · DEDUPE: No subir dos veces", conocidas)).toEqual({
            id: "DEDUPE",
            ola: "Ola 237 · piezas que faltaban",
            titulo: "No subir dos veces",
            salvavidas: false,
        });
    });

    it("el salvavidas es trabajo del agente de la misma tarea", () => {
        expect(tareaDeAsunto("salvavidas · DEDUPE: trabajo del agente antes de las puertas", conocidas)?.salvavidas).toBe(
            true,
        );
    });

    it("un asunto normal que empieza por una palabra y dos puntos NO es una tarea", () => {
        expect(tareaDeAsunto("mando: dos procesos reiniciándolo a la vez", conocidas)).toBeNull();
    });
});

describe("tareasIntegradasEnMain", () => {
    it("junta los commits de cada tarea, la más reciente primero", () => {
        const log = [
            "aaa\x1f2026-09-22T05:58:47\x1fOla 237 · x · DEDUPE: No subir dos veces",
            "bbb\x1f2026-09-22T05:58:47\x1fsalvavidas · DEDUPE: trabajo del agente",
            "ccc\x1f2026-09-21T21:44:10\x1fmando: algo que no es tarea",
            "ddd\x1f2026-09-21T20:41:08\x1f363 · RM2: Estado PAIR",
        ].join("\n");
        const t = tareasIntegradasEnMain(log, conocidas);
        expect(t.map((x) => x.id)).toEqual(["DEDUPE", "RM2"]);
        expect(t[0].commits).toEqual([
            { sha: "aaa", salvavidas: false },
            { sha: "bbb", salvavidas: true },
        ]);
        expect(t[1].ola).toBe("363");
    });
});

describe("definicionDeLinea", () => {
    it("reconoce funciones, flechas, clases, tipos y Python", () => {
        expect(definicionDeLinea("export async function leerOlas(x) {")).toEqual({ nombre: "leerOlas", tipo: "función" });
        expect(definicionDeLinea("export const Panel = ({ a }: P) => {")).toEqual({ nombre: "Panel", tipo: "función" });
        expect(definicionDeLinea("export interface OlaActiva {")).toEqual({ nombre: "OlaActiva", tipo: "tipo" });
        expect(definicionDeLinea("class Vigia(object):")).toEqual({ nombre: "Vigia", tipo: "clase" });
        expect(definicionDeLinea("    def agentes_de_nube(datos):")).toEqual({ nombre: "agentes_de_nube", tipo: "función" });
        expect(definicionDeLinea("const x = 3;")).toBeNull();
    });
});

describe("parsearCommits", () => {
    const salida =
        "\x1eabc\x1f2026-09-22T05:58:47\x1fsalvavidas · DEDUPE: trabajo\n\n" +
        "51\t0\tsrc/lib/__tests__/os-files.test.ts\n" +
        "4\t4\tsrc/lib/files/os-files.ts\n" +
        "3\t0\tstarseed_memory_root/olas/progreso.json\n" +
        "diff --git a/src/lib/files/os-files.ts b/src/lib/files/os-files.ts\n" +
        "--- a/src/lib/files/os-files.ts\n" +
        "+++ b/src/lib/files/os-files.ts\n" +
        "@@ -1,0 +2,2 @@\n" +
        "+export function dedupePorChecksum(a: string) {\n" +
        "+  return a;\n";

    it("saca archivos (sin la memoria) y lo que define", () => {
        const [c] = parsearCommits(salida);
        expect(c.sha).toBe("abc");
        expect(c.archivos.map((a) => a.ruta)).toEqual(["src/lib/__tests__/os-files.test.ts", "src/lib/files/os-files.ts"]);
        expect(c.definiciones).toEqual([{ ruta: "src/lib/files/os-files.ts", nombre: "dedupePorChecksum", tipo: "función" }]);
    });
});

describe("ubicarDefiniciones", () => {
    it("da la línea en el archivo de hoy, o null si ya no está", () => {
        const u = ubicarDefiniciones(
            [
                { ruta: "a.ts", nombre: "vive", tipo: "función" },
                { ruta: "a.ts", nombre: "muerta", tipo: "función" },
                { ruta: "b.ts", nombre: "x", tipo: "función" },
            ],
            (r) => (r === "a.ts" ? "// cabecera\nexport function vive() {}\n" : null),
        );
        expect(u.map((x) => x.linea)).toEqual([2, null, null]);
    });
});

describe("resumenDeCambios", () => {
    it("suma por archivo", () => {
        expect(
            resumenDeCambios([
                { ruta: "a", mas: 3, menos: 1 },
                { ruta: "a", mas: 2, menos: 0 },
                { ruta: "b", mas: 1, menos: 1 },
            ]),
        ).toBe("+6 −2 en 2 archivos");
        expect(resumenDeCambios([])).toBe("sin cambios de código (solo memoria o registros)");
    });
});

describe("medidor «integradas»", () => {
    it("cada tarea trae commits, archivos con enlace a main y lo que implementa con su línea de hoy", () => {
        const d = detalleDeMedidor("integradas", {
            repoGitHub: "o/r",
            integradas: {
                total: 412,
                lista: [
                    {
                        id: "DEDUPE",
                        titulo: "No subir dos veces",
                        ola: "237",
                        fecha: "2026-09-22T05:58:47",
                        commits: [
                            {
                                sha: "aaaaaaaa11",
                                fecha: "2026-09-22T05:58:47",
                                asunto: "Ola 237 · DEDUPE: No subir dos veces",
                                clase: "integración",
                                archivos: [],
                            },
                            {
                                sha: "bbbbbbbb22",
                                fecha: "2026-09-22T05:58:47",
                                asunto: "salvavidas · DEDUPE: trabajo",
                                clase: "trabajo del agente",
                                archivos: [{ ruta: "src/a.ts", mas: 4, menos: 4 }],
                            },
                        ],
                        ubicaciones: [
                            { ruta: "src/a.ts", nombre: "dedupe", tipo: "función", linea: 12 },
                            { ruta: "src/a.ts", nombre: "vieja", tipo: "función", linea: null },
                        ],
                    },
                ],
            },
        });
        expect(d.resumen).toMatch(/^412 tareas integradas en main/);
        const [f] = d.filas;
        expect(f.titulo).toBe("DEDUPE · No subir dos veces");
        expect(f.etapa).toBe("+4 −4 en 1 archivo");
        expect(f.enlace).toBe("https://github.com/o/r/commit/aaaaaaaa11");
        const ficha = f.ficha ?? [];
        expect(ficha.find((x) => x.etiqueta === "Ola")?.valor).toBe("Ola 237");
        expect(ficha.find((x) => x.etiqueta === "Archivo")?.enlace).toBe("https://github.com/o/r/blob/main/src/a.ts");
        const impl = ficha.filter((x) => x.etiqueta === "Implementa");
        expect(impl[0].enlace).toBe("https://github.com/o/r/blob/main/src/a.ts#L12");
        expect(impl[1].aviso).toBe(true);
        expect(impl[1].valor).toContain("ya no está");
    });
});
