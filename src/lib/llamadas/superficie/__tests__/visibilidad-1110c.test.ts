/**
 * LLA1110C · telemetría de visibilidad (pura) y el lienzo del vídeo ligero cuando WebRTC trae una pista muda.
 */
import { describe, expect, it } from "vitest";
import { lineaVisibilidad, motivoInvisible, describirElemento, type DatosVisibilidad } from "../visibilidad";
import { AdaptadorMotor, pistaTraeImagen, streamTraeVideo, textoListaCamaras } from "../adaptador-motor";
import { describirCamaras } from "@/lib/llamadas/camaras";
import { MotorFalso, ENTORNO_ESCRITORIO, vaciar } from "./motor-falso";

const VISTO: DatosVisibilidad = { conectado: true, ancho: 438, alto: 246, display: "block", visibility: "visible", opacidad: 1, arriba: true, tapa: null, brillo: 87 };

describe("líneas de visibilidad", () => {
  it("una línea por mosaico, corta y con todo lo que hace falta", () => {
    const l = lineaVisibilidad("lienzo", "remoto", VISTO, { lienzo: { w: 160, h: 120 } });
    expect(l).toBe("visibilidad lienzo=remoto doc=si caja=438x246 display=block vis=visible op=1 arriba=si brillo=87 lienzo=160x120");
    const v = lineaVisibilidad("video", "remoto", { ...VISTO, arriba: false, tapa: "div.absolute.inset-0" }, { video: { listo: 4, ancho: 640, alto: 480, pausado: false, pistas: ["v:live/on/muda"] } });
    expect(v).toContain("arriba=no tapa=div.absolute.inset-0");
    expect(v).toContain("pistas=v:live/on/muda");
    expect(v.length).toBeLessThanOrEqual(195);
  });

  it("dice por qué no se vería", () => {
    expect(motivoInvisible(VISTO)).toBeNull();
    expect(motivoInvisible({ ...VISTO, conectado: false })).toBe("no está en el documento");
    expect(motivoInvisible({ ...VISTO, ancho: 0 })).toBe("no tiene tamaño");
    expect(motivoInvisible({ ...VISTO, opacidad: 0 })).toBe("está oculto");
    expect(motivoInvisible({ ...VISTO, arriba: false, tapa: "div.x" })).toBe("lo tapa div.x");
    expect(motivoInvisible({ ...VISTO, brillo: 0 })).toBe("se ve negro");
    expect(motivoInvisible(VISTO, { listo: 4, ancho: 640, alto: 480, pausado: false, pistas: ["v:live/on/muda"] })).toMatch(/no trae imagen/);
    expect(describirElemento(null)).toBe("nada");
  });
});

/** Pista y flujo mínimos (jsdom no tiene MediaStream). */
function flujo(pistas: Array<{ readyState: "live" | "ended"; muted: boolean }>) {
  return { id: "f", getVideoTracks: () => pistas, getAudioTracks: () => [], getTracks: () => pistas } as unknown as MediaStream;
}

describe("vídeo remoto: nunca un <video> negro encima del lienzo (LLA1110C)", () => {
  it("una pista muda o terminada no trae imagen", () => {
    expect(pistaTraeImagen({ readyState: "live", muted: false })).toBe(true);
    expect(pistaTraeImagen({ readyState: "live", muted: true })).toBe(false);
    expect(streamTraeVideo(flujo([{ readyState: "live", muted: true }]))).toBe(false);
    expect(streamTraeVideo(null)).toBe(false);
  });

  it("con el vídeo ligero recibiendo y la pista WebRTC muda, el foco enseña el lienzo", async () => {
    const lienzo = { soy: "lienzo" } as unknown as HTMLCanvasElement;
    const m = new MotorFalso("yo", "Yo");
    const base = m.estado();
    const otro = { ...base.participantes[0], id: "otro", nombre: "Otra", yo: false, camara: true, stream: flujo([{ readyState: "live", muted: true }]), lienzo: null };
    m.poner({ participantes: [base.participantes[0], otro], medio: { tipo: "enlace-datos", texto: "Voz por enlace de datos · cifrada", cifrada: true }, videoDatos: { disponible: true, enviando: false, recibiendo: true, calidadTexto: "160×120", nivel: "mala" } });
    const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, lienzoLigero: () => lienzo });
    await vaciar();
    expect(ad.vista().remotoLienzo).toBe(lienzo);
    expect(ad.vista().participantes?.find((p) => p.id === "otro")?.lienzo).toBe(lienzo);
    // Si la pista WebRTC trae imagen de verdad, se usa ella (no el lienzo).
    m.poner({ participantes: [base.participantes[0], { ...otro, stream: flujo([{ readyState: "live", muted: false }]) }], videoDatos: { disponible: true, enviando: false, recibiendo: true, calidadTexto: null, nivel: null } });
    await vaciar();
    expect(ad.vista().remotoLienzo).toBeNull();
    ad.destruir();
  });

  it("(LLA1111H) lo que cuenta el <video> del foco llega al motor con el id de ESE par", async () => {
    const m = new MotorFalso("yo", "Yo");
    const base = m.estado();
    const otro = { ...base.participantes[0], id: "otro", nombre: "Otra", yo: false, camara: true, stream: flujo([{ readyState: "live", muted: true }]), lienzo: null };
    m.poner({ participantes: [base.participantes[0], otro] });
    const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO });
    await vaciar();
    ad.vista();
    ad.acciones.videoWebPinta?.(false);
    ad.acciones.videoWebPinta?.(null);
    expect(m.llamadas).toEqual(expect.arrayContaining(["videoWebPinta:otro:false", "videoWebPinta:otro:null"]));
    ad.destruir();
  });

  it("lista de cámaras para el registro: tipo y nombre, corta", () => {
    const t = textoListaCamaras(describirCamaras([{ id: "a", nombre: "FaceTime HD Camera" }, { id: "b", nombre: "iPhone de X Desk View Camera" }, { id: "c", nombre: "Cámara 3" }]));
    expect(t.startsWith("integrada:FaceTime HD Camera|continuidad:iPhone de X Desk View Camera|sin-nombre:Cámara 3")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(120);
  });
});

describe("encender la cámara (LLA1110C)", () => {
  it("con etiquetas, pide la integrada antes de abrir y anota la lista, la elegida y las restricciones", async () => {
    const m = new MotorFalso("yo", "Yo");
    m.poner({ dispositivos: { microfonos: [], altavoces: [], camaras: [{ id: "dv", nombre: "iPhone de X Desk View Camera" }, { id: "ft", nombre: "FaceTime HD Camera" }] }, seleccion: { microId: null, camaraId: null, altavozId: null } });
    const lineas: string[] = [];
    const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, anotar: (l) => lineas.push(l) });
    const err = await ad.encenderCamara();
    expect(err).toBeNull();
    expect(m.llamadas).toEqual(["cambiarCamara:ft", "camara"]);
    expect(lineas[0]).toMatch(/^camara pedida lista=continuidad:iPhone de X Desk View Camera\|integrada:FaceTime HD Camera elegir="FaceTime HD Camera" motivo=integrada restr=ideal=\d+x\d+@\d+,deviceId:exact$/);
    ad.destruir();
  });

  it("(LLA1111H) el registro no dice «facingMode» en el escritorio y sí en el teléfono, sin id de cámara", async () => {
    for (const [plataforma, esperado] of [["mac", /restr=ideal=\d+x\d+@\d+$/], ["android", /restr=ideal=\d+x\d+@\d+,facingMode:ideal=user$/]] as const) {
      const m = new MotorFalso("yo", "Yo");
      m.poner({ dispositivos: { microfonos: [], altavoces: [], camaras: [] }, seleccion: { microId: null, camaraId: null, altavozId: null } });
      const lineas: string[] = [];
      const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, anotar: (l) => lineas.push(l), plataforma: () => plataforma });
      await ad.encenderCamara();
      const l = lineas.find((x) => x.startsWith("camara pedida")) ?? "";
      expect(l, plataforma).toMatch(esperado);
      expect(l).not.toMatch(/facingMode-user|deviceId-exacto/);
      ad.destruir();
    }
  });

  it("si el aparato no abre la cámara, lo dice (y lo anota) en vez de callar", async () => {
    const m = new MotorFalso("yo", "Yo");
    m.errores.camara = "La cámara está ocupada por otra app.";
    const lineas: string[] = [];
    const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, anotar: (l) => lineas.push(l) });
    expect(await ad.encenderCamara()).toBe("La cámara está ocupada por otra app.");
    expect(lineas.some((l) => /^camara fallo ms=\d+ error="La cámara está ocupada/.test(l))).toBe(true);
    ad.destruir();
  });

  it("si el aparato no responde (se queda esperando a la cámara), avisa al pasar el plazo", async () => {
    const m = new MotorFalso("yo", "Yo");
    m.alternarCamara = () => new Promise<string | null>(() => undefined);
    const lineas: string[] = [];
    const ad = new AdaptadorMotor(m, { titulo: "Otra", unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, anotar: (l) => lineas.push(l), esperaCamaraMs: 30 });
    expect(await ad.encenderCamara()).toMatch(/^La cámara no responde/);
    expect(lineas.some((l) => l.startsWith("camara sin-respuesta al abrir ms=30"))).toBe(true);
    ad.destruir();
  });
});
