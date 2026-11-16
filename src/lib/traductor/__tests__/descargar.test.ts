/**
 * TU1116-APP-F1 · Pruebas de descarga de paquetes con progreso, cancelación y hash
 * ─────────────────────────────────────────────────────────────────────────────
 * Pruebas con dependencias inyectadas (fetch, digest, almacen, índice).
 * Sin red real, sin disco real.
 */
import { describe, expect, it, vi } from "vitest";
import type { ModeloDescargable, DependenciasDescarga } from "../descargar";
import { descargarPaquete } from "../descargar";

function crearRespuestaMock(body: ReadableStream<Uint8Array> | null, ok = true, status = 200): Response {
    return {
        ok,
        status,
        statusText: ok ? "OK" : "Error",
        headers: new Headers(),
        body,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        formData: async () => new FormData(),
        json: async () => ({}),
        text: async () => "",
        bytes: async () => new Uint8Array(0),
        clone: () => crearRespuestaMock(body, ok, status),
        redirected: false,
        type: "basic" as ResponseType,
        url: "",
    } as Response;
}

function crearModeloValido(sobrescrituras: Partial<ModeloDescargable> = {}): ModeloDescargable {
    return {
        id: "pkg-es-en",
        par: "es-en",
        repo: "Xenova/opus-mt-es-en",
        version: "1.0.0",
        verificado: true,
        bytes: 1000,
        hash: "hash-modelo-valido",
        archivos: [
            { url: "https://example.com/model.bin", ruta: "modelos/es-en/model.bin", bytes: 1000 },
        ],
        ...sobrescrituras,
    };
}

function crearDepsBasicas(sobrescrituras: Partial<DependenciasDescarga> = {}): DependenciasDescarga {
    const almacen = {
        puedeGuardar: vi.fn(() => true),
        guardar: vi.fn(async () => {}),
        borrar: vi.fn(async () => {}),
        existe: vi.fn(async () => false),
    };
    const indice = {
        registrar: vi.fn(),
        quitar: vi.fn(),
    };
    // Crear datos de prueba que coincidan con los bytes esperados
    const datosModelo = new Uint8Array(1000);
    datosModelo.fill(65); // 'A'
    const datosA = new Uint8Array(800);
    datosA.fill(66); // 'B'
    const datosB = new Uint8Array(1200);
    datosB.fill(67); // 'C'
    
    return {
        fetch: vi.fn(async (url: string) => {
            let datos: Uint8Array;
            if (url.includes("model.bin")) datos = datosModelo;
            else if (url.includes("a.bin")) datos = datosA;
            else if (url.includes("b.bin")) datos = datosB;
            else datos = new Uint8Array(0);
            
            return crearRespuestaMock(new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(datos);
                    controller.close();
                },
            }));
        }) as DependenciasDescarga["fetch"],
        digest: vi.fn(async (datos: Uint8Array) => {
            // Identificar qué datos se están hasheando por su longitud y contenido
            if (datos.length === 800 && datos[0] === 66) return "hash-a"; // a.bin
            if (datos.length === 1200 && datos[0] === 67) return "hash-b"; // b.bin
            // Hash del modelo completo (concatenación de todos los archivos)
            if (datos.length === 1000 && datos[0] === 65) return "hash-modelo-valido";
            if (datos.length === 2000) return "hash-modelo-valido";
            return "hash-desconocido";
        }) as DependenciasDescarga["digest"],
        almacen,
        indice,
        ...sobrescrituras,
    };
}

describe("descargarPaquete", () => {
    describe("éxito con progreso", () => {
        it("descarga completo, verifica hash, guarda archivos, registra en índice y reporta progreso", async () => {
            const modelo = crearModeloValido();
            const progreso: { hecho: number; total: number }[] = [];
            const deps = crearDepsBasicas({
                alProgreso: (hecho, total) => progreso.push({ hecho, total }),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: true });
            expect(deps.almacen.guardar).toHaveBeenCalledWith("modelos/es-en/model.bin", expect.any(Uint8Array));
            expect(deps.indice.registrar).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "pkg-es-en",
                    par: "es-en",
                    bytes: 1000,
                    hash: "hash-modelo-valido",
                    version: "1.0.0",
                })
            );
            expect(progreso.length).toBeGreaterThan(0);
            const ultimo = progreso[progreso.length - 1];
            expect(ultimo.hecho).toBe(1000);
            expect(ultimo.total).toBe(1000);
        });

        it("descarga varios archivos y suma progreso", async () => {
            const modelo = crearModeloValido({
                bytes: 2000,
                archivos: [
                    { url: "https://example.com/a.bin", ruta: "modelos/a.bin", bytes: 800, hash: "hash-a" },
                    { url: "https://example.com/b.bin", ruta: "modelos/b.bin", bytes: 1200, hash: "hash-b" },
                ],
            });
            const deps = crearDepsBasicas({
                digest: vi.fn(async (datos: Uint8Array) => {
                    if (datos.length === 800 && datos[0] === 66) return "hash-a";
                    if (datos.length === 1200 && datos[0] === 67) return "hash-b";
                    return "hash-modelo-valido";
                }),
            });

            const progreso: number[] = [];
            const resultado = await descargarPaquete(modelo, {
                ...deps,
                alProgreso: (hecho) => progreso.push(hecho),
            });

            expect(resultado).toEqual({ ok: true });
            expect(deps.almacen.guardar).toHaveBeenCalledTimes(2);
            expect(progreso[progreso.length - 1]).toBe(2000);
        });
    });

    describe("hash malo", () => {
        it("hash de archivo incorrecto: borra lo descargado y devuelve motivo", async () => {
            const modelo = crearModeloValido({
                hash: "",
                archivos: [{ url: "https://example.com/model.bin", ruta: "modelos/model.bin", bytes: 1000, hash: "hash-esperado" }],
            });
            const deps = crearDepsBasicas({
                digest: vi.fn(async (datos: Uint8Array) => {
                    if (datos.length === 1000 && datos[0] === 65) return "hash-incorrecto";
                    return "hash-modelo-valido";
                }),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Hash no coincide para modelos/model.bin" });
            expect(deps.almacen.borrar).toHaveBeenCalledWith("modelos/model.bin");
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });

        it("hash de modelo completo incorrecto: borra archivos y devuelve motivo", async () => {
            const modelo = crearModeloValido({
                hash: "hash-modelo-esperado",
                archivos: [{ url: "https://example.com/model.bin", ruta: "modelos/es-en/model.bin", bytes: 1000 }],
            });
            const deps = crearDepsBasicas({
                digest: vi.fn(async (datos: Uint8Array) => {
                    if (datos.length === 1000 && datos[0] === 65) return "hash-modelo-incorrecto";
                    return "hash-modelo-valido";
                }),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Hash del modelo no coincide" });
            expect(deps.almacen.borrar).toHaveBeenCalledWith("modelos/es-en/model.bin");
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });
    });

    describe("cancelación", () => {
        it("señal abortada antes de empezar: deja índice intacto y devuelve cancelado", async () => {
            const senal = new AbortController();
            senal.abort();
            const modelo = crearModeloValido();
            const deps = crearDepsBasicas({ senal: senal.signal });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Cancelado" });
            expect(deps.fetch).not.toHaveBeenCalled();
            expect(deps.indice.registrar).not.toHaveBeenCalled();
            expect(deps.indice.quitar).not.toHaveBeenCalled();
        });

        it("señal abortada durante descarga: borra parciales, deja índice intacto, devuelve cancelado", async () => {
            const senal = new AbortController();
            let readResolve: (value: { done: boolean; value?: Uint8Array }) => void;
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(100).fill(65));
                },
                pull(controller) {
                    return new Promise((resolve) => {
                        readResolve = (v) => {
                            if (v.done) controller.close();
                            else controller.enqueue(v.value!);
                            resolve();
                        };
                    });
                },
            });
            const deps = crearDepsBasicas({
                fetch: vi.fn(async () => crearRespuestaMock(stream)),
                senal: senal.signal,
            });

            const promesa = descargarPaquete(crearModeloValido(), deps);
            // Dar tiempo a que empiece la descarga
            await new Promise((r) => setTimeout(r, 10));
            senal.abort();
            readResolve!({ done: true, value: undefined });

            const resultado = await promesa;

            expect(resultado).toEqual({ ok: false, motivo: "Cancelado" });
            expect(deps.indice.registrar).not.toHaveBeenCalled();
            expect(deps.indice.quitar).not.toHaveBeenCalled();
        });
    });

    describe("sin espacio", () => {
        it("puedeGuardar false: no empieza, devuelve motivo, índice intacto", async () => {
            const modelo = crearModeloValido();
            const deps = crearDepsBasicas({
                almacen: {
                    puedeGuardar: vi.fn(() => false),
                    guardar: vi.fn(),
                    borrar: vi.fn(),
                    existe: vi.fn(),
                },
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Espacio insuficiente" });
            expect(deps.fetch).not.toHaveBeenCalled();
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });
    });

    describe("conexión medida rechazada", () => {
        it("conexionMedida true y confirmarMedida resuelve false: no descarga, devuelve motivo", async () => {
            const modelo = crearModeloValido();
            const deps = crearDepsBasicas({
                conexionMedida: true,
                confirmarMedida: vi.fn(async () => false),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Descarga cancelada: conexión medida no confirmada" });
            expect(deps.fetch).not.toHaveBeenCalled();
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });

        it("conexionMedida true y confirmarMedida resuelve true: continúa descarga normal", async () => {
            const modelo = crearModeloValido();
            const deps = crearDepsBasicas({
                conexionMedida: true,
                confirmarMedida: vi.fn(async () => true),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: true });
            expect(deps.fetch).toHaveBeenCalled();
        });

        it("conexionMedida false: no pide confirmación aunque confirmarMedida exista", async () => {
            const confirmar = vi.fn(async () => false);
            const modelo = crearModeloValido();
            const deps = crearDepsBasicas({
                conexionMedida: false,
                confirmarMedida: confirmar,
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: true });
            expect(confirmar).not.toHaveBeenCalled();
        });
    });

    describe("no verificado sin permiso", () => {
        it("verificado:false y permitirNoVerificado undefined: devuelve motivo sin descargar", async () => {
            const modelo = crearModeloValido({ verificado: false });
            const deps = crearDepsBasicas();

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Modelo no verificado" });
            expect(deps.fetch).not.toHaveBeenCalled();
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });

        it("verificado:false y permitirNoVerificado false: devuelve motivo sin descargar", async () => {
            const modelo = crearModeloValido({ verificado: false });
            const deps = crearDepsBasicas({ permitirNoVerificado: false });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: false, motivo: "Modelo no verificado" });
            expect(deps.fetch).not.toHaveBeenCalled();
        });

        it("verificado:false y permitirNoVerificado true: descarga normalmente", async () => {
            const modelo = crearModeloValido({ verificado: false, hash: "" });
            const deps = crearDepsBasicas({
                permitirNoVerificado: true,
                digest: vi.fn(async (datos: Uint8Array) => {
                    if (datos.length === 1000 && datos[0] === 65) return "hash-archivo-valido";
                    return "hash-modelo-valido";
                }),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: true });
            expect(deps.fetch).toHaveBeenCalled();
        });

        it("verificado:true: descarga normalmente sin necesidad de permitirNoVerificado", async () => {
            const modelo = crearModeloValido({ verificado: true });
            const deps = crearDepsBasicas();

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado).toEqual({ ok: true });
        });
    });

    describe("todos o ninguno", () => {
        it("si falla el segundo archivo, borra el primero y no registra en índice", async () => {
            const modelo = crearModeloValido({
                bytes: 2000,
                archivos: [
                    { url: "https://example.com/a.bin", ruta: "modelos/a.bin", bytes: 800, hash: "hash-a" },
                    { url: "https://example.com/b.bin", ruta: "modelos/b.bin", bytes: 1200, hash: "hash-b" },
                ],
            });
            let llamada = 0;
            const deps = crearDepsBasicas({
                fetch: vi.fn(async (url: string) => {
                    llamada++;
                    if (url.includes("b.bin")) {
                        return crearRespuestaMock(null, false, 404);
                    }
                    return crearRespuestaMock(new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new Uint8Array(800).fill(66));
                            controller.close();
                        },
                    }));
                }),
                digest: vi.fn(async (datos: Uint8Array) => {
                    if (datos.length === 800 && datos[0] === 66) return "hash-a";
                    return "hash-modelo-valido";
                }),
            });

            const resultado = await descargarPaquete(modelo, deps);

            expect(resultado.ok).toBe(false);
            expect(deps.almacen.borrar).toHaveBeenCalledWith("modelos/a.bin");
            expect(deps.indice.registrar).not.toHaveBeenCalled();
        });
    });
});