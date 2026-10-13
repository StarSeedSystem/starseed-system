/**
 * Rescate de la rama nube/a1-20261013-072810-RTRTS1010-EV-ORACLE-1ab: los casos de órdenes de
 * neurona que main no cubría, adaptados a la API de hoy (`remoto-nodos.ts`). Las etiquetas de
 * ACCIONES y la exclusión en ACCIONES_DEL_LIDER ya están en remoto-nodos.test.ts; lo de
 * «contenedor» destapa una divergencia REAL con Python (el bloque de `args_validos` de
 * nodo_metagenesis_logica.py falta en TypeScript) y se reporta en la tarea, no aquí.
 */
import { describe, expect, it } from "vitest";
import { validarArgs } from "../remoto-nodos";

describe("validarArgs: «desconectar» no quiere argumentos", () => {
    it("sin argumentos pasa; con cualquier argumento se rechaza", () => {
        expect(validarArgs("desconectar", {})).toBeNull();
        expect(validarArgs("desconectar", { motivo: "x" })).toContain("argumento no admitido");
    });
});
