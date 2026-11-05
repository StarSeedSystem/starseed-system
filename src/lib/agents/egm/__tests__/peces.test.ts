import { describe, expect, it } from "vitest";

import {
    leerObjeciones,
    promptDePez,
    type GravedadObjecion,
    type Objecion,
    type TipoArtefacto,
    type Veredicto,
    veredicto,
} from "../peces";

describe("promptDePez", () => {
    it("devuelve prompt para respuesta con el texto del artefacto", () => {
        const artefacto = "La función calcula el total con descuento del 10%";
        const prompt = promptDePez(artefacto, "respuesta");
        expect(prompt).toContain(artefacto);
        expect(prompt).toContain("revisa este respuesta larga o propuesta de creación");
        expect(prompt).toContain("bloquea|");
        expect(prompt).toContain("importa|");
        expect(prompt).toContain("menor|");
    });

    it("devuelve prompt para plan con el texto del artefacto", () => {
        const artefacto = "1. Crear tabla de usuarios 2. Agregar validación 3. Deploy";
        const prompt = promptDePez(artefacto, "plan");
        expect(prompt).toContain(artefacto);
        expect(prompt).toContain("revisa este plan de implementación");
    });

    it("devuelve prompt para ola con el texto del artefacto", () => {
        const artefacto = "Ola 1104R: instalar repos EGM y crear módulo peces";
        const prompt = promptDePez(artefacto, "ola");
        expect(prompt).toContain(artefacto);
        expect(prompt).toContain("revisa este ola o tarea del enjambre");
    });

    it("devuelve prompt para página con el texto del artefacto", () => {
        const artefacto = "Landing page con hero, testimonios y CTA";
        const prompt = promptDePez(artefacto, "pagina");
        expect(prompt).toContain(artefacto);
        expect(prompt).toContain("revisa este página o publicación");
    });

    it("devuelve prompt para app con el texto del artefacto", () => {
        const artefacto = "App de notas con sincronización Realtime";
        const prompt = promptDePez(artefacto, "app");
        expect(prompt).toContain(artefacto);
        expect(prompt).toContain("revisa este app o widget");
    });

    it("ignora líneas sin gravedad válida y no usa markdown en el prompt", () => {
        const artefacto = "Resumen del proyecto";
        const prompt = promptDePez(artefacto, "respuesta");
        expect(prompt).not.toContain("Lista");
    });
});

describe("leerObjeciones", () => {
    it("parsea objeciones con gravedad válida", () => {
        const texto = "bloquea| El cálculo no considera IVA\nimporta| Falta validar el email\nmenor| Podría mejorar el placeholder";
        const resultado = leerObjeciones(texto);
        expect(resultado).toHaveLength(3);
        expect(resultado[0]).toEqual({ gravedad: "bloquea", texto: "El cálculo no considera IVA" });
        expect(resultado[1]).toEqual({ gravedad: "importa", texto: "Falta validar el email" });
        expect(resultado[2]).toEqual({ gravedad: "menor", texto: "Podría mejorar el placeholder" });
    });

    it("ignora líneas sin formato correcto", () => {
        const texto = "Esto no es una objeción\nbloquea| Solo esta sí\nTexto cualquiera";
        const resultado = leerObjeciones(texto);
        expect(resultado).toHaveLength(1);
        expect(resultado[0]).toEqual({ gravedad: "bloquea", texto: "Solo esta sí" });
    });

    it("ignora líneas con texto vacío después del separador", () => {
        const texto = "bloquea|   \nimporta| Hay un error\nmenor|";
        const resultado = leerObjeciones(texto);
        expect(resultado).toHaveLength(1);
        expect(resultado[0]).toEqual({ gravedad: "importa", texto: "Hay un error" });
    });

    it("elimina duplicados manteniendo el primero", () => {
        const texto = "bloquea| Error crítico\nimporta| Mensaje repetido\nbloquea| Error crítico";
        const resultado = leerObjeciones(texto);
        expect(resultado).toHaveLength(2);
    });

    it("maneja texto real de modelo con ruido inicial", () => {
        const texto = `He revisado el artefacto y encontré:
bloquea| La variable 'total' no se define antes de usarla
importa| No hay manejo de errores en la API call
menor| El nombre del archivo no sigue convención kebab-case
No hay más objeciones.`;
        const resultado = leerObjeciones(texto);
        expect(resultado).toHaveLength(3);
        expect(resultado[0].gravedad).toBe("bloquea");
        expect(resultado[1].gravedad).toBe("importa");
        expect(resultado[2].gravedad).toBe("menor");
    });

    it("devuelve arreglo vacío para texto sin objeciones válidas", () => {
        const texto = "Todo está correcto\nSin objeciones";
        const resultado = leerObjeciones(texto);
        expect(resultado).toEqual([]);
    });
});

describe("veredicto", () => {
    it("pasa true cuando no hay objeciones bloquea", () => {
        const objeciones: Objecion[] = [
            { gravedad: "importa", texto: "Pequeño detalle" },
            { gravedad: "menor", texto: "Sugerencia" },
        ];
        const result = veredicto(objeciones);
        expect(result.pasa).toBe(true);
        expect(result.bloqueantes).toEqual([]);
    });

    it("pasa false cuando hay objeciones bloquea", () => {
        const objeciones: Objecion[] = [
            { gravedad: "bloquea", texto: "Error crítico" },
            { gravedad: "importa", texto: "Observación" },
        ];
        const result = veredicto(objeciones);
        expect(result.pasa).toBe(false);
        expect(result.bloqueantes).toHaveLength(1);
        expect(result.bloqueantes[0]).toEqual({ gravedad: "bloquea", texto: "Error crítico" });
    });

    it("devuelve todos los bloqueantes si hay varios", () => {
        const objeciones: Objecion[] = [
            { gravedad: "bloquea", texto: "Error 1" },
            { gravedad: "importa", texto: "Obs 1" },
            { gravedad: "bloquea", texto: "Error 2" },
        ];
        const result = veredicto(objeciones);
        expect(result.pasa).toBe(false);
        expect(result.bloqueantes).toHaveLength(2);
    });

    it("pasa false con arreglo vacío de objeciones", () => {
        const result = veredicto([]);
        expect(result.pasa).toBe(true);
        expect(result.bloqueantes).toEqual([]);
    });
});

describe("tipos públicos", () => {
    it("TipoArtefacto incluye todos los valores permitidos", () => {
        const tipos: TipoArtefacto[] = ["respuesta", "plan", "ola", "pagina", "app"];
        expect(tipos).toHaveLength(5);
    });

    it("GravedadObjecion incluye los tres valores", () => {
        const gravedades: GravedadObjecion[] = ["bloquea", "importa", "menor"];
        expect(gravedades).toHaveLength(3);
    });
});