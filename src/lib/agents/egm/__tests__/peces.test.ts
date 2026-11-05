import { describe, expect, it } from "vitest";

import {
    leerObjeciones,
    promptDePez,
    veredicto,
    type Objecion,
    type TipoArtefacto,
} from "@/lib/agents/egm/peces";

const TIPOS: TipoArtefacto[] = ["respuesta", "plan", "ola", "pagina", "app"];

describe("promptDePez · el revisor sin contexto", () => {
    it("incluye el artefacto entero y su tipo, sin añadir contexto externo", () => {
        const artefacto = "Propongo publicar el aviso el viernes a las 9:00.";
        const prompt = promptDePez(artefacto, "respuesta");
        expect(prompt).toContain(artefacto);
        expect(prompt).toMatch(/respuesta/i);
        expect(prompt).toMatch(/no conoces|sin contexto|no tienes contexto/i);
    });

    it("nombra cada tipo de artefacto, incluida la página con tilde", () => {
        const etiquetas: Record<string, RegExp> = {
            respuesta: /respuesta de un agente/i,
            plan: /plan de trabajo/i,
            ola: /ola del enjambre/i,
            pagina: /página web/i,
            página: /página web/i,
            app: /aplicación/i,
        };
        for (const tipo of [...TIPOS, "página" as const]) {
            expect(promptDePez("texto", tipo), tipo).toMatch(etiquetas[tipo]);
        }
    });

    it("explica las tres gravedades y el formato, y tolera un artefacto vacío", () => {
        const prompt = promptDePez("   ", "plan");
        for (const gravedad of ["bloquea", "importa", "menor"]) expect(prompt).toContain(gravedad);
        expect(prompt).toMatch(/una objeción por línea/i);
        expect(prompt).toMatch(/sin objeciones/i);
        expect(prompt).toContain("(sin contenido)");
    });
});

describe("leerObjeciones · lectura tolerante", () => {
    it("lee una objeción por línea con su gravedad", () => {
        const texto = [
            "bloquea · afirma un dato sin fuente",
            "importa: no explica el paso 2",
            "menor — usa «usted» y luego «tú»",
        ].join("\n");
        expect(leerObjeciones(texto)).toEqual<Objecion[]>([
            { gravedad: "bloquea", texto: "afirma un dato sin fuente" },
            { gravedad: "importa", texto: "no explica el paso 2" },
            { gravedad: "menor", texto: "usa «usted» y luego «tú»" },
        ]);
    });

    it("aguanta un texto real de modelo con viñetas, negritas, numeración y ruido", () => {
        const texto = [
            "Claro, aquí tienes mi revisión:",
            "1. **Bloquea**: afirma que la reunión es el viernes sin ninguna fecha en el artefacto.",
            "- [x] importa — no explica de dónde sale el 40 % de ahorro.",
            "* menor: mezcla «usted» y «tú» en el mismo párrafo.",
            "Esta línea no es una objeción y debe ignorarse.",
            "bloqueante: repite el mismo párrafo dos veces.",
            "(importa) el enlace de la fuente no aparece.",
            "Nota final: sin objeciones adicionales.",
        ].join("\n");
        expect(leerObjeciones(texto)).toEqual<Objecion[]>([
            { gravedad: "bloquea", texto: "afirma que la reunión es el viernes sin ninguna fecha en el artefacto." },
            { gravedad: "importa", texto: "no explica de dónde sale el 40 % de ahorro." },
            { gravedad: "menor", texto: "mezcla «usted» y «tú» en el mismo párrafo." },
            { gravedad: "bloquea", texto: "repite el mismo párrafo dos veces." },
            { gravedad: "importa", texto: "el enlace de la fuente no aparece." },
        ]);
    });

    it("ignora líneas sin gravedad o con la gravedad a media frase, y no inventa vacías", () => {
        const texto = "Revisión:\nsin objeciones\nNo bloquea la publicación.\nLa peña importa mucho.\nmenor\nbloquea:   \r\n";
        expect(leerObjeciones(texto)).toEqual([]);
    });

    it("quita duplicados aunque cambie la decoración, sin mezclar gravedades distintas", () => {
        const texto = [
            "bloquea: falta la prueba",
            "**Bloquea** — falta la prueba",
            "- [ ] bloquea: falta la prueba",
            "importa: falta la prueba",
        ].join("\n");
        expect(leerObjeciones(texto)).toEqual<Objecion[]>([
            { gravedad: "bloquea", texto: "falta la prueba" },
            { gravedad: "importa", texto: "falta la prueba" },
        ]);
    });
});

describe("veredicto · basta una objeción bloqueante", () => {
    it("pasa solo si no hay ninguna gravedad «bloquea»", () => {
        expect(veredicto([])).toEqual({ pasa: true, bloqueantes: 0 });
    });

    it("no se deja engañar por importa o menor, pero cuenta todas las bloqueantes", () => {
        const leves: Objecion[] = [
            { gravedad: "importa", texto: "a" },
            { gravedad: "menor", texto: "b" },
        ];
        expect(veredicto(leves)).toEqual({ pasa: true, bloqueantes: 0 });
        expect(
            veredicto([...leves, { gravedad: "bloquea", texto: "c" }, { gravedad: "bloquea", texto: "d" }]),
        ).toEqual({ pasa: false, bloqueantes: 2 });
    });

    it("de punta a punta: un texto real con una bloqueante no pasa", () => {
        const texto = "bloquea: falta el enlace\nimporta: sobra un párrafo\nmenor: tilde";
        expect(veredicto(leerObjeciones(texto))).toEqual({ pasa: false, bloqueantes: 1 });
    });
});
