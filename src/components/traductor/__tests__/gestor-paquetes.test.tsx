import { describe, it, expect } from "vitest";
import {
    formatearBytes,
    calcularEspacioUsado,
    almacenEsPersistente,
    conexionEsMedida,
    requiereConfirmacionDescarga,
    requiereConfirmacionEliminar,
    EstadoDescarga,
    ProgresoDescarga,
    PaqueteUI,
} from "../gestor-paquetes";

describe("formatearBytes", () => {
    it("debe formatear bytes a B", () => {
        expect(formatearBytes(0)).toBe("0 B");
        expect(formatearBytes(500)).toBe("500 B");
        expect(formatearBytes(1023)).toBe("1023 B");
    });

    it("debe formatear kilobytes", () => {
        expect(formatearBytes(1024)).toBe("1 KB");
        expect(formatearBytes(1536)).toBe("1.5 KB");
        expect(formatearBytes(1024 * 1024 - 1)).toBe("1024 KB");
    });

    it("debe formatear megabytes", () => {
        expect(formatearBytes(1024 * 1024)).toBe("1 MB");
        expect(formatearBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
        expect(formatearBytes(1024 * 1024 * 1024 - 1)).toBe("1024 MB");
    });

    it("debe formatear gigabytes", () => {
        expect(formatearBytes(1024 * 1024 * 1024)).toBe("1 GB");
        expect(formatearBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
    });
});

describe("calcularEspacioUsado", () => {
    it("debe sumar bytes de paquetes descargados", () => {
        const paquetes: PaqueteUI[] = [
            { id: "es->en", par: { origen: "es", destino: "en" }, bytes: 50 * 1024 * 1024, estado: "descargado", verificado: true, version: "1.0", hash: "abc", motor: "marian-onnx", repo: "test" },
            { id: "es->fr", par: { origen: "es", destino: "fr" }, bytes: 45 * 1024 * 1024, estado: "descargado", verificado: true, version: "1.0", hash: "def", motor: "marian-onnx", repo: "test" },
        ];
        expect(calcularEspacioUsado(paquetes)).toBe(95 * 1024 * 1024);
    });

    it("debe ignorar paquetes no descargados", () => {
        const paquetes: PaqueteUI[] = [
            { id: "es->en", par: { origen: "es", destino: "en" }, bytes: 50 * 1024 * 1024, estado: "descargado", verificado: true, version: "1.0", hash: "abc", motor: "marian-onnx", repo: "test" },
            { id: "es->fr", par: { origen: "es", destino: "fr" }, bytes: 45 * 1024 * 1024, estado: "descargando", verificado: true, version: "1.0", hash: "def", motor: "marian-onnx", repo: "test" },
            { id: "es->de", par: { origen: "es", destino: "de" }, bytes: 40 * 1024 * 1024, estado: "pendiente", verificado: true, version: "1.0", hash: "ghi", motor: "marian-onnx", repo: "test" },
        ];
        expect(calcularEspacioUsado(paquetes)).toBe(50 * 1024 * 1024);
    });

    it("debe devolver 0 para lista vacía", () => {
        expect(calcularEspacioUsado([])).toBe(0);
    });
});

describe("almacenEsPersistente", () => {
    it("debe ser true para IndexedDB", () => {
        expect(almacenEsPersistente("indexeddb")).toBe(true);
    });

    it("debe ser true para OPFS", () => {
        expect(almacenEsPersistente("opfs")).toBe(true);
    });

    it("debe ser false para localStorage", () => {
        expect(almacenEsPersistente("localstorage")).toBe(false);
    });

    it("debe ser false para sessionStorage", () => {
        expect(almacenEsPersistente("sessionstorage")).toBe(false);
    });

    it("debe ser false para memoria", () => {
        expect(almacenEsPersistente("memoria")).toBe(false);
    });

    it("debe ser false para valor desconocido", () => {
        expect(almacenEsPersistente("desconocido")).toBe(false);
    });
});

describe("conexionEsMedida", () => {
    it("debe detectar conexión medida", () => {
        expect(conexionEsMedida({ saveData: true, effectiveType: "4g" })).toBe(true);
        expect(conexionEsMedida({ saveData: true, effectiveType: "wifi" })).toBe(true);
    });

    it("debe no detectar conexión no medida", () => {
        expect(conexionEsMedida({ saveData: false, effectiveType: "4g" })).toBe(false);
        expect(conexionEsMedida({ saveData: false, effectiveType: "wifi" })).toBe(false);
    });

    it("debe manejar objeto nulo", () => {
        expect(conexionEsMedida(null)).toBe(false);
        expect(conexionEsMedida(undefined)).toBe(false);
    });
});

describe("requiereConfirmacionDescarga", () => {
    it("debe requerir confirmación si no verificado", () => {
        const paquete: PaqueteUI = { id: "es->en", par: { origen: "es", destino: "en" }, bytes: 50 * 1024 * 1024, estado: "pendiente", verificado: false, version: "1.0", hash: "abc", motor: "marian-onnx", repo: "test" };
        expect(requiereConfirmacionDescarga(paquete)).toBe(true);
    });

    it("no debe requerir confirmación si verificado", () => {
        const paquete: PaqueteUI = { id: "es->en", par: { origen: "es", destino: "en" }, bytes: 50 * 1024 * 1024, estado: "pendiente", verificado: true, version: "1.0", hash: "abc", motor: "marian-onnx", repo: "test" };
        expect(requiereConfirmacionDescarga(paquete)).toBe(false);
    });
});

describe("requiereConfirmacionEliminar", () => {
    it("siempre debe requerir confirmación para eliminar", () => {
        const paquete: PaqueteUI = { id: "es->en", par: { origen: "es", destino: "en" }, bytes: 50 * 1024 * 1024, estado: "descargado", verificado: true, version: "1.0", hash: "abc", motor: "marian-onnx", repo: "test" };
        expect(requiereConfirmacionEliminar(paquete)).toBe(true);
    });
});

describe("EstadoDescarga", () => {
    it("debe tener los estados correctos", () => {
        const estados: EstadoDescarga[] = ["pendiente", "descargando", "descargado", "error"];
        expect(estados).toHaveLength(4);
    });
});

describe("ProgresoDescarga", () => {
    it("debe permitir progreso parcial", () => {
        const progreso: ProgresoDescarga = { bytesDescargados: 25 * 1024 * 1024, bytesTotales: 50 * 1024 * 1024, cancelado: false };
        expect(progreso.bytesDescargados).toBe(25 * 1024 * 1024);
        expect(progreso.bytesTotales).toBe(50 * 1024 * 1024);
        expect(progreso.cancelado).toBe(false);
    });

    it("debe permitir estado cancelado", () => {
        const progreso: ProgresoDescarga = { bytesDescargados: 10 * 1024 * 1024, bytesTotales: 50 * 1024 * 1024, cancelado: true };
        expect(progreso.cancelado).toBe(true);
    });
});