import { describe, it, expect } from "vitest";

import {
    calcularAvisos,
    ETIQUETA_DESPIERTO,
    impideReposo,
    parsearAsserciones,
    parsearBateria,
    parsearPmsetG,
    plistDespierto,
    validarServidor,
    type Asercion,
    type EstadoServidorAstraura,
} from "@/lib/mando/servidor-astraura-tipos";

const MUESTRA_PMSET_G = `System-wide power settings:
Currently in use:
 standby              1
 disksleep            10
 sleep                1 (sleep prevented by powerd, Claude)
 hibernatemode        3
 displaysleep         90
`;

describe("parsearPmsetG", () => {
    it("lee minutos de sistema y pantalla, y quién impide el reposo", () => {
        const r = parsearPmsetG(MUESTRA_PMSET_G);
        expect(r.reposoSistemaMin).toBe(1);
        expect(r.reposoPantallaMin).toBe(90);
        expect(r.reposoImpedidoPor).toEqual(["powerd", "Claude"]);
        expect(r.reposoDesactivado).toBe(false);
    });

    it("`sleep 0` significa nunca: minutos null", () => {
        const r = parsearPmsetG(" sleep                0\n displaysleep         0\n");
        expect(r.reposoSistemaMin).toBeNull();
        expect(r.reposoPantallaMin).toBeNull();
    });

    it("no confunde disksleep/displaysleep con sleep", () => {
        const r = parsearPmsetG(" disksleep 10\n displaysleep 5\n");
        expect(r.reposoSistemaMin).toBeNull();
        expect(r.reposoPantallaMin).toBe(5);
    });

    it("detecta SleepDisabled (tabulado) del bloque system-wide", () => {
        const texto = "System-wide power settings:\nSleepDisabled\t\t1\nCurrently in use:\n sleep 1\n";
        const r = parsearPmsetG(texto);
        expect(r.reposoDesactivado).toBe(true);
    });

    it("SleepDisabled a 0 no activa el desactivado", () => {
        const r = parsearPmsetG("SleepDisabled\t\t0\n sleep 1\n");
        expect(r.reposoDesactivado).toBe(false);
    });

    it("texto vacío o irreconocible no lanza y devuelve todo neutro", () => {
        expect(parsearPmsetG("")).toEqual({
            reposoSistemaMin: null,
            reposoPantallaMin: null,
            reposoImpedidoPor: [],
            reposoDesactivado: false,
        });
        expect(parsearPmsetG("cualquier cosa\nque no es pmset\n").reposoSistemaMin).toBeNull();
    });

    it("sin paréntesis de «prevented by» deja la lista vacía", () => {
        const r = parsearPmsetG(" sleep 10\n");
        expect(r.reposoImpedidoPor).toEqual([]);
        expect(r.reposoSistemaMin).toBe(10);
    });
});

describe("parsearBateria", () => {
    it("AC + 100% + charged + 0:00 remaining", () => {
        const texto = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=22806627)\t100%; charged; 0:00 remaining present: true";
        const r = parsearBateria(texto);
        expect(r.alimentacion).toBe("ac");
        expect(r.porcentaje).toBe(100);
        expect(r.cargando).toBe(false);
        expect(r.restante).toBe("0:00");
    });

    it("Battery Power + discharging + tiempo restante", () => {
        const texto = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t62%; discharging; 3:12 remaining present: true";
        const r = parsearBateria(texto);
        expect(r.alimentacion).toBe("bateria");
        expect(r.porcentaje).toBe(62);
        expect(r.cargando).toBe(false);
        expect(r.restante).toBe("3:12");
    });

    it("charging de verdad sí marca cargando=true", () => {
        const texto = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t45%; charging; 1:05 remaining present: true";
        const r = parsearBateria(texto);
        expect(r.cargando).toBe(true);
        expect(r.restante).toBe("1:05");
    });

    it("(no estimate) deja restante en null sin lanzar", () => {
        const texto = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t45%; discharging; (no estimate) present: true";
        const r = parsearBateria(texto);
        expect(r.restante).toBeNull();
        expect(r.porcentaje).toBe(45);
    });

    it("Mac de sobremesa sin línea de batería", () => {
        const texto = "Now drawing from 'AC Power'\n";
        const r = parsearBateria(texto);
        expect(r.alimentacion).toBe("ac");
        expect(r.porcentaje).toBeNull();
        expect(r.cargando).toBe(false);
        expect(r.restante).toBeNull();
    });

    it("texto vacío no lanza: todo desconocido/null", () => {
        const r = parsearBateria("");
        expect(r.alimentacion).toBe("desconocida");
        expect(r.porcentaje).toBeNull();
    });
});

const MUESTRA_ASSERCIONES = `Assertion status system-wide:
   BackgroundTask                    0
   ApplePushServiceTask              0
Listed by owning process:
   pid 30504(Claude): [0x0006a59100018a12] 23:22:37 NoIdleSleepAssertion named: "Electron"
   pid 411(powerd): [0x0006a5910001891a] 23:10:00 PreventUserIdleDisplaySleep named: "Prevent sleep while display is on"
   pid 1(launchd): [0x0006a59100018900] 22:00:00 PreventSystemSleep named: "com.starseed.despierto"
`;

describe("parsearAsserciones", () => {
    it("extrae pid, proceso, tipo y nombre de cada línea", () => {
        const r = parsearAsserciones(MUESTRA_ASSERCIONES);
        expect(r).toEqual([
            { pid: 30504, proceso: "Claude", tipo: "NoIdleSleepAssertion", nombre: "Electron" },
            { pid: 411, proceso: "powerd", tipo: "PreventUserIdleDisplaySleep", nombre: "Prevent sleep while display is on" },
            { pid: 1, proceso: "launchd", tipo: "PreventSystemSleep", nombre: "com.starseed.despierto" },
        ]);
    });

    it("texto vacío o sin sección devuelve []", () => {
        expect(parsearAsserciones("")).toEqual([]);
        expect(parsearAsserciones("nada que ver aquí")).toEqual([]);
    });
});

describe("impideReposo", () => {
    it("incluye NoIdleSleepAssertion y PreventSystemSleep, excluye la de powerd de pantalla", () => {
        const asserciones = parsearAsserciones(MUESTRA_ASSERCIONES);
        expect(impideReposo(asserciones)).toEqual(["Claude", "launchd"]);
    });

    it("un tipo no relevante (PreventUserIdleDisplaySleep) no cuenta aunque no sea powerd", () => {
        const asserciones: Asercion[] = [{ pid: 1, proceso: "algo", tipo: "PreventUserIdleDisplaySleep", nombre: "x" }];
        expect(impideReposo(asserciones)).toEqual([]);
    });

    it("dedupe: el mismo proceso repetido aparece una sola vez", () => {
        const asserciones: Asercion[] = [
            { pid: 1, proceso: "Claude", tipo: "NoIdleSleepAssertion", nombre: "a" },
            { pid: 2, proceso: "Claude", tipo: "PreventSystemSleep", nombre: "b" },
        ];
        expect(impideReposo(asserciones)).toEqual(["Claude"]);
    });

    it("[] de entrada devuelve []", () => {
        expect(impideReposo([])).toEqual([]);
    });
});

describe("plistDespierto", () => {
    it("lleva caffeinate -i -m -s (sin -d), KeepAlive y la etiqueta correcta", () => {
        const xml = plistDespierto();
        expect(xml).toContain("<string>/usr/bin/caffeinate</string>");
        expect(xml).toContain("<string>-i</string>");
        expect(xml).toContain("<string>-m</string>");
        expect(xml).toContain("<string>-s</string>");
        expect(xml).not.toContain("<string>-d</string>");
        expect(xml).toContain(`<string>${ETIQUETA_DESPIERTO}</string>`);
        expect(xml).toContain("<key>KeepAlive</key><true/>");
        expect(xml).toContain("<key>RunAtLoad</key><true/>");
        expect(xml).toContain("<key>ProcessType</key><string>Interactive</string>");
    });
});

describe("validarServidor", () => {
    it("acepta una URL https válida con solo el dominio", () => {
        const r = validarServidor({ nombre: "Oracle Always Free", tipo: "oracle", url: "https://140.238.1.2" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.servidor).toEqual({ nombre: "Oracle Always Free", tipo: "oracle", url: "https://140.238.1.2" });
        }
    });

    it("acepta http:// solo para una IP privada de la LAN", () => {
        const r = validarServidor({ nombre: "Servidor de casa", tipo: "vps", url: "http://192.168.1.50:8000" });
        expect(r.ok).toBe(true);
    });

    it("acepta http:// para un host .local", () => {
        const r = validarServidor({ nombre: "Mac mini", tipo: "otro", url: "http://mac-mini.local" });
        expect(r.ok).toBe(true);
    });

    it("rechaza http:// para un host público", () => {
        const r = validarServidor({ nombre: "x", tipo: "vps", url: "http://ejemplo.com" });
        expect(r.ok).toBe(false);
    });

    it("rechaza nombre vacío o demasiado largo", () => {
        expect(validarServidor({ nombre: "", tipo: "oracle", url: "https://x.com" }).ok).toBe(false);
        expect(validarServidor({ nombre: "a".repeat(61), tipo: "oracle", url: "https://x.com" }).ok).toBe(false);
    });

    it("rechaza un tipo desconocido", () => {
        expect(validarServidor({ nombre: "x", tipo: "aws", url: "https://x.com" }).ok).toBe(false);
    });

    it("rechaza usuario:contraseña en la URL", () => {
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://user:pass@ejemplo.com" }).ok).toBe(false);
    });

    it("rechaza query string y fragmento", () => {
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://ejemplo.com?a=1" }).ok).toBe(false);
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://ejemplo.com#frag" }).ok).toBe(false);
    });

    it("rechaza cualquier ruta detrás del dominio", () => {
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://ejemplo.com/api" }).ok).toBe(false);
    });

    it("rechaza algo que parezca una clave o token", () => {
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://ejemplo.com?key=abc" }).ok).toBe(false);
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://sk-abc123.ejemplo.com" }).ok).toBe(false);
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "https://ejemplo.com?token=abc" }).ok).toBe(false);
    });

    it("rechaza una URL inválida o vacía sin lanzar", () => {
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "no-es-una-url" }).ok).toBe(false);
        expect(validarServidor({ nombre: "x", tipo: "vps", url: "" }).ok).toBe(false);
        expect(validarServidor({}).ok).toBe(false);
        expect(validarServidor(null).ok).toBe(false);
    });
});

function estadoBase(): EstadoServidorAstraura {
    return {
        t: new Date().toISOString(),
        energia: {
            despierto: false,
            pidCaffeinate: null,
            desde: null,
            bateria: { alimentacion: "ac", porcentaje: 100, cargando: false, restante: null },
            reposoSistemaMin: 10,
            reposoPantallaMin: 5,
            reposoDesactivado: false,
            reposoImpedidoPor: [],
        },
        astraura: {
            backend: { ok: true, ms: 50 },
            bitnet: { dormido: false, ultimoUsoInteractivoHaceS: 1000, vivo: true },
            llama: { ok: true },
            fondo: { ciclo: 10, enCurso: false, descansaS: 30, aplazadasPresupuesto: 0, cedidasAlChat: 0 },
        },
        nube: {
            tunelActivo: true,
            proveedor: "cloudflare",
            actualizado: new Date().toISOString(),
            huella: "abc123def456",
            publicado: { huella: "abc123def456" },
            coincide: true,
            destino: "esta-mac-tunel",
        },
        servicios: [],
        enjambre: { orquestadorVivo: true, topeGobernador: 4 },
        maquina: {
            hostname: "mac-de-alex",
            uptimeS: 3600,
            loadavg: [1, 1, 1],
            memLibreMb: 2048,
            memTotalMb: 8192,
            plataforma: "darwin",
        },
        servidores: [],
        avisos: [],
    };
}

describe("calcularAvisos", () => {
    it("sin problemas no da avisos", () => {
        expect(calcularAvisos(estadoBase())).toEqual([]);
    });

    it("avisa si está despierta y en batería", () => {
        const e = estadoBase();
        e.energia.despierto = true;
        e.energia.bateria = { alimentacion: "bateria", porcentaje: 40, cargando: false, restante: "2:00" };
        const avisos = calcularAvisos(e);
        expect(avisos.some((a) => a.includes("En batería al 40 %"))).toBe(true);
    });

    it("avisa si la batería está baja y sin cargar", () => {
        const e = estadoBase();
        e.energia.bateria = { alimentacion: "bateria", porcentaje: 10, cargando: false, restante: "0:20" };
        expect(calcularAvisos(e).some((a) => a.includes("10 %"))).toBe(true);
    });

    it("no avisa de batería baja si está cargando", () => {
        const e = estadoBase();
        e.energia.bateria = { alimentacion: "bateria", porcentaje: 10, cargando: true, restante: "0:20" };
        expect(calcularAvisos(e).some((a) => a.includes("y sin cargar"))).toBe(false);
    });

    it("avisa si el túnel publicado no coincide con el activo", () => {
        const e = estadoBase();
        e.nube.publicado.huella = "otrahuella000";
        expect(calcularAvisos(e).some((a) => a.includes("túnel viejo"))).toBe(true);
    });

    it("avisa si el backend está caído", () => {
        const e = estadoBase();
        e.astraura.backend = { ok: false, ms: null };
        expect(calcularAvisos(e).some((a) => a.includes("backend de Astraura"))).toBe(true);
    });

    it("avisa si BitNet (llama) está caído", () => {
        const e = estadoBase();
        e.astraura.llama = { ok: false };
        expect(calcularAvisos(e).some((a) => a.includes("BitNet"))).toBe(true);
    });

    it("avisa de la tapa cerrada cuando está despierta y el reposo no está desactivado", () => {
        const e = estadoBase();
        e.energia.despierto = true;
        expect(calcularAvisos(e).some((a) => a.includes("tapa cerrada"))).toBe(true);
    });

    it("no avisa de la tapa cerrada si el reposo ya está desactivado", () => {
        const e = estadoBase();
        e.energia.despierto = true;
        e.energia.reposoDesactivado = true;
        expect(calcularAvisos(e).some((a) => a.includes("tapa cerrada"))).toBe(false);
    });

    it("avisa si el orquestador no está vivo", () => {
        const e = estadoBase();
        e.enjambre.orquestadorVivo = false;
        expect(calcularAvisos(e).some((a) => a.includes("orquestador"))).toBe(true);
    });
});
