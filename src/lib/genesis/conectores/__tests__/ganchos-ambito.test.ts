import { describe, it, expect } from "vitest";
import {
    verificarEntradaGancho,
    firmarSalidaGancho,
    EntradaVerificada,
    ErrorEntrada,
    CABECERA_FIRMA,
    CABECERA_TIMESTAMP,
    PREFIJO_FIRMA,
    VALIDAD_ANTI_REPETICION_MS,
    firmarCuerpo
} from "../ganchos-ambito";

describe("ganchos-ambito (unit tests)", () => {
    // Mocks
    const ambitoIdTest = "ambito-test";
    const secretoTest = "secreto-super-secreto";
    const cuerpoTest = "{\"hola\":\"mundo\"}";
    const cuerpoUint8Test = new TextEncoder().encode(cuerpoTest);

    // Función para obtener secreto (mock)
    const obtenerSecretoMock = async (id: string): Promise<string | null> => {
        if (id === ambitoIdTest) return secretoTest;
        return null;
    };

    // Función para obtener tiempo actual (mock)
    const tiempoActualMock = 1_700_000_000_000; // Fecha fija para pruebas
    const obtenerAhoraMock = () => tiempoActualMock;

    // Almacén anti-repetición mock (simpleMap)
    const crearAlmacenMock = () => {
        const usados = new Map<string, Set<number>>(); // ambitoId -> set of timestamps
        return {
            marcarUsado: (ambitoId: string, timestamp: number): void => {
                if (!usados.has(ambitoId)) {
                    usados.set(ambitoId, new Set());
                }
                usados.get(ambitoId)!.add(timestamp);
            },
            yaUsado: (ambitoId: string, timestamp: number): boolean => {
                return usados.get(ambitoId)?.has(timestamp) ?? false;
            }
        };
    };

    describe("verificarEntradaGancho", () => {
        it("debe rechazar si falta timestamp", async () => {
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                null, // cabeceraTimestamp
                "sha256=abc", // cabeceraFirma
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.FALTA_TIMESTAMP);
            }
        });

        it("debe rechazar si timestamp no es numérico", async () => {
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                "no-es-numero",
                "sha256=abc",
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.TIMESTAMP_INVALIDO);
            }
        });

        it("debe rechazar si timestamp fuera de ventana (demasiado antiguo)", async () => {
            const timestampAntiguo = tiempoActualMock - VALIDAD_ANTI_REPETICION_MS - 1;
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                timestampAntiguo.toString(),
                "sha256=abc", // firma incorrecta a propósito, pero primero fallará por ventana
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.TIMESTAMP_FUERA_VENTANA);
            }
        });

        it("debe rechazar si timestamp fuera de ventana (demasiado futuro)", async () => {
            const timestampFuturo = tiempoActualMock + VALIDAD_ANTI_REPETICION_MS + 1;
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                timestampFuturo.toString(),
                "sha256=abc",
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.TIMESTAMP_FUERA_VENTANA);
            }
        });

        it("debe rechazar si timestamp repetido", async () => {
            const almacen = crearAlmacenMock();
            const timestamp = tiempoActualMock;
            // Marcar como usado
            almacen.marcarUsado(ambitoIdTest, timestamp);
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                timestamp.toString(),
                "sha256=abc",
                obtenerSecretoMock,
                obtenerAhoraMock,
                almacen
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.TIMESTAMP_REPETIDO);
            }
        });

        it("debe rechazar si falta firma", async () => {
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                tiempoActualMock.toString(),
                null, // cabeceraFirma
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.FALTA_FIRMA);
            }
        });

        it("debe rechazar si formato de firma inválido", async () => {
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                tiempoActualMock.toString(),
                "sha256=ggg", // no hex
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.FIRMA_INVALIDA);
            }
        });

        it("debe rechazar si secreto no configurado", async () => {
            const obtenerSecretoNull = async (_: string): Promise<string | null> => {
                return null;
            };
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                tiempoActualMock.toString(),
                "sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                obtenerSecretoNull,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.error).toBe(ErrorEntrada.SECRETO_NO_CONFIGURADO);
            }
        });

        it("debe aceptar entrada válida", async () => {
            // Primero, generar una firma válida para el cuerpo y el secreto
            const firmaValida = firmarCuerpo(cuerpoTest, secretoTest);
            const cabeceraFirma = PREFIJO_FIRMA + firmaValida;
            const resultado = await verificarEntradaGancho(
                ambitoIdTest,
                cuerpoTest,
                tiempoActualMock.toString(),
                cabeceraFirma,
                obtenerSecretoMock,
                obtenerAhoraMock,
                crearAlmacenMock()
            );
            expect(resultado.ok).toBe(true);
            if (resultado.ok) {
                expect(resultado.entrada.cuerpo).toBe(cuerpoTest);
                expect(resultado.entrada.timestamp).toBe(tiempoActualMock);
            }
        });
    });

    describe("firmarSalidaGancho", () => {
        it("debe devolver cabeceras con firma y timestamp", async () => {
            const resultado = await firmarSalidaGancho(
                ambitoIdTest,
                cuerpoTest,
                obtenerSecretoMock,
                obtenerAhoraMock
            );
            expect(resultado[CABECERA_FIRMA]).toBe(`${PREFIJO_FIRMA}${firmarCuerpo(cuerpoTest, secretoTest)}`);
            expect(resultado[CABECERA_TIMESTAMP]).toBe(tiempoActualMock.toString());
        });
    });
});