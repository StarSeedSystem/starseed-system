/**
 * SOLO PRUEBAS (no lo importa ningún código de la app). Utilidades de prueba del consumo: almacenamiento en memoria y un «BroadcastChannel» falso que
 * reparte los mensajes entre instancias (como pestañas distintas), de forma asíncrona como el real.
 */
import type { AlmacenConsumo, CanalConsumo } from "./guardian";

export function almacenMemoria(): AlmacenConsumo & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return {
        datos,
        getItem: (k) => (datos.has(k) ? (datos.get(k) as string) : null),
        setItem: (k, v) => {
            datos.set(k, String(v));
        },
        removeItem: (k) => {
            datos.delete(k);
        },
    };
}

export interface CanalFalso extends CanalConsumo {
    nombre: string;
    mudo: boolean;
    enviados: unknown[];
}

export function hubCanales() {
    const canales = new Set<CanalFalso>();
    function crear(nombre: string): CanalFalso {
        const c: CanalFalso = {
            nombre,
            mudo: false,
            enviados: [],
            onmessage: null,
            postMessage(m: unknown) {
                if (c.mudo || !canales.has(c)) return;
                c.enviados.push(m);
                const copia = JSON.parse(JSON.stringify(m)) as unknown;
                for (const otro of canales) {
                    if (otro === c || otro.nombre !== nombre) continue;
                    setTimeout(() => {
                        if (canales.has(otro)) otro.onmessage?.({ data: copia });
                    }, 0);
                }
            },
            close() {
                canales.delete(c);
            },
        };
        canales.add(c);
        return c;
    }
    return { crear, canales };
}

export function jsonDe(res: Response): Promise<{ message?: string; code?: string }> {
    return res.json() as Promise<{ message?: string; code?: string }>;
}
