import { describe, expect, it, beforeEach } from "vitest";
import { crearMaquinaConversacion, type ConfigConversacion, type Turno, type EstadoConversacion } from "../conversacion";

function crearRelojFalso(inicio = 1000): { reloj: { ahora: () => number }; avanzar: (ms: number) => void } {
    let ahora = inicio;
    return {
        reloj: { ahora: () => ahora },
        avanzar: (ms: number) => { ahora += ms; },
    };
}

function configBasica(): ConfigConversacion {
    return {
        idiomaA: "es",
        idiomaB: "en",
        reconocimientoDisponible: true,
        vozDestinoDisponible: () => true,
    };
}

describe("conversacion: máquina de turnos", () => {
    let maquina: ReturnType<typeof crearMaquinaConversacion>;
    let reloj: { ahora: () => number };
    let avanzar: (ms: number) => void;

    beforeEach(() => {
        const r = crearRelojFalso();
        reloj = r.reloj;
        avanzar = r.avanzar;
        maquina = crearMaquinaConversacion(configBasica(), reloj);
    });

    describe("estado inicial", () => {
        it("empieza en inactivo sin turnos", () => {
            expect(maquina.estado().tipo).toBe("inactivo");
            expect(maquina.turnos()).toEqual([]);
        });
    });

    describe("secuencia completa A→B→A", () => {
        it("A habla, se traduce a B, B responde, se traduce a A", () => {
            // A pulsa hablar
            let salida = maquina.pulsarHablar("A");
            expect(salida.estado.tipo).toBe("escuchando");
            expect(salida.accion).toBe("escuchar");
            expect(salida.payload?.idioma).toBe("es");

            // A dice algo (resultado parcial)
            salida = maquina.resultadoParcial("hola");
            expect(salida.estado.tipo).toBe("escuchando");

            // A termina de hablar (resultado final) - avanzar ANTES de resultadoFinal
            avanzar(500); // 500ms de reconocimiento
            salida = maquina.resultadoFinal("hola mundo");
            expect(salida.estado.tipo).toBe("traduciendo");
            expect(salida.accion).toBe("traducir");
            expect(salida.payload?.idioma).toBe("en");

            // Traducción lista
            avanzar(200); // 200ms de traducción
            salida = maquina.traduccionLista({ texto: "hello world", ms: 200 });
            expect(salida.estado.tipo).toBe("hablando");
            expect(salida.accion).toBe("hablar");
            expect(salida.payload?.texto).toBe("hello world");
            expect(salida.payload?.idioma).toBe("en");

            // B termina de escuchar la traducción (fin de voz)
            avanzar(1000); // 1000ms de habla
            salida = maquina.finDeVoz();
            expect(salida.estado.tipo).toBe("escuchando");
            expect(salida.estado.quien).toBe("B");
            expect(salida.accion).toBe("escuchar");
            expect(salida.payload?.idioma).toBe("en");

            // Un turno guardado
            const turnos = maquina.turnos();
            expect(turnos.length).toBe(1);
            expect(turnos[0].quien).toBe("A");
            expect(turnos[0].texto).toBe("hola mundo");
            expect(turnos[0].traduccion).toBe("hello world");
            expect(turnos[0].msReconocer).toBe(500);
            expect(turnos[0].msTraducir).toBe(200);
            expect(turnos[0].msHablar).toBe(1000);

            // B responde (ya está en estado "escuchando" para B tras finDeVoz)
            salida = maquina.resultadoParcial("hi");
            avanzar(300); // 300ms de reconocimiento para B
            salida = maquina.resultadoFinal("hi there");
            expect(salida.estado.tipo).toBe("traduciendo");
            avanzar(150); // 150ms de traducción
            salida = maquina.traduccionLista({ texto: "hola allí", ms: 150 });
            expect(salida.estado.tipo).toBe("hablando");
            avanzar(800); // 800ms de habla
            salida = maquina.finDeVoz();

            // Dos turnos guardados
            const turnos2 = maquina.turnos();
            expect(turnos2.length).toBe(2);
            expect(turnos2[1].quien).toBe("B");
            expect(turnos2[1].texto).toBe("hi there");
            expect(turnos2[1].traduccion).toBe("hola allí");
            expect(turnos2[1].msReconocer).toBe(300);
            expect(turnos2[1].msTraducir).toBe(150);
            expect(turnos2[1].msHablar).toBe(800);

            // Turno de A otra vez
            expect(salida.estado.tipo).toBe("escuchando");
            expect(salida.estado.quien).toBe("A");
        });
    });

    describe("error en traducir", () => {
        it("si falla la traducción, se emite error y se guarda el estado anterior", () => {
            maquina.pulsarHablar("A");
            maquina.resultadoFinal("hola mundo");
            const salida = maquina.error("fallo de red en traducción");

            expect(salida.estado.tipo).toBe("error");
            expect(salida.estado.motivo).toBe("fallo de red en traducción");
            expect(salida.estado.estadoAnterior.tipo).toBe("traduciendo");
            expect(salida.accion).toBe("mostrar-error");
        });

        it("después de error, la máquina se queda en error hasta reiniciar", () => {
            maquina.pulsarHablar("A");
            maquina.error("algo falló");
            const salida = maquina.pulsarHablar("B");
            expect(salida.estado.tipo).toBe("error");
        });
    });

    describe("sin voz de destino", () => {
        it("si no hay voz para el oyente, el turno sigue como texto en idioma original", () => {
            const config = configBasica();
            config.vozDestinoDisponible = () => false;
            const m = crearMaquinaConversacion(config, reloj);

            m.pulsarHablar("A");
            const salida = m.resultadoFinal("hola mundo");

            // Debería ir directamente a hablando en el idioma original (español)
            expect(salida.estado.tipo).toBe("hablando");
            expect(salida.payload?.idioma).toBe("es");
            expect(salida.payload?.texto).toBe("hola mundo");
        });

        it("guarda el turno con traducción igual al original y msTraducir=0", () => {
            const config = configBasica();
            config.vozDestinoDisponible = () => false;
            const m = crearMaquinaConversacion(config, reloj);

            m.pulsarHablar("A");
            avanzar(400);
            m.resultadoFinal("hola");
            // No llamar a traduccionLista porque ya está en "hablando"
            avanzar(500);
            m.finDeVoz();

            const turnos = m.turnos();
            expect(turnos.length).toBe(1);
            expect(turnos[0].traduccion).toBe("hola");
            expect(turnos[0].msTraducir).toBe(0);
        });
    });

    describe("pulsar durante hablando se encola", () => {
        it("si B pulsa mientras A está hablando, se encola y sale después", () => {
            maquina.pulsarHablar("A");
            maquina.resultadoFinal("hola");
            maquina.traduccionLista({ texto: "hello", ms: 100 });
            // A está hablando
            expect(maquina.estado().tipo).toBe("hablando");

            // B pulsa durante el habla
            const salida = maquina.pulsarHablar("B");
            expect(salida.accion).toBeUndefined(); // no hace nada, se encola
            expect(maquina.estado().tipo).toBe("hablando"); // sigue hablando A

            // A termina
            avanzar(500);
            const fin = maquina.finDeVoz();
            // Ahora debería pasar a B automáticamente
            expect(fin.estado.tipo).toBe("escuchando");
            expect(fin.estado.quien).toBe("B");
            expect(fin.accion).toBe("escuchar");
        });

        it("múltiples pulsaciones durante hablando: solo la primera se encola", () => {
            maquina.pulsarHablar("A");
            maquina.resultadoFinal("hola");
            maquina.traduccionLista({ texto: "hello", ms: 100 });

            maquina.pulsarHablar("B");
            maquina.pulsarHablar("A"); // segunda pulsación, debería ignorarse
            maquina.pulsarHablar("B"); // tercera, ignorarse

            avanzar(500);
            maquina.finDeVoz();

            // Solo B debería ser el siguiente (primera encolada)
            expect(maquina.estado().quien).toBe("B");
        });
    });

    describe("sin reconocimiento disponible", () => {
        it("si no hay reconocimiento, salta a traduciendo con texto vacío", () => {
            const config = configBasica();
            config.reconocimientoDisponible = false;
            const m = crearMaquinaConversacion(config, reloj);

            const salida = m.pulsarHablar("A");
            expect(salida.estado.tipo).toBe("traduciendo");
            expect(salida.estado.texto).toBe("");
            expect(salida.accion).toBe("traducir");
        });
    });

    describe("reiniciar", () => {
        it("reiniciar limpia estado y turnos", () => {
            maquina.pulsarHablar("A");
            maquina.resultadoFinal("hola");
            maquina.traduccionLista({ texto: "hello", ms: 100 });
            avanzar(500);
            maquina.finDeVoz();

            expect(maquina.turnos().length).toBe(1);

            maquina.reiniciar();

            expect(maquina.estado().tipo).toBe("inactivo");
            expect(maquina.turnos()).toEqual([]);
        });
    });

    describe("eventos en estados incorrectos", () => {
        it("resultadoParcial sin estar escuchando no hace nada", () => {
            const salida = maquina.resultadoParcial("hola");
            expect(salida.estado.tipo).toBe("inactivo");
            expect(salida.accion).toBeUndefined();
        });

        it("resultadoFinal sin estar escuchando no hace nada", () => {
            const salida = maquina.resultadoFinal("hola");
            expect(salida.estado.tipo).toBe("inactivo");
        });

        it("traduccionLista sin estar traduciendo no hace nada", () => {
            const salida = maquina.traduccionLista({ texto: "hello", ms: 100 });
            expect(salida.estado.tipo).toBe("inactivo");
        });

        it("finDeVoz sin estar hablando no hace nada", () => {
            const salida = maquina.finDeVoz();
            expect(salida.estado.tipo).toBe("inactivo");
        });

        it("pulsarHablar durante error no hace nada", () => {
            maquina.error("fallo");
            const salida = maquina.pulsarHablar("A");
            expect(salida.estado.tipo).toBe("error");
        });
    });

    describe("latencias registradas correctamente", () => {
        it("msReconocer, msTraducir, msHablar se miden con el reloj inyectado", () => {
            maquina.pulsarHablar("A");
            avanzar(123);
            maquina.resultadoFinal("hola");
            avanzar(456);
            maquina.traduccionLista({ texto: "hello", ms: 456 });
            avanzar(789);
            maquina.finDeVoz();

            const turno = maquina.turnos()[0];
            expect(turno.msReconocer).toBe(123);
            expect(turno.msTraducir).toBe(456);
            expect(turno.msHablar).toBe(789);
        });
    });

    describe("idiomas por hablante", () => {
        it("usa idiomaA para A e idiomaB para B en escuchar", () => {
            const config = configBasica();
            config.idiomaA = "fr";
            config.idiomaB = "de";
            const m = crearMaquinaConversacion(config, reloj);

            let salida = m.pulsarHablar("A");
            expect(salida.payload?.idioma).toBe("fr");

            // Completar el ciclo de A para poder probar B
            m.resultadoFinal("bonjour");
            m.traduccionLista({ texto: "hallo", ms: 100 });
            avanzar(500);
            m.finDeVoz();

            // Después de finDeVoz, ya está en "escuchando" para B, no hace falta pulsarHablar
            salida = m.pulsarHablar("B"); // Esto se ignora porque ya está escuchando
            // Verificar que el estado actual es escuchando para B
            expect(m.estado().tipo).toBe("escuchando");
            expect(m.estado().quien).toBe("B");
        });

        it("usa idioma del oyente para traducir y hablar", () => {
            maquina.pulsarHablar("A");
            maquina.resultadoFinal("hola");
            let salida = maquina.traduccionLista({ texto: "hello", ms: 100 });
            // A habla, B escucha → idioma de B (en)
            expect(salida.payload?.idioma).toBe("en");

            avanzar(500);
            maquina.finDeVoz();
            // Ahora B escucha (estado ya es "escuchando" para B)
            expect(maquina.estado().quien).toBe("B");
            maquina.resultadoFinal("hi");
            salida = maquina.traduccionLista({ texto: "hola", ms: 100 });
            // B habla, A escucha → idioma de A (es)
            expect(salida.payload?.idioma).toBe("es");
        });
    });
});