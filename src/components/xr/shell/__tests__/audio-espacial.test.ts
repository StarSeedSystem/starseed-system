/**
 * Pruebas de XR1010AB · audio espacial (contrato §3 h y d). Sin Web Audio, sin visor y sin red:
 * `crearMotorAudio` recibe un contexto FALSO que registra nodos, parámetros y llamadas.
 */
import { describe, expect, it } from "vitest";
import {
    crearMotorAudio, distanciaEntre, gananciaPorDistancia,
    type AudioContextLike, type AudioParamLike, type GananciaLike, type NodoAudioLike,
    type PannerLike, type MotorAudio,
} from "../audio-espacial";

interface ParamFalso extends AudioParamLike {
    value: number;
    objetivos: { valor: number; constante: number }[];
}

function param(valor = 1): ParamFalso {
    const objetivos: { valor: number; constante: number }[] = [];
    return {
        value: valor,
        objetivos,
        setValueAtTime(v: number) { this.value = v; return this; },
        setTargetAtTime(v: number, _cuando: number, constante: number) { objetivos.push({ valor: v, constante }); return this; },
    };
}

interface NodoFalso extends NodoAudioLike { conexiones: number; desconexiones: number }

function nodo(): NodoFalso {
    return {
        conexiones: 0,
        desconexiones: 0,
        connect() { this.conexiones++; return this; },
        disconnect() { this.desconexiones++; },
    };
}

interface GananciaFalsa extends NodoFalso, GananciaLike { gain: ParamFalso }

interface PannerFalso extends NodoFalso, PannerLike {
    positionX: ParamFalso; positionY: ParamFalso; positionZ: ParamFalso;
}

function pannerFalso(): PannerFalso {
    return {
        ...nodo(), panningModel: "", distanceModel: "", refDistance: 0, rolloffFactor: 0,
        positionX: param(), positionY: param(), positionZ: param(),
    };
}

function contextoFalso() {
    const ganancias: GananciaFalsa[] = [];
    const panners: PannerFalso[] = [];
    const fuentes: NodoFalso[] = [];
    let deStream = 0, deElemento = 0;
    const listener = {
        positionX: param(), positionY: param(), positionZ: param(),
        forwardX: param(0), forwardY: param(0), forwardZ: param(-1),
        upX: param(0), upY: param(1), upZ: param(0),
    };
    const ctx: AudioContextLike = {
        currentTime: 1,
        destination: nodo(),
        listener,
        createGain: () => { const g = { ...nodo(), gain: param() }; ganancias.push(g); return g; },
        createPanner: () => { const p = pannerFalso(); panners.push(p); return p; },
        createMediaStreamSource: () => { deStream++; const n = nodo(); fuentes.push(n); return n; },
        createMediaElementSource: () => { deElemento++; const n = nodo(); fuentes.push(n); return n; },
    };
    return { ctx, ganancias, panners, fuentes, listener, contar: () => ({ deStream, deElemento }) };
}

const stream = { getAudioTracks: () => [] };
const elemento = { tagName: "AUDIO" };
const estado = (motor: MotorAudio, id: string) => motor.fuentes().find((f) => f.id === id);

describe("crearMotorAudio · niveles y panner", () => {
    it("en mínima el motor es estéreo y no crea ningún panner", () => {
        const { ctx, panners } = contextoFalso();
        const motor = crearMotorAudio(ctx, "minima");
        motor.anadirFuente("ana", stream);
        expect(motor.modo).toBe("estereo");
        expect(panners).toHaveLength(0);
    });

    it("en baja crea un PannerNode en modo equalpower", () => {
        const { ctx, panners } = contextoFalso();
        const motor = crearMotorAudio(ctx, "baja");
        motor.anadirFuente("ana", stream);
        expect(panners).toHaveLength(1);
        expect(panners[0]!.panningModel).toBe("equalpower");
        expect(panners[0]!.distanceModel).toBe("inverse");
    });

    it("en media y alta usa HRTF con la distancia inversa del contrato", () => {
        for (const nivel of ["media", "alta", "maxima"] as const) {
            const { ctx, panners } = contextoFalso();
            const motor = crearMotorAudio(ctx, nivel);
            motor.anadirFuente("ana", stream);
            expect(motor.modo).toBe("hrtf");
            expect(panners[0]!.panningModel).toBe("HRTF");
            expect(panners[0]!.distanceModel).toBe("inverse");
            expect(panners[0]!.refDistance).toBe(1);
            expect(panners[0]!.rolloffFactor).toBe(1.2);
        }
    });

    it("mover una fuente suaviza la posición con setTargetAtTime de 30 ms", () => {
        const { ctx, panners } = contextoFalso();
        const motor = crearMotorAudio(ctx, "media");
        motor.anadirFuente("ana", stream);
        motor.moverFuente("ana", [2, 1, -3]);
        const ultimo = panners[0]!.positionX.objetivos.at(-1);
        expect(ultimo?.valor).toBe(2);
        expect(ultimo?.constante).toBeCloseTo(0.03);
        expect(panners[0]!.positionZ.objetivos.at(-1)?.valor).toBe(-3);
    });

    it("en estéreo la ganancia baja con la distancia, sin panner", () => {
        const { ctx } = contextoFalso();
        const motor = crearMotorAudio(ctx, "minima");
        motor.anadirFuente("ana", stream);
        motor.moverFuente("ana", [0, 0, 10]);
        expect(distanciaEntre([0, 0, 0], [0, 0, 10])).toBe(10);
        expect(gananciaPorDistancia(10)).toBeLessThan(gananciaPorDistancia(1));
        expect(estado(motor, "ana")?.conPanner).toBe(false);
        expect(estado(motor, "ana")?.factorDistancia).toBeCloseTo(gananciaPorDistancia(10));
    });
});

describe("crearMotorAudio · fuentes y zonas", () => {
    it("una zona de silencio deja a 0 a quien está fuera de la zona del hablante", () => {
        const { ctx, ganancias } = contextoFalso();
        const motor = crearMotorAudio(ctx, "media");
        motor.anadirFuente("ana", stream);
        motor.anadirFuente("luis", stream);
        motor.moverFuente("ana", [1, 0, 0]);
        motor.moverFuente("luis", [2, 0, 0]);
        motor.aplicarZona([{ efecto: "silencio", dentro: ["ana"], oyenteDentro: false }]);
        expect(estado(motor, "ana")?.factorZona).toBe(0);
        expect(estado(motor, "luis")?.factorZona).toBe(1);
        expect(ganancias[0]!.gain.objetivos.at(-1)?.constante).toBeCloseTo(0.15);
        motor.aplicarZona([{ efecto: "silencio", dentro: ["ana"], oyenteDentro: true }]);
        expect(estado(motor, "ana")?.factorZona).toBe(1);
    });

    it("audio-privado aísla: solo se oyen entre los de la misma zona", () => {
        const { ctx } = contextoFalso();
        const motor = crearMotorAudio(ctx, "media");
        motor.anadirFuente("ana", stream);
        motor.anadirFuente("luis", stream);
        motor.moverFuente("ana", [1, 0, 0]);
        motor.moverFuente("luis", [2, 0, 0]);
        motor.aplicarZona([{ efecto: "audio-privado", dentro: ["ana"], oyenteDentro: false }]);
        expect(estado(motor, "ana")?.factorZona).toBe(0);
        expect(estado(motor, "luis")?.factorZona).toBe(1);
        motor.aplicarZona([{ efecto: "audio-privado", dentro: ["ana"], oyenteDentro: true }]);
        expect(estado(motor, "ana")?.factorZona).toBe(1);
        expect(estado(motor, "luis")?.factorZona).toBe(0);
    });

    it("el tope de fuentes degrada a mono las más lejanas", () => {
        const { ctx } = contextoFalso();
        const motor = crearMotorAudio(ctx, "baja");
        expect(motor.tope).toBe(8);
        for (let i = 0; i < 9; i++) {
            motor.anadirFuente(`p${i}`, stream);
            motor.moverFuente(`p${i}`, [i + 1, 0, 0]);
        }
        expect(estado(motor, "p0")?.conPanner).toBe(true);
        expect(estado(motor, "p0")?.degradada).toBe(false);
        expect(estado(motor, "p8")?.conPanner).toBe(false);
        expect(estado(motor, "p8")?.degradada).toBe(true);
    });

    it("quitar una fuente la desconecta y la olvida", () => {
        const { ctx, fuentes } = contextoFalso();
        const motor = crearMotorAudio(ctx, "media");
        motor.anadirFuente("ana", stream);
        const nodoAna = fuentes[0]!;
        expect(motor.quitarFuente("ana")).toBe(true);
        expect(nodoAna.desconexiones).toBeGreaterThan(0);
        expect(motor.fuentes()).toHaveLength(0);
        expect(motor.quitarFuente("ana")).toBe(false);
    });

    it("usa la fábrica de stream para un MediaStream y la de elemento para un <audio>", () => {
        const { ctx, contar } = contextoFalso();
        const motor = crearMotorAudio(ctx, "minima");
        motor.anadirFuente("ana", stream);
        motor.anadirFuente("luis", elemento);
        expect(contar()).toEqual({ deStream: 1, deElemento: 1 });
    });
});
