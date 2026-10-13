/**
 * Pruebas del contrato de acciones de la colmena (rows de remoto-nodos.ts).
 */
import { describe, it, expect } from "vitest";
import { validarArgs, type AccionOrden } from "../remoto-nodos";

describe("acciones sobre el nodo que recibe la colmena", () => {
    it("desconectar no quiere argumentos", () => {
        expect(validarArgs("desconectar" as AccionOrden, {})).toBeNull();
        expect(validarArgs("desconectar" as AccionOrden, { motivo: "x" })).toContain(
            "argumento no admitido",
        );
    });

    it("contenedor con ‘contenedor’: los argumentos son trabajadores y activo", () => {
        expect(validarArgs("contenedor", { activo: true, trabajadores: 2 })).toBeNull();
    });

    it("contenedor hoy: el validador no controla 'activo' (contrato pendiente de main)", () => {
        // Aviso: en la rama había una regla de tipo estricto que main NO definió; si en el futuro se
        // añade "activo booleano obligatorio" hay que actualizar estos expects.
        expect(validarArgs("contenedor" as AccionOrden, {})).toBeNull();
        expect(validarArgs("contenedor" as AccionOrden, { activo: "si" })).toBeNull();
        expect(validarArgs("contenedor" as AccionOrden, { activo: 1 })).toBeNull();
    });
});
