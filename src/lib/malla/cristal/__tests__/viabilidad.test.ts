// Malla cristalina SiO₂ amorfa: pruebas de viabilidad
// Función pura: sin node:* ni Supabase ni window

import { describe, it, expect } from 'vitest'
import { viabilidad } from './viabilidad.ts'
import type { Dato, SenalMedida, Medio, ClaseDato, Prioridad, TipoDato } from '../tipos'

// Helper to create a basic Dato
function crearDato(overrides: Partial<Dato> = {}): Dato {
  return {
    id: 'dato1',
    clase: 'privado', // default to privado for most tests
    tipo: 'mensaje',
    bytes: 100,
    prioridad: 0, // P0
    origen: 'neurona1',
    destino: 'neurona2',
    ...overrides
  }
}

// Helper to create a basic SenalMedida
function crearSenal(overrides: Partial<SenalMedida> = {}): SenalMedida {
  return {
    de: 'neurona1',
    a: 'neurona2',
    medio: 'wifi-lan',
    rssiDbm: -50,
    snrDb: 20,
    rttMs: 50,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    frecuenciaMhz: 2400,
    anchoCanalMhz: 20,
    vistaEn: 1000,
    ...overrides
  }
}

// Helper to create a basic ctx
function crearCtx(overrides: Partial<{ cuentaDe: (neuronaId: string) => string | null; bateriaPct?: number | null; cifradoE2E: boolean }> = {}): Required<Omit<typeof crearCtx, 'cuentaDe'>> & { cuentaDe: (neuronaId: string) => string | null } {
  const cuentaDeDefault = (neuronaId: string) => {
    if (neuronaId === 'neurona1' || neuronaId === 'neurona2') return 'cuentaA'
    return null
  }
  return {
    cuentaDe: overrides.cuentaDe ?? cuentaDeDefault,
    bateriaPct: overrides.bateriaPct ?? 50,
    cifradoE2E: overrides.cifradoE2E ?? true,
    ...overrides
  }
}

describe('viabilidad', () => {
  describe('vetos', () => {
    it('debe veto por interno cuando una punta no es de la misma cuenta', () => {
      const dato = crearDato({ clase: 'interno' })
      const senal = crearSenal({ a: 'neurona3' }) // neurona3 is in different account
      const ctx = crearCtx({
        cuentaDe: (id) => {
          if (id === 'neurona1' || id === 'neurona2') return 'cuentaA'
          if (id === 'neurona3') return 'cuentaB'
          return null
        }
      })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('interno')
      expect(result.valor).toBe(0)
    })

    it('debe veto por interno cuando ambas puntas no son de la misma cuenta', () => {
      const dato = crearDato({ clase: 'interno' })
      const senal = crearSenal({ de: 'neurona3', a: 'neurona4' })
      const ctx = crearCtx({
        cuentaDe: (id) => {
          if (id === 'neurona1' || id === 'neurona2') return 'cuentaA'
          if (id === 'neurona3' || id === 'neurona4') return 'cuentaB'
          return null
        }
      })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('interno')
    })

    it('debe veto por privado sin cifradoE2E', () => {
      const dato = crearDato({ clase: 'privado' })
      const senal = crearSenal()
      const ctx = crearCtx({ cifradoE2E: false })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('privado')
      expect(result.valor).toBe(0)
    })

    it('debe veto por interno sin cifradoE2E', () => {
      const dato = crearDato({ clase: 'interno' })
      const senal = crearSenal()
      const ctx = crearCtx({ cifradoE2E: false })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('interno')
      expect(result.valor).toBe(0)
    })

    it('debe veto por lora cuando bytes > 1600', () => {
      const dato = crearDato({ bytes: 2000 })
      const senal = crearSenal({ medio: 'lora' })
      const ctx = crearCtx()
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('lora')
      expect(result.valor).toBe(0)
    })

    it('debe veto por lora cuando tipo es llamada', () => {
      const dato = crearDato({ tipo: 'llamada', bytes: 100 })
      const senal = crearSenal({ medio: 'lora' })
      const ctx = crearCtx()
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('lora')
      expect(result.valor).toBe(0)
    })

    it('debe veto por nfc cuando bytes > 32768', () => {
      const dato = crearDato({ bytes: 40000 })
      const senal = crearSenal({ medio: 'nfc' })
      const ctx = crearCtx()
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('nfc')
      expect(result.valor).toBe(0)
    })

    it('debe veto por servidor para privado sin cifradoE2E', () => {
      const dato = crearDato({ clase: 'privado' })
      const senal = crearSenal({ medio: 'servidor' })
      const ctx = crearCtx({ cifradoE2E: false })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('servidor')
      expect(result.valor).toBe(0)
    })

    it('debe veto por servidor para interno sin cifradoE2E', () => {
      const dato = crearDato({ clase: 'interno' })
      const senal = crearSenal({ medio: 'servidor' })
      const ctx = crearCtx({ cifradoE2E: false })
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('servidor')
      expect(result.valor).toBe(0)
    })
  })

  describe('sin vetos', () => {
    it('debe retornar apto true cuando todas las condiciones son favorables', () => {
      const dato = crearDato()
      const senal = crearSenal()
      const ctx = crearCtx()
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(true)
      expect(result.valor).toBeGreaterThan(0)
      expect(result.motivo).toBe('')
    })

    it('debe aplicar factor de servidor 0.6 cuando medio es servidor y clase no es publico', () => {
      const dato = crearDato({ clase: 'privado' })
      const senalWifi = crearSenal({ medio: 'wifi-lan' })
      const senalServidor = crearSenal({ medio: 'servidor' })
      const ctx = crearCtx()

      const resultWifi = viabilidad(dato, senalWifi, ctx)
      const resultServidor = viabilidad(dato, senalServidor, ctx)

      // El único diferencia debería ser el factor 0.6 para servidor
      // Asumiendo que la calidadSenal es la mismo para ambos medios (lo cual no es cierto debido a diferentes capacidades)
      // Pero para este test, forzamos que la calidadSenal sea la misma anulando las diferencias de medio en la función de calidadSenal?
      // En su lugar, vamos a comparar la relación y esperamos que sea cercana a 0.6
      // Debido a que la calidadSenal depende del medio (por la capacidad), no podemos garantizar que sea igual.
      // Por lo tanto, este test podría ser frágil. Vamos a.skip por ahora y enfocarnos en los vetos.
      // Sin embargo, la tarea requiere pruebas por cada veto y orden relativo esperado.
      // Vamos a intentar un enfoque diferente: usar un medio que no afecte tanto a la calidadSenal, o usar valores extremos.
      // Otra idea: usar un medio donde la capacidad sea muy alta para que el puntaje de ancho de banda sea 1 en ambos.
      // Pero la capacidad de wifi-lan es 100000 y servidor es 10000, así que diferente.
      // Vamos a.skip este test y esperar que las pruebas de orden relativo nos den más información.
      expect(resultWifi.apto).toBe(true)
      expect(resultServidor.apto).toBe(true)
      // Sólo verificamos que ambos son aptos y que el valor del servidor es menor (debería ser por el factor 0.6)
      // Pero como la calidadSenal puede ser diferente, no podemos afirmar una razón exacta.
      // Vamos a dejarlo como una comprobación suave: esperamos que el valor del servidor sea menor que el de wifi-lan
      // en condiciones donde la calidadSenal sea similar. Para hacer la calidadSenal similar, necesitamos que
      // las medidas de señal sean tales que el puntaje de ancho de banda sea 1 para ambos.
      // Para wifi-lan, anchoBandaKbps necesita ser >= 100000 para puntaje 1.
      // Para servidor, anchoBandaKbps necesita ser >= 10000 para puntaje 1.
      // Así que si establecemos anchoBandaKbps a 100000, entonces para wifi-lan es 1, para servidor también es 1 (porque 100000 > 10000).
      const senalWifiHigh = crearSenal({ medio: 'wifi-lan', anchoBandaKbps: 100000 })
      const senalServidorHigh = crearSenal({ medio: 'servidor', anchoBandaKbps: 100000 })
      const resultWifiHigh = viabilidad(dato, senalWifiHigh, ctx)
      const resultServidorHigh = viabilidad(dato, senalServidorHigh, ctx)
      // Ahora la calidadSenal debería ser muy similar (solo difiere en que el medio es diferente, pero la función de calidadSenal
      // solo usa el medio para buscar la capacidad, y como ambas tienen anchoBandaKbps=100000, el puntaje de ancho será 1 para ambos).
      // Sin embargo, la función puntuaAnchoBanda usa la capacidad del medio, que es diferente: 100000 para wifi-lan y 10000 para servidor.
      // Pero pasamos anchoBandaKbps=100000, entonces para servidor: puntaje = puntuaAnchoBanda(100000, 10000) which should be 1 (since it's over capacity).
      // Para wifi-lan: puntuaAnchoBanda(100000, 100000) = 1.
      // Así que el puntaje de ancho es 1 para ambos.
      // Los otros puntajes (rssi, snr, rtt, perdida) son los mismos.
      // Por lo tanto, la calidadSenal debería ser idéntica.
      // Entonces la diferencia en el valor debería ser solo por el factor de servidor (0.6) y posiblemente el factor de prioridad y batería (que son los mismos).
      // Esperamos: valorServidor = valorWifi * 0.6
      const ratio = resultServidorHigh.valor / resultWifiHigh.valor
      expect(ratio).toBeCloseTo(0.6, 0.1) // dentro de 0.1
    })

    it('debe aplicar factor de batería 0.8 cuando batería < 20 y medio es alto consumo', () => {
      const dato = crearDato({ clase: 'publico' }) // para evitar el factor de servidor
      const senalWifi = crearSenal({ medio: 'wifi-lan' })
      const senalBle = crearSenal({ medio: 'ble' }) // ble no es alto consumo según la lista
      const ctx = crearCtx({ bateriaPct: 10 }) // batería baja

      const resultWifi = viabilidad(dato, senalWifi, ctx)
      const resultBle = viabilidad(dato, senalBle, ctx)

      // Esperamos que el factor de batería se aplique a wifi-lan pero no a ble
      // Nuevamente, necesitamos que la calidadSenal sea la misma para ambos.
      // Para ble, la capacidad es 1000 kbps, para wifi-lan es 100000 kbps.
      // Para hacer que el puntaje de ancho sea 1 en ambos, necesitamos anchoBandaKbps alto suficiente.
      // Establecemos anchoBandaKbps a 100000, entonces:
      //   ble: puntaje = puntuaAnchoBanda(100000, 1000) = 1
      //   wifi-lan: puntaje = puntuaAnchoBanda(100000, 100000) = 1
      const senalWifiHigh = crearSenal({ medio: 'wifi-lan', anchoBandaKbps: 100000 })
      const senalBleHigh = crearSenal({ medio: 'ble', anchoBandaKbps: 100000 })
      const resultWifiHigh = viabilidad(dato, senalWifiHigh, ctx)
      const resultBleHigh = viabilidad(dato, senalBleHigh, ctx)

      // El factor de batería es 0.8 para wifi-lan (porque batería < 20 y medio alto consumo)
      // Para ble, no es alto consumo, so factorBateria = 1
      // Esperamos: valorWifiHigh = valorBleHigh * 0.8
      const ratio = resultWifiHigh.valor / resultBleHigh.valor
      expect(ratio).toBeCloseTo(0.8, 0.1)
    })
  })

  describe('orden relativo esperado', () => {
    it('un mensaje privado P0 de 120 B prefiere wifi-lan a servidor', () => {
      const dato = crearDato({
        clase: 'privado',
        prioridad: 0,
        bytes: 120
      })
      // Crear señales para wifi-lan y servidor con la misma calidadSenal (como antes)
      const senalWifi = crearSenal({
        medio: 'wifi-lan',
        anchoBandaKbps: 100000 // para hacer puntaje de ancho 1 en ambos
      })
      const senalServidor = crearSenal({
        medio: 'servidor',
        anchoBandaKbps: 100000
      })
      const ctx = crearCtx({
        bateriaPct: 50, // para evitar factor de batería
        cifradoE2E: true
      })

      const resultWifi = viabilidad(dato, senalWifi, ctx)
      const resultServidor = viabilidad(dato, senalServidor, ctx)

      // Esperamos que el valor de wifi-lan sea mayor que el de servidor
      expect(resultWifi.valor).toBeGreaterThan(resultServidor.valor)
    })

    it('uno de 5 MB nunca va por lora', () => {
      const dato = crearDato({
        bytes: 5 * 1024 * 1024 // 5 MB
      })
      const senal = crearSenal({ medio: 'lora' })
      const ctx = crearCtx()
      const result = viabilidad(dato, senal, ctx)
      expect(result.apto).toBe(false)
      expect(result.motivo).toBe('lora')
      expect(result.valor).toBe(0)
    })
  })
})
