import { describe, it, expect } from 'vitest';
import { 
  libres_de, 
  contenedor, 
  resumir, 
  inventario,
  InformacionContenedor,
  CatalogoContenedor,
  MedioContenedor
} from '../contenedores';

describe('libres_de', () => {
  it('returns 0 when jobs_simultaneos is 0', () => {
    const cat: CatalogoContenedor = {
      servicio: "test",
      proveedor: "test",
      vcpu: 1,
      ram_gb: 1,
      horas_job: 0,
      jobs_simultaneos: 0,
      agentes_por_job: 1,
      coste: "test",
    };
    
    expect(libres_de(cat, 0, 0)).toBe(0);
  });

  it('returns 0 when agentes_por_job is 0', () => {
    const cat: CatalogoContenedor = {
      servicio: "test",
      proveedor: "test",
      vcpu: 1,
      ram_gb: 1,
      horas_job: 0,
      jobs_simultaneos: 1,
      agentes_por_job: 0,
      coste: "test",
    };
    
    expect(libres_de(cat, 0, 0)).toBe(0);
  });

  it('calculates libres correctly when there is capacity', () => {
    const cat: CatalogoContenedor = {
      servicio: "test",
      proveedor: "test",
      vcpu: 1,
      ram_gb: 1,
      horas_job: 0,
      jobs_simultaneos: 2,
      agentes_por_job: 2,
      coste: "test",
    };
    
    // 2 jobs * 2 agentes/job = 4 capacidad total
    // 1 agente actualmente en uso
    // 0 runs actualmente en ejecución
    // Debería tener 3 agentes libres (4 - 1)
    expect(libres_de(cat, 1, 0)).toBe(3);
  });

  it('does not invent site when runs already exceed capacity', () => {
    const cat: CatalogoContenedor = {
      servicio: "test",
      proveedor: "test",
      vcpu: 1,
      ram_gb: 1,
      horas_job: 0,
      jobs_simultaneos: 2,
      agentes_por_job: 2,
      coste: "test",
    };
    
    // 2 jobs * 2 agentes/job = 4 capacidad total
    // 5 agentes actualmente en uso (más de la capacidad)
    // 0 runs actualmente en ejecución
    // No debería inventar sitio negativo
    expect(libres_de(cat, 5, 0)).toBe(0);
  });

  it('considers runs when calculating libres', () => {
    const cat: CatalogoContenedor = {
      servicio: "test",
      proveedor: "test",
      vcpu: 1,
      ram_gb: 1,
      horas_job: 0,
      jobs_simultaneos: 2,
      agentes_por_job: 2,
      coste: "test",
    };
    
    // 2 jobs * 2 agentes/job = 4 capacidad total
    // 0 agentes actualmente en uso
    // 1 run actualmente en ejecución (ocupando 1 job = 2 agentes)
    // Debería tener 2 agentes libres (4 - 2)
    expect(libres_de(cat, 0, 1)).toBe(2);
  });
});

describe('contenedor', () => {
  const vivoPorMedio: Record<string, { agentes: number; runs: number }> = {
    "test-medio": { agentes: 1, runs: 1 }
  };

  it('creates container info from medio and catalog', () => {
    const medio: MedioContenedor = {
      id: "test-medio",
      nombre: "Test Medio",
      estado: "listo",
      detalle: "Detalle de prueba",
      siguiente_paso: "Paso de prueba"
    };

    const cat: CatalogoContenedor = {
      servicio: "Test Servicio",
      proveedor: "Test Proveedor",
      vcpu: 2,
      ram_gb: 8,
      horas_job: 4,
      jobs_simultaneos: 2,
      agentes_por_job: 2,
      coste: "Test coste",
      lanza: "test lanza"
    };

    const result = contenedor(medio, cat, vivoPorMedio);
    
    expect(result.id).toBe("test-medio");
    expect(result.nombre).toBe("Test Medio");
    expect(result.enlaceAlta).toBeNull();
    expect(result.guia).toBeNull();
    expect(result.requiereCuenta).toBeFalsy();
    expect(result.requierePago).toBeFalsy();
    expect(result.aptoPrivado).toBeFalsy();
    expect(result.verificado).toBeNull();
    expect(result.servicio).toBe("Test Servicio");
    expect(result.proveedor).toBe("Test Proveedor");
    expect(result.estado).toBe("listo");
    expect(result.maquina).toContain("2 vCPU");
    expect(result.maquina).toContain("8 GB");
    expect(result.maquina).toContain("4 h por job");
    expect(result.jobs_simultaneos).toBe(2);
    expect(result.agentes_por_job).toBe(2);
    expect(result.agentes_ahora).toBe(1);
    expect(result.runs_ahora).toBe(1);
    expect(result.detalle).toBe("Detalle de prueba");
    expect(result.falta).toBe(""); // Porque es usable
    expect(result.siguiente_paso).toBe("Paso de prueba");
    expect(result.lanza).toBe("test lanza");
    expect(result.desplegable).toBe(true);
  });

  it('handles no_disponible state correctly', () => {
    const medio: MedioContenedor = {
      id: "test-medio",
      nombre: "Test Medio",
      estado: "no_disponible",
      detalle: "No disponible por falta de configuración",
      siguiente_paso: "Configurar el servicio"
    };

    const cat: CatalogoContenedor = {
      servicio: "Test Servicio",
      proveedor: "Test Proveedor",
      vcpu: 1,
      ram_gb: 4,
      horas_job: 0,
      jobs_simultaneos: 1,
      agentes_por_job: 1,
      coste: "Test coste",
    };

    const result = contenedor(medio, cat, vivoPorMedio);
    
    expect(result.id).toBe("test-medio");
    expect(result.nombre).toBe("Test Medio");
    expect(result.enlaceAlta).toBeNull();
    expect(result.guia).toBeNull();
    expect(result.requiereCuenta).toBeFalsy();
    expect(result.requierePago).toBeFalsy(); // Esto dependería de la implementación específica
    expect(result.aptoPrivado).toBeFalsy();
    expect(result.verificado).toBeNull();
    expect(result.estado).toBe("no_disponible");
    expect(result.falta).toBe("No disponible por falta de configuración");
    expect(result.siguiente_paso).toBe("Configurar el servicio");
    expect(result.desplegable).toBe(false);
  });
});

describe('resumir', () => {
  it('calculates correct totals', () => {
    const contenedores: InformacionContenedor[] = [
      {
        id: "c1",
        nombre: "Contenedor 1",
        enlaceAlta: null,
        guia: null,
        requiereCuenta: false,
        requierePago: false,
        aptoPrivado: false,
        verificado: null,
        servicio: "Servicio 1",
        proveedor: "Proveedor 1",
        estado: "listo",
        maquina: "1 vCPU · 1 GB",
        jobs_simultaneos: 2,
        agentes_por_job: 2,
        agentes_ahora: 1,
        runs_ahora: 0,
        agentes_libres: 3,
        coste: "coste 1",
        detalle: "detalle 1",
        falta: "",
        siguiente_paso: "",
        lanza: "lanza 1",
        desplegable: true
      },
      {
        id: "c2",
        nombre: "Contenedor 2",
        enlaceAlta: null,
        guia: null,
        requiereCuenta: false,
        requierePago: false,
        aptoPrivado: false,
        verificado: null,
        servicio: "Servicio 2",
        proveedor: "Proveedor 2",
        estado: "usable",
        maquina: "2 vCPU · 2 GB",
        jobs_simultaneos: 1,
        agentes_por_job: 3,
        agentes_ahora: 2,
        runs_ahora: 1,
        agentes_libres: 1,
        coste: "coste 2",
        detalle: "detalle 2",
        falta: "",
        siguiente_paso: "",
        lanza: "lanza 2",
        desplegable: true
      },
      {
        id: "c3",
        nombre: "Contenedor 3",
        enlaceAlta: null,
        guia: null,
        requiereCuenta: false,
        requierePago: false,
        aptoPrivado: false,
        verificado: null,
        servicio: "Servicio 3",
        proveedor: "Proveedor 3",
        estado: "requiere_alex",
        maquina: "4 vCPU · 4 GB",
        jobs_simultaneos: 1,
        agentes_por_job: 1,
        agentes_ahora: 0,
        runs_ahora: 0,
        agentes_libres: 0,
        coste: "coste 3",
        detalle: "detalle 3",
        falta: "falta 3",
        siguiente_paso: "paso 3",
        lanza: "lanza 3",
        desplegable: false
      }
    ];

    const resumen = resumir(contenedores);
    
    expect(resumen.contenedores).toBe(3);
    expect(resumen.usables).toBe(2); // listo + usable
    expect(resumen.agentes_ahora).toBe(3); // 1 + 2 + 0
    expect(resumen.agentes_libres).toBe(4); // 3 + 1 + 0
    expect(resumen.agentes_tope).toBe(7); // (2*2) + (1*3) + (1*1) = 4 + 3 + 1 = 8? Esperemos...
    // En realidad: c1: 2*2=4, c2: 1*3=3, c3: 1*1=1 => total 8
    // Pero solo contamos los usables (c1 y c2): 4 + 3 = 7
    expect(resumen.agentes_tope).toBe(7);
    expect(resumen.por_hacer).toBe(1); // solo c3
  });
});

describe('inventario', () => {
  it('returns structured result with empty input', () => {
    const result = inventario([]);
    
    expect(result).toHaveProperty('generado');
    expect(result).toHaveProperty('contenedores');
    expect(result).toHaveProperty('resumen');
    
    expect(Array.isArray(result.contenedores)).toBe(true);
    expect(typeof result.resumen).toBe('object');
    
    expect(result.resumen.contenedores).toBe(0);
    expect(result.resumen.usables).toBe(0);
    expect(result.resumen.agentes_ahora).toBe(0);
    expect(result.resumen.agentes_libres).toBe(0);
    expect(result.resumen.agentes_tope).toBe(0);
    expect(result.resumen.por_hacer).toBe(0);
  });
});