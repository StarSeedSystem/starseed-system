import { describe, it, expect } from "vitest";
import {
  TipoProceso,
  ETIQUETA_TIPO,
  porcentaje,
  UmbralesProcesos,
  UMBRALES_POR_DEFECTO,
  avisosHardware,
  hardwareDesdeMac,
  hardwareDesdeNodo,
  hardwareDesdeNeurona,
  ProcesoActivo,
  HardwareServidor
} from "../procesos";

describe("procesos.ts", () => {
  describe("Tipos", () => {
    it("debe tener todos los tipos de proceso definidos", () => {
      const tiposEsperados: TipoProceso[] = [
        "genesis", "poligenesis", "sueno", "imaginacion", "descarga",
        "instalacion", "actualizacion", "app-fondo", "servicio"
      ];
      
      tiposEsperados.forEach(tipo => {
        expect(tipo).toBeTypeOf<string>();
      });
    });
    
    it("debe tener etiquetas en español para cada tipo", () => {
      expect(ETIQUETA_TIPO.genesis).toBe("Genesis");
      expect(ETIQUETA_TIPO.poligenesis).toBe("PoliGenesis");
      expect(ETIQUETA_TIPO.sueno).toBe("Sueños");
      expect(ETIQUETA_TIPO.imaginacion).toBe("Imaginación");
      expect(ETIQUETA_TIPO.descarga).toBe("Descargas");
      expect(ETIQUETA_TIPO.instalacion).toBe("Instalaciones");
      expect(ETIQUETA_TIPO.actualizacion).toBe("Actualizaciones");
      expect(ETIQUETA_TIPO["app-fondo"]).toBe("Apps en segundo plano");
      expect(ETIQUETA_TIPO.servicio).toBe("Servicios");
    });
  });
  
  describe("porcentaje", () => {
    it("debe devolver null si alguno de los valores es null", () => {
      expect(porcentaje(null, 100)).toBeNull();
      expect(porcentaje(50, null)).toBeNull();
      expect(porcentaje(null, null)).toBeNull();
    });
    
    it("debe devolver null si el total es menor o igual a cero", () => {
      expect(porcentaje(50, 0)).toBeNull();
      expect(porcentaje(50, -10)).toBeNull();
    });
    
    it("debe calcular correctamente el porcentaje con un decimal", () => {
      expect(porcentaje(50, 100)).toBe(50.0);
      expect(porcentaje(25, 100)).toBe(25.0);
      expect(porcentaje(33, 100)).toBe(33.0);
      expect(porcentaje(1, 3)).toBe(33.3); // 1/3 * 100 = 33.333... -> 33.3
      expect(porcentaje(2, 3)).toBe(66.7); // 2/3 * 100 = 66.666... -> 66.7
      expect(porcentaje(10, 3)).toBe(333.3); // 10/3 * 100 = 333.333... -> 333.3
    });
  });
  
  describe("avisosHardware", () => {
    const umbrales: UmbralesProcesos = {
      cpu: 85,
      ram: 90,
      disco: 90,
      bateria: 20
    };
    
    it("no debe generar avisos si todos los valores están por debajo de los umbrales", () => {
      const hardware: HardwareServidor[] = [{
        id: "1",
        nombre: "Servidor de prueba",
        tipo: "mac",
        cpuPct: 50,
        nucleos: 4,
        carga: 0.5,
        ramUsadaMb: 4000,
        ramTotalMb: 8000, // 50%
        gpuPct: 30,
        gpuNombre: "Intel Iris Plus",
        discoLibreGb: 500,
        discoTotalGb: 1000, // 50% usado
        bateriaPct: 50,
        cargando: false,
        medidoEn: Date.now(),
        fuente: "test"
      }];
      
      const avisos = avisosHardware(hardware, umbrales);
      expect(avisos).toHaveLength(0);
    });
    
    it("debe generar avisos cuando se superan los umbrales", () => {
      const hardware: HardwareServidor[] = [{
        id: "1",
        nombre: "Servidor sobrecalentado",
        tipo: "mac",
        cpuPct: 90, // Sobre umbral de CPU (85)
        nucleos: 4,
        carga: 0.5,
        ramUsadaMb: 7200,
        ramTotalMb: 8000, // 90% - en el umbral, no debería avisar (necesita ser >)
        gpuPct: 30,
        gpuNombre: "Intel Iris Plus",
        discoLibreGb: 50,
        discoTotalGb: 1000, // 95% usado - sobre umbral de disco (90)
        bateriaPct: 10, // Bajo umbral de batería (20) y no cargando
        cargando: false,
        medidoEn: Date.now(),
        fuente: "test"
      }];
      
      const avisos = avisosHardware(hardware, umbrales);
      expect(avisos).toHaveLength(3); // CPU, disco y batería
      
      // Verificar CPU
      expect(avisos[0]).toMatchObject({
        servidor: "Servidor sobrecalentado",
        medida: "cpu",
        valor: 90,
        umbral: 85
      });
      
      // Verificar disco
      expect(avisos[1]).toMatchObject({
        servidor: "Servidor sobrecalentado",
        medida: "disco",
        valor: 95, // (1000-50)/1000*100 = 95
        umbral: 90
      });
      
      // Verificar batería
      expect(avisos[2]).toMatchObject({
        servidor: "Servidor sobrecalentado",
        medida: "bateria",
        valor: 10,
        umbral: 20
      });
    });
    
    it("no debe generar aviso de batería si está cargando", () => {
      const hardware: HardwareServidor[] = [{
        id: "1",
        nombre: "Servidor cargando",
        tipo: "mac",
        cpuPct: 50,
        nucleos: 4,
        carga: 0.5,
        ramUsadaMb: 4000,
        ramTotalMb: 8000,
        gpuPct: 30,
        gpuNombre: "Intel Iris Plus",
        discoLibreGb: 500,
        discoTotalGb: 1000,
        bateriaPct: 10, // Bajo umbral pero cargando
        cargando: true, // Importante: está cargando
        medidoEn: Date.now(),
        fuente: "test"
      }];
      
      const avisos = avisosHardware(hardware, umbrales);
      expect(avisos).toHaveLength(0); // No debería avisar porque está cargando
    });
  });
  
  describe("hardwareDesdeMac", () => {
    it("debe devolver null para datos inválidos", () => {
      expect(hardwareDesdeMac(null, Date.now())).toBeNull();
      expect(hardwareDesdeMac(undefined, Date.now())).toBeNull();
      expect(hardwareDesdeMac("", Date.now())).toBeNull();
      expect(hardwareDesdeMac({}, Date.now())).toBeNull();
    });
    
    it("debe crear correctamente un HardwareServidor desde datos de Mac", () => {
      const ahora = Date.now();
      const datosMac = {
        cpuPct: 45.5,
        nucleos: 8,
        carga: 0.3,
        ramUsadaMb: 6144,
        ramTotalMb: 16384,
        gpuPct: 20.0,
        gpuNombre: "Apple M2 Pro",
        discoLibreGb: 250.5,
        discoTotalGb: 512.0,
        bateriaPct: 75,
        cargando: false,
        medidoEn: ahora - 1000
      };
      
      const hardware = hardwareDesdeMac(datosMac, ahora);
      
      expect(hardware).not.toBeNull();
      expect(hardware?.id).toContain("mac-");
      expect(hardware?.nombre).toBe("Esta Mac");
      expect(hardware?.tipo).toBe("mac");
      expect(hardware?.cpuPct).toBe(45.5);
      expect(hardware?.nucleos).toBe(8);
      expect(hardware?.carga).toBe(0.3);
      expect(hardware?.ramUsadaMb).toBe(6144);
      expect(hardware?.ramTotalMb).toBe(16384);
      expect(hardware?.gpuPct).toBe(20.0);
      expect(hardware?.gpuNombre).toBe("Apple M2 Pro");
      expect(hardware?.discoLibreGb).toBe(250.5);
      expect(hardware?.discoTotalGb).toBe(512.0);
      expect(hardware?.bateriaPct).toBe(75);
      expect(hardware?.cargando).toBe(false);
      expect(hardware?.medidoEn).toBe(ahora - 1000);
      expect(hardware?.fuente).toBe("/api/mando/hardware");
    });
  });
  
  describe("hardwareDesdeNodo", () => {
    it("debe devolver null para datos inválidos", () => {
      expect(hardwareDesdeNodo(null, Date.now())).toBeNull();
      expect(hardwareDesdeNodo(undefined, Date.now())).toBeNull();
      expect(hardwareDesdeNodo("", Date.now())).toBeNull();
      expect(hardwareDesdeNodo({}, Date.now())).toBeNull();
    });
    
    it("debe crear correctamente un HardwareServidor desde datos de nodo", () => {
      const ahora = Date.now();
      const datosNodo = {
        nodo: "node-abc123",
        medio: "fibra",
        ram_libre_mb: 2048,
        disco_gb: 500,
        cpu_pct: 30.5,
        ram_total_mb: 8192,
        disco_total_gb: 1000,
        nucleos: 4,
        carga: 0.2
      };
      
      const hardware = hardwareDesdeNodo(datosNodo, ahora);
      
      expect(hardware).not.toBeNull();
      expect(hardware?.id).toBe("nodo-node-abc123");
      expect(hardware?.nombre).toBe("node-abc123");
      expect(hardware?.tipo).toBe("a1");
      expect(hardware?.cpuPct).toBe(30.5);
      expect(hardware?.nucleos).toBe(4);
      expect(hardware?.carga).toBe(0.2);
      expect(hardware?.ramUsadaMb).toBe(6144); // 8192 - 2048
      expect(hardware?.ramTotalMb).toBe(8192);
      expect(hardware?.gpuPct).toBeNull();
      expect(hardware?.gpuNombre).toBeNull();
      expect(hardware?.discoLibreGb).toBeNull(); // No se proporciona en los datos
      expect(hardware?.discoTotalGb).toBe(1000);
      expect(hardware?.bateriaPct).toBeNull();
      expect(hardware?.cargando).toBeNull();
      expect(hardware?.medidoEn).toBe(ahora);
      expect(hardware?.fuente).toBe("nodo-metagenesis");
    });
    
    it("debe manejar correctamente cuando falta ram_total_mb", () => {
      const ahora = Date.now();
      const datosNodo = {
        nodo: "node-xyz789",
        medio: "wifi",
        ram_libre_mb: 1024,
        disco_gb: 256,
        // Faltan ram_total_mb, disco_total_gb, cpu_pct, nucleos, carga
      };
      
      const hardware = hardwareDesdeNodo(datosNodo, ahora);
      
      expect(hardware).not.toBeNull();
      expect(hardware?.ramUsadaMb).toBeNull(); // Porque no hay ram_total_mb
      expect(hardware?.ramTotalMb).toBeNull();
      expect(hardware?.cpuPct).toBeNull();
      expect(hardware?.nucleos).toBeNull();
      expect(hardware?.carga).toBeNull();
      expect(hardware?.discoTotalGb).toBeNull(); // Porque no hay disco_total_gb
    });
  });
  
  describe("hardwareDesdeNeurona", () => {
    it("debe devolver null para datos inválidos", () => {
      expect(hardwareDesdeNeurona(null, Date.now())).toBeNull();
      expect(hardwareDesdeNeurona(undefined, Date.now())).toBeNull();
      expect(hardwareDesdeNeurona("", Date.now())).toBeNull();
      expect(hardwareDesdeNeurona({}, Date.now())).toBeNull();
    });
    
    it("debe crear correctamente un HardwareServidor desde datos de neurona", () => {
      const ahora = Date.now();
      const datosNeurona = {
        capabilities: {
          bateria: {
            level: 85,
            charging: true
          },
          cuota_almacenamiento: 2048 // 2 GB en MB
        }
      };
      
      const hardware = hardwareDesdeNeurona(datosNeurona, ahora);
      
      expect(hardware).not.toBeNull();
      expect(hardware?.id).toMatch(/^neurona-[a-z0-9]{9}$/);
      expect(hardware?.nombre).toBe("Neurona del navegador");
      expect(hardware?.tipo).toBe("neurona");
      expect(hardware?.cpuPct).toBeNull();
      expect(hardware?.nucleos).toBeNull();
      expect(hardware?.carga).toBeNull();
      expect(hardware?.ramUsadaMb).toBeNull();
      expect(hardware?.ramTotalMb).toBeNull();
      expect(hardware?.gpuPct).toBeNull();
      expect(hardware?.gpuNombre).toBeNull();
      expect(hardware?.discoLibreGb).toBeNull();
      expect(hardware?.discoTotalGb).toBe(2); // 2048 MB / 1024 = 2 GB
      expect(hardware?.bateriaPct).toBe(85);
      expect(hardware?.cargando).toBe(true);
      expect(hardware?.medidoEn).toBe(ahora);
      expect(hardware?.fuente).toBe("neuron_devices.capabilities");
    });
    
    it("debe manejar correctamente cuando falta cuota de almacenamiento", () => {
      const ahora = Date.now();
      const datosNeurona = {
        capabilities: {
          bateria: {
            level: 30,
            charging: false
          }
          // Faltan cuota_almacenamiento
        }
      };
      
      const hardware = hardwareDesdeNeurona(datosNeurona, ahora);
      
      expect(hardware).not.toBeNull();
      expect(hardware?.discoTotalGb).toBeNull(); // Porque no hay cuota_almacenamiento
    });
  });
});