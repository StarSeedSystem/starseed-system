import { describe, it, expect, beforeEach } from 'vitest'
import {
    abrirEdicion,
    paqueteEnEdicion,
    anadirPendiente,
    pendientes,
    traducir,
    completadas,
    cerrarEdicion,
    publicarBorrador,
    establecerAlmacen,
    almacenDefault,
} from '../editor'

// Helper to create a reproducible almanac state
function crearAlmacen(pendientes: string[] = [], traducciones: Record<string, string> = {}) {
    return {
        ...almacenDefault,
        abierta: true,
        codigo: 'cod-1',
        nombre: 'Nombre',
        pendientes,
        traducciones,
    }
}

describe('Editor', () => {
    beforeEach(() => {
        cerrarEdicion()
        abrirEdicion('cod-1', 'Nombre')
    })

    it('añade un pendiente correcto', () => {
        anadirPendiente('hola')
        expect(pendientes()).toContain('hola')
    })

    it('ignora duplicados', () => {
        anadirPendiente('hola')
        anadirPendiente('hola')
        expect(pendientes()).toHaveLength(1)
    })

    it('ignora texto > 500 caracteres', () => {
        const largo = 'a'.repeat(501)
        anadirPendiente(largo)
        expect(pendientes()).not.toContain(largo)
    })

    it('limita a 2000 pendientes', () => {
        for (let i = 0; i < 2000; i++) {
            anadirPendiente(`t${i}`)
        }
        expect(pendientes()).toHaveLength(2000)
        anadirPendiente('extra')
        expect(pendientes()).toHaveLength(2000)
    })

    it('traducir agrega traducción', () => {
        traducir('clave', 'valor')
        expect(completadas()).toHaveProperty('clave', 'valor')
    })

    it('publicarBorrador devuelve solo entradas traducidas', async () => {
        anadirPendiente('pendiente1')
        traducir('clave1', 'val1')
        const paquete = publicarBorrador()
        expect(paquete).not.toBeNull()
        if (paquete) {
            expect(Object.keys(paquete.entradas)).toHaveLength(1)
            expect(paquete.entradas['clave1']).toBe('val1')
        }
    })

    it('publicarBorrador devuelve null si no hay traducciones', () => {
        expect(publicarBorrador()).toBeNull()
    })

    it('revisado.estado es automatico en paquete', () => {
        traducir('k', 'v')
        const paquete = publicarBorrador()
        expect(paquete?.revisado.estado).toBe('automatico')
    })

    it('se reinicia al cerrar y abrir de nuevo', () => {
        anadirPendiente('t1')
        cerrarEdicion()
        abrirEdicion('cod-1', 'Nombre')
        expect(pendientes()).toHaveLength(0)
        expect(paqueteEnEdicion()).toBe(true)
    })

    it('recupera estado tras reload con almacén falso', () => {
        const estado = crearAlmacen(['verbad'], {'cl': 'val'})
        establecerAlmacen(estado)
        expect(paqueteEnEdicion()).toBe(true)
        expect(pendientes()).toContain('verbad')
        expect(completadas()).toHaveProperty('cl', 'val')
    })
})
