import { describe, expect, it } from "vitest";
import {
    TipoProceso,
    ETIQUETA_TIPO,
    ProcesoActivo,
    HardwareServidor,
    UMBRALES_POR_DEFECTO,
    UmbralesProcesos,
    porcentaje,
    avisosHardware,
    hardwareDesdeMac,
    hardwareDesdeNodo,
    hardwareDesdeNeurona
} from "../procesos";

describe("Tipos y constantes de procesos", () => {
    it("debe tener todos los tipos de proceso definidos", () => {
        const tiposEsperados: TipoProceso[] = [
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
        
        tiposEsperados.forEach(tipo => {
            expect(ETIQUETA_TIPO[tipo]).toBeDefined();
        });
    });

    it("debe tener las etiquetas en español correctas", () => {
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

    it("debe tener los umbrales por defecto correctos", () => {
        expect(UMBRALES_POR_DEFECTO).toEqual({
            cpu: 85,
            ram: 90,
            disco: 90,
            bateria: 20
        });
    });
});

describe("Función porcentaje", () => {
    it("debe devolver null si usado es null", () => {
        expect(porcentaje(null, 100)).toBeNull();
    });

    it("debe devolver null si total es null", () => {
        expect(porcentaje(50, null)).toBeNull();
    });

    it("debe devolver null si total es 0", () => {
        expect(porcentaje(50, 0)).toBeNull();
    });

    it("debe devolver null si total es negativo", () => {
        expect(porcentaje(50, -10)).toBeNull();
    });

    it("debe calcular correctamente el porcentaje", () => {
        expect(porcentaje(50, 100)).toBe(50);
        expect(porcentaje(25, 100)).toBe(25);
        expect(porcentaje(10, 3)).toBe(333.33); // 10/3*100 = 333.333... -> 333.33
        expect(porcentaje(0, 100)).toBe(0);
        expect(porcentaje(100, 100)).toBe(100);
    });

    it("debe redondear a 1 decimal", () => {
        expect(porcentaje(1, 3)).toBe(33.3); // 1/3*100 = 33.333... -> 33.3
        expect(porcentaje(2, 3)).toBe(66.7); // 2/3*100 = 66.666... -> 66.7
        expect(porcentaje(10, 1000)).toBe(1); // 10/1000*100 = 1
    });
});

describe("Función avisosHardware", () => {
    const umbralesDePrueba: UmbralesProcesos = {
        cpu: 80,
        ram: 70,
        disco: 60,
        bateria: 30
    };

    it("no debe generar avisos si todos los valores están dentro de los umbrales", () => {
        const hardware: HardwareServidor[] = [
            {
                id: "1",
                nombre: "Servidor 1",
                tipo: "mac",
                cpuPct: 50,
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 2000,
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 1",
                discoLibreGb: 500,
                discoTotalGb: 1000,
                bateriaPct: 50,
                cargando: false,
                medidoEn: Date.now(),
                fuente: "test"
            }
        ];

        expect(avisosHardware(hardware, umbralesDePrueba)).toEqual([]);
    });

    it("debe generar avisos cuando se superan los umbrales", () => {
        const ahora = Date.now();
        const hardware: HardwareServidor[] = [
            {
                id: "1",
                nombre: "Servidor CPU alto",
                tipo: "mac",
                cpuPct: 90, // Sobre 80
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 2000,
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 1",
                discoLibreGb: 500,
                discoTotalGb: 1000,
                bateriaPct: 50,
                cargando: false,
                medidoEn: ahora,
                fuente: "test"
            },
            {
                id: "2",
                nombre: "Servidor RAM alto",
                tipo: "mac",
                cpuPct: 50,
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 3500, // 87.5% de 4000, sobre 70%
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 2",
                discoLibreGb: 500,
                discoTotalGb: 1000,
                bateriaPct: 50,
                cargando: false,
                medidoEn: ahora,
                fuente: "test"
            },
            {
                id: "3",
                nombre: "Servidor Disco alto",
                tipo: "mac",
                cpuPct: 50,
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 2000,
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 3",
                discoLibreGb: 300, // 700 usado de 1000 = 70%, sobre 60%
                discoTotalGb: 1000,
                bateriaPct: 50,
                cargando: false,
                medidoEn: ahora,
                fuente: "test"
            },
            {
                id: "4",
                nombre: "Servidor Batería baja",
                tipo: "mac",
                cpuPct: 50,
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 2000,
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 4",
                discoLibreGb: 500,
                discoTotalGb: 1000,
                bateriaPct: 20, // Bajo 30%
                cargando: false, // Importante: solo avisa si no está cargando
                medidoEn: ahora,
                fuente: "test"
            }
        ];

        const avisos = avisosHardware(hardware, umbralesDePrueba);
        
        // Debemos tener exactamente 4 avisos
        expect(avisos).toHaveLength(4);
        
        // Verificamos cada aviso
        const medidas = avisos.map(a => a.medida);
        expect(medidas).toContain('cpu');
        expect(medidas).toContain('ram');
        expect(medidas).toContain('disco');
        expect(medidas).toContain('bateria');
        
        // Verificamos valores específicos
        expect(avisos.find(a => a.medida === 'cpu')?.valor).toBe(90);
        expect(avisos.find(a => a.medida === 'cpu')?.umbral).toBe(80);
        
        expect(avisos.find(a => a.medida === 'ram')?.valor).toBeCloseTo(87.5);
        expect(avisos.find(a => a.medida === 'ram')?.umbral).toBe(70);
        
        expect(avisos.find(a => a.medida === 'disco')?.valor).toBe(70);
        expect(avisos.find(a => a.medida === 'disco')?.umbral).toBe(60);
        
        expect(avisos.find(a => a.medida === 'bateria')?.valor).toBe(20);
        expect(avisos.find(a => a.medida === 'bateria')?.umbral).toBe(30);
    });

    it("no debe generar aviso de batería si está cargando", () => {
        const ahora = Date.now();
        const hardware: HardwareServidor[] = [
            {
                id: "1",
                nombre: "Servidor Batería baja pero cargando",
                tipo: "mac",
                cpuPct: 50,
                nucleos: 4,
                carga: 0.5,
                ramUsadaMb: 2000,
                ramTotalMb: 4000,
                gpuPct: 30,
                gpuNombre: "GPU 1",
                discoLibreGb: 500,
                discoTotalGb: 1000,
                bateriaPct: 20, // Bajo 30%
                cargando: true, // Está cargando, así que no debe avisar
                medidoEn: ahora,
                fuente: "test"
            }
        ];

        expect(avisosHardware(hardware, umbralesDePrueba)).toEqual([]);
    });

    it("debe manejar valores null correctamente", () => {
        const ahora = Date.now();
        const hardware: HardwareServidor[] = [
            {
                id: "1",
                nombre: "Servidor con valores null",
                tipo: "mac",
                cpuPct: null, // No debe avisar
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
                medidoEn: ahora,
                fuente: "test"
            }
        ];

        expect(avisosHardware(hardware, umbralesDePrueba)).toEqual([]);
    });
});

describe("Función hardwareDesdeMac", () => {
    it("debe devolver null para entrada no válida", () => {
        expect(hardwareDesdeMac(null, Date.now())).toBeNull();
        expect(hardwareDesdeMac(undefined, Date.now())).toBeNull();
        expect(hardwareDesdeMac("", Date.now())).toBeNull();
        expect(hardwareDesdeMac({}, Date.now())).toBeNull();
        expect(hardwareDesdeMac({ cpuPct: 50 }, Date.now())).toBeNull(); // Faltan campos
    });

    it("debe devolver null para tipos incorrectos", () => {
        const ahora = Date.now();
        expect(hardwareDesdeMac({ 
            cpuPct: "50", 
            nucleos: 4, 
            carga: 0.5,
            ramUsadaMb: 2000,
            ramTotalMb: 4000,
            gpuPct: 30,
            gpuNombre: "GPU",
            discoLibreGb: 500,
            discoTotalGb: 1000,
            bateriaPct: 50,
            cargando: false,
            medidoEn: ahora
        }, ahora)).toBeNull(); // cpuPct es string, no number
        
        expect(hardwareDesdeMac({ 
            cpuPct: 50,
            nucleos: 4, 
            carga: 0.5,
            ramUsadaMb: 2000,
            ramTotalMb: 4000,
            gpuPct: 30,
            gpuNombre: "GPU",
            discoLibreGb: 500,
            discoTotalGb: 1000,
            bateriaPct: 50,
            cargando: "false", // Esto es string, no boolean
            medidoEn: ahora
        }, ahora)).toBeNull();
    });

    it("debe convertir correctamente los datos válidos", () => {
        const ahora = Date.now();
        const entrada = {
            cpuPct: 45.5,
            nucleos: 8,
            carga: 0.3,
            ramUsadaMb: 4096,
            ramTotalMb: 16384,
            gpuPct: 20.0,
            gpuNombre: "Intel Iris Plus",
            discoLibreGb: 250.5,
            discoTotalGb: 500.0,
            bateriaPct: 75,
            cargando: false,
            medidoEn: ahora - 1000
        };
        
        const resultado = hardwareDesdeMac(entrada, ahora);
        
        expect(resultado).not.toBeNull();
        expect(resultado?.id).toBe("mac-local");
        expect(resultado?.nombre).toBe("Esta Mac");
        expect(resultado?.tipo).toBe("mac");
        expect(resultado?.cpuPct).toBe(45.5);
        expect(resultado?.nucleos).toBe(8);
        expect(resultado?.carga).toBe(0.3);
        expect(resultado?.ramUsadaMb).toBe(4096);
        expect(resultado?.ramTotalMb).toBe(16384);
        expect(resultado?.gpuPct).toBe(20.0);
        expect(resultado?.gpuNombre).toBe("Intel Iris Plus");
        expect(resultado?.discoLibreGb).toBe(250.5);
        expect(resultado?.discoTotalGb).toBe(500.0);
        expect(resultado?.bateriaPct).toBe(75);
        expect(resultado?.cargando).toBe(false);
        expect(resultado?.medidoEn).toBe(ahora - 1000);
        expect(resultado?.fuente).toBe("/api/mando/hardware");
    });
});

describe("Función hardwareDesdeNodo", () => {
    it("debe devolver null para entrada no válida", () => {
        expect(hardwareDesdeNodo(null, Date.now())).toBeNull();
        expect(hardwareDesdeNodo(undefined, Date.now())).toBeNull();
        expect(hardwareDesdeNodo({}, Date.now())).toBeNull();
        expect(hardwareDesdeNodo({ nodo: "n1" }, Date.now())).toBeNull(); // Faltan campos
    });

    it("debe devolver null para tipos incorrectos", () => {
        const ahora = Date.now();
        expect(hardwareDesdeNodo({ 
            nodo: "n1",
            medio: "test",
            ram_libre_mb: "2048", // string en vez de number
            disco_gb: 100
        }, ahora)).toBeNull();
        
        expect(hardwareDesdeNodo({ 
            nodo: "n1",
            medio: "test",
            ram_libre_mb: 2048,
            disco_gb: "100" // string en vez de number
        }, ahora)).toBeNull();
    });

    it("debe convertir correctamente los datos válidos", () => {
        const ahora = Date.now();
        const entrada = {
            nodo: "nodo1",
            medio: "ethernet",
            ram_libre_mb: 2048,
            disco_gb: 500,
            cpu_pct: 30.5,
            ram_total_mb: 8192,
            disco_total_gb: 1000,
            nucleos: 16,
            carga: 0.7
        };
        
        const resultado = hardwareDesdeNodo(entrada, ahora);
        
        expect(resultado).not.toBeNull();
        expect(resultado?.id).toBe("nodo-nodo1");
        expect(resultado?.nombre).toBe("ethernet");
        expect(resultado?.tipo).toBe("a1");
        expect(resultado?.cpuPct).toBe(30.5);
        expect(resultado?.nucleos).toBe(16);
        expect(resultado?.carga).toBe(0.7);
        expect(resultado?.ramUsadaMb).toBe(6144); // 8192 - 2048
        expect(resultado?.ramTotalMb).toBe(8192);
        expect(resultado?.gpuPct).toBeNull();
        expect(resultado?.gpuNombre).toBeNull();
        expect(resultado?.discoLibreGb).toBe(500);
        expect(resultado?.discoTotalGb).toBe(1000);
        expect(resultado?.bateriaPct).toBeNull();
        expect(resultado?.cargando).toBeNull();
        expect(resultado?.medidoEn).toBe(ahora);
        expect(resultado?.fuente).toBe("nodo-metagenesis");
    });

    it("debe manejar correctamente cuando no hay ram_total_mb", () => {
        const ahora = Date.now();
        const entrada = {
            nodo: "nodo2",
            medio: "wifi",
            ram_libre_mb: 1024,
            disco_gb: 250
            // No hay cpu_pct, ram_total_mb, etc.
        };
        
        const resultado = hardwareDesdeNodo(entrada, ahora);
        
        expect(resultado).not.toBeNull();
        expect(resultado?.id).toBe("nodo-nodo2");
        expect(resultado?.nombre).toBe("wifi");
        expect(resultado?.tipo).toBe("a1");
        expect(resultado?.cpuPct).toBeNull();
        expect(resultado?.nucleos).toBeNull();
        expect(resultado?.carga).toBeNull();
        expect(resultado?.ramUsadaMb).toBeNull(); // No tenemos total, así que no podemos calcular usado
        expect(resultado?.ramTotalMb).toBeNull();
        expect(resultado?.gpuPct).toBeNull();
        expect(resultado?.gpuNombre).toBeNull();
        expect(resultado?.discoLibreGb).toBe(250);
        expect(resultado?.discoTotalGb).toBeNull();
        expect(resultado?.bateriaPct).toBeNull();
        expect(resultado?.cargando).toBeNull();
        expect(resultado?.medidoEn).toBe(ahora);
        expect(resultado?.fuente).toBe("nodo-metagenesis");
    });
});

describe("Función hardwareDesdeNeurona", () => {
    it("debe devolver null para entrada no válida", () => {
        expect(hardwareDesdeNeurona(null, Date.now())).toBeNull();
        expect(hardwareDesdeNeurona(undefined, Date.now())).toBeNull();
        expect(hardwareDesdeNeurona({}, Date.now())).toBeNull();
        expect(hardwareDesdeNeurona({ bateria: {} }, Date.now())).toBeNull(); // Faltan campos
    });

    it("debe devolver null para tipos incorrectos", () => {
        const ahora = Date.now();
        expect(hardwareDesdeNeurona({ 
            bateria: { 
                level: "50", // string en vez de number
                charging: false
            },
            cuota_almacenamiento: 100
        }, ahora)).toBeNull();
        
        expect(hardwareDesdeNeurona({ 
            bateria: { 
                level: 50,
                charging: "false" // string en vez de boolean
            },
            cuota_almacenamiento: 100
        }, ahora)).toBeNull();
        
        expect(hardwareDesdeNeurona({ 
            bateria: { 
                level: 50,
                charging: false
            },
            cuota_almacenamiento: "100" // string en vez de number
        }, ahora)).toBeNull();
    });

    it("debe convertir correctamente los datos válidos", () => {
        const ahora = Date.now();
        const entrada = {
            bateria: {
                level: 85,
                charging: true
            },
            cuota_almacenamiento: 128
        };
        
        const resultado = hardwareDesdeNeurona(entrada, ahora);
        
        expect(resultado).not.toBeNull();
        expect(resultado?.tipo).toBe("neurona");
        expect(resultado?.nombre).toBe("Neurona de navegador");
        expect(resultado?.cpuPct).toBeNull();
        expect(resultado?.nucleos).toBeNull();
        expect(resultado?.carga).toBeNull();
        expect(resultado?.ramUsadaMb).toBeNull();
        expect(resultado?.ramTotalMb).toBeNull();
        expect(resultado?.gpuPct).toBeNull();
        expect(resultado?.gpuNombre).toBeNull();
        expect(resultado?.discoLibreGb).toBe(128);
        expect(resultado?.discoTotalGb).toBe(128);
        expect(resultado?.bateriaPct).toBe(85);
        expect(resultado?.cargando).toBe(true);
        expect(resultado?.medidoEn).toBe(ahora);
        expect(resultado?.fuente).toBe("neuron_devices.capabilities");
        // El id será aleatorio, así que solo verificamos que exista y tenga el formato esperado
        expect(resultado?.id).toMatch(/^neurona-[a-z0-9]{9}$/);
    });

    it("debe manejar correctamente valores null en bateria", () => {
        const ahora = Date.now();
        const entrada = {
            bateria: {
                level: null,
                charging: null
            },
            cuota_almacenamiento: 64
        };
        
        const resultado = hardwareDesdeNeurona(entrada, ahora);
        
        expect(resultado).not.toBeNull();
        expect(resultado?.bateriaPct).toBeNull();
        expect(resultado?.cargando).toBeNull();
        expect(resultado?.discoLibreGb).toBe(64);
        expect(resultado?.discoTotalGb).toBe(64);
    });
});