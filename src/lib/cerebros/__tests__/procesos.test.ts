import { describe, it, expect } from "vitest";
import {
  TipoProceso,
  ProcesoActivo,
  HardwareServidor,
  ETIQUETA_TIPO,
  porcentaje,
  UmbralesProcesos,
  UMBRALES_POR_DEFECTO,
  avisosHardware,
  hardwareDesdeMac,
  hardwareDesdeNodo,
  hardwareDesdeNeurona
} from "../procesos";

describe("Tipos básicos", () => {
  it("should verify TipoProceso values are valid strings", () => {
    // Verificar que los valores esperados son cadenas válidas
    expect(typeof "genesis").toBe("string");
    expect(typeof "poligenesis").toBe("string");
    expect(typeof "sueno").toBe("string");
    expect(typeof "imaginacion").toBe("string");
    expect(typeof "descarga").toBe("string");
    expect(typeof "instalacion").toBe("string");
    expect(typeof "actualizacion").toBe("string");
    expect(typeof "app-fondo").toBe("string");
    expect(typeof "servicio").toBe("string");
    
    // Verificar que están en la lista esperada (aunque no podemos probar el tipo directamente)
    const valoresValidos: TipoProceso[] = [
      "genesis",
      "poligenesis",
      "sueno",
      "imaginacion",
      "descarga",
      "instalacion",
      "actualizacion",
      "app-fondo",
      "servicio"
    ];
    
    expect(valoresValidos).toContain("genesis");
    expect(valoresValidos).toContain("poligenesis");
    expect(valoresValidos).toContain("sueno");
    expect(valoresValidos).toContain("imaginacion");
    expect(valoresValidos).toContain("descarga");
    expect(valoresValidos).toContain("instalacion");
    expect(valoresValidos).toContain("actualizacion");
    expect(valoresValidos).toContain("app-fondo");
    expect(valoresValidos).toContain("servicio");
  });

  it("should define ETIQUETA_TIPO con valores en español", () => {
    expect(ETIQUETA_TIPO["genesis"]).toBe("Genesis");
    expect(ETIQUETA_TIPO["poligenesis"]).toBe("PoliGenesis");
    expect(ETIQUETA_TIPO["sueno"]).toBe("Sueños");
    expect(ETIQUETA_TIPO["imaginacion"]).toBe("Imaginación");
    expect(ETIQUETA_TIPO["descarga"]).toBe("Descargas");
    expect(ETIQUETA_TIPO["instalacion"]).toBe("Instalaciones");
    expect(ETIQUETA_TIPO["actualizacion"]).toBe("Actualizaciones");
    expect(ETIQUETA_TIPO["app-fondo"]).toBe("Apps en segundo plano");
    expect(ETIQUETA_TIPO["servicio"]).toBe("Servicios");
  });
});

describe("Función porcentaje", () => {
  it("should return null when used is null", () => {
    expect(porcentaje(null, 100)).toBeNull();
  });

  it("should return null when total is null", () => {
    expect(porcentaje(50, null)).toBeNull();
  });

  it("should return null when total is 0", () => {
    expect(porcentaje(50, 0)).toBeNull();
  });

  it("should return null when total is negative", () => {
    expect(porcentaje(50, -10)).toBeNull();
  });

  it("should calculate percentage correctly with 1 decimal", () => {
    expect(porcentaje(50, 100)).toBe(50.0);
    expect(porcentaje(25, 100)).toBe(25.0);
    expect(porcentaje(10, 3)).toBe(333.3); // 10/3*100 = 333.333... -> 333.3
    expect(porcentaje(1, 3)).toBe(33.3); // 1/3*100 = 33.333... -> 33.3
    expect(porcentaje(0, 100)).toBe(0.0);
  });
});

describe("Umbrales por defecto", () => {
  it("should have correct default values", () => {
    expect(UMBRALES_POR_DEFECTO.cpu).toBe(85);
    expect(UMBRALES_POR_DEFECTO.ram).toBe(90);
    expect(UMBRALES_POR_DEFECTO.disco).toBe(90);
    expect(UMBRALES_POR_DEFECTO.bateria).toBe(20);
  });
});

describe("avisosHardware", () => {
  const umbralesTest: UmbralesProcesos = {
    cpu: 80,
    ram: 70,
    disco: 60,
    bateria: 30
  };

  it("should return empty array when no values exceed thresholds", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 50,
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 2000,
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 500,
      discoTotalGb: 1000,
      bateriaPct: 50,
      cargando: false,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    expect(avisosHardware(hardware, umbralesTest)).toEqual([]);
  });

  it("should detect CPU over threshold", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 90, // Sobre 80
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 2000,
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 500,
      discoTotalGb: 1000,
      bateriaPct: 50,
      cargando: false,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    expect(avisos.length).toBe(1);
    expect(avisos[0]).toEqual({
      servidor: "Servidor de prueba",
      medida: "cpu",
      valor: 90,
      umbral: 80
    });
  });

  it("should detect RAM over threshold", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 50,
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 3500, // 87.5% de 4000
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 500,
      discoTotalGb: 1000,
      bateriaPct: 50,
      cargando: false,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    expect(avisos.length).toBe(1);
    expect(avisos[0]).toEqual({
      servidor: "Servidor de prueba",
      medida: "ram",
      valor: 87.5, // 3500/4000*100 = 87.5
      umbral: 70
    });
  });

  it("should detect disk over threshold", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 50,
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 2000,
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 300, // 700 usado de 1000 = 70%
      discoTotalGb: 1000,
      bateriaPct: 50,
      cargando: false,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    expect(avisos.length).toBe(1);
    expect(avisos[0]).toEqual({
      servidor: "Servidor de prueba",
      medida: "disco",
      valor: 70, // (1000-300)/1000*100 = 70
      umbral: 60
    });
  });

  it("should detect battery under threshold when not charging", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 50,
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 2000,
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 500,
      discoTotalGb: 1000,
      bateriaPct: 25, // Bajo 30
      cargando: false, // Importante: no cargando
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    expect(avisos.length).toBe(1);
    expect(avisos[0]).toEqual({
      servidor: "Servidor de prueba",
      medida: "bateria",
      valor: 25,
      umbral: 30
    });
  });

  it("should NOT detect battery when charging even if under threshold", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor de prueba",
      tipo: "mac",
      cpuPct: 50,
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 2000,
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 500,
      discoTotalGb: 1000,
      bateriaPct: 15, // Bajo 30
      cargando: true, // Está cargando, así que NO debe avisar
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    expect(avisos.length).toBe(0);
  });

  it("should handle multiple alerts from same server", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor sobrecalentado",
      tipo: "mac",
      cpuPct: 90, // Sobre 80
      nucleos: 4,
      carga: 0.5,
      ramUsadaMb: 3500, // 87.5% de 4000
      ramTotalMb: 4000,
      gpuPct: 30,
      gpuNombre: "Intel Iris",
      discoLibreGb: 300, // 70% usado
      discoTotalGb: 1000,
      bateriaPct: 25, // Bajo 30
      cargando: false,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    const avisos = avisosHardware(hardware, umbralesTest);
    // Debe tener 4 avisos: cpu, ram, disco, bateria
    expect(avisos.length).toBe(4);
    
    // Verificar que cada tipo de medida está presente
    const medidas = avisos.map(a => a.medida);
    expect(medidas).toContain("cpu");
    expect(medidas).toContain("ram");
    expect(medidas).toContain("disco");
    expect(medidas).toContain("bateria");
  });

  it("should handle null values gracefully", () => {
    const hardware: HardwareServidor[] = [{
      id: "1",
      nombre: "Servidor con datos faltantes",
      tipo: "mac",
      cpuPct: null, // Dato faltante
      nucleos: null,
      carga: null,
      ramUsadaMb: null, // Dato faltante
      ramTotalMb: 4000,
      gpuPct: null,
      gpuNombre: null,
      discoLibreGb: null, // Dato faltante
      discoTotalGb: 1000,
      bateriaPct: null, // Dato faltante
      cargando: null,
      medidoEn: Date.now(),
      fuente: "test"
    }];

    // No debería lanzar excepción y debería devolver array vacío
    expect(avisosHardware(hardware, umbralesTest)).toEqual([]);
  });
});

describe("hardwareDesdeMac", () => {
  it("should return null for invalid input", () => {
    expect(hardwareDesdeMac(null, Date.now())).toBeNull();
    expect(hardwareDesdeMac(undefined, Date.now())).toBeNull();
    expect(hardwareDesdeMac("", Date.now())).toBeNull();
    expect(hardwareDesdeMac([], Date.now())).toBeNull();
    expect(hardwareDesdeMac({}, Date.now())).not.toBeNull(); // Objeto vacío debería procesarse
  });

    it("should convert valid Mac hardware response", () => {
      const ahora = Date.now();
      const respuesta = {
        cpuPct: 45.5,
        nucleos: 8,
        carga: 0.3,
        ramUsadaMb: 8192,
        ramTotalMb: 16384,
        gpuPct: 20.0,
        gpuNombre: "Apple M1 Pro",
        discoLibreGb: 250.5,
        discoTotalGb: 500.0,
        bateriaPct: 75,
        cargando: false,
        medidoEn: ahora - 1000
      };

      const resultado = hardwareDesdeMac(respuesta, ahora);
      
      expect(resultado).not.toBeNull();
      if (resultado) {
        expect(resultado.id).toContain(`mac-${ahora}`);
        expect(resultado.nombre).toBe("Esta Mac");
        expect(resultado.tipo).toBe("mac");
        expect(resultado.cpuPct).toBe(45.5);
        expect(resultado.nucleos).toBe(8);
        expect(resultado.carga).toBe(0.3);
        expect(resultado.ramUsadaMb).toBe(8192);
        expect(resultado.ramTotalMb).toBe(16384);
        expect(resultado.gpuPct).toBe(20.0);
        expect(resultado.gpuNombre).toBe("Apple M1 Pro");
        expect(resultado.discoLibreGb).toBe(250.5);
        expect(resultado.discoTotalGb).toBe(500.0);
        expect(resultado.bateriaPct).toBe(75);
        expect(resultado.cargando).toBe(false);
        expect(resultado.medidoEn).toBe(ahora - 1000);
        expect(resultado.fuente).toBe("/api/mando/hardware");
      }
    });

    it("should handle null values in response", () => {
      const ahora = Date.now();
      const respuesta = {
        cpuPct: null,
        nucleos: null,
        carga: null,
        ramUsadaMb: null,
        ramTotalMb: null,
        gpuPct: null,
        gpuNombre: null,
        discoLibreGb: null,
        discoTotalGb: null,
        bateriaPct: null,
        cargando: null,
        medidoEn: null
      };

      const resultado = hardwareDesdeMac(respuesta, ahora);
      
      expect(resultado).not.toBeNull();
      if (resultado) {
        expect(resultado.cpuPct).toBeNull();
        expect(resultado.nucleos).toBeNull();
        expect(resultado.carga).toBeNull();
        expect(resultado.ramUsadaMb).toBeNull();
        expect(resultado.ramTotalMb).toBeNull();
        expect(resultado.gpuPct).toBeNull();
        expect(resultado.gpuNombre).toBeNull();
        expect(resultado.discoLibreGb).toBeNull();
        expect(resultado.discoTotalGb).toBeNull();
        expect(resultado.bateriaPct).toBeNull();
        expect(resultado.cargando).toBeNull();
        // medidoEn debería ser el valor de 'ahora' cuando el campo es null
        expect(resultado.medidoEn).toBe(ahora);
      }
    });
});

describe("hardwareDesdeNodo", () => {
  it("should return null for invalid input", () => {
    expect(hardwareDesdeNodo(null, Date.now())).toBeNull();
    expect(hardwareDesdeNodo(undefined, Date.now())).toBeNull();
    expect(hardwareDesdeNodo("", Date.now())).toBeNull();
    expect(hardwareDesdeNodo([], Date.now())).toBeNull();
  });

  it("should convert valid MetaGenesis node data", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-123",
      medio: "ethernet",
      ram_libre_mb: 2048,
      disco_gb: 500,
      cpu_pct: 30.5,
      ram_total_mb: 4096,
      disco_total_gb: 1000,
      nucleos: 4,
      carga: 0.2
    };

    const resultado = hardwareDesdeNodo(nodoData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.id).toBe("node-123");
      expect(resultado.nombre).toBe("node-123");
      expect(resultado.tipo).toBe("a1");
      expect(resultado.cpuPct).toBe(30.5);
      expect(resultado.nucleos).toBe(4);
      expect(resultado.carga).toBe(0.2);
      // RAM usada = total - libre = 4096 - 2048 = 2048
      expect(resultado.ramUsadaMb).toBe(2048);
      expect(resultado.ramTotalMb).toBe(4096);
      expect(resultado.gpuPct).toBeNull();
      expect(resultado.gpuNombre).toBeNull();
      expect(resultado.discoLibreGb).toBeNull(); // No disponible directamente
      expect(resultado.discoTotalGb).toBe(1000);
      expect(resultado.bateriaPct).toBeNull(); // No disponible en nodos A1
      expect(resultado.cargando).toBeNull(); // No disponible en nodos A1
      expect(resultado.medidoEn).toBe(ahora);
      expect(resultado.fuente).toBe("MetaGenesis nodo");
    }
  });

  it("should handle null values in node data", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: null,
      medio: null,
      ram_libre_mb: null,
      disco_gb: null,
      cpu_pct: null,
      ram_total_mb: null,
      disco_total_gb: null,
      nucleos: null,
      carga: null
    };

    const resultado = hardwareDesdeNodo(nodoData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.id).toBe(`nodo-${ahora}`); // ID por defecto cuando nodo es null
      expect(resultado.nombre).toBe(`nodo-${ahora}`);
      expect(resultado.tipo).toBe("a1");
      expect(resultado.cpuPct).toBeNull();
      expect(resultado.nucleos).toBeNull();
      expect(resultado.carga).toBeNull();
      expect(resultado.ramUsadaMb).toBeNull(); // No se puede calcular si falta dato
      expect(resultado.ramTotalMb).toBeNull();
      expect(resultado.gpuPct).toBeNull();
      expect(resultado.gpuNombre).toBeNull();
      expect(resultado.discoLibreGb).toBeNull();
      expect(resultado.discoTotalGb).toBeNull();
      expect(resultado.bateriaPct).toBeNull();
      expect(resultado.cargando).toBeNull();
      expect(resultado.medidoEn).toBe(ahora);
      expect(resultado.fuente).toBe("MetaGenesis nodo");
    }
  });

  it("should calculate used ram when total and libre are available", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-456",
      medio: "wifi",
      ram_libre_mb: 1024,
      disco_gb: 200,
      ram_total_mb: 3072 // 3GB
      // Nota: intencionalmente omitiendo cpu_pct, disco_total_gb, nucleos, carga
    };

    const resultado = hardwareDesdeNodo(nodoData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      // RAM usada = total - libre = 3072 - 1024 = 2048 MB
      expect(resultado.ramUsadaMb).toBe(2048);
    }
  });

  it("should NOT calculate used ram when libre is missing", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-789",
      medio: "wifi",
      ram_libre_mb: null, // Dato faltante
      disco_gb: 200,
      ram_total_mb: 3072
    };

    const resultado = hardwareDesdeNodo(nodoData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.ramUsadaMb).toBeNull(); // No se puede calcular
    }
  });

  it("should NOT calculate used ram when total is missing", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-101",
      medio: "wifi",
      ram_libre_mb: 1024,
      disco_gb: 200,
      ram_total_mb: null // Dato faltante
    };

    const resultado = hardwareDesdeNodo(nodoData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.ramUsadaMb).toBeNull(); // No se puede calcular
    }
  });
});

describe("hardwareDesdeNeurona", () => {
  it("should return null for invalid input", () => {
    expect(hardwareDesdeNeurona(null, Date.now())).toBeNull();
    expect(hardwareDesdeNeurona(undefined, Date.now())).toBeNull();
    expect(hardwareDesdeNeurona("", Date.now())).toBeNull();
    expect(hardwareDesdeNeurona([], Date.now())).toBeNull();
  });

  it("should convert valid neuron capabilities", () => {
    const ahora = Date.now();
    const neuronaData = {
      capabilities: {
        bateria: {
          level: 85,
          charging: true
        },
        cuota_almacenamiento: 128 // 128 GB
      }
    };

    const resultado = hardwareDesdeNeurona(neuronaData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.id).toBe("neurona-desconocida");
      expect(resultado.nombre).toBe("Neurona de navegador");
      expect(resultado.tipo).toBe("neurona");
      expect(resultado.cpuPct).toBeNull();
      expect(resultado.nucleos).toBeNull();
      expect(resultado.carga).toBeNull();
      expect(resultado.ramUsadaMb).toBeNull();
      expect(resultado.ramTotalMb).toBeNull();
      expect(resultado.gpuPct).toBeNull();
      expect(resultado.gpuNombre).toBeNull();
      expect(resultado.discoLibreGb).toBeNull();
      expect(resultado.discoTotalGb).toBe(128);
      expect(resultado.bateriaPct).toBe(85);
      expect(resultado.cargando).toBe(true);
      expect(resultado.medidoEn).toBe(ahora);
      expect(resultado.fuente).toBe("neuron_devices.capabilities");
    }
  });

  it("should handle null values in neuron capabilities", () => {
    const ahora = Date.now();
    const neuronaData = {
      capabilities: {
        bateria: {
          level: null,
          charging: null
        },
        cuota_almacenamiento: null
      }
    };

    const resultado = hardwareDesdeNeurona(neuronaData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.bateriaPct).toBeNull();
      expect(resultado.cargando).toBeNull();
      expect(resultado.discoTotalGb).toBeNull();
    }
  });

  it("should handle missing capabilities", () => {
    const ahora = Date.now();
    const neuronaData = {}; // Sin capabilities

    const resultado = hardwareDesdeNeurona(neuronaData, ahora);
    
    expect(resultado).not.toBeNull();
    if (resultado) {
      expect(resultado.bateriaPct).toBeNull();
      expect(resultado.cargando).toBeNull();
      expect(resultado.discoTotalGb).toBeNull();
    }
  });
});