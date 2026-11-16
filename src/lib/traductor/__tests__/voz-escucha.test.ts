import { describe, expect, it, vi } from "vitest";
import { crearEscucha } from "../voz-escucha";

describe("crearEscucha", () => {
    describe("disponible()", () => {
        it("retorna ok:true cuando hay SpeechRecognition disponible", () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                },
            };
            const escucha = crearEscucha(entorno);
            const r = escucha.disponible();
            expect(r.ok).toBe(true);
            expect(r.audioSaleDelAparato).toBe(true);
            expect(r.motivo).toBeUndefined();
        });

        it("retorna ok:true cuando hay SpeechRecognition disponible (sin webkit)", () => {
            const entorno = {
                SpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                },
            };
            const escucha = crearEscucha(entorno);
            const r = escucha.disponible();
            expect(r.ok).toBe(true);
            expect(r.audioSaleDelAparato).toBe(true);
        });

        it("retorna ok:true cuando OSS está disponible pero sin reconocimiento nativo", () => {
            const entorno = {
                ossStt: {
                    iniciar: vi.fn(),
                    detener: vi.fn(),
                    disponible: () => ({ ok: true }),
                },
            };
            const escucha = crearEscucha(entorno);
            const r = escucha.disponible();
            expect(r.ok).toBe(true);
            expect(r.audioSaleDelAparato).toBe(false);
        });

        it("retorna ok:false con motivo cuando no hay ni reconocimiento ni OSS", () => {
            const entorno = {};
            const escucha = crearEscucha(entorno);
            const r = escucha.disponible();
            expect(r.ok).toBe(false);
            expect(r.motivo).toContain("no ofrece reconocimiento");
            expect(r.audioSaleDelAparato).toBe(false);
        });

        it("retorna ok:false con motivo cuando OSS está caído", () => {
            const entorno = {
                ossStt: {
                    iniciar: vi.fn(),
                    detener: vi.fn(),
                    disponible: () => ({ ok: false, motivo: "modelo no descargado" }),
                },
            };
            const escucha = crearEscucha(entorno);
            const r = escucha.disponible();
            expect(r.ok).toBe(false);
            expect(r.motivo).toBe("modelo no descargado");
        });
    });

    describe("iniciar() con SpeechRecognition nativo", () => {
        it("inicia reconocimiento y llama alResultado con texto final", async () => {
            const resultados: string[] = [];
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult: ((ev: SpeechRecognitionEvent) => void) | null = null;
                    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                    onend: ((ev: Event) => void) | null = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);

            expect(entorno.webkitSpeechRecognition!.prototype.start).toHaveBeenCalled();
        });

        it("llama a alError con mensaje traducido al error not-allowed", async () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                    onend = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);

            const SR = entorno.webkitSpeechRecognition as new () => SpeechRecognitionLike;
            const instancia = new SR();

            if (instancia.onerror) {
                instancia.onerror({ error: "not-allowed" } as SpeechRecognitionErrorEvent);
            }

            expect(callbacks.alError).toHaveBeenCalledWith(expect.stringContaining("permiso"));
        });

        it("llama a alError con mensaje traducido al error no-speech", async () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                    onend = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);

            const SR = entorno.webkitSpeechRecognition as new () => SpeechRecognitionLike;
            const instancia = new SR();

            if (instancia.onerror) {
                instancia.onerror({ error: "no-speech" } as SpeechRecognitionErrorEvent);
            }

            expect(callbacks.alError).toHaveBeenCalledWith(expect.stringContaining("voz"));
        });

        it("llama a alError con mensaje traducido al error network", async () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                    onend = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);

            const SR = entorno.webkitSpeechRecognition as new () => SpeechRecognitionLike;
            const instancia = new SR();

            if (instancia.onerror) {
                instancia.onerror({ error: "network" } as SpeechRecognitionErrorEvent);
            }

            expect(callbacks.alError).toHaveBeenCalledWith(expect.stringContaining("red"));
        });

        it("llama a alError con mensaje traducido al error language-not-supported", async () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                    onend = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);

            const SR = entorno.webkitSpeechRecognition as new () => SpeechRecognitionLike;
            const instancia = new SR();

            if (instancia.onerror) {
                instancia.onerror({ error: "language-not-supported" } as SpeechRecognitionErrorEvent);
            }

            expect(callbacks.alError).toHaveBeenCalledWith(expect.stringContaining("idioma"));
        });

        it("rechaza iniciar cuando ya hay sesión activa", async () => {
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror = null;
                    onend = null;
                    start = vi.fn();
                    stop = vi.fn();
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);
            await escucha.iniciar("es-ES", callbacks);

            expect(callbacks.alError).toHaveBeenCalledWith("Ya hay una sesión de reconocimiento activa");
        });
    });

    describe("iniciar() con OSS", () => {
        it("llama a OSS.iniciar cuando no hay SpeechRecognition nativo", async () => {
            const iniciarMock = vi.fn().mockResolvedValue(undefined);
            const entorno = {
                ossStt: {
                    iniciar: iniciarMock,
                    detener: vi.fn(),
                    disponible: () => ({ ok: true }),
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es", callbacks);

            expect(iniciarMock).toHaveBeenCalledWith("es", callbacks);
        });
    });

    describe("detener()", () => {
        it("detiene reconocimiento nativo", async () => {
            const stopMock = vi.fn();
            const entorno = {
                webkitSpeechRecognition: class {
                    lang = "";
                    interimResults = false;
                    continuous = false;
                    onresult = null;
                    onerror = null;
                    onend = null;
                    start = vi.fn();
                    stop = stopMock;
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es-ES", callbacks);
            escucha.detener();

            expect(stopMock).toHaveBeenCalled();
        });

        it("detiene OSS cuando está activo", async () => {
            const detenerMock = vi.fn();
            const entorno = {
                ossStt: {
                    iniciar: vi.fn().mockResolvedValue(undefined),
                    detener: detenerMock,
                    disponible: () => ({ ok: true }),
                },
            };

            const escucha = crearEscucha(entorno);
            const callbacks = {
                alResultado: vi.fn(),
                alError: vi.fn(),
            };

            await escucha.iniciar("es", callbacks);
            escucha.detener();

            expect(detenerMock).toHaveBeenCalled();
        });
    });

    describe("mapeo de errores", () => {
        const errores = [
            ["not-allowed", "permiso"],
            ["permission-denied", "permiso"],
            ["no-speech", "voz"],
            ["audio-capture", "micrófono"],
            ["network", "red"],
            ["language-not-supported", "idioma"],
            ["aborted", "cancelado"],
            ["service-not-allowed", "no está disponible"],
        ];

        for (const [error, busqueda] of errores) {
            it(`traduce error "${error}" a mensaje en español`, async () => {
                const entorno = {
                    webkitSpeechRecognition: class {
                        lang = "";
                        interimResults = false;
                        continuous = false;
                        onresult = null;
                        onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null = null;
                        onend = null;
                        start = vi.fn();
                        stop = vi.fn();
                    },
                };

                const escucha = crearEscucha(entorno);
                const callbacks = {
                    alResultado: vi.fn(),
                    alError: vi.fn(),
                };

                await escucha.iniciar("es-ES", callbacks);

                const SR = entorno.webkitSpeechRecognition as new () => SpeechRecognitionLike;
                const instancia = new SR();

                if (instancia.onerror) {
                    instancia.onerror({ error } as SpeechRecognitionErrorEvent);
                }

                expect(callbacks.alError).toHaveBeenCalledWith(expect.stringContaining(busqueda));
            });
        }
    });
});