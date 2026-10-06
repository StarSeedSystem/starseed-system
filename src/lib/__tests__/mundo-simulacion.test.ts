import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  mundoInicial, 
  avanzar, 
  guardarMundo, 
  cargarMundo,
  pasosParaTick,
  debeAvanzar,
  EstadoMundo,
  HabitanteMundo
} from '../avatares/mundo/simulacion';

describe('Simulación del mundo de avatares', () => {
  beforeEach(() => {
    // Limpiar localStorage antes de cada prueba
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('debería crear un mundo inicial con las personalidades proporcionadas', () => {
    const personalidades = [
      { id: 'pers1', nombre: 'Avatar 1' },
      { id: 'pers2', nombre: 'Avatar 2' }
    ];
    
    const estado = mundoInicial(personalidades);
    
    expect(estado.tick).toBe(0);
    expect(estado.habitantes).toHaveLength(2);
    expect(estado.creaciones).toHaveLength(0);
    expect(estado.encuentros).toHaveLength(0);
    
    const habitante1 = estado.habitantes[0];
    expect(habitante1.personalidadId).toBe('pers1');
    expect(habitante1.nombre).toBe('Avatar 1');
    expect(habitante1.posicion).toBeInstanceOf(Array);
    expect(habitante1.posicion.length).toBe(3);
    expect(habitante1.energia).toBeGreaterThan(0);
    expect(habitante1.energia).toBeLessThanOrEqual(1);
    expect(['explorar', 'conversar', 'crear', 'descansar']).toContain(habitante1.ocupacion);
    expect(habitante1.obras).toBe(0);
    expect(habitante1.vinculos).toEqual({});
  });

  it('debería ser determinista: mismo estado y mismos pasos dan mismo resultado', () => {
    const personalidades = [{ id: 'pers1', nombre: 'Avatar 1' }];
    const estadoInicial1 = mundoInicial(personalidades);
    const estadoInicial2 = mundoInicial(personalidades);
    
    const resultado1 = avanzar(estadoInicial1, 5);
    const resultado2 = avanzar(estadoInicial2, 5);
    
    // Comparar cada propiedad importante para evitar diferencias en IDs
    expect(resultado1.tick).toBe(resultado2.tick);
    expect(resultado1.habitantes.length).toBe(resultado2.habitantes.length);
    expect(resultado1.creaciones.length).toBe(resultado2.creaciones.length);
    expect(resultado1.encuentros.length).toBe(resultado2.encuentros.length);
    
    // Comparar posiciones, energías, etc., ignorando los IDs
    for (let i = 0; i < resultado1.habitantes.length; i++) {
      expect(resultado1.habitantes[i].posicion).toEqual(resultado2.habitantes[i].posicion);
      expect(resultado1.habitantes[i].energia).toBeCloseTo(resultado2.habitantes[i].energia, 5);
      expect(resultado1.habitantes[i].humor).toBe(resultado2.habitantes[i].humor);
      expect(resultado1.habitantes[i].ocupacion).toBe(resultado2.habitantes[i].ocupacion);
      expect(resultado1.habitantes[i].obras).toBe(resultado2.habitantes[i].obras);
    }
  });

  it('debería mantener la energía entre 0 y 1', () => {
    const personalidades = [{ id: 'pers1', nombre: 'Avatar 1' }];
    let estado = mundoInicial(personalidades);
    
    // Avanzar muchos pasos para probar diferentes situaciones
    for (let i = 0; i < 20; i++) {
      estado = avanzar(estado, 1);
      for (const habitante of estado.habitantes) {
        expect(habitante.energia).toBeGreaterThanOrEqual(0);
        expect(habitante.energia).toBeLessThanOrEqual(1);
      }
    }
  });

  it('debería crear un vínculo en ambos sentidos cuando dos habitantes se encuentran', () => {
    // Creamos personalidades en posiciones cercanas para forzar un encuentro
    const personalidades = [
      { id: 'pers1', nombre: 'Avatar 1' },
      { id: 'pers2', nombre: 'Avatar 2' }
    ];
    
    let estado = mundoInicial(personalidades);
    
    // Forzar posiciones cercanas para garantizar un encuentro
    estado.habitantes[0].posicion = [0, 0, 0];
    estado.habitantes[1].posicion = [0, 0, 0]; // Muy cerca
    
    // Asegurar que ambos estén en modo conversar
    estado.habitantes[0].ocupacion = 'conversar';
    estado.habitantes[1].ocupacion = 'conversar';
    
    const estadoDespues = avanzar(estado, 1);
    
    // Verificar que haya ocurrido un encuentro
    expect(estadoDespues.encuentros.length).toBeGreaterThan(0);
    
    // Verificar que ambos habitantes tengan un vínculo con el otro
    const habitante1 = estadoDespues.habitantes.find(h => h.personalidadId === 'pers1')!;
    const habitante2 = estadoDespues.habitantes.find(h => h.personalidadId === 'pers2')!;
    
    expect(habitante1.vinculos[habitante2.id]).toBeDefined();
    expect(habitante2.vinculos[habitante1.id]).toBeDefined();
    
    // Verificar que ambos vínculos tengan el mismo valor (refuerzo mutuo)
    expect(habitante1.vinculos[habitante2.id]).toBeCloseTo(habitante2.vinculos[habitante1.id]);
  });

  it('debería respetar el tope de 500 ticks al cargar el mundo', () => {
    const personalidades = [{ id: 'pers1', nombre: 'Avatar 1' }];
    const estado = mundoInicial(personalidades);
    
    // Mockear localStorage para simular el entorno de pruebas
    if (typeof localStorage !== 'undefined') {
      // Guardar el estado
      guardarMundo(estado);
      
      // Modificar artificialmente el timestamp para simular que pasó mucho tiempo
      const storageData = JSON.parse(localStorage.getItem('starseed.mundo.avatares.v1')!);
      storageData.timestamp = Date.now() - (600 * 1000); // Simular 600 segundos atrás
      localStorage.setItem('starseed.mundo.avatares.v1', JSON.stringify(storageData));
      
      // Cargar el mundo y verificar que no se hayan avanzado más de 500 ticks
      const estadoCargado = cargarMundo();
      
      if (estadoCargado) {
        expect(estadoCargado.tick).toBeLessThanOrEqual(500);
      }
    }
  });

  it('debería avanzar el tick correctamente', () => {
    const personalidades = [{ id: 'pers1', nombre: 'Avatar 1' }];
    const estadoInicial = mundoInicial(personalidades);
    
    const estadoDespues = avanzar(estadoInicial, 10);
    
    expect(estadoDespues.tick).toBe(10);
  });

  describe('pausa del tick (rescatado de SP092910)', () => {
    it('en pausa, ningún pulso del temporizador avanza el estado', () => {
      let estado = mundoInicial([{ id: 'pers1', nombre: 'Avatar 1' }]);
      const antes = JSON.stringify(estado);

      for (let i = 0; i < 5; i++) {
        const { pasos, pasosPendientes } = pasosParaTick({
          pausado: true,
          pestañaOculta: false,
          pasosPendientes: 0
        });
        expect(pasos).toBe(0);
        expect(pasosPendientes).toBe(0);
        estado = avanzar(estado, pasos);
      }

      expect(estado.tick).toBe(0);
      expect(JSON.stringify(estado)).toBe(antes);
    });

    it('en pausa no se acumula nada, ni siquiera con la pestaña oculta', () => {
      let pendientes = 0;
      for (let i = 0; i < 6; i++) {
        const r = pasosParaTick({
          pausado: true,
          pestañaOculta: true,
          pasosPendientes: pendientes
        });
        expect(r.pasos).toBe(0);
        pendientes = r.pasosPendientes;
      }
      expect(pendientes).toBe(0);
    });

    it('pestaña oculta sin pausa: acumula con tope 4 y al volver avanza 1 solo paso', () => {
      let pendientes = 0;
      for (let i = 0; i < 6; i++) {
        const r = pasosParaTick({
          pausado: false,
          pestañaOculta: true,
          pasosPendientes: pendientes
        });
        expect(r.pasos).toBe(0);
        pendientes = r.pasosPendientes;
      }
      expect(pendientes).toBe(4);

      const alVolver = pasosParaTick({
        pausado: false,
        pestañaOculta: false,
        pasosPendientes: pendientes
      });
      expect(alVolver.pasos).toBe(1);
      expect(alVolver.pasosPendientes).toBe(0);
    });

    it('sin pausa y pestaña visible, cada tick avanza exactamente 1 paso', () => {
      let estado = mundoInicial([{ id: 'pers1', nombre: 'Avatar 1' }]);

      for (let i = 0; i < 3; i++) {
        const { pasos, pasosPendientes } = pasosParaTick({
          pausado: false,
          pestañaOculta: false,
          pasosPendientes: 0
        });
        expect(pasos).toBe(1);
        expect(pasosPendientes).toBe(0);
        estado = avanzar(estado, pasos);
      }

      expect(estado.tick).toBe(3);
    });

    it('debeAvanzar es cierto solo sin pausa y con pestaña visible', () => {
      expect(debeAvanzar({ pausado: false, oculta: false })).toBe(true);
      expect(debeAvanzar({ pausado: true, oculta: false })).toBe(false);
      expect(debeAvanzar({ pausado: false, oculta: true })).toBe(false);
      expect(debeAvanzar({ pausado: true, oculta: true })).toBe(false);
    });

    it('los pulsos descartados por pausa dejan el tick intacto y al reanudar vuelve a avanzar', () => {
      const inicial = mundoInicial([{ id: 'a', nombre: 'Astra' }]);
      const trasPausa = [true, true, true].reduce(
        (estado, pausado) =>
          debeAvanzar({ pausado, oculta: false }) ? avanzar(estado, 1) : estado,
        inicial
      );
      expect(trasPausa.tick).toBe(inicial.tick);

      const reanudado = debeAvanzar({ pausado: false, oculta: false })
        ? avanzar(trasPausa, 1)
        : trasPausa;
      expect(reanudado.tick).toBe(inicial.tick + 1);
    });
  });
});