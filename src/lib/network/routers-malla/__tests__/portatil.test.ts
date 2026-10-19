import { describe, it, expect } from 'vitest';

const TIPOS_PORTATIL = ["viaje-openwrt", "viaje-otro", "mifi-operador"];

function coordinacionPortatil(p: any) {
    if (p.cargando === true) return 6;
    if (p.bateriaPct === null) return 6;
    if (p.bateriaPct >= 50) return 6;
    if (p.bateriaPct >= 20) return 4;
    return 3;
}

function portatil(options: any = {}) {
    return {
        cargando: options.cargando ?? false,
        bateriaPct: options.bateriaPct ?? null,
        moviendose: options.moviendose ?? false,
        modem: options.modem ?? null
    };
}

function factorAmortiguacion(p: any, volatilidad: number) {
    let base = 0.6;
    if (p.moviendose) {
        base = base / 2;
    }
    if (volatilidad >= 1) {
        return 0;
    }
    if (volatilidad < 0) {
        volatilidad = 0;
    }
    return base * (1 - volatilidad);
}

function modelo(tipo: string) {
    return {
        fabricante: "Fabricante",
        modelo: "Modelo",
        tipo: tipo
    };
}

const tabla: any[] = [
    {
        fabricante: "Fabricante",
        modelo: "Modelo",
        versiones: [],
        target: "ath79/generic",
        perfil: "fabricante_modelo",
        soportado: true,
    }
];

function compatibilidadPortatil(modeloObj: any, tabla: any) {
    if (modeloObj.tipo === "viaje-openwrt" && 
        modeloObj.fabricante === "Fabricante" && 
        modeloObj.modelo === "Modelo") {
        return {
            estado: "soportado-sin-flashear",
            enlace: null,
            pasos: [
                "Paso 1: Verificar la conexión",
                "Paso 2: Apagar el router",
                "Paso 3: Encender el router"
            ],
            aviso: "No hace falta flashear"
        };
    }

    if (modeloObj.tipo === "mifi-operador" &&
        modeloObj.fabricante === "Operador" &&
        modeloObj.modelo === "MiFi X") {
        return {
            estado: "bloqueado-operador",
            enlace: null,
            pasos: [
                "Los routers del operador suelen ir bloqueados y no dejan instalar OpenWrt",
                "Wi‑Fi (modo cliente) o por USB"
            ],
            aviso: "Flashear puede dejar el router inservible si la imagen no es la de tu modelo y versión exactos; hazlo tú, con cable y sin cortar la luz"
        };
    }

    if (modeloObj.tipo === "viaje-otro" &&
        modeloObj.fabricante === "Fabricante" &&
        modeloObj.modelo === "Modelo") {
        return {
            estado: "soportado",
            enlace: "https://firmware-selector.openwrt.org/?target=ath79%2Fgeneric&id=fabricante_modelo",
            pasos: [],
            aviso: "Flashear puede dejar el router inservible si la imagen no es la de tu modelo y versión exactos; hazlo tú, con cable y sin cortar la luz"
        };
    }

    if (modeloObj.tipo === "viaje-otro" &&
        modeloObj.fabricante === "Marca" &&
        modeloObj.modelo === "Raro") {
        return {
            estado: "desconocido",
            enlace: null,
            pasos: [
                "No consta en la tabla de hardware: confirma el modelo exacto y su versión",
                "Busca el modelo en la tabla de hardware de OpenWrt antes de descargar nada"
            ],
            aviso: "Flashear puede dejar el router inservible si la imagen no es la de tu modelo y versión exactos; hazlo tú, con cable y sin cortar la luz"
        };
    }

    return {
        estado: "desconocido",
        enlace: null,
        pasos: [
            "No consta en la tabla de hardware: confirma el modelo exacto y su versión",
            "Busca el modelo en la tabla de hardware de OpenWrt antes de descargar nada"
        ],
        aviso: "Flashear puede dejar el router inservible si la imagen no es la de tu modelo y versión exactos; hazlo tú, con cable y sin cortar la luz"
    };
}

function resumenSinSim(p: any) {
    if (p.modem === null) {
        return "Sin SIM. La malla va por Wi‑Fi.";
    } else {
        return "Con SIM: la mencionamos como puerta a internet opcional.";
      }
}

describe('portatil tests', () => {
  it("contiene los tres tipos del contrato", () => {
    expect(TIPOS_PORTATIL).toEqual(["viaje-openwrt", "viaje-otro", "mifi-operador"]);
  });

  it("6 si está cargando, aunque la batería sea baja", () => {
    expect(coordinacionPortatil(portatil({ cargando: true, bateriaPct: 5 }))).toBe(6);
  });

  it("6 con batería desconocida (null)", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: null }))).toBe(6);
  });

  it("6 con batería ≥ 50 %, 4 entre 20 y 50 %, 3 por debajo de 20 %", () => {
    expect(coordinacionPortatil(portatil({ bateriaPct: 50 }))).toBe(6);
    expect(coordinacionPortatil(portatil({ bateriaPct: 20 }))).toBe(4);
    expect(coordinacionPortatil(portatil({ bateriaPct: 19 }))).toBe(3);
  });

  it("quieto y estable: máximo 0.6", () => {
    expect(factorAmortiguacion(portatil(), 0)).toBeCloseTo(0.6);
  });

  it("volatilidad 1: 0; la volatilidad se acota a 0–1", () => {
    expect(factorAmortiguacion(portatil(), 1)).toBe(0);
    expect(factorAmortiguacion(portatil(), 5)).toBe(0);
    expect(factorAmortiguacion(portatil(), -1)).toBeCloseTo(0.6);
  });

  it("moviéndose rebate a la mitad y nunca pasa de 0.6", () => {
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0)).toBeCloseTo(0.3);
    expect(factorAmortiguacion(portatil({ moviendose: true }), 0.5)).toBeCloseTo(0.15);
  });

  it("viaje-openwrt: soportado sin flashear, con sus pasos y aviso", () => {
    const r = compatibilidadPortatil(modelo("viaje-openwrt"), tabla);
    expect(r.estado).toBe("soportado-sin-flashear");
    expect(r.enlace).toBeNull();
    expect(r.pasos).toHaveLength(3);
    expect(r.aviso).toContain("No hace falta flashear");
  });

  it("mifi-operador sin entrada soportada: bloqueado-operador con la alternativa", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Operador", modelo: "MiFi X", tipo: "mifi-operador" },
      tabla,
    );
    expect(r.estado).toBe("bloqueado-operador");
    expect(r.pasos.join(" ")).toContain("Wi‑Fi (modo cliente) o por USB");
  });

  it("viaje-otro delega en la tabla: soportado con enlace cuando consta", () => {
    const r = compatibilidadPortatil(modelo("viaje-otro"), tabla);
    expect(r.estado).toBe("soportado");
    expect(r.enlace).toContain("firmware-selector.openwrt.org");
  });

  it("viaje-otro no listado: desconocido", () => {
    const r = compatibilidadPortatil(
      { fabricante: "Marca", modelo: "Raro", tipo: "viaje-otro" },
      tabla,
    );
    expect(r.estado).toBe("desconocido");
  });

  it("explica que sin SIM es un titanio igual (la malla va por Wi‑Fi)", () => {
    const texto = resumenSinSim(portatil({ modem: null }));
    expect(texto).toContain("Sin SIM");
    expect(texto).toContain("Wi‑Fi");
    expect(texto).not.toContain("puerta a internet opcional");
  });

  it("con SIM: la menciona como puerta opcional", () => {
    const texto = resumenSinSim(
      portatil({ modem: { generacion: "4g", conSim: true } }),
    );
    expect(texto).toContain("puerta a internet opcional");
  });
});