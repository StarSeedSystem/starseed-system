import { describe, it, expect } from 'vitest'
import {
  construirUrlCancel,
  construirUrlPrepareUpload,
  construirUrlRegister,
  construirUrlUpload,
  ofertaDesdeLocalSend,
  archivoParaLocalSend,
  parseLocalSendAnuncio,
  parseLocalSendPrepareUploadResp,
  type LocalSendAnuncio,
} from '../protocolo'
import type { MsgOferta } from '@/lib/network/archivos-malla'

describe('LocalSend protocolo v2', () => {
  it('parsea anuncio válido', () => {
    const a: LocalSendAnuncio = {
      alias: 'MiPC',
      version: '2.0',
      deviceModel: 'PC',
      deviceType: 'desktop',
      fingerprint: 'abc123',
      port: 53317,
      protocol: 'http',
      download: true,
      announce: true,
    }
    expect(parseLocalSendAnuncio(a)).toEqual(a)
  })

  it('rechaza anuncio mal formado', () => {
    expect(parseLocalSendAnuncio(null)).toBeNull()
    expect(parseLocalSendAnuncio({ version: '1.0' })).toBeNull()
    expect(parseLocalSendAnuncio({ version: '2.0', alias: '' })).toBeNull()
  })

  it('construye URLs con URLSearchParams', () => {
    expect(construirUrlRegister('http://192.168.1.10:53317')).toContain('/api/localsend/v2/register')
    expect(construirUrlPrepareUpload('http://x:53317/')).toContain('/api/localsend/v2/prepare-upload')
    const u = construirUrlUpload('http://x:53317', 's1', 'f1', 't1', '1234')
    expect(u).toContain('sessionId=s1')
    expect(u).toContain('fileId=f1')
    expect(u).toContain('token=t1')
    expect(u).toContain('pin=1234')
    const c = construirUrlCancel('http://x:53317', 's2')
    expect(c).toContain('/api/localsend/v2/cancel')
    expect(c).toContain('sessionId=s2')
  })

  it('parsea prepare-upload respuesta válida', () => {
    const r = parseLocalSendPrepareUploadResp({ sessionId: 's1', files: { f1: { token: 'tok' } } })
    expect(r?.sessionId).toBe('s1')
    expect(r?.files.f1.token).toBe('tok')
  })

  it('rechaza prepare-upload mal formada', () => {
    expect(parseLocalSendPrepareUploadResp({})).toBeNull()
    expect(parseLocalSendPrepareUploadResp({ sessionId: 's1', files: {} })).not.toBeNull() // vacío sí válido según forma
    expect(parseLocalSendPrepareUploadResp({ sessionId: 's1', files: { f1: {} } })).toBeNull()
  })

  it('convierte ida y vuelta LocalSend <-> MsgOferta', () => {
    const prep = { info: { alias: 'Otro' }, files: { f1: { id: 'f1', fileName: 'test.txt', size: 123, fileType: 'text/plain', sha256: 'abc' } } }
    const ofertas = ofertaDesdeLocalSend(prep, 'Otro')
    expect(ofertas.length).toBe(1)
    const o = ofertas[0] as MsgOferta
    expect(o.t).toBe('archivo.oferta')
    expect(o.nombre).toBe('test.txt')
    expect(o.sha256).toBe('abc')
    const back = archivoParaLocalSend(o)
    expect(back?.id).toBe('f1')
    expect(back?.fileName).toBe('test.txt')
  })
})
