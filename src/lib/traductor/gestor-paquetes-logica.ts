import type { PaqueteModelo } from "./modelos-locales";
import type { EntradaPaquete } from "./indice-paquetes";

export interface AlmacenPaquetes {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
}

export interface Descargador {
    descargar(url: string, onProgreso: (bytes: number, total: number) => void, senal: AbortSignal): Promise<{ bytes: number; hash: string }>;
}

export interface Reloj {
    ahora(): number;
}

export interface ParConEstado {
    modelo: PaqueteModelo;
    instalado: boolean;
    entrada?: EntradaPaquete;
}

export interface GestorPaquetesProps {
    modelos: readonly PaqueteModelo[];
    almacen: AlmacenPaquetes;
    descargador: Descargador;
    reloj: Reloj;
    topeBytes: number;
    esPersistente: boolean;
    conexionMedida?: boolean;
    onCambio?: () => void;
}

export function formatearBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function calcularProgreso(bytes: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((bytes / total) * 100));
}

export function leerEntradas(almacen: AlmacenPaquetes): EntradaPaquete[] {
    try {
        const raw = almacen.getItem("starseed:traductor-paquetes");
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function escribirEntradas(almacen: AlmacenPaquetes, entradas: EntradaPaquete[]): void {
    try {
        almacen.setItem("starseed:traductor-paquetes", JSON.stringify(entradas));
    } catch {
        // Silencioso
    }
}

export function calcularEspacioUsado(pares: ParConEstado[]): number {
    return pares.reduce((acc, p) => acc + (p.entrada?.bytes ?? 0), 0);
}

export function ordenarPares(pares: ParConEstado[]): ParConEstado[] {
    return [...pares].sort((a, b) => {
        if (a.instalado !== b.instalado) return a.instalado ? -1 : 1;
        return a.modelo.origen.localeCompare(b.modelo.origen);
    });
}

export function construirUrlDescarga(modelo: PaqueteModelo): string {
    return `https://huggingface.co/${modelo.repo}/resolve/main/model.onnx`;
}

export function crearEntradaNueva(modelo: PaqueteModelo, bytes: number, hash: string, reloj: Reloj): EntradaPaquete {
    return {
        id: modelo.repo,
        par: `${modelo.origen}-${modelo.destino}`,
        bytes,
        hash,
        version: modelo.version ?? "1.0.0",
        instaladoEn: reloj.ahora(),
    };
}