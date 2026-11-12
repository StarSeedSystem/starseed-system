/**
 * LLA1112B · la cámara elegida en vivo se mide: sin imagen no se queda, se vuelve a la anterior y se dice con palabras;
 * una virtual con imagen vale solo para esta llamada; la buena se queda y es la predeterminada.
 */
import { describe, expect, it, vi } from "vitest";
import { AdaptadorMotor, type DepsAdaptador } from "../adaptador-motor";
import { avisoCamaraVirtual, decidirImagen, textoCamaraFallida, type ResultadoImagen } from "../prueba-camara";
import { ENTORNO_ESCRITORIO, MotorFalso, vaciar } from "./motor-falso";

describe("decidirImagen (pura)", () => {
  it("espera mientras no hay veredicto y el plazo no se agotó", () => {
    expect(decidirImagen({ cuadros: 0, brillos: [], terminada: false, agotado: false })).toBeNull();
    expect(decidirImagen({ cuadros: 5, brillos: [1, 2], terminada: false, agotado: false })).toBeNull();
  });
  it("imagen usable: dos cuadros y al menos uno no negro", () => {
    expect(decidirImagen({ cuadros: 2, brillos: [0, 60], terminada: false, agotado: false })).toMatchObject({ ok: true });
  });
  it("agotado sin cuadros → sin-cuadros; con cuadros solo negros → negra; terminada → terminada", () => {
    expect(decidirImagen({ cuadros: 0, brillos: [], terminada: false, agotado: true })).toMatchObject({ ok: false, motivo: "sin-cuadros" });
    expect(decidirImagen({ cuadros: 1, brillos: [30], terminada: false, agotado: true })).toMatchObject({ ok: false, motivo: "sin-cuadros" });
    expect(decidirImagen({ cuadros: 40, brillos: [0, 1, 2, 3], terminada: false, agotado: true })).toMatchObject({ ok: false, motivo: "negra" });
    expect(decidirImagen({ cuadros: 0, brillos: [], terminada: true, agotado: false })).toMatchObject({ ok: false, motivo: "terminada" });
  });
  it("los textos dicen cuál falló, por qué y a cuál se vuelve", () => {
    expect(textoCamaraFallida("Cámara del iPhone (Continuidad)", "sin-cuadros", "Cámara de esta Mac")).toBe("La cámara «Cámara del iPhone (Continuidad)» no da imagen (en 4 s no llegó ningún cuadro; si es la del iPhone, acércalo y desbloquéalo). Sigues con «Cámara de esta Mac».");
    expect(textoCamaraFallida("X", "negra", null)).toBe("La cámara «X» solo da imagen negra (está tapada, apagada o sin fuente).");
    expect(avisoCamaraVirtual("OBS", "Cámara de esta Mac")).toMatch(/no puede saber si es la tuya o una tarjeta de espera.*no queda como predeterminada/);
  });
});

function montar(prueba: (id: string) => ResultadoImagen, pref: { id: string; etiqueta: string } | null = { id: "ft", etiqueta: "FaceTime HD Camera" }) {
  const m = new MotorFalso("yo", "Yo");
  m.camara = true;
  const pista = { label: "x", readyState: "live", muted: false } as unknown as MediaStreamTrack;
  const flujo = { getVideoTracks: () => [pista], getTracks: () => [pista], getAudioTracks: () => [] } as unknown as MediaStream;
  const base = m.estado();
  const ponerCamara = (id: string) =>
    m.poner({
      camara: true,
      dispositivos: { microfonos: [], altavoces: [], camaras: [{ id: "ft", nombre: "FaceTime HD Camera" }, { id: "dv", nombre: "iPhone de X Desk View Camera" }, { id: "obs", nombre: "OBS Virtual Camera" }, { id: "br", nombre: "Brio 4K" }] },
      seleccion: { microId: null, camaraId: id, altavozId: null },
      participantes: base.participantes.map((p) => (p.yo ? { ...p, camara: true, stream: flujo } : p)),
    });
  ponerCamara("ft");
  let ultima = "ft";
  (m.cambiarCamara as unknown as { mockImplementation: (f: (id: string) => Promise<string | null>) => void }).mockImplementation(async (id: string) => {
    m.llamadas.push(`cambiarCamara:${id}`);
    ultima = id;
    if (m.errores[id]) return m.errores[id];
    ponerCamara(id);
    return null;
  });
  const guardadas: Array<{ id: string; etiqueta: string } | null> = [];
  const lineas: string[] = [];
  const deps: Partial<DepsAdaptador> = {
    preferenciaCamara: () => pref,
    guardarPreferenciaCamara: (p) => void guardadas.push(p),
    probarImagen: async () => prueba(ultima),
    anotar: (l) => void lineas.push(l),
  };
  const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, ...deps });
  return { m, ad, guardadas, lineas };
}

describe("elegir cámara en vivo (LLA1112B)", () => {
  it("sin cuadros: vuelve a la anterior, deja la predeterminada como estaba y lo dice", async () => {
    const { m, ad, guardadas, lineas } = montar(() => ({ ok: false, motivo: "sin-cuadros", cuadros: 0, brillo: null }));
    ad.acciones.elegirCamara?.("dv");
    await vaciar(30);
    expect(m.llamadas.filter((l) => l.startsWith("cambiarCamara"))).toEqual(["cambiarCamara:dv", "cambiarCamara:ft"]);
    expect(guardadas).toEqual([{ id: "ft", etiqueta: "FaceTime HD Camera" }]);
    expect(ad.vista().aviso).toMatch(/^La cámara «Vista de escritorio del iPhone \(Continuidad\)» no da imagen .* Sigues con «Cámara de .*»\.$/);
    expect(lineas.some((l) => /selector-sin-imagen .* motivo=sin-cuadros/.test(l))).toBe(true);
    expect(lineas.some((l) => /selector-vuelve/.test(l))).toBe(true);
    ad.destruir();
  });
  it("solo negra: lo mismo con su texto", async () => {
    const { ad } = montar(() => ({ ok: false, motivo: "negra", cuadros: 30, brillo: 0 }));
    ad.acciones.elegirCamara?.("dv");
    await vaciar(30);
    expect(ad.vista().aviso).toMatch(/solo da imagen negra/);
    ad.destruir();
  });
  it("si volver a la anterior también falla, lo dice", async () => {
    const { m, ad } = montar(() => ({ ok: false, motivo: "sin-cuadros", cuadros: 0, brillo: null }));
    m.errores.ft = "La cámara está ocupada.";
    ad.acciones.elegirCamara?.("dv");
    await vaciar(30);
    expect(ad.vista().aviso).toMatch(/No se pudo volver a ella: La cámara está ocupada\./);
    ad.destruir();
  });
  it("virtual con imagen: se queda esta llamada, NO se guarda como predeterminada y avisa de lo que no se puede saber", async () => {
    const { m, ad, guardadas } = montar(() => ({ ok: true, cuadros: 30, brillo: 90 }));
    ad.acciones.elegirCamara?.("obs");
    await vaciar(30);
    expect(m.llamadas.filter((l) => l.startsWith("cambiarCamara"))).toEqual(["cambiarCamara:obs"]);
    expect(guardadas).toEqual([{ id: "ft", etiqueta: "FaceTime HD Camera" }]);
    expect(ad.vista().aviso).toMatch(/es una cámara virtual: da imagen, pero la ventana no puede saber/);
    ad.destruir();
  });
  it("sin predeterminada previa, restaurar es «ninguna»", async () => {
    const { guardadas, ad } = montar(() => ({ ok: true, cuadros: 30, brillo: 90 }), null);
    ad.acciones.elegirCamara?.("obs");
    await vaciar(30);
    expect(guardadas).toEqual([null]);
    ad.destruir();
  });
  it("cámara buena: se queda, sin aviso ni restauración", async () => {
    const { m, ad, guardadas } = montar(() => ({ ok: true, cuadros: 30, brillo: 90 }));
    ad.acciones.elegirCamara?.("br");
    await vaciar(30);
    expect(m.llamadas.filter((l) => l.startsWith("cambiarCamara"))).toEqual(["cambiarCamara:br"]);
    expect(guardadas).toEqual([]);
    expect(ad.vista().aviso ?? null).toBeNull();
    ad.destruir();
  });
  it("con la cámara apagada solo se apunta (se medirá al encenderla)", async () => {
    const probar = vi.fn();
    const { m, ad } = montar(() => ({ ok: true, cuadros: 1, brillo: 1 }));
    m.poner({ camara: false });
    (ad as unknown as { deps: DepsAdaptador }).deps.probarImagen = probar;
    ad.acciones.elegirCamara?.("dv");
    await vaciar(30);
    expect(probar).not.toHaveBeenCalled();
    ad.destruir();
  });
});
