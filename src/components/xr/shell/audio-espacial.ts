/**
 * StarSeed XR · AUDIO ESPACIAL (XR1010AB · §3 h y d). Módulo PURO: `AudioContext` inyectado (Node usa un falso).
 * Niveles: estéreo (ganancia por distancia, sin panner), panner equalpower o HRTF; 30 ms al mover, 150 ms en zonas.
 * Privacidad (§3 k): solo conecta fuentes ya autorizadas; no graba ni envía audio.
 */
import { PERFILES, type PerfilCalidad } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
export const SUAVIZADO_CLIC_S = 0.03, FUNDIDO_ZONA_S = 0.15, REF_DISTANCE = 1, ROLLOFF_FACTOR = 1.2;
export type ModoAudio = PerfilCalidad["audio"];
export type EfectoZonaAudio = "nada" | "punto-reunion" | "escenario" | "audio-privado" | "silencio" | "gravedad-cero" | "zona-segura";
export interface AudioParamLike { value: number; setValueAtTime(v: number, t: number): unknown; setTargetAtTime(v: number, t: number, c: number): unknown }
export interface NodoAudioLike { connect(d: NodoAudioLike): unknown; disconnect(): void }
export interface GananciaLike extends NodoAudioLike { gain: AudioParamLike }
export interface PannerLike extends NodoAudioLike { panningModel: string; distanceModel: string; refDistance: number; rolloffFactor: number; positionX: AudioParamLike; positionY: AudioParamLike; positionZ: AudioParamLike }
export interface OyenteLike { positionX: AudioParamLike; positionY: AudioParamLike; positionZ: AudioParamLike; forwardX: AudioParamLike; forwardY: AudioParamLike; forwardZ: AudioParamLike; upX: AudioParamLike; upY: AudioParamLike; upZ: AudioParamLike }
export type EntradaAudio = object;
export interface AudioContextLike { currentTime: number; destination: NodoAudioLike; listener?: OyenteLike; createGain(): GananciaLike; createPanner?(): PannerLike; createMediaStreamSource?(stream: object): NodoAudioLike; createMediaElementSource?(elemento: object): NodoAudioLike }
export interface ZonaAudio { efecto: EfectoZonaAudio; dentro: readonly string[]; oyenteDentro: boolean }
export interface EstadoFuente { id: string; pos: Vec3; factorDistancia: number; factorZona: number; ganancia: number; degradada: boolean; conPanner: boolean }
export interface MotorAudio { nivel: NivelCalidad; modo: ModoAudio; tope: number; anadirFuente(id: string, entrada: EntradaAudio): boolean; quitarFuente(id: string): boolean; moverFuente(id: string, pos: Vec3): void; actualizarOyente(pos: Vec3, adelante: Vec3, arriba: Vec3): void; aplicarZona(zonas: readonly ZonaAudio[]): void; fuentes(): EstadoFuente[] }
interface FuenteInterna { id: string; nodo: NodoAudioLike; panner: PannerLike | null; ganancia: GananciaLike; pos: Vec3; factorDistancia: number; factorZona: number; degradada: boolean }
const seguro = (f: () => void) => { try { f(); } catch { /* nodo ya desconectado */ } };
const acotar01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
export function distanciaEntre(a: Vec3, b: Vec3): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function gananciaPorDistancia(distancia: number): number {
    if (!Number.isFinite(distancia)) return 0;
    const d = Math.max(REF_DISTANCE, distancia);
    return acotar01(REF_DISTANCE / (REF_DISTANCE + ROLLOFF_FACTOR * (d - REF_DISTANCE)));
}
export function gananciaDeZona(id: string, zonas: readonly ZonaAudio[]): 0 | 1 {
    let audible = true;
    for (const z of zonas) {
        const dentro = z.dentro.includes(id);
        if (z.efecto === "silencio" && dentro && !z.oyenteDentro) audible = false;
        else if (z.efecto === "audio-privado" && dentro !== z.oyenteDentro) audible = false;
    }
    return audible ? 1 : 0;
}
export function crearMotorAudio(ctx: AudioContextLike, nivel: NivelCalidad): MotorAudio {
    const modo = PERFILES[nivel].audio, tope = PERFILES[nivel].jugadoresVisibles;
    const mapa = new Map<string, FuenteInterna>();
    let posOyente: Vec3 = [0, 0, 0];
    const desconectar = (f: FuenteInterna) => { const pan = f.panner; seguro(() => f.nodo.disconnect()); if (pan) seguro(() => pan.disconnect()); seguro(() => f.ganancia.disconnect()); };
    const aplicarGanancia = (f: FuenteInterna, segundos: number) => { const v = acotar01(f.factorDistancia * f.factorZona); try { f.ganancia.gain.setTargetAtTime(v, ctx.currentTime, segundos); } catch { f.ganancia.gain.value = v; } };
    const desplazar = (f: FuenteInterna) => { const pan = f.panner; if (pan) { const t = ctx.currentTime; [pan.positionX, pan.positionY, pan.positionZ].forEach((p, i) => p.setTargetAtTime(f.pos[i]!, t, SUAVIZADO_CLIC_S)); } };
    const encadenar = (f: FuenteInterna) => {
        desconectar(f);
        if (f.panner && !f.degradada) { f.nodo.connect(f.panner); f.panner.connect(f.ganancia); } else f.nodo.connect(f.ganancia);
        f.ganancia.connect(ctx.destination);
    };
    const recalcular = () => {
        [...mapa.values()].sort((a, b) => distanciaEntre(a.pos, posOyente) - distanciaEntre(b.pos, posOyente)).forEach((f, i) => {
            const degradada = i >= tope;
            if (degradada !== f.degradada) { f.degradada = degradada; encadenar(f); }
            f.factorDistancia = f.panner && !f.degradada ? 1 : gananciaPorDistancia(distanciaEntre(f.pos, posOyente));
        });
        for (const f of mapa.values()) aplicarGanancia(f, SUAVIZADO_CLIC_S);
    };
    return {
        nivel, modo, tope,
        anadirFuente(id, entrada) {
            if (mapa.has(id)) return false;
            const esStream = typeof (entrada as { getAudioTracks?: unknown }).getAudioTracks === "function" || typeof (entrada as { getTracks?: unknown }).getTracks === "function";
            let nodo = esStream ? ctx.createMediaStreamSource?.(entrada) : ctx.createMediaElementSource?.(entrada);
            nodo ??= esStream ? ctx.createMediaElementSource?.(entrada) : ctx.createMediaStreamSource?.(entrada);
            if (!nodo) return false;
            const panner = modo === "estereo" ? null : (ctx.createPanner?.() ?? null);
            if (panner) {
                panner.panningModel = modo === "hrtf" ? "HRTF" : "equalpower";
                panner.distanceModel = "inverse";
                panner.refDistance = REF_DISTANCE;
                panner.rolloffFactor = ROLLOFF_FACTOR;
            }
            const f: FuenteInterna = { id, nodo, panner, ganancia: ctx.createGain(), pos: [0, 0, 0], factorDistancia: 1, factorZona: 1, degradada: false };
            mapa.set(id, f);
            encadenar(f);
            recalcular();
            desplazar(f);
            return true;
        },
        quitarFuente(id) {
            const f = mapa.get(id);
            if (!f) return false;
            desconectar(f);
            mapa.delete(id);
            recalcular();
            return true;
        },
        moverFuente(id, pos) {
            const f = mapa.get(id);
            if (!f) return;
            f.pos = pos;
            desplazar(f);
            recalcular();
        },
        actualizarOyente(pos, adelante, arriba) {
            posOyente = pos;
            const o = ctx.listener;
            if (o) {
                const t = ctx.currentTime, s = SUAVIZADO_CLIC_S;
                [o.positionX, o.positionY, o.positionZ].forEach((p, i) => p.setTargetAtTime(pos[i]!, t, s));
                [o.forwardX, o.forwardY, o.forwardZ].forEach((p, i) => p.setTargetAtTime(adelante[i]!, t, s));
                [o.upX, o.upY, o.upZ].forEach((p, i) => p.setTargetAtTime(arriba[i]!, t, s));
            }
            recalcular();
        },
        aplicarZona(zonas) {
            for (const f of mapa.values()) { f.factorZona = gananciaDeZona(f.id, zonas); aplicarGanancia(f, FUNDIDO_ZONA_S); }
        },
        fuentes() {
            return [...mapa.values()].map((f) => ({
                id: f.id, pos: f.pos, factorDistancia: f.factorDistancia, factorZona: f.factorZona,
                ganancia: acotar01(f.factorDistancia * f.factorZona), degradada: f.degradada,
                conPanner: f.panner !== null && !f.degradada,
            }));
        },
    };
}
