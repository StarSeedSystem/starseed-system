import { describe, it, expect } from 'vitest'
import {
  validarPunto,
  ordenesMontaje,
  ordenDesmontar,
  type Sistema,
  type TipoOrigen,
  type Origen,
} from '../montaje'

describe('validarPunto', () => {
  it('devuelve true para un punto válido sin ..', () => {
    expect(validarPunto('/home/user/mount')).toBe(true)
    expect(validarPunto('/mnt/data')).toBe(true)
  })

  it('devuelve false para punto vacío o solo espacios', () => {
    expect(validarPunto('')).toBe(false)
    expect(validarPunto('   ')).toBe(false)
  })

  it('devuelve false si contiene ..', () => {
    expect(validarPunto('/home/user/../mount')).toBe(false)
    expect(validarPunto('/home/..')).toBe(false)
    expect(validarPunto('..')).toBe(false)
  })
})

describe('ordenesMontaje', () => {
  const puntoValido = '/home/user/mount'
  const recurso = 'http://example.com/dav'

  const origenWebdav: Origen = { tipo: 'webdav', url: recurso }
  const origenRclone: Origen = { tipo: 'rclone', url: recurso }

  it('devuelve órdenes vacías para punto inválido', () => {
    expect(ordenesMontaje({ sistema: 'macos', origen: origenWebdav, punto: '../invalid', soloLectura: false })).toEqual([])
    expect(ordenesMontaje({ sistema: 'windows', origen: origenWebdav, punto: '', soloLectura: false })).toEqual([])
    expect(ordenesMontaje({ sistema: 'linux', origen: origenWebdav, punto: '..', soloLectura: false })).toEqual([])
  })

  it('devuelve órdenes vacías si falta recurso', () => {
    expect(
      ordenesMontaje({
        sistema: 'macos',
        origen: { tipo: 'webdav' },
        punto: puntoValido,
        soloLectura: false,
      })
    ).toEqual([])
  })

  describe('macos', () => {
    it('devuelve orden para webdav sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'macos',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['mount_webdav', recurso, puntoValido])
      expect(result[0].texto).toBe(`mount_webdav ${recurso} ${puntoValido}`)
    })

    it('devuelve orden para webdav con solo lectura (ignorado, sin bandera)', () => {
      const result = ordenesMontaje({
        sistema: 'macos',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['mount_webdav', recurso, puntoValido])
      expect(result[0].texto).toBe(`mount_webdav ${recurso} ${puntoValido}`)
    })

    it('devuelve orden para rclone sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'macos',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['rclone', 'nfsmount', recurso, puntoValido, '--vfs-cache-mode', 'full'])
      expect(result[0].texto).toBe(`rclone nfsmount ${recurso} ${puntoValido} --vfs-cache-mode full`)
    })

    it('devuelve orden para rclone con solo lectura (añade --read-only)', () => {
      const result = ordenesMontaje({
        sistema: 'macos',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual([
        'rclone',
        'nfsmount',
        recurso,
        puntoValido,
        '--vfs-cache-mode',
        'full',
        '--read-only',
      ])
      expect(result[0].texto).toBe(
        `rclone nfsmount ${recurso} ${puntoValido} --vfs-cache-mode full --read-only`
      )
    })
  })

  describe('windows', () => {
    it('devuelve orden para webdav sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'windows',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['net use', puntoValido, recurso])
      expect(result[0].texto).toBe(`net use ${puntoValido} ${recurso}`)
    })

    it('devuelve orden para webdav con solo lectura (ignorado, sin bandera)', () => {
      const result = ordenesMontaje({
        sistema: 'windows',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['net use', puntoValido, recurso])
      expect(result[0].texto).toBe(`net use ${puntoValido} ${recurso}`)
    })

    it('devuelve orden para rclone sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'windows',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['rclone', 'mount', recurso, puntoValido, '--vfs-cache-mode', 'full'])
      expect(result[0].texto).toBe(`rclone mount ${recurso} ${puntoValido} --vfs-cache-mode full`)
    })

    it('devuelve orden para rclone con solo lectura (añade --read-only)', () => {
      const result = ordenesMontaje({
        sistema: 'windows',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual([
        'rclone',
        'mount',
        recurso,
        puntoValido,
        '--vfs-cache-mode',
        'full',
        '--read-only',
      ])
      expect(result[0].texto).toBe(
        `rclone mount ${recurso} ${puntoValido} --vfs-cache-mode full --read-only`
      )
    })
  })

  describe('linux', () => {
    it('devuelve orden para webdav (davfs2) sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'linux',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['mount', '-t', 'davfs', recurso, puntoValido])
      expect(result[0].texto).toBe(`mount -t davfs ${recurso} ${puntoValido}`)
    })

    it('devuelve orden para webdav (davfs2) con solo lectura (añade -o ro)', () => {
      const result = ordenesMontaje({
        sistema: 'linux',
        origen: origenWebdav,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['mount', '-t', 'davfs', '-o', 'ro', recurso, puntoValido])
      expect(result[0].texto).toBe(`mount -t davfs -o ro ${recurso} ${puntoValido}`)
    })

    it('devuelve orden para rclone sin solo lectura', () => {
      const result = ordenesMontaje({
        sistema: 'linux',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: false,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual(['rclone', 'mount', recurso, puntoValido, '--vfs-cache-mode', 'full'])
      expect(result[0].texto).toBe(`rclone mount ${recurso} ${puntoValido} --vfs-cache-mode full`)
    })

    it('devuelve orden para rclone con solo lectura (añade --read-only)', () => {
      const result = ordenesMontaje({
        sistema: 'linux',
        origen: origenRclone,
        punto: puntoValido,
        soloLectura: true,
      })
      expect(result.length).toBe(1)
      expect(result[0].args).toEqual([
        'rclone',
        'mount',
        recurso,
        puntoValido,
        '--vfs-cache-mode',
        'full',
        '--read-only',
      ])
      expect(result[0].texto).toBe(
        `rclone mount ${recurso} ${puntoValido} --vfs-cache-mode full --read-only`
      )
    })
  })
})

describe('ordenDesmontar', () => {
  const puntoValido = '/home/user/mount'

  it('devuelve null para punto inválido', () => {
    expect(ordenDesmontar({ sistema: 'macos', punto: '../invalid' })).toBeNull()
    expect(ordenDesmontar({ sistema: 'windows', punto: '' })).toBeNull()
    expect(ordenDesmontar({ sistema: 'linux', punto: '..' })).toBeNull()
  })

  it('devuelve orden de desmontaje para macos', () => {
    const result = ordenDesmontar({ sistema: 'macos', punto: puntoValido })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.args).toEqual(['umount', puntoValido])
      expect(result.texto).toBe(`umount ${puntoValido}`)
    }
  })

  it('devuelve orden de desmontaje para linux', () => {
    const result = ordenDesmontar({ sistema: 'linux', punto: puntoValido })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.args).toEqual(['umount', puntoValido])
      expect(result.texto).toBe(`umount ${puntoValido}`)
    }
  })

  it('devuelve orden de desmontaje para windows', () => {
    const result = ordenDesmontar({ sistema: 'windows', punto: puntoValido })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.args).toEqual(['net use', puntoValido, '/delete'])
      expect(result.texto).toBe(`net use ${puntoValido} /delete`)
    }
  })
})