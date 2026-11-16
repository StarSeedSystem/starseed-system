import { describe, expect, it } from "vitest";
import {
    borrar,
    borrarTodo,
    listar,
    registrar,
    type EntradaHistorial,
    type AlmacenHistorial,
} from "../historial";

describe("historial del traductor", () => {
    const almacenMemoria = (): AlmacenHistorial => {
        const datos = new Map<string, string>();
        return {
            obtener: (clave: string) => {
                const v = datos.get(clave);
                return v === undefined ? null : v;
            },
            guardar: (clave: string, valor: string) => {
                datos.set(clave, valor);
            },
            borrar: (clave: string) => {
                datos.delete(clave);
            },
        };
    };

    describe("registrar", () => {
        it("guarda una entrada con todos los campos", () => {
            const almacen = almacenMemoria();
            registrar(
                { origen: "es", destino: "en", textoOrigen: "hola", textoDestino: "hello", motor: "local" },
                almacen,
                { sinHistorial: false }
            );
            const entradas = listar(almacen);
            expect(entradas).toHaveLength(1);
            expect(entradas[0]).toMatchObject({
                origen: "es",
                destino: "en",
                textoOrigen: "hola",
                textoDestino: "hello",
                motor: "local",
            });
            expect(entradas[0].id).toBeDefined();
            expect(entradas[0].timestamp).toBeDefined();
        });

        it("no guarda nada si sinHistorial es true", () => {
            const almacen = almacenMemoria();
            registrar(
                { origen: "es", destino: "en", textoOrigen: "hola", textoDestino: "hello", motor: "local" },
                almacen,
                { sinHistorial: true }
            );
            expect(listar(almacen)).toHaveLength(0);
        });

        it("trunca textoOrigen y textoDestino a 2000 caracteres", () => {
            const almacen = almacenMemoria();
            const largo = "a".repeat(2500);
            registrar(
                { origen: "es", destino: "en", textoOrigen: largo, textoDestino: largo, motor: "local" },
                almacen,
                { sinHistorial: false }
            );
            const entradas = listar(almacen);
            expect(entradas[0].textoOrigen.length).toBe(2000);
            expect(entradas[0].textoDestino.length).toBe(2000);
        });

        it("respeta el tope de 50 entradas (elimina la más antigua)", () => {
            const almacen = almacenMemoria();
            for (let i = 0; i < 55; i++) {
                registrar(
                    { origen: "es", destino: "en", textoOrigen: `texto${i}`, textoDestino: `text${i}`, motor: "local" },
                    almacen,
                    { sinHistorial: false }
                );
            }
            const entradas = listar(almacen);
            expect(entradas).toHaveLength(50);
            expect(entradas[0].textoOrigen).toBe("texto5"); // las 5 primeras se borraron
        });

        it("maneja error de almacenamiento sin lanzar", () => {
            const almacenFallo: AlmacenHistorial = {
                obtener: () => { throw new Error("fallo"); },
                guardar: () => { throw new Error("fallo"); },
                borrar: () => { throw new Error("fallo"); },
            };
            expect(() =>
                registrar(
                    { origen: "es", destino: "en", textoOrigen: "hola", textoDestino: "hello", motor: "local" },
                    almacenFallo,
                    { sinHistorial: false }
                )
            ).not.toThrow();
        });
    });

    describe("listar", () => {
        it("devuelve array vacío si no hay historial", () => {
            const almacen = almacenMemoria();
            expect(listar(almacen)).toEqual([]);
        });

        it("devuelve entradas ordenadas por timestamp descendente", () => {
            const almacen = almacenMemoria();
            registrar({ origen: "es", destino: "en", textoOrigen: "primero", textoDestino: "first", motor: "local" }, almacen, { sinHistorial: false });
            registrar({ origen: "es", destino: "en", textoOrigen: "segundo", textoDestino: "second", motor: "local" }, almacen, { sinHistorial: false });
            const entradas = listar(almacen);
            expect(entradas[0].textoOrigen).toBe("segundo");
            expect(entradas[1].textoOrigen).toBe("primero");
        });

        it("maneja datos corruptos en almacenamiento (JSON inválido)", () => {
            const almacen: AlmacenHistorial = {
                obtener: () => "no-es-json",
                guardar: () => {},
                borrar: () => {},
            };
            expect(listar(almacen)).toEqual([]);
        });

        it("maneja datos corruptos en almacenamiento (array con entradas inválidas)", () => {
            const almacen: AlmacenHistorial = {
                obtener: () => JSON.stringify([{ id: "1", origen: "es" }]), // falta campos requeridos
                guardar: () => {},
                borrar: () => {},
            });
            expect(listar(almacen)).toEqual([]);
        });

        it("maneja error de almacenamiento sin lanzar", () => {
            const almacenFallo: AlmacenHistorial = {
                obtener: () => { throw new Error("fallo"); },
                guardar: () => {},
                borrar: () => {},
            };
            expect(listar(almacenFallo)).toEqual([]);
        });
    });

    describe("borrar", () => {
        it("elimina la entrada con el id dado", () => {
            const almacen = almacenMemoria();
            registrar({ origen: "es", destino: "en", textoOrigen: "hola", textoDestino: "hello", motor: "local" }, almacen, { sinHistorial: false });
            const id = listar(almacen)[0].id;
            borrar(id, almacen);
            expect(listar(almacen)).toHaveLength(0);
        });

        it("no falla si el id no existe", () => {
            const almacen = almacenMemoria();
            expect(() => borrar("id-inexistente", almacen)).not.toThrow();
        });

        it("maneja error de almacenamiento sin lanzar", () => {
            const almacenFallo: AlmacenHistorial = {
                obtener: () => "[]",
                guardar: () => {},
                borrar: () => { throw new Error("fallo"); },
            };
            expect(() => borrar("cualquiera", almacenFallo)).not.toThrow();
        });
    });

    describe("borrarTodo", () => {
        it("elimina todas las entradas", () => {
            const almacen = almacenMemoria();
            registrar({ origen: "es", destino: "en", textoOrigen: "hola", textoDestino: "hello", motor: "local" }, almacen, { sinHistorial: false });
            registrar({ origen: "es", destino: "en", textoOrigen: "adios", textoDestino: "bye", motor: "local" }, almacen, { sinHistorial: false });
            borrarTodo(almacen);
            expect(listar(almacen)).toHaveLength(0);
        });

        it("maneja error de almacenamiento sin lanzar", () => {
            const almacenFallo: AlmacenHistorial = {
                obtener: () => "[]",
                guardar: () => {},
                borrar: () => { throw new Error("fallo"); },
            };
            expect(() => borrarTodo(almacenFallo)).not.toThrow();
        });
    });
});