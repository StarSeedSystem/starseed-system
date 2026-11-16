/**
 * TU1116-APP-F1 · Descarga de paquetes de modelo con progreso, cancelación y verificación de hash
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO (sin red, sin disco, sin procesos). Red, reloj y almacenamiento se INYECTAN.
 */

import type { PaqueteModelo } from "./tipos";

export interface ModeloDescargable {
    id: string;
    par: string;
    repo: string;
    version: string;
    verificado: boolean;
    bytes: number;
    hash: string;
    archivos: readonly {
        url: string;
        ruta: string;
        bytes: number;
        hash?: string;
    }[];
}

export interface DependenciasDescarga {
    fetch: (url: string, opciones?: { signal?: AbortSignal }) => Promise<Response>;
    digest: (datos: Uint8Array) => Promise<string>;
    almacen: {
        puedeGuardar(bytes: number): boolean;
        guardar(ruta: string, datos: Uint8Array): Promise<void>;
        borrar(ruta: string): Promise<void>;
        existe(ruta: string): Promise<boolean>;
    };
    indice: {
        registrar(entrada: { id: string; par: string; bytes: number; hash: string; version: string; instaladoEn: number }): void;
        quitar(id: string): void;
    };
    senal?: AbortSignal;
    alProgreso?: (hecho: number, total: number) => void;
    conexionMedida?: boolean;
    confirmarMedida?: (bytes: number) => Promise<boolean>;
    permitirNoVerificado?: boolean;
}

export type ResultadoDescarga = { ok: true } | { ok: false; motivo: string };

export async function descargarPaquete(
    modelo: ModeloDescargable,
    deps: DependenciasDescarga
): Promise<ResultadoDescarga> {
    // Verificar si el modelo está verificado
    if (!modelo.verificado && !deps.permitirNoVerificado) {
        return { ok: false, motivo: "Modelo no verificado" };
    }

    // Verificar espacio disponible
    if (!deps.almacen.puedeGuardar(modelo.bytes)) {
        return { ok: false, motivo: "Espacio insuficiente" };
    }

    // Confirmar si la conexión es medida
    if (deps.conexionMedida && deps.confirmarMedida) {
        const confirmado = await deps.confirmarMedida(modelo.bytes);
        if (!confirmado) {
            return { ok: false, motivo: "Descarga cancelada: conexión medida no confirmada" };
        }
    }

    const totalBytes = modelo.archivos.reduce((acc, a) => acc + a.bytes, 0);
    let bytesDescargados = 0;
    const archivosDescargados: { ruta: string; datos: Uint8Array }[] = [];

    try {
        for (const archivo of modelo.archivos) {
            // Verificar cancelación
            if (deps.senal?.aborted) {
                throw new Error("Cancelado");
            }

            const response = await deps.fetch(archivo.url, { signal: deps.senal });
            if (!response.ok || !response.body) {
                throw new Error(`Error HTTP ${response.status} en ${archivo.url}`);
            }

            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let archivoBytes = 0;

            while (true) {
                if (deps.senal?.aborted) {
                    throw new Error("Cancelado");
                }

                const { done, value } = await reader.read();
                if (deps.senal?.aborted) {
                    throw new Error("Cancelado");
                }
                if (done) break;

                chunks.push(value);
                archivoBytes += value.length;
                bytesDescargados += value.length;

                if (deps.alProgreso) {
                    deps.alProgreso(bytesDescargados, totalBytes);
                }
            }

            const datosArchivo = new Uint8Array(archivoBytes);
            let offset = 0;
            for (const chunk of chunks) {
                datosArchivo.set(chunk, offset);
                offset += chunk.length;
            }

            // Añadir a la lista ANTES de verificar hash para que se limpie en caso de error
            archivosDescargados.push({ ruta: archivo.ruta, datos: datosArchivo });

            // Verificar hash del archivo si existe
            if (archivo.hash) {
                const hashCalculado = await deps.digest(datosArchivo);
                if (hashCalculado !== archivo.hash) {
                    throw new Error(`Hash no coincide para ${archivo.ruta}`);
                }
            }
        }

        // Verificar hash del modelo completo si existe
        if (modelo.hash) {
            const todosLosDatos = new Uint8Array(totalBytes);
            let offset = 0;
            for (const { datos } of archivosDescargados) {
                todosLosDatos.set(datos, offset);
                offset += datos.length;
            }
            const hashCalculado = await deps.digest(todosLosDatos);
            if (hashCalculado !== modelo.hash) {
                // Borrar archivos descargados
                for (const { ruta } of archivosDescargados) {
                    await deps.almacen.borrar(ruta);
                }
                return { ok: false, motivo: "Hash del modelo no coincide" };
            }
        }

        // Guardar todos los archivos
        for (const { ruta, datos } of archivosDescargados) {
            await deps.almacen.guardar(ruta, datos);
        }

        // Registrar en el índice
        deps.indice.registrar({
            id: modelo.id,
            par: modelo.par,
            bytes: modelo.bytes,
            hash: modelo.hash,
            version: modelo.version,
            instaladoEn: Date.now(),
        });

        return { ok: true };
    } catch (error) {
        // En caso de error, borrar archivos descargados
        for (const { ruta } of archivosDescargados) {
            try {
                await deps.almacen.borrar(ruta);
            } catch {
                // Silencioso
            }
        }

        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        if (mensaje === "Cancelado") {
            return { ok: false, motivo: "Cancelado" };
        }
        return { ok: false, motivo: mensaje };
    }
}