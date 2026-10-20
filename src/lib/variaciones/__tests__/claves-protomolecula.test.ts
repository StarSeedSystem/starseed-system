import { describe, it, expect } from 'vitest'
import { 
  claveDeHerramienta, 
  claveDeAtomo, 
  claveDeMolecula,
  atributosClave
} from '../claves-protomolecula'
import { CATALOGO_PROTOMOLECULA } from '../../protomolecula/catalogo-herramientas.ts'
import { listarAtomos } from '../../protomolecula/registro-atomos.ts'

// Obtener un id de herramienta válido del catálogo (sabemos que el catálogo no está vacío)
const validToolId = CATALOGO_PROTOMOLECULA.length > 0 ? CATALOGO_PROTOMOLECULA[0].id : 'photocraft'
// Respaldo a 'photocraft' si el catálogo está vacío (no debería ocurrir)

// Obtener un id de átomo válido del registro (si es que hay alguno) obteniendo el herramientaId del primer átomo
const atoms = listarAtomos()
const validAtomId = atoms.length > 0 ? atoms[0].herramientaId : ''

describe('claves-protomolecula', () => {
  describe('claveDeHerramienta', () => {
    it('should return null for empty id', () => {
      expect(claveDeHerramienta('')).toBeNull()
      expect(claveDeHerramienta(' ')).toBeNull() // espacios
      expect(claveDeHerramienta(null as any)).toBeNull()
      expect(claveDeHerramienta(undefined as any)).toBeNull()
    })

    it('should return null for invalid tool id', () => {
      expect(claveDeHerramienta('invalid-tool-id')).toBeNull()
    })

    it('should return a valid key for a known tool id', () => {
      // Sabemos que el id de herramienta que obtuvimos del catálogo es válido
      const clave = claveDeHerramienta(validToolId)
      expect(clave).toBe(`herramienta:${validToolId}`)
    })
  })

  describe('claveDeAtomo', () => {
    it('should return null for empty id', () => {
      expect(claveDeAtomo('')).toBeNull()
      expect(claveDeAtomo(null as any)).toBeNull()
      expect(claveDeAtomo(undefined as any)).toBeNull()
    })

    it('should return null for invalid atom id', () => {
      expect(claveDeAtomo('invalid-atom-id')).toBeNull()
    })

    it('should return a valid key for a known atom id', () => {
      // Si tenemos un id de átomo válido del registro, lo probamos
      if (validAtomId) {
        const clave = claveDeAtomo(validAtomId)
        expect(clave).toBe(`atomo:${validAtomId}`)
      } else {
        // Si no hay átomos en el registro, esperamos null para cualquier id
        expect(claveDeAtomo('some-id')).toBeNull()
      }
    })
  })

  describe('claveDeMolecula', () => {
    it('should return null for empty id', () => {
      expect(claveDeMolecula('')).toBeNull()
      expect(claveDeMolecula(null as any)).toBeNull()
      expect(claveDeMolecula(undefined as any)).toBeNull()
    })

    it('should return null for id not found in catalog or registry', () => {
      expect(claveDeMolecula('totally-fake-id')).toBeNull()
    })

    it('should return a valid key for id found in tool catalog', () => {
      // Usando un id de herramienta válido del catálogo
      const clave = claveDeMolecula(validToolId)
      expect(clave).toBe(`molecula:${validToolId}`)
    })

    it('should return a valid key for id found in atom registry', () => {
      // Si tenemos un id de átomo válido del registro, lo probamos
      if (validAtomId) {
        const clave = claveDeMolecula(validAtomId)
        expect(clave).toBe(`molecula:${validAtomId}`)
      } else {
        // Si no hay átomos en el registro, esperamos null para cualquier id (ya que tampoco estará en el catálogo? pero tenemos el catálogo de herramientas)
        // En realidad, si el registro de átomos está vacío, todavía tenemos el catálogo de herramientas, así que ya lo probamos.
        // Entonces podemos omitir esta prueba o simplemente esperar null para un id falso.
        expect(claveDeMolecula('fake-id')).toBeNull()
      }
    })
  })

  describe('atributosClave', () => {
    it('should return null for invalid clave format', () => {
      expect(atributosClave('')).toBeNull()
      expect(atributosClave('widgetclima')).toBeNull() // falta :
      expect(atributosClave('widget:')).toBeNull() // falta id
      expect(atributosClave(':clima')).toBeNull() // falta familia
      expect(atributosClave('widget clima')).toBeNull() // espacio en lugar de :
      expect(atributosClave('WIDGET:clima')).toBeNull() // mayúsculas no permitidas
      expect(atributosClave('widget:cl ima')).toBeNull() // espacio en id
      expect(atributosClave('widget:clima#')).toBeNull() // parte vacía
    })

    it('should return the attribute object for a valid clave', () => {
      const clave = 'herramienta:photocraft'
      const result = atributosClave(clave)
      expect(result).toEqual({ 'data-ss-elemento': clave })
    })

    it('should return the attribute object for a valid clave with parte', () => {
      const clave = 'herramienta:photocraft#parte1'
      const result = atributosClave(clave)
      expect(result).toEqual({ 'data-ss-elemento': clave })
    })
  })
})