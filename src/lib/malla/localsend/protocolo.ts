export interface LocalSendArchivoPrep {
  id: string
  fileName: string
  size: number
  fileType: string
  sha256?: string
  preview?: string
}

export interface LocalSendPrepareUploadReq {
  info?: LocalSendInfo
  files: Record<string, LocalSendArchivoPrep>
}

export interface LocalSendPrepareUploadResp {
  sessionId: string
  files: Record<string, { token: string }>
}

export function parseLocalSendPrepareUploadResp(x: unknown): LocalSendPrepareUploadResp | null {
  if (!esObjeto(x)) return null
  if (typeof x.sessionId !== 'string' || !x.sessionId) return null
  if (!esObjeto(x.files)) return null
  const out: Record<string, { token: string }> = {}
  for (const k of Object.keys(x.files)) {
    const v = (x.files as Record<string, unknown>)[k]
    if (!esObjeto(v)) return null
    if (typeof v.token !== 'string' || !v.token) return null
    out[k] = { token: v.token }
  }
  return { sessionId: x.sessionId, files: out }
}

export function ofertaDesdeLocalSend(
  ls: { files: Record<string, LocalSendArchivoPrep>; info?: LocalSendInfo; sessionId?: string },
  origen?: string,
): MsgOferta[] {
  const res: MsgOferta[] = []
  for (const id of Object.keys(ls.files)) {
    const f = ls.files[id]
    if (!f) continue
    if (typeof f.id !== 'string' || !f.id) continue
    if (typeof f.fileName !== 'string' || !f.fileName) continue
    if (typeof f.size !== 'number') continue
    if (typeof f.fileType !== 'string') continue
    const sha256 = typeof f.sha256 === 'string' && f.sha256 ? f.sha256 : ''
    res.push({
      t: 'archivo.oferta',
      id: f.id,
      nombre: f.fileName,
      tipo: f.fileType,
      tamano: f.size,
      sha256,
      trozos: 0,
      tamanoTrozo: 0,
      destino: { tipo: 'dispositivo' },
      origen: origen || ls.info?.alias,
    })
  }
  return res
}

export function archivoParaLocalSend(oferta: MsgOferta): LocalSendArchivoPrep | null {
  if (!oferta || oferta.t !== 'archivo.oferta') return null
  if (typeof oferta.id !== 'string' || !oferta.id) return null
  if (typeof oferta.nombre !== 'string' || !oferta.nombre) return null
  if (typeof oferta.tamano !== 'number') return null
  if (typeof oferta.tipo !== 'string') return null
  const out: LocalSendArchivoPrep = {
    id: oferta.id,
    fileName: oferta.nombre,
    size: oferta.tamano,
    fileType: oferta.tipo,
  }
  if (oferta.sha256) out.sha256 = oferta.sha256
  return out
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object'
}

export function parseLocalSendAnuncio(x: unknown): LocalSendAnuncio | null {
  if (!esObjeto(x)) return null
  if (x.version !== '2.0') return null
  if (typeof x.alias !== 'string' || !x.alias) return null
  if (typeof x.deviceModel !== 'string' || !x.deviceModel) return null
  if (typeof x.deviceType !== 'string') return null
  const dt = x.deviceType as string
  if (!['desktop', 'mobile', 'web', 'headless', 'server'].includes(dt)) return null
  if (typeof x.fingerprint !== 'string' || !x.fingerprint) return null
  if (typeof x.port !== 'number' || x.port <= 0) return null
  if (x.protocol !== 'http' && x.protocol !== 'https') return null
  if (typeof x.download !== 'boolean') return null
  if (typeof x.announce !== 'boolean') return null
  return {
    alias: x.alias,
    version: '2.0',
    deviceModel: x.deviceModel,
    deviceType: dt as LocalSendDeviceType,
    fingerprint: x.fingerprint,
    port: x.port,
    protocol: x.protocol,
    download: x.download,
    announce: x.announce,
  }
}

export function construirUrlRegister(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/localsend/v2/register'
  }
  return url.toString()
}

export function construirUrlPrepareUpload(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/localsend/v2/prepare-upload'
  }
  return url.toString()
}

export function construirUrlUpload(baseUrl: string, sessionId: string, fileId: string, token: string, pin?: string): string {
  const url = new URL(baseUrl)
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/localsend/v2/upload'
  }
  const params = new URLSearchParams()
  params.set('sessionId', sessionId)
  params.set('fileId', fileId)
  params.set('token', token)
  if (pin) params.set('pin', pin)
  url.search = params.toString()
  return url.toString()
}

export function construirUrlCancel(baseUrl: string, sessionId: string): string {
  const url = new URL(baseUrl)
  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/api/localsend/v2/cancel'
  }
  const params = new URLSearchParams()
  params.set('sessionId', sessionId)
  url.search = params.toString()
  return url.toString()
}