/**
 * TU1116-APP-F1 · Idioma por persona: aprende preferencias de idioma.
 * ─────────────────────────────────────────────────────────────────────────────
 * {personaId → {idioma, fuente: "pedido" | "detectado", confianza, desde}}
 * Observar: 3 detecciones seguidas fijan el idioma.
 * Fijar: el pedido gana siempre.
 */

export type FuenteIdioma = "pedido" | "detectado";

export interface PreferenciaIdioma {
    readonly idioma: string;
    readonly fuente: FuenteIdioma;
    readonly confianza: number;
    readonly desde: number;
}

export type StorePersonas = Map<string, {
    idioma: string;
    fuente: FuenteIdioma;
    confianza: number;
    desde: number;
    detecciones: { idioma: string; count: number } | null;
}>;

export class GestionIdiomasPersonas {
    private store: StorePersonas = new Map();
    private readonly MAX_PERSONAS = 500;

    constructor(private porDefecto: string = "en") {}

    public fijar(personaId: string, idioma: string): void {
        this.store.set(personaId, {
            idioma,
            fuente: "pedido",
            confianza: 1.0,
            desde: Date.now(),
            detecciones: null
        });
    }

    public observar(personaId: string, idiomaDetectado: string, confianza: number): void {
        if (confianza < 0.8) return;
        const actual = this.store.get(personaId);
        if (actual?.fuente === "pedido") return;

        const detecciones = actual?.detecciones ?? { idioma: idiomaDetectado, count: 0 };

        if (detecciones.idioma !== idiomaDetectado) {
            detecciones.idioma = idiomaDetectado;
            detecciones.count = 1;
        } else {
            detecciones.count++;
        }

        if (detecciones.count >= 3) {
            this.store.set(personaId, {
                idioma: idiomaDetectado,
                fuente: "detectado",
                confianza: 0.9,
                desde: Date.now(),
                detecciones: null
            });
        } else {
            this.store.set(personaId, {
                idioma: actual?.idioma ?? this.porDefecto,
                fuente: actual?.fuente ?? "detectado",
                confianza: actual?.confianza ?? 0,
                desde: actual?.desde ?? Date.now(),
                detecciones
            });
        }
    }

    public idiomaDe(personaId: string): string {
        return this.store.get(personaId)?.idioma ?? this.porDefecto;
    }

    public olvidar(personaId: string): void {
        this.store.delete(personaId);
    }
}
