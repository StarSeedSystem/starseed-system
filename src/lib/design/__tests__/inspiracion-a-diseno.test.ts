import { describe, it, expect } from "vitest"
import { briefDesdeReferencias, validarResultado, type ReferenciaBrief, type ObjetivoDiseno } from "../inspiracion-a-diseno"

/* RFI1018G — de referencia a diseño propio: brief para el Director de diseño */

const refMenu: ReferenciaBrief = {
  id: "navbar-gallery",
  nombre: "Navbar Gallery",
  url: "https://navbargallery.com",
  que_es: "Galería de navegaciones superiores con sus bloques y apoyos."
}

describe("briefDesdeReferencias", () => {
  it("devuelve un brief con nombre nuevo, objetivo, patrón, tokens y créditos", () => {
    const brief = briefDesdeReferencias({ referencias: [refMenu], objetivo: "menu", adn: { nombre: "Aurora" } })
    expect(brief.nombre).toBe("Faro de Aurora")
    expect(brief.patron.estructura).toBeTruthy()
    expect(brief.patron.jerarquia).toBeTruthy()
    expect(brief.patron.ritmo).toBeTruthy()
    expect(brief.patron.movimiento.duracionMs).toBeGreaterThan(0)
    expect(brief.patron.tipografia).toBeTruthy()
    expect(brief.creditos).toEqual([{ nombre: "Navbar Gallery", url: "https://navbargallery.com" }])
    expect(brief.texto).toContain("«Faro de Aurora»")
  })

  it("cada objetivo lleva su nombre de pieza propio y queda en el brief", () => {
    const piezas: Array<[ObjetivoDiseno, string]> = [["boton", "Pulso"], ["transicion", "Puente"], ["animacion", "Latido"], ["seccion", "Umbral"], ["pagina", "Marco"], ["marca", "Sello"], ["escena3d", "Cámara"], ["xr", "Presencia"]]
    for (const [objetivo, pieza] of piezas) {
      const brief = briefDesdeReferencias({ referencias: [], objetivo })
      expect(brief.nombre).toContain(pieza)
      expect(brief.objetivo).toBe(objetivo)
    }
  })

  it("sin tokens del contexto usa el tema Trinity del OS; con tokens, los lleva encima", () => {
    expect(Object.values(briefDesdeReferencias({ referencias: [], objetivo: "boton" }).tokens)).toContain("#007FFF")
    const brief = briefDesdeReferencias({ referencias: [], objetivo: "boton", contexto: { tipo: "pizarra", tokens: { tinta: "#1E293B", papel: "#F8FAFC" } } })
    expect(brief.tokens).toEqual({ tinta: "#1E293B", papel: "#F8FAFC" })
  })

  it("el movimiento varía con el registro del ADN: sobrio es suave y sin resorte; experimental alarga", () => {
    const sobrio = briefDesdeReferencias({ referencias: [], objetivo: "boton", adn: { registro: "sobrio" } })
    expect(sobrio.patron.movimiento.duracionMs).toBe(90)
    expect(sobrio.patron.movimiento.curva).toBe("cubic-bezier(0.4, 0, 0.2, 1)")
    expect(sobrio.patron.movimiento.resorte).toContain("sobriedad")
    const experimental = briefDesdeReferencias({ referencias: [], objetivo: "menu", adn: { registro: "experimental" } })
    expect(experimental.patron.movimiento.duracionMs).toBe(Math.round(150 * 1.5))
  })

  it("la tipografía sale del ADN cuando lo dice", () => {
    const patron = briefDesdeReferencias({ referencias: [], objetivo: "pagina", adn: { tipografia: "Atkinson para el cuerpo y Space Grotesk para el titular" } }).patron
    expect(patron.tipografia).toContain("Atkinson")
  })

  it("incluye hasta tres principios como reglas de la casa, en ambas formas", () => {
    const brief = briefDesdeReferencias({ referencias: [], objetivo: "seccion", principios: ["Marco el foco antes del contenido", { titulo: "Una acción por pantalla" }, "Testigo del contexto", "Cuarto no entra"] })
    expect(brief.texto).toContain("Reglas de la casa:")
    expect(brief.texto).toContain("· Marco el foco antes del contenido")
    expect(brief.texto).toContain("· Una acción por pantalla")
    expect(brief.texto).toContain("· Testigo del contexto")
    expect(brief.texto).not.toContain("Cuarto no entra")
  })

  it("cita cada referencia en los créditos, con apoyos por si faltan campos", () => {
    const brief = briefDesdeReferencias({ referencias: [{ id: "sin-nombre" }, { nombre: "60fps", enlaces: [{ titulo: "Principal", url: "https://60fps.design" }] }], objetivo: "animacion" })
    expect(brief.creditos[0]).toEqual({ nombre: "sin-nombre", url: "(sin enlace citado)" })
    expect(brief.creditos[1]).toEqual({ nombre: "60fps", url: "https://60fps.design" })
  })

  it("el texto dice qué se estudia y que nada se copia; no pasa del tope", () => {
    const brief = briefDesdeReferencias({ referencias: [refMenu], objetivo: "menu" })
    expect(brief.texto).toContain("Qué se estudia")
    expect(brief.texto).toContain(refMenu.que_es)
    expect(brief.texto).toContain("inspiración citada, diseño propio")
    expect(brief.texto).toContain("nada se copia")
    const repetidas = briefDesdeReferencias({ referencias: [refMenu, refMenu, refMenu, refMenu], objetivo: "xr" })
    expect(repetidas.texto.length).toBeLessThanOrEqual(2500)
  })
})
describe("validarResultado", () => {
  const propio = "Faro de la sesión con las filas marcadas por una línea guía y los accesos en cascada."

  it("acepta un diseño propio sin rastro de la referencia", () => {
    expect(validarResultado(propio, [refMenu])).toEqual({ ok: true })
  })

  it("rechaza una frase copiada de más de 8 palabras seguidas", () => {
    const frase = "galería de navegaciones superiores con sus bloques y apoyos"
    expect(frase.trim().split(/\s+/)).toHaveLength(9)
    const verificación = validarResultado(`${propio} Tomamos ${frase} tal cual vino.`, [refMenu])
    expect(verificación.ok).toBe(false)
    if (!verificación.ok) expect(verificación.motivos[0]).toContain("Texto copiado")
  })

  it("acepta 8 palabras que coincidan por azar", () => {
    const fraseCorta = "de navegaciones superiores con sus bloques y apoyos"
    expect(fraseCorta.trim().split(/\s+/)).toHaveLength(8)
    expect(validarResultado(`${propio} hacia lo ${fraseCorta}.`, [refMenu])).toEqual({ ok: true })
  })

  it("la comparación baja mayúsculas y suelta signos antes de mirar la frase", () => {
    const verificación = validarResultado("Galería de navegaciones superiores con sus bloques, y apoyos ¡ahí!", [refMenu])
    expect(verificación.ok).toBe(false)
  })

  it("rechaza assets de terceros y la portada (logo) de la referencia", () => {
    const conAsset = validarResultado(`${propio} <img src="https://cdn.ejemplo.com/isotipo.png">`, [refMenu])
    expect(conAsset.ok).toBe(false)
    if (!conAsset.ok) expect(conAsset.motivos[0]).toContain("Asset de tercero")
    const conPortada: ReferenciaBrief = { ...refMenu, og_imagen: "https://navbargallery.com/og/" }
    const verificación = validarResultado(`${propio} https://navbargallery.com/og/captura`, [conPortada])
    expect(verificación.ok).toBe(false)
    if (!verificación.ok) expect(verificación.motivos[0]).toContain("Portada (logo) de la referencia")
  })

  it("acepta assets del propio OS y enlaces de texto sin extensión de asset", () => {
    expect(validarResultado(`${propio} <img src="https://starseed-os.vercel.app/imagenes/faro.png">`, [refMenu])).toEqual({ ok: true })
    expect(validarResultado(`${propio} Fuente de estudio: https://navbargallery.com/menus/`, [refMenu])).toEqual({ ok: true })
  })
})
