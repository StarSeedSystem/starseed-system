import { describe, it, expect } from "vitest";

// Import functions to test
import {
  porcentaje,
  avisosHardware,
  hardwareDesdeMac,
  hardwareDesdeNodo,
  hardwareDesdeNeurona,
  TipoProceso,
  ProcesoActivo,
  HardwareServidor,
  ETIQUETA_TIPO,
  UMBRALES_POR_DEFECTO
} from "../procesos";

describe("procesos", () => {
  describe("porcentaje", () => {
    it("should return null if used is null", () => {
      expect(porcentaje(null, 100)).toBeNull();
    });

    it("should return null if total is null", () => {
      expect(porcentaje(50, null)).toBeNull();
    });

    it("should return null if total is 0", () => {
      expect(porcentaje(50, 0)).toBeNull();
    });

    it("should return null if total is negative", () => {
      expect(porcentaje(50, -10)).toBeNull();
    });

    it("should calculate percentage and round to 1 decimal", () => {
      expect(porcentaje(50, 100)).toBe(50.0);
      expect(porcentaje(33, 100)).toBe(33.0);
      expect(porcentaje(66.666, 100)).toBe(66.7); // Rounded to 1 decimal
      expect(porcentaje(1, 3)).toBe(33.3); // 1/3 = 0.333... * 100 = 33.333... -> 33.3
      expect(porcentaje(0, 100)).toBe(0.0);
      expect(porcentaje(100, 100)).toBe(100.0);
    });
  });

  describe("avisosHardware", () => {
    const umbrales = UMBRALES_POR_DEFECTO;

    it("should return empty array for empty lista", () => {
      expect(avisosHardware([], umbrales)).toEqual([]);
    });

    it("should detect CPU over threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: 90, // Over 85 threshold
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
          medidoEn: null,
          fuente: "test"
        }
      ];

      const avisos = avisosHardware(lista, umbrales);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toEqual({
        servidor: "Servidor 1",
        medida: "cpu",
        valor: 90,
        umbral: 85
      });
    });

    it("should not trigger CPU alert when under threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: 80, // Under 85 threshold
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
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });

    it("should detect RAM over threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: 90, // 90% of 100 MB
          ramTotalMb: 100,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null,
          discoTotalGb: null,
          bateriaPct: null,
          cargando: null,
          medidoEn: null,
          fuente: "test"
        }
      ];

      const avisos = avisosHardware(lista, umbrales);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toEqual({
        servidor: "Servidor 1",
        medida: "ram",
        valor: 90,
        umbral: 90
      });
    });

    it("should not trigger RAM alert when under threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: 80, // 80% of 100 MB
          ramTotalMb: 100,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null,
          discoTotalGb: null,
          bateriaPct: null,
          cargando: null,
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });

    it("should detect disco over threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: null,
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: 10, // 10 GB free
          discoTotalGb: 100, // 100 GB total -> 90 GB used = 90%
          bateriaPct: null,
          cargando: null,
          medidoEn: null,
          fuente: "test"
        }
      ];

      const avisos = avisosHardware(lista, umbrales);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toEqual({
        servidor: "Servidor 1",
        medida: "disco",
        valor: 90,
        umbral: 90
      });
    });

    it("should not trigger disco alert when under threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: null,
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: 20, // 20 GB free
          discoTotalGb: 100, // 100 GB total -> 80 GB used = 80%
          bateriaPct: null,
          cargando: null,
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });

    it("should detect bateria under threshold when not charging", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: null,
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null,
          discoTotalGb: null,
          bateriaPct: 15, // 15% < 20% threshold
          cargando: false, // Not charging
          medidoEn: null,
          fuente: "test"
        }
      ];

      const avisos = avisosHardware(lista, umbrales);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toEqual({
        servidor: "Servidor 1",
        medida: "bateria",
        valor: 15,
        umbral: 20
      });
    });

    it("should not trigger bateria alert when charging", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: null,
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null,
          discoTotalGb: null,
          bateriaPct: 15, // 15% < 20% threshold
          cargando: true, // Charging - should not alert
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });

    it("should not trigger bateria alert when above threshold", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null,
          nucleos: null,
          carga: null,
          ramUsadaMb: null,
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null,
          discoTotalGb: null,
          bateriaPct: 25, // 25% > 20% threshold
          cargando: false, // Not charging
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });

    it("should handle multiple alerts from same server", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: 90, // Over CPU threshold
          nucleos: null,
          carga: null,
          ramUsadaMb: 95, // Over RAM threshold (95% of 100)
          ramTotalMb: 100,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: 5, // 95% used -> over disco threshold
          discoTotalGb: 100,
          bateriaPct: 15, // Under bateria threshold and not charging
          cargando: false,
          medidoEn: null,
          fuente: "test"
        }
      ];

      const avisos = avisosHardware(lista, umbrales);
      expect(avisos).toHaveLength(4); // CPU, RAM, disco, bateria
      
      // Check that we have all four types of alerts
      const medidas = avisos.map(a => a.medida);
      expect(medidas).toContain("cpu");
      expect(medidas).toContain("ram");
      expect(medidas).toContain("disco");
      expect(medidas).toContain("bateria");
    });

    it("should skip null values", () => {
      const lista: HardwareServidor[] = [
        {
          id: "1",
          nombre: "Servidor 1",
          tipo: "mac",
          cpuPct: null, // Should skip CPU check
          nucleos: null,
          carga: null,
          ramUsadaMb: null, // Should skip RAM check
          ramTotalMb: null,
          gpuPct: null,
          gpuNombre: null,
          discoLibreGb: null, // Should skip disco check
          discoTotalGb: null,
          bateriaPct: null, // Should skip bateria check
          cargando: null,
          medidoEn: null,
          fuente: "test"
        }
      ];

      expect(avisosHardware(lista, umbrales)).toHaveLength(0);
    });
  });

  describe("hardwareDesdeMac", () => {
    it("should return null for invalid input", () => {
      expect(hardwareDesdeMac(null, Date.now())).toBeNull();
      expect(hardwareDesdeMac(undefined, Date.now())).toBeNull();
      expect(hardwareDesdeMac({}, Date.now())).toBeNull();
      expect(hardwareDesdeMac("invalid", Date.now())).toBeNull();
      expect(hardwareDesdeMac(123, Date.now())).toBeNull();
    });

    it("should create HardwareServidor from valid Mac hardware data", () => {
      const ahora = Date.now();
      const macData = {
        cpuPct: 45.5,
        nucleos: 8,
        carga: 0.7,
        ramUsadaMb: 4096,
        ramTotalMb: 16384,
        gpuPct: 23.1,
        gpuNombre: "Intel Iris Plus Graphics 640",
        discoLibreGb: 50.2,
        discoTotalGb: 256,
        bateriaPct: 87,
        cargando: false,
        medidoEn: ahora - 1000,
        fuente: "/api/mando/hardware"
      };

      const result = hardwareDesdeMac(macData, ahora);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.tipo).toBe("mac");
        expect(result.nombre).toBe("Esta Mac"); // Default name
        expect(result.id).toBe(`mac-${ahora}`);
        expect(result.cpuPct).toBe(45.5);
        expect(result.nucleos).toBe(8);
        expect(result.carga).toBe(0.7);
        expect(result.ramUsadaMb).toBe(4096);
        expect(result.ramTotalMb).toBe(16384);
        expect(result.gpuPct).toBe(23.1);
        expect(result.gpuNombre).toBe("Intel Iris Plus Graphics 640");
        expect(result.discoLibreGb).toBe(50.2);
        expect(result.discoTotalGb).toBe(256);
        expect(result.bateriaPct).toBe(87);
        expect(result.cargando).toBe(false);
        expect(result.medidoEn).toBe(ahora);
        expect(result.fuente).toBe("/api/mando/hardware");
      }
    });

    it("should handle missing fields by setting them to null", () => {
      const ahora = Date.now();
      const macData = {
        // Only providing some fields
        cpuPct: 30,
        ramUsadaMb: 2048
      };

      const result = hardwareDesdeMac(macData, ahora);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.cpuPct).toBe(30);
        expect(result.nucleos).toBeNull();
        expect(result.carga).toBeNull();
        expect(result.ramUsadaMb).toBe(2048);
        expect(result.ramTotalMb).toBeNull();
        expect(result.gpuPct).toBeNull();
        expect(result.gpuNombre).toBeNull();
        expect(result.discoLibreGb).toBeNull();
        expect(result.discoTotalGb).toBeNull();
        expect(result.bateriaPct).toBeNull();
        expect(result.cargando).toBeNull();
        expect(result.medidoEn).toBe(ahora);
      }
    });
  });

  // More tests will be added as we implement the functions
});

describe("hardwareDesdeNeurona", () => {
  it("should return null for invalid input", () => {
    expect(hardwareDesdeNeurona(null, Date.now())).toBeNull();
    expect(hardwareDesdeNeurona(undefined, Date.now())).toBeNull();
    expect(hardwareDesdeNeurona({}, Date.now())).toBeNull();
    expect(hardwareDesdeNeurona("invalid", Date.now())).toBeNull();
    expect(hardwareDesdeNeurona(123, Date.now())).toBeNull();
  });

  it("should create HardwareServidor from valid neuron_devices capabilities", () => {
    const ahora = Date.now();
    const neuronData = {
      capabilities: {
        bateria: {
          level: 85,
          charging: true
        },
        cuota_almacenamiento: {
          usado: 10.5,
          total: 50.0
        }
      }
    };

    const result = hardwareDesdeNeurona(neuronData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.tipo).toBe("neurona");
      expect(result.nombre).toBe("Neurona Desconocida");
      expect(result.id).toBe(`neurona-${ahora}`);
      expect(result.cpuPct).toBeNull();
      expect(result.nucleos).toBeNull();
      expect(result.carga).toBeNull();
      expect(result.ramUsadaMb).toBeNull();
      expect(result.ramTotalMb).toBeNull();
      expect(result.gpuPct).toBeNull();
      expect(result.gpuNombre).toBeNull();
      expect(result.discoLibreGb).toBeNull(); // Not directly provided
      expect(result.discoTotalGb).toBeNull(); // Not directly provided
      expect(result.bateriaPct).toBe(85);
      expect(result.cargando).toBe(true);
      expect(result.medidoEn).toBe(ahora);
      expect(result.fuente).toBe("neuron_devices.capabilities");
    }
  });

  it("should handle missing battery fields by setting them to null", () => {
    const ahora = Date.now();
    const neuronData = {
      capabilities: {
        // bateria not provided
        cuota_almacenamiento: {
          usado: 10.5,
          total: 50.0
        }
      }
    };

    const result = hardwareDesdeNeurona(neuronData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.bateriaPct).toBeNull();
      expect(result.cargando).toBeNull();
    }
  });

  it("should handle missing storage fields", () => {
    const ahora = Date.now();
    const neuronData = {
      capabilities: {
        bateria: {
          level: 30,
          charging: false
        }
        // cuota_almacenamiento not provided
      }
    };

    const result = hardwareDesdeNeurona(neuronData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.bateriaPct).toBe(30);
      expect(result.cargando).toBe(false);
      // disco fields should be null as storage info isn't mapped to them
      expect(result.discoLibreGb).toBeNull();
      expect(result.discoTotalGb).toBeNull();
    }
  });

  it("should handle empty capabilities object", () => {
    const ahora = Date.now();
    const neuronData = {
      capabilities: {}
    };

    const result = hardwareDesdeNeurona(neuronData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.bateriaPct).toBeNull();
      expect(result.cargando).toBeNull();
      expect(result.discoLibreGb).toBeNull();
      expect(result.discoTotalGb).toBeNull();
    }
  });
});

describe("hardwareDesdeNodo", () => {
  it("should return null for invalid input", () => {
    expect(hardwareDesdeNodo(null, Date.now())).toBeNull();
    expect(hardwareDesdeNodo(undefined, Date.now())).toBeNull();
    expect(hardwareDesdeNodo({}, Date.now())).toBeNull();
    expect(hardwareDesdeNodo("invalid", Date.now())).toBeNull();
    expect(hardwareDesdeNodo(123, Date.now())).toBeNull();
  });

  it("should create HardwareServidor from valid NodoVista data", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-123",
      medio: "ethernet",
      ram_libre_mb: 4096,
      disco_gb: 100,
      cpu_pct: 65.5,
      ram_total_mb: 16384,
      disco_total_gb: 500,
      nucleos: 8,
      carga: 0.5
    };

    const result = hardwareDesdeNodo(nodoData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.tipo).toBe("a1");
      expect(result.nombre).toBe("node-123");
      expect(result.id).toBe(`a1-node-123`);
      expect(result.cpuPct).toBe(65.5);
      expect(result.nucleos).toBe(8);
      expect(result.carga).toBe(0.5);
      expect(result.ramTotalMb).toBe(16384);
      expect(result.ramUsadaMb).toBe(12288); // 16384 - 4096
      expect(result.gpuPct).toBeNull();
      expect(result.gpuNombre).toBeNull();
      expect(result.discoTotalGb).toBe(500);
      expect(result.discoLibreGb).toBeNull(); // Not provided in NodoVista
      expect(result.bateriaPct).toBeNull();
      expect(result.cargando).toBeNull();
      expect(result.medidoEn).toBe(ahora);
      expect(result.fuente).toBe("MetaGenesis nodo");
    }
  });

  it("should calculate ram usada correctly when ram_total_mb is provided", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-123",
      medio: "ethernet",
      ram_libre_mb: 4096,
      disco_gb: 100,
      ram_total_mb: 16384
    };

    const result = hardwareDesdeNodo(nodoData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.ramTotalMb).toBe(16384);
      expect(result.ramUsadaMb).toBe(12288); // 16384 - 4096
    }
  });

  it("should set ram usada to null when ram_total_mb is not provided", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-123",
      medio: "ethernet",
      ram_libre_mb: 4096,
      disco_gb: 100
      // ram_total_mb not provided
    };

    const result = hardwareDesdeNodo(nodoData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.ramTotalMb).toBeNull();
      expect(result.ramUsadaMb).toBeNull(); // Can't calculate without total
    }
  });

  it("should handle missing fields by setting them to null", () => {
    const ahora = Date.now();
    const nodoData = {
      nodo: "node-123"
      // Only providing nodo
    };

    const result = hardwareDesdeNodo(nodoData, ahora);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.nombre).toBe("node-123");
      expect(result.id).toBe(`a1-node-123`);
      expect(result.cpuPct).toBeNull();
      expect(result.nucleos).toBeNull();
      expect(result.carga).toBeNull();
      expect(result.ramTotalMb).toBeNull();
      expect(result.ramUsadaMb).toBeNull();
      expect(result.gpuPct).toBeNull();
      expect(result.gpuNombre).toBeNull();
      expect(result.discoTotalGb).toBeNull();
      expect(result.discoLibreGb).toBeNull();
      expect(result.bateriaPct).toBeNull();
      expect(result.cargando).toBeNull();
      expect(result.medidoEn).toBe(ahora);
      expect(result.fuente).toBe("MetaGenesis nodo");
    }
  });
});