import { describe, it, expect } from 'vitest'
import { estadoCreditos, resumenCredito, textoExtras, DocCreditos, MedidorCredito } from '../creditos-pago'

describe('creditos-pago',()=>{
  const ahora=Date.parse('2026-10-06T18:05:00-06:00')
  it('ordena claude codex resto tonos obsoleto',()=>{
    const doc:DocCreditos={ version:1, t:'2026-10-06T18:05:00-06:00', medidores:{
      codex:{id:'codex',proveedor:'openai',nombre:'ChatGPT · Codex',tipo:'plan',plan:'plus',
        ventanas:[{id:'5h',etiqueta:'5 horas',usado_pct:0,reinicia:'2026-10-06T22:58:40-06:00'},
                 {id:'semana',etiqueta:'Semana',usado_pct:100,reinicia:'2026-10-09T22:12:51-06:00'}],
        saldo:{valor:0,unidad:'créditos'},extras:{bloqueado:'rate_limit_reached',uso_normal:false,reinicios_gratis:1,reinicio_gratis_vence:'2026-10-29T12:10:00-06:00'},
        leido:'2026-10-06T17:00:00-06:00',ok:true},
      claude:{id:'claude',proveedor:'anthropic',nombre:'Claude · plan',tipo:'plan',plan:'suscripción',
        ventanas:[{id:'sesion',etiqueta:'Sesión (5 h)',usado_pct:23,reinicia:'2026-10-06T18:10:00-06:00'},
                 {id:'semana',etiqueta:'Semana (todos los modelos)',usado_pct:41,reinicia:'2026-10-10T04:00:00-06:00'}],
        saldo:null,extras:{},leido:'2026-10-06T16:00:00-06:00',ok:true},
      otro:{id:'otro',proveedor:'x',nombre:'Otro',tipo:'plan',ventanas:[],saldo:{valor:7.5,unidad:'USD'},leido:'2026-10-06T17:50:00-06:00',ok:true}
    }}
    const res=estadoCreditos(doc,ahora)
    expect(res.length).toBe(3)
    expect(res[0].id).toBe('claude')
    expect(res[1].id).toBe('codex')
    expect(res[2].id).toBe('otro')
    const claude=res[0]
    expect(claude.tono).toBe('aviso'); expect(claude.obsoleto).toBe(true); expect(claude.haceMin!).toBeGreaterThan(45)
    const codex=res[1]
    expect(codex.tono).toBe('peligro')
    expect(codex.ventanas.find(v=>v.id==='semana')?.tono).toBe('peligro')
    expect(codex.textoExtras).toContain('bloqueado: rate_limit_reached')
    expect(codex.textoExtras).toContain('uso normal cortado')
    expect(codex.textoExtras.some(t=>t.includes('reinicio gratis'))).toBe(true)
    const otro=res[2]
    expect(otro.resumen).toContain('saldo'); expect(otro.resumen).toContain('USD')
  })
  it('ventana reiniciada',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{claude:{id:'claude',proveedor:'anthropic',nombre:'C',tipo:'plan',
      ventanas:[{id:'sesion',etiqueta:'Sesión',usado_pct:90,reinicia:'2026-10-06T17:00:00-06:00'}],
      saldo:null,leido:'2026-10-06T18:04:00-06:00',ok:true}}}
    const v=estadoCreditos(doc,ahora)[0].ventanas[0]
    expect(v.reiniciada).toBe(true); expect(v.usado_pct).toBe(0); expect(v.tono).toBe('ok')
  })
  it('null devuelve vacío',()=>{ expect(estadoCreditos(null,ahora)).toEqual([]) })
  it('resumenCredito formatos',()=>{
    const m:MedidorCredito={id:'x',proveedor:'p',nombre:'N',tipo:'plan',ventanas:[{id:'semana',etiqueta:'Semana',usado_pct:41,reinicia:'2026-10-09T04:00:00-06:00'}],saldo:null}
    expect(resumenCredito(m)).toMatch(/41 % semana · reinicia/)
  })
  it('textoExtras',()=>{
    const m:MedidorCredito={id:'x',proveedor:'p',nombre:'N',tipo:'plan',ventanas:[],saldo:null,extras:{reinicios_gratis:1,reinicio_gratis_vence:'2026-10-29T12:10:00-06:00',bloqueado:'rate_limit_reached',uso_normal:false}}
    const ext=textoExtras(m)
    expect(ext).toContain('bloqueado: rate_limit_reached'); expect(ext).toContain('uso normal cortado'); expect(ext.some(s=>s.includes('reinicio gratis'))).toBe(true)
  })
  it('resumen con ventana reiniciada cuenta como 0 %',()=>{
    const m:MedidorCredito={id:'claude',proveedor:'anthropic',nombre:'Claude · plan',tipo:'plan',ventanas:[{id:'sesion',etiqueta:'Sesión',usado_pct:90,reinicia:'2026-10-06T17:00:00-06:00'}],saldo:null}
    const r=estadoCreditos({version:1,t:'',medidores:{claude:m}},ahora)
    expect(r[0].resumen).toContain('0 %'); expect(r[0].ventanas[0].usado_pct).toBe(0)
  })
  it('resumenCredito acepta ahora opcional y ajusta',()=>{
    const m:MedidorCredito={id:'x',proveedor:'p',nombre:'N',tipo:'plan',ventanas:[{id:'semana',etiqueta:'Semana',usado_pct:41,reinicia:'2026-10-09T04:00:00-06:00'}],saldo:null}
    expect(resumenCredito(m,ahora)).toMatch(/41 % semana · reinicia/)
    const pasado=Date.parse('2026-10-10T10:00:00-06:00')
    expect(resumenCredito(m,pasado)).toMatch(/0 % semana · reinicia/)
  })
  it('reinicia nulo o no fecha válida: sin texto reinicia y minutosParaReinicio null',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{claude:{id:'claude',proveedor:'a',nombre:'C',tipo:'plan',ventanas:[{id:'semana',etiqueta:'Semana',usado_pct:30,reinicia:null}],saldo:null,leido:'2026-10-06T16:00:00-06:00',ok:true}}}
    const r=estadoCreditos(doc,ahora)
    const v=r[0].ventanas[0]
    expect(v.reinicia).toBeNull(); expect(v.reiniciada).toBe(false); expect(v.minutosParaReinicio).toBeNull()
    expect(r[0].resumen).not.toContain('reinicia')
  })
  it('reinicia no fecha válida también da null',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{claude:{id:'claude',proveedor:'a',nombre:'C',tipo:'plan',ventanas:[{id:'semana',etiqueta:'Semana',usado_pct:30,reinicia:'no-fecha'}],saldo:null,leido:'2026-10-06T16:00:00-06:00',ok:true}}}
    const r=estadoCreditos(doc,ahora)
    const v=r[0].ventanas[0]
    expect(v.reinicia).toBe('no-fecha'); expect(v.reiniciada).toBe(false); expect(v.minutosParaReinicio).toBeNull()
  })
  it('medidor ok:false sin ventanas ni saldo tiene tono aviso y resumen sin lectura',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{x:{id:'x',proveedor:'p',nombre:'X',tipo:'plan',ventanas:[],saldo:null,leido:'2026-10-06T16:00:00-06:00',ok:false}}}
    const r=estadoCreditos(doc,ahora)
    expect(r[0].tono).toBe('aviso'); expect(r[0].resumen).toBe('sin lectura')
  })
  it('medidor con error añade textoExtras',()=>{
    const m:MedidorCredito={id:'y',proveedor:'p',nombre:'Y',tipo:'plan',ventanas:[],saldo:null,error:'falló lectura',ok:false}
    expect(textoExtras(m)).toContain('error: falló lectura')
  })
  it('defensa: ventanas no lista se trata como vacío y sin nombre usa id',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{a:{id:'a',proveedor:'p',tipo:'plan',ventanas:'no-lista' as unknown as unknown[]}}}
    const r=estadoCreditos(doc,ahora)
    expect(r[0].ventanas).toEqual([])
    const doc2:DocCreditos={version:1,t:'',medidores:{b:{id:'b',proveedor:'p',tipo:'plan',nombre:undefined as unknown as string}}}
    const r2=estadoCreditos(doc2,ahora)
    expect(r2[0].nombre).toBe('b')
  })
  it('defensa: medidor mínimo {id, ok:false, error} no lanza',()=>{
    const doc:DocCreditos={version:1,t:'',medidores:{min:{id:'min',proveedor:'p',tipo:'plan',ventanas:undefined,saldo:null,ok:false,error:'nulo'}}}
    const r=estadoCreditos(doc,ahora)
    expect(r[0].id).toBe('min'); expect(r[0].tono).toBe('aviso'); expect(r[0].resumen).toBe('sin lectura'); expect(r[0].textoExtras).toContain('error: nulo')
  })
})
