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
  // Revisión MC1007Fb (§3, §4.3 de architecture/medidores-credito.md)
  it('el resumen usa las ventanas ya ajustadas: una semana reiniciada no sigue diciendo 100 %',()=>{
    const m:MedidorCredito={id:'codex',proveedor:'openai',nombre:'ChatGPT · Codex',tipo:'plan',saldo:null,
      ventanas:[{id:'5h',etiqueta:'5 horas',usado_pct:12,reinicia:'2026-10-06T22:58:40-06:00'},
               {id:'semana',etiqueta:'Semana',usado_pct:100,reinicia:'2026-10-06T17:00:00-06:00'}],
      leido:'2026-10-06T18:00:00-06:00',ok:true}
    const e=estadoCreditos({version:1,t:'',medidores:{codex:m}},ahora)[0]
    expect(e.resumen).toMatch(/^12 % 5h · reinicia /)
    expect(resumenCredito(m,ahora)).toBe(e.resumen)
    expect(resumenCredito(m)).toMatch(/^100 % semana · reinicia /)
    const soloSemana={...m,ventanas:[m.ventanas[1]]}
    expect(resumenCredito(soloSemana,ahora)).toBe('0 % semana')
  })
  it('reinicia nulo o inválido: sin «reinicia» en el resumen y minutosParaReinicio null',()=>{
    const m:MedidorCredito={id:'api',proveedor:'x',nombre:'API',tipo:'api',saldo:null,
      ventanas:[{id:'mes',etiqueta:'Mes',usado_pct:30,reinicia:null},{id:'dia',etiqueta:'Día',usado_pct:10,reinicia:'no-es-fecha'}],
      leido:'2026-10-06T18:00:00-06:00',ok:true}
    const e=estadoCreditos({version:1,t:'',medidores:{api:m}},ahora)[0]
    expect(e.resumen).toBe('30 % mes')
    expect(e.ventanas.map(v=>v.minutosParaReinicio)).toEqual([null,null])
    expect(e.ventanas[0].reinicia).toBeNull()
  })
  it('ok:false sin ventanas ni saldo: tono aviso, «sin lectura» y el error corto en extras',()=>{
    const m={id:'roto',ok:false,error:'claude /usage no respondió en 30 s'} as unknown as MedidorCredito
    const [e]=estadoCreditos({version:1,t:'',medidores:{roto:m}},ahora)
    expect(e.tono).toBe('aviso')
    expect(e.resumen).toBe('sin lectura')
    expect(e.nombre).toBe('roto')
    expect(e.ventanas).toEqual([])
    expect(e.textoExtras).toContain('error: claude /usage no respondió en 30 s')
    const largo=textoExtras({...m,error:'x'.repeat(200)})
    expect(largo[largo.length-1].length).toBeLessThanOrEqual(7+80)
  })
  it('datos incompletos nunca lanzan: ventanas que no son lista cuentan como []',()=>{
    const m={id:'raro',proveedor:'x',tipo:'plan',ventanas:'??',saldo:null,ok:true,leido:'2026-10-06T18:00:00-06:00'} as unknown as MedidorCredito
    expect(()=>estadoCreditos({version:1,t:'',medidores:{raro:m}},ahora)).not.toThrow()
    expect(resumenCredito(m,ahora)).toBe('sin lectura')
  })
})
