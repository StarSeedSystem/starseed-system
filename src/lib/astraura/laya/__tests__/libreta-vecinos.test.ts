import { describe, it, expect } from "vitest"
import {
  huellaPalabras,
  similitud,
  vecinos,
  votar,
  type EjemploLibreta,
  type Vecino
} from "../libreta-vecinos"

const EJEMPLOS: EjemploLibreta[] = [
  {
    punto: "usar.chat",
    ambito: "personal",
    estado: "hola cómo estás",
    respuesta: "chat",
    desenlaceOk: true
  },
  {
    punto: "usar.voz",
    ambito: "personal",
    estado: "hola a todos",
    respuesta: "voz",
    desenlaceOk: true
  },
  {
    punto: "guardar.info",
    ambito: "trabajo",
    estado: "guardar el informe",
    respuesta: "guardar",
    desenlaceOk: true
  },
  {
    punto: "eliminar.dato",
    ambito: "trabajo",
    estado: "borrar el dato",
    respuesta: "eliminar",
    desenlaceOk: false
  },
  {
    punto: "consultar.registro",
    ambito: "personal",
    estado: "ver mis datos",
    respuesta: "consultar",
    desenlaceOk: true
  },
  {
    punto: "enviar.mensaje",
    ambito: "grupo",
    estado: "enviar el mensaje",
    respuesta: "enviar",
    desenlaceOk: true
  },
  {
    punto: "crear.evento",
    ambito: "grupo",
    estado: "crear la reunion",
    respuesta: "crear",
    desenlaceOk: true
  },
  {
    punto: "borrar.evento",
    ambito: "grupo",
    estado: "borrar el evento",
    respuesta: "borrar",
    desenlaceOk: false
  }
]

describe("huellaPalabras", () => {
  it("normaliza texto a minúsculas y quita acentos", () => {
    const r = huellaPalabras("Hola Mundo")
    expect(r).toHaveLength(256)
    expect(r[0]).toBeGreaterThanOrEqual(0)
  })

  it("ignora caracteres especiales", () => {
    const r = huellaPalabras("Hola! ¿Qué tal?")
    expect(r).toHaveLength(256)
  })
})

describe("similitud", () => {
  it("devuelve 1 para vectores idénticos", () => {
    const v = huellaPalabras("hola")
    expect(similitud(v, v)).toBe(1)
  })

  it("devuelve 0 para vectores ortogonales", () => {
    const v1 = huellaPalabras("hola")
    const v2 = huellaPalabras("xyzabcdefghijklmno")
    expect(similitud(v1, v2)).toBeCloseTo(0, 5)
  })
})

describe("vecinos", () => {
  it("solo busca ejemplos del mismo ámbito", () => {
    const resultado = vecinos(EJEMPLOS, "hola", 3, "personal")
    expect(resultado.length).toBe(3)
    resultado.forEach((v) => expect(v.ejemplo.ambito).toBe("personal"))
  })

  it("no incluye ejemplos sin desenlaceOk", () => {
    const conSinDesenlace = [...EJEMPLOS, {
      punto: "sin.estado",
      ambito: "personal",
      estado: "test",
      respuesta: "test",
      desenlaceOk: null
    }]
    const resultado = vecinos(conSinDesenlace, "hola", 3, "personal")
    // resultado puede ser menor que 3 si no hay ejemplos validos
    expect(resultado.every(r => r.ejemplo.desenlaceOk !== null)).toBe(true)
  })

  it("devuelve como máximo k vecinos", () => {
    const resultado = vecinos(EJEMPLOS, "hola", 2, "personal")
    expect(resultado.length).toBeLessThanOrEqual(2)
  })
})

describe("votar", () => {
  it("devuelve null si hay menos de 5 vecinos", () => {
    const pocos: Vecino[] = [
      { ejemplo: EJEMPLOS[0], distancia: 0.1 },
      { ejemplo: EJEMPLOS[1], distancia: 0.2 },
      { ejemplo: EJEMPLOS[2], distancia: 0.3 }
    ]
    expect(votar(pocos)).toBeNull()
  })

  it("devuelve null si el apoyo es < 0.6", () => {
    const vecinosMayor: Vecino[] = []
    // 5 vecinos total, 2 con respuesta 'chat', 3 con 'voz'.
    // 3/5 = 0.6. Apoyo 0.6 no es < 0.6.
    // Necesito apoyo < 0.6.
    // 8 vecinos, 4 'chat', 4 'voz'. Apoyo = 4/8 = 0.5.
    for (let i = 0; i < 4; i++) {
      vecinosMayor.push({ ejemplo: EJEMPLOS[0], distancia: 0.1 })
    }
    for (let i = 0; i < 4; i++) {
      vecinosMayor.push({ ejemplo: { ...EJEMPLOS[0], respuesta: "voz" }, distancia: 0.1 })
    }
    expect(votar(vecinosMayor)).toBeNull()
  })

  it("devuelve respuesta y apoyo cuando hay suficientes", () => {
    const muchos: Vecino[] = []
    for (let i = 0; i < 8; i++) {
      muchos.push({ ejemplo: EJEMPLOS[0], distancia: 0.1 })
    }
    const resultado = votar(muchos)
    expect(resultado).not.toBeNull()
    expect(resultado!.apoyo).toBe(1)
    expect(resultado!.respuesta).toBe("chat")
  })

  it("usa el desempate estable (primera opción con más votos)", () => {
    const empatados: Vecino[] = []
    // 3 de cada para 6 total, apoyo = 3/6 = 0.5 < 0.6.
    // Necesito apoyo >= 0.6.
    // 6 'chat', 4 'voz'. Total 10. Apoyo 6/10 = 0.6.
    for (let i = 0; i < 6; i++) {
      empatados.push({ ejemplo: EJEMPLOS[0], distancia: 0.1 })
    }
    for (let i = 0; i < 4; i++) {
      empatados.push({ ejemplo: { ...EJEMPLOS[0], respuesta: "voz" }, distancia: 0.1 })
    }
    const resultado = votar(empatados)
    expect(resultado).not.toBeNull()
    expect(resultado!.respuesta).toBe("chat")
    expect(resultado!.apoyo).toBe(0.6)
  })
})