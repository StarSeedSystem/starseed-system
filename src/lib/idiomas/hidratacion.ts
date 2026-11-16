export interface EntornoHidratacion {
    readyState: () => string;
    alCargar: (f: () => void) => () => void;
    esperarReposo: (f: () => void, tope: number) => () => void;
}

export function cuandoEsSeguroTraducir(
    entorno: EntornoHidratacion,
    topeMs = 1500
): Promise<void> {
    return new Promise<void>((resolve) => {
        let resuelto = false;
        const resolver = () => {
            if (resuelto) return;
            resuelto = true;
            quitarEscuchas();
            resolve();
        };

        let quitarCarga: (() => void) | null = null;
        let quitarReposo: (() => void) | null = null;

        const quitarEscuchas = () => {
            quitarCarga?.();
            quitarReposo?.();
            quitarCarga = null;
            quitarReposo = null;
        };

        const tope = setTimeout(resolver, topeMs);

        const comprobarYRegistrarReposo = () => {
            quitarReposo = entorno.esperarReposo(() => {
                clearTimeout(tope);
                resolver();
            }, topeMs);
        };

        if (entorno.readyState() === "complete") {
            comprobarYRegistrarReposo();
        } else {
            quitarCarga = entorno.alCargar(() => {
                comprobarYRegistrarReposo();
            });
        }
    });
}

export function entornoDelNavegador(win: Window): EntornoHidratacion {
    const doc = win.document;

    return {
        readyState: () => doc.readyState,
        alCargar: (f: () => void) => {
            if (doc.readyState === "complete") {
                f();
                return () => {};
            }
            const handler = () => {
                win.removeEventListener("load", handler);
                f();
            };
            win.addEventListener("load", handler);
            return () => win.removeEventListener("load", handler);
        },
        esperarReposo: (f: () => void, tope: number) => {
            const idleCallback = win.requestIdleCallback ?? ((cb: IdleRequestCallback) => {
                return win.setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 0);
            });
            const cancelIdle = win.cancelIdleCallback ?? win.clearTimeout;

            let id: number | undefined;
            const topeId = win.setTimeout(() => {
                if (id !== undefined) {
                    cancelIdle(id);
                    id = undefined;
                }
                f();
            }, tope);

            id = idleCallback((deadline) => {
                win.clearTimeout(topeId);
                if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
                    f();
                } else {
                    id = idleCallback((d) => {
                        win.clearTimeout(topeId);
                        f();
                    });
                }
            });

            return () => {
                win.clearTimeout(topeId);
                if (id !== undefined) {
                    cancelIdle(id);
                }
            };
        },
    };
}