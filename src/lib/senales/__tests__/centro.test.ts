import { describe, expect, it } from "vitest";
import { DEFAULT_MESH_PRIVACY, type MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { NOMBRE_NEURONA_POR_DEFECTO, construirCentro } from "../centro";
import {
  LIMITE_AVATAR_3D_BYTES, avatarDeCache, avatarUrlSegura, decidirAvatar, iniciales, perfilDesdeCuenta, type PerfilCentro,
} from "../perfil-centro";
import type { EntradaYo, MedioMapa } from "../tipos-vivo";

const perfil = (o: Partial<PerfilCentro> = {}): PerfilCentro => ({
  nombre: "Alex Bordón", usuario: "maggasukha", fotoUrl: "https://cdn.example.org/alex.jpg", avatar3dUrl: null, avatar3dBytes: null, ...o,
});
const MODELO = "https://cdn.example.org/alex.glb";
const abierto = { ligero: false, reducido: false };

describe("avatarUrlSegura", () => {
  it("acepta https público y rutas del propio sitio", () => {
    expect(avatarUrlSegura("https://cdn.example.org/a.png")).toBe("https://cdn.example.org/a.png");
    expect(avatarUrlSegura("/avatares/a.png")).toBe("/avatares/a.png");
  });
  it("rechaza lo que sondearía tu red o ejecutaría código", () => {
    for (const mala of [
      "javascript:alert(1)", "data:image/png;base64,AAAA", "http://cdn.example.org/a.png", "//evil.example/a.png",
      "https://localhost/a.png", "https://192.168.1.5/a.png", "https://10.0.0.2/a.png", "https://127.0.0.1/a.png",
      "https://169.254.169.254/latest", "https://[::1]/a.png", "https://user:pass@cdn.example.org/a.png", "no es una url", "", null, undefined, 7,
      `https://cdn.example.org/${"x".repeat(400)}`,
    ]) expect(avatarUrlSegura(mala as unknown)).toBeNull();
  });
});

describe("decidirAvatar: foto, avatar 3D o iniciales, siempre con su porqué", () => {
  it("sin perfil: iniciales", () => {
    expect(decidirAvatar(null, abierto)).toMatchObject({ modo: "iniciales", url: null });
  });
  it("con foto y sin modelo: la foto como cartel", () => {
    expect(decidirAvatar(perfil(), abierto)).toMatchObject({ modo: "foto", url: "https://cdn.example.org/alex.jpg" });
  });
  it("sin foto ni modelo: iniciales", () => {
    expect(decidirAvatar(perfil({ fotoUrl: null }), abierto).modo).toBe("iniciales");
  });
  it("el avatar 3D solo si pesa poco y el peso se midió", () => {
    const ok = decidirAvatar(perfil({ avatar3dUrl: MODELO, avatar3dBytes: 800_000 }), abierto);
    expect(ok).toMatchObject({ modo: "avatar3d", url: MODELO });
    expect(ok.motivo).toContain("800 KB");
  });
  it("pesado → foto, y lo dice", () => {
    const d = decidirAvatar(perfil({ avatar3dUrl: MODELO, avatar3dBytes: LIMITE_AVATAR_3D_BYTES + 1 }), abierto);
    expect(d.modo).toBe("foto");
    expect(d.motivo).toMatch(/pesa 1,5 MB|pesa 1,6 MB/);
  });
  it("peso sin medir → foto (nunca se supone que es ligero)", () => {
    const d = decidirAvatar(perfil({ avatar3dUrl: MODELO, avatar3dBytes: null }), abierto);
    expect(d.modo).toBe("foto");
    expect(d.motivo).toContain("no se pudo medir");
  });
  it("modo ligero o movimiento reducido → foto aunque el modelo sea liviano", () => {
    const p = perfil({ avatar3dUrl: MODELO, avatar3dBytes: 100_000 });
    expect(decidirAvatar(p, { ligero: true, reducido: false }).modo).toBe("foto");
    expect(decidirAvatar(p, { ligero: false, reducido: true }).modo).toBe("foto");
  });
  it("un archivo que no es GLB/glTF no se carga", () => {
    expect(decidirAvatar(perfil({ avatar3dUrl: "https://cdn.example.org/a.fbx", avatar3dBytes: 10 }), abierto).modo).toBe("foto");
  });
  it("modelo pesado y sin foto → iniciales", () => {
    expect(decidirAvatar(perfil({ fotoUrl: null, avatar3dUrl: MODELO, avatar3dBytes: 9_000_000 }), abierto).modo).toBe("iniciales");
  });
});

describe("perfilDesdeCuenta", () => {
  it("la faceta activa manda en nombre y foto; el avatar 3D sale de la cuenta", () => {
    const p = perfilDesdeCuenta(
      { display_name: "Cuenta", avatar_url: "https://cdn.example.org/cuenta.jpg", avatar_3d: { url: MODELO } },
      { name: "Faceta", handle: "faceta", avatarUrl: "https://cdn.example.org/faceta.jpg" },
      900_000,
    );
    expect(p).toMatchObject({ nombre: "Faceta", usuario: "faceta", fotoUrl: "https://cdn.example.org/faceta.jpg", avatar3dUrl: MODELO, avatar3dBytes: 900_000 });
  });
  it("sin foto en la faceta usa la de la cuenta; una dirección mala no pasa", () => {
    expect(perfilDesdeCuenta({ handle: "x", avatar_url: "https://cdn.example.org/c.jpg" }, { name: "F", avatarUrl: null })?.fotoUrl).toBe("https://cdn.example.org/c.jpg");
    expect(perfilDesdeCuenta({ handle: "x", avatar_url: "javascript:1" }, null)?.fotoUrl).toBeNull();
  });
  it("sin nada, null", () => {
    expect(perfilDesdeCuenta(null, null)).toBeNull();
  });
  it("avatarDeCache lee la foto de la copia local y tolera basura", () => {
    expect(avatarDeCache(JSON.stringify({ userId: "u", profile: { avatar_url: "https://cdn.example.org/a.jpg" } }))).toBe("https://cdn.example.org/a.jpg");
    expect(avatarDeCache("{no es json")).toBeNull();
    expect(avatarDeCache(null)).toBeNull();
    expect(avatarDeCache(JSON.stringify({ profile: { avatar_url: "http://inseguro.example/a.jpg" } }))).toBeNull();
  });
  it("iniciales", () => {
    expect(iniciales("Alex Bordón")).toBe("AB");
    expect(iniciales("Maggasukha")).toBe("MA");
    expect(iniciales("")).toBe("SS");
  });
});

const yo = (o: Partial<EntradaYo> = {}): EntradaYo => ({
  neuronaId: "n1", nombre: "Mac de Alex", plataforma: "desktop",
  medio: { id: "m1", tipo: "local", etiqueta: "Chrome 154 · localhost:9002" }, senales: null,
  radio: { estado: "sin-radio", transporte: null, nodos: 0, region: null, gps: false, simulador: false }, ...o,
});
const medioPropio = { id: "medio:m2", m: "m2", neuronaId: "n1", padreId: "yo", propio: true } as unknown as MedioMapa;
const medioAjeno = { id: "medio:m3", m: "m3", neuronaId: "n2", padreId: "neuron:n2", propio: false } as unknown as MedioMapa;
const base = (o: Partial<Parameters<typeof construirCentro>[0]> = {}): Parameters<typeof construirCentro>[0] => ({
  yo: yo(), perfil: perfil(), medios: [], senalesOidas: 3, senalesCompartidas: 0,
  privacidad: DEFAULT_MESH_PRIVACY, internetPublico: true, ligero: false, reducido: false, ...o,
});

describe("construirCentro", () => {
  it("nombre de la neurona, perfil, medios abiertos y señales: todo con su fuente", () => {
    const c = construirCentro(base({ medios: [medioPropio, medioAjeno] }));
    expect(c.nombreNeurona).toBe("Mac de Alex");
    expect(c.nombrePerfil).toBe("Alex Bordón");
    expect(c.mediosAbiertos).toBe(2); // este medio + uno más abierto en este aparato (el de otro aparato no cuenta)
    const por = (e: string) => c.datos.find((d) => d.etiqueta === e)!;
    expect(por("Medios abiertos en este aparato")).toMatchObject({ valor: "2 medios", estado: "medido" });
    expect(por("Señales que oye este medio")).toMatchObject({ valor: "3", estado: "medido" });
    expect(por("Perfil activo").valor).toBe("Alex Bordón · @maggasukha");
    for (const d of c.datos) expect(d.fuente.length).toBeGreaterThan(5);
  });
  it("lo que falta se llama «no medido» con su motivo, nunca un número inventado", () => {
    const c = construirCentro(base({ yo: yo({ nombre: "", plataforma: undefined, medio: null }), perfil: null }));
    expect(c.nombreNeurona).toBe(NOMBRE_NEURONA_POR_DEFECTO);
    expect(c.sinNombre).toBe(true);
    const nm = c.datos.filter((d) => d.estado === "no-medido").map((d) => d.etiqueta);
    expect(nm).toEqual(expect.arrayContaining(["Nombre de la neurona", "Perfil activo", "Aparato", "Medios abiertos en este aparato"]));
    for (const d of c.datos.filter((x) => x.estado === "no-medido")) { expect(d.valor).toBe("no medido"); expect(d.nota).toBeTruthy(); }
  });
  it("el nombre recién editado manda sobre el del registro", () => {
    expect(construirCentro(base({ nombreLocal: "Mac de casa" })).nombreNeurona).toBe("Mac de casa");
  });
  it("la imagen del centro sigue la decisión del avatar", () => {
    const c = construirCentro(base({ perfil: perfil({ avatar3dUrl: MODELO, avatar3dBytes: 500_000 }) }));
    expect(c.avatar.modo).toBe("avatar3d");
    expect(construirCentro(base({ perfil: perfil({ avatar3dUrl: MODELO, avatar3dBytes: 500_000 }), ligero: true })).avatar.modo).toBe("foto");
  });
  it("el radar público refleja la privacidad de la malla", () => {
    const visible: MeshPrivacySettings = { ...DEFAULT_MESH_PRIVACY, publicRadar: "visible", shareAvatar: true };
    const c = construirCentro(base({ privacidad: visible }));
    expect(c.radar.emision).toBe("publica");
    expect(c.datos.find((d) => d.etiqueta === "Foto del perfil")?.valor).toBe("se ve");
    expect(construirCentro(base()).radar.emision).toBe("anonima");
  });
});
