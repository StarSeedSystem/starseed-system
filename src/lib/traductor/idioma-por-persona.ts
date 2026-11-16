/**
 * TU1116-APP-F1 · Idioma por persona: mapa {personaId → {idioma, fuente, confianza, desde}}
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO. Tres detecciones consecutivas con confianza ≥0.8 fijan el idioma.
 * Un "pedido" (fuente: "pedido") siempre gana sobre lo detectado.
 */

export type Fuente = "pedido" | "detectado";

export interface RegistroIdioma {
    readonly idioma: string;
    readonly fuente: Fuente;
    readonly confianza: number;
    readonly desde: number;
}

export interface Deteccion {
    readonly idioma: string;
    readonly confianza: number;
}

export interface MapaPersonas {
    readonly [personaId: string]: RegistroIdioma;
}

export class AlmacénIdiomas {
    private datos: Record<string, RegistroIdioma> = {};
    private detecciones: Record<string, Deteccion[]> = {};

    constructor(private readonly tope: number = 500) {}

    observar(personaId: string, deteccion: Deteccion): void {
        const hist = this.detecciones[personaId];
        if (!hist) {
            // Mantener límite de personas
            if (Object.keys(this.datos).length >= this.tope) {
                const first = Object.keys(this.datos)[0];
                delete this.datos[first];
            }
            this.detecciones[personaId] = [];
        }

        const registro = this.datos[personaId];
        if (registro && registro.fuente === "pedido") return;

        const historial = this.detecciones[personaId];
        historial.push({ ...deteccion, cuando: Date.now() });
        if (historial.length > 3) historial.shift();

        if (
            historial.length >= 3 &&
            historial.every((d) => d.confianza >= 0.8 && d.idioma === deteccion.idioma)
        ) {
            this.datos[personaId] = {
                idioma: deteccion.idioma,
                fuente: "detectado",
                confianza: deteccion.confianza,
                desde: Date.now(),
            };
            delete this.detecciones[personaId];
        }
    }

    fijar(personaId: string, idioma: string): void {
        if (!this.datos[personaId]) {
            // Mantener límite antes de añadir nuevo
            if (Object.keys(this.datos).length >= this.tope) {
                const first = Object.keys(this.datos)[0];
                delete this.datos[first];
            }
            this.detecciones[personaId] = [];
        }
        this.datos[personaId] = {
            idioma,
            fuente: "pedido",
            confianza: 1,
            desde: Date.now(),
        };
        delete this.detecciones[personaId];
    }

    idiomaDe(personaId: string, porDefecto?: string): string | undefined {
        const registro = this.datos[personaId];
        return registro && registro.idioma ? registro.idioma : porDefecto;
    }

    olvidar(personaId: string): void {
        delete this.datos[personaId];
        delete this.detecciones[personaId];
    }

    estado(): MapaPersonas {
        const result: MapaPersonas = {};
        for (const id in this.datos) {
            result[id] = this.datos[id];
        }
        return result;
    }
}

export const starseedTraductorPersonasV1 = new AlmacénIdiomas(500);