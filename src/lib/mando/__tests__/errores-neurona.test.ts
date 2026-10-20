import { describe, it, expect } from "vitest";
import { normalizarError, limpiarDatosPersonales, huella, agrupar, ContextoError } from "../errores-neurona";

const contexto: ContextoError = { ambito: "neuron", neurona: "n-01", proceso: "mando" };

describe("errores-neurona", () => {
    it("limpia correos electrónicos", () => {
        const ev = normalizarError(new Error("contacto alexbordongarrigos@gmail.com falló"), contexto);
        const limpio = limpiarDatosPersonales(ev);
        expect(limpio.exception.values[0].value).not.toContain("@");
        expect(limpio.exception.values[0].value).toContain("[EMAIL]");
    });

    it("limpia tokens sk-", () => {
        const ev = normalizarError(new Error("clave sk-abc123def456 falló"), contexto);
        const limpio = limpiarDatosPersonales(ev);
        expect(limpio.exception.values[0].value).toContain("[TOKEN-sk]");
        expect(limpio.exception.values[0].value).not.toContain("sk-abc");
    });

    it("limpia rutas de usuario /Users/<nombre>", () => {
        const ev = normalizarError(new Error("archivo /Users/Alex/proyecto falló"), contexto);
        const limpio = limpiarDatosPersonales(ev);
        expect(limpio.exception.values[0].value).toContain("/Users/[NOMBRE]");
    });

    it("limpia teléfonos", () => {
        const ev = normalizarError(new Error("llamar +34 612 345 678"), contexto);
        expect(limpiarDatosPersonales(ev).exception.values[0].value).toContain("[TELEFONO]");
    });

    it("limpia IPs", () => {
        const ev = normalizarError(new Error("conexión 192.168.1.1 rechazada"), contexto);
        expect(limpiarDatosPersonales(ev).exception.values[0].value).toContain("[IP]");
    });

    it("limpia tokens Bearer y JWT", () => {
        const evBearer = normalizarError(new Error("autenticación Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc"), contexto);
        expect(limpiarDatosPersonales(evBearer).exception.values[0].value).toContain("[TOKEN-Bearer]");
        const evJwt = normalizarError(new Error("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.def"), contexto);
        expect(limpiarDatosPersonales(evJwt).exception.values[0].value).toContain("[TOKEN-JWT]");
    });

    it("limpia rutas /home/usuario", () => {
        const ev = normalizarError(new Error("archivo /home/alex/config falló"), contexto);
        expect(limpiarDatosPersonales(ev).exception.values[0].value).toContain("/home/[NOMBRE]");
    });

    it("dos errores iguales con mensajes distintos comparten huella", () => {
        const base = new Error("fallo de lectura");
        const ev1 = normalizarError(base, contexto);
        const ev2 = normalizarError(new Error("fallo de lectura"), contexto);
        expect(huella(ev1)).toBe(huella(ev2));
        expect(ev1.event_id).not.toBe(ev2.event_id);
    });

    it("un error de otro ámbito no comparte huella con el mismo mensaje", () => {
        const ev1 = normalizarError(new Error("fallo"), contexto);
        const ev2 = normalizarError(new Error("fallo"), { ...contexto, ambito: "cerebro" });
        expect(huella(ev1)).not.toBe(huella(ev2));
    });

    it("agrupar cuenta correctamente", () => {
        const ev1 = normalizarError(new Error("e1"), contexto);
        const ev2 = normalizarError(new Error("e1"), contexto);
        const ev3 = normalizarError(new Error("e2"), { ...contexto, ambito: "cerebro" });
        const grupo = agrupar([ev1, ev2, ev3]);
        expect(grupo).toHaveProperty(huella(ev1));
        const gNeurona = grupo[huella(ev1)];
        expect(gNeurona.veces).toBe(2);
        expect(gNeurona.primero).toBe(ev1.timestamp);
        expect(gNeurona.ultimo).toBe(ev2.timestamp);
        expect(gNeurona.ejemplo.event_id).toBe(ev1.event_id);
        expect(grupo).toHaveProperty(huella(ev3));
        expect(grupo[huella(ev3)].veces).toBe(1);
    });
});
