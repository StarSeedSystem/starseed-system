// ════════════════════════════════════════════════════════════════
// StarSeed OS — Escena 3D del símbolo oficial (ESC1110A)
// ----------------------------------------------------------------
// three.js puro (sin React): la usan el componente R3F del escritorio y
// el banco de pruebas que generó la imagen fija, así ambos pintan lo mismo.
//
// Modelo procedural a partir de `simbolo-starseed-medidas.ts`:
//   · dos discos satinados con bisel fino, plegados unos grados por el eje
//     vertical (la mitad derecha mira a la luz y sale más clara, como en el
//     arte plano); el inferior queda un poco detrás;
//   · el diamante como gema facetada real (seis facetas por mitad, cada una
//     un plano), en relieve sobre los discos;
//   · el ojo: almendra abombada con párpado gris, iris oscuro de brillo
//     húmedo y el brillo del diseño (emisivo: es parte de la marca y no
//     desaparece cuando se mueve la luz).
// Luz de tres puntos, entorno generado en código (RoomEnvironment + PMREM),
// sombras PCF suaves y una sombra de contacto bajo la pieza.
// Visto de frente coincide con la marca plana (IoU de silueta ≥ 0,97).
// ════════════════════════════════════════════════════════════════

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import { CIRCULOS, DIAMANTE, OJO, pxAModelo } from "./simbolo-starseed-medidas";

/** Parámetros de forma (en unidades del modelo: 1 = 1000 px). */
export const FORMA = {
    grosorDisco: 0.034,
    bisel: 0.007,
    plegado: THREE.MathUtils.degToRad(11),
    retrasoInferior: 0.012,
    relieveGema: 0.15,
    holguraOjo: 0.006,
    domoOjo: 0.035,
    parpado: 0.007,
    alturaIris: 0.04,
    sueloY: -0.82,
} as const;

/** Exposición del render (tone mapping neutro). */
export const EXPOSICION = 1;

/**
 * Albedos (uno por par de facetas, uno por disco): la luz real hace el tono «sombra» de
 * cada par. Calibrados en el banco de pruebas para que el render frontal reproduzca los
 * colores de la marca (Δ ≤ ~25/255 por canal y región; ver el informe de ESC1110A). Los
 * blancos, el gris del párpado, el iris y el disco claro son los colores de marca tal cual.
 */
export const COLOR_BASE = {
    discoSuperior: CIRCULOS.superior.claro,
    discoInferior: "#444648",
    rojo: "#FF5654",
    verde: "#53C445",
    amarillo: "#FFF954",
    azul: "#3032BD",
    blancoOjo: OJO.blanco,
    parpado: OJO.parpado.color,
    iris: OJO.iris.color,
} as const;

const R = CIRCULOS.superior.r / 1000;
const [, CY_SUP] = pxAModelo(CIRCULOS.superior.cx, CIRCULOS.superior.cy);
const [, CY_INF] = pxAModelo(CIRCULOS.inferior.cx, CIRCULOS.inferior.cy);
const MEDIO_ALTO_GEMA = pxAModelo(DIAMANTE.arriba.x, DIAMANTE.arriba.y)[1];
const CINTURA = DIAMANTE.cinturaPx.map((x) => (x - 500) / 1000);
const MEDIO_ANCHO_GEMA = CINTURA[CINTURA.length - 1];
/** Esquina de la almendra: donde se cortan los dos círculos. */
const ESQUINA_OJO = Math.sqrt(R * R - CY_SUP * CY_SUP);

/** z del frente del disco superior en x (pliegue en V, arista hacia delante). */
function zFrenteDisco(x: number, inferior = false): number {
    return -Math.abs(x) * Math.tan(FORMA.plegado) - (inferior ? FORMA.retrasoInferior : 0);
}

/** Perfil de la gema en la cintura (elipse), sobre el frente del disco. */
function zCinturaSuave(x: number): number {
    const t = Math.min(1, Math.abs(x) / Math.max(MEDIO_ANCHO_GEMA, ESQUINA_OJO));
    // |x| suavizado: el ojo no hereda el pliegue en V de los discos (y nunca queda por debajo de la gema).
    const absSuave = Math.sqrt(x * x + 0.0036) - 0.06;
    return -absSuave * Math.tan(FORMA.plegado) + 0.003 + FORMA.relieveGema * Math.sqrt(Math.max(0, 1 - t * t));
}

// ── Discos ───────────────────────────────────────────────────────
function geometriaDisco(cy: number, inferior: boolean): THREE.BufferGeometry {
    const b = FORMA.bisel;
    const g = FORMA.grosorDisco;
    // Perfil (radio, z) de centro delantero a centro trasero, con bisel redondeado.
    const perfil: THREE.Vector2[] = [];
    const anillos = 18;
    for (let i = 0; i <= anillos; i++) perfil.push(new THREE.Vector2(((R - b) * i) / anillos, 0));
    for (let i = 1; i <= 6; i++) {
        const a = (i / 6) * (Math.PI / 2);
        perfil.push(new THREE.Vector2(R - b + Math.sin(a) * b, -b + Math.cos(a) * b));
    }
    for (let i = 1; i <= 6; i++) {
        const a = (i / 6) * (Math.PI / 2);
        perfil.push(new THREE.Vector2(R - b + Math.cos(a) * b, -(g - b) - Math.sin(a) * b));
    }
    perfil.push(new THREE.Vector2(0, -g));
    // Lathe gira alrededor de Y: el perfil (r, y=z). 128 segmentos: hay vértices justo en x = 0.
    const geo = new THREE.LatheGeometry(perfil, 128);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // (x, y, z) del torno → (x, cy + z, y) del modelo.
        const x = v.x;
        const yModelo = cy + v.z;
        const z = v.y + zFrenteDisco(x, inferior);
        pos.setXYZ(i, x, yModelo, z);
    }
    geo.computeVertexNormals();
    return geo;
}

// ── Gema facetada ────────────────────────────────────────────────
function geometriaGema(mitad: "arriba" | "abajo"): THREE.BufferGeometry {
    const signo = mitad === "arriba" ? 1 : -1;
    const apice = new THREE.Vector3(0, signo * MEDIO_ALTO_GEMA, zFrenteDisco(0, mitad === "abajo") + 0.001);
    const cintura = CINTURA.map((x) => {
        const t = Math.abs(x) / MEDIO_ANCHO_GEMA;
        const z = zFrenteDisco(x) + 0.003 + FORMA.relieveGema * Math.sqrt(Math.max(0, 1 - t * t));
        return new THREE.Vector3(x, 0, z);
    });
    const posiciones: number[] = [];
    const grupos: Array<[number, number]> = [];
    for (let i = 0; i < cintura.length - 1; i++) {
        const a = cintura[i];
        const b = cintura[i + 1];
        // Orden antihorario visto desde delante.
        // Antihorario visto de frente (normal hacia +z): arriba (a, b, ápice), abajo (b, a, ápice).
        for (const p of signo > 0 ? [a, b, apice] : [b, a, apice]) posiciones.push(p.x, p.y, p.z);
        grupos.push([i * 3, 3]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(posiciones, 3));
    geo.computeVertexNormals(); // no indexada: una normal plana por faceta
    // Material por faceta: 0 rojo, 1 color central, 2 azul.
    const indiceMaterial = [0, 0, 1, 1, 2, 2];
    grupos.forEach(([inicio, cuenta], i) => geo.addGroup(inicio, cuenta, indiceMaterial[i]));
    return geo;
}

// ── Ojo ──────────────────────────────────────────────────────────
function arcosOjo(x: number): { abajo: number; arriba: number; parpado: number } {
    const h = Math.sqrt(Math.max(0, R * R - x * x));
    const arriba = CY_INF + h; // borde superior de la almendra = círculo inferior
    const abajo = CY_SUP - h; // borde inferior = círculo superior
    const [, cyP] = pxAModelo(OJO.parpado.cx, OJO.parpado.cy);
    const rP = OJO.parpado.r / 1000;
    const parpado = cyP + Math.sqrt(Math.max(0, rP * rP - x * x));
    return { abajo, arriba: Math.max(arriba, abajo), parpado: Math.min(Math.max(parpado, abajo), Math.max(arriba, abajo)) };
}

function zOjo(x: number, y: number, abajo: number, arriba: number): number {
    const alto = Math.max(1e-6, arriba - abajo);
    const v = THREE.MathUtils.clamp((y - abajo) / alto, 0, 1);
    const u = Math.min(1, Math.abs(x) / ESQUINA_OJO);
    const domo = Math.sqrt(Math.sin(Math.PI * v)) * Math.sqrt(Math.max(0, 1 - u * u));
    return zCinturaSuave(x) + FORMA.holguraOjo + FORMA.domoOjo * domo;
}

/** Superficie de la almendra entre dos curvas y(x). */
function geometriaAlmendra(
    desde: (x: number) => number,
    hasta: (x: number) => number,
    elevar: (vn: number) => number,
): THREE.BufferGeometry {
    const N = 120;
    const M = 22;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
        // Espaciado coseno: más densidad en las esquinas agudas.
        const s = -Math.cos((Math.PI * i) / N);
        const x = s * ESQUINA_OJO;
        const { abajo, arriba } = arcosOjo(x);
        const y0 = desde(x);
        const y1 = Math.max(y0, hasta(x));
        for (let j = 0; j <= M; j++) {
            const vn = j / M;
            const y = y0 + (y1 - y0) * vn;
            pos.push(x, y, zOjo(x, y, abajo, arriba) + elevar(vn));
        }
    }
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
            const a = i * (M + 1) + j;
            const b = (i + 1) * (M + 1) + j;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

/** Altura del iris sobre la almendra: córnea abombada que se apoya en el ojo. */
function zIris(x: number, y: number): number {
    const { abajo, arriba } = arcosOjo(x);
    const rho = Math.min(1, Math.hypot(x, y) / (OJO.iris.r / 1000));
    return zOjo(x, y, abajo, arriba) + 0.004 + FORMA.alturaIris * Math.pow(Math.max(0, 1 - rho * rho), 0.55);
}

function geometriaIris(): THREE.BufferGeometry {
    const r = OJO.iris.r / 1000;
    const anillos = 28;
    const lados = 120;
    const pos: number[] = [];
    const idx: number[] = [];
    // Anillo 0 = centro; los anillos 1..anillos cubren la cúpula; el último baja como pared.
    const radios: number[] = [];
    for (let i = 0; i <= anillos; i++) radios.push(r * Math.sin(((i / anillos) * Math.PI) / 2));
    for (let i = 0; i <= anillos; i++) {
        for (let j = 0; j < lados; j++) {
            const a = (j / lados) * Math.PI * 2;
            const x = Math.cos(a) * radios[i];
            const y = Math.sin(a) * radios[i];
            pos.push(x, y, zIris(x, y));
        }
    }
    // Pared corta bajo el borde, hundida en la almendra.
    for (let j = 0; j < lados; j++) {
        const a = (j / lados) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const { abajo, arriba } = arcosOjo(x);
        pos.push(x, y, zOjo(x, y, abajo, arriba) - 0.01);
    }
    for (let i = 0; i <= anillos; i++) {
        for (let j = 0; j < lados; j++) {
            const a = i * lados + j;
            const b = i * lados + ((j + 1) % lados);
            const c = (i + 1) * lados + j;
            const d = (i + 1) * lados + ((j + 1) % lados);
            idx.push(a, c, b, b, c, d);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

/** Contorno (polígono) del brillo blanco: brillo ∩ círculo desplazado. */
function contornoBrillo(): THREE.Shape {
    const b = OJO.brillo;
    const r = b.r / 1000;
    const dx = b.desplazamiento.x / 1000;
    const dy = -b.desplazamiento.y / 1000;
    const dentro = (x: number, y: number, cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9;
    const puntos: THREE.Vector2[] = [];
    const n = 96;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        if (dentro(p.x, p.y, dx, dy)) puntos.push(p);
        const q = new THREE.Vector2(dx + Math.cos(a) * r, dy + Math.sin(a) * r);
        if (dentro(q.x, q.y, 0, 0)) puntos.push(q);
    }
    const cx = dx / 2;
    const cy = dy / 2;
    puntos.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    return new THREE.Shape(puntos);
}

// ── Sombra de contacto (como la de drei, en three puro) ──────────
class SombraContacto {
    readonly grupo = new THREE.Group();
    private readonly plano: THREE.Mesh;
    private readonly destino: THREE.WebGLRenderTarget;
    private readonly desenfoque: THREE.WebGLRenderTarget;
    private readonly camara: THREE.OrthographicCamera;
    private readonly materialProfundidad: THREE.MeshDepthMaterial;
    private readonly horizontal: THREE.ShaderMaterial;
    private readonly vertical: THREE.ShaderMaterial;
    private readonly velo: THREE.Mesh;

    constructor(ancho: number, profundo: number, resolucion = 256, private readonly opacidad = 0.42, private readonly difuminado = 7) {
        this.destino = new THREE.WebGLRenderTarget(resolucion, resolucion);
        this.destino.texture.generateMipmaps = false;
        this.desenfoque = new THREE.WebGLRenderTarget(resolucion, resolucion);
        this.desenfoque.texture.generateMipmaps = false;
        const material = new THREE.MeshBasicMaterial({
            map: this.destino.texture,
            transparent: true,
            opacity: opacidad,
            depthWrite: false,
        });
        // Misma disposición que ContactShadows de drei: la cámara mira hacia arriba desde el suelo.
        this.grupo.rotation.x = Math.PI / 2;
        this.plano = new THREE.Mesh(new THREE.PlaneGeometry(ancho, profundo).rotateX(Math.PI / 2), material);
        this.plano.scale.set(1, -1, 1);
        this.plano.rotation.x = -Math.PI / 2;
        this.plano.renderOrder = -1;
        this.camara = new THREE.OrthographicCamera(-ancho / 2, ancho / 2, profundo / 2, -profundo / 2, 0, 0.9);
        this.grupo.add(this.plano, this.camara);
        this.materialProfundidad = new THREE.MeshDepthMaterial();
        this.materialProfundidad.userData.oscuridad = { value: 1.3 };
        this.materialProfundidad.onBeforeCompile = (shader) => {
            shader.uniforms.oscuridad = this.materialProfundidad.userData.oscuridad;
            shader.fragmentShader = `uniform float oscuridad;\n${shader.fragmentShader.replace(
                "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
                "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * oscuridad );",
            )}`;
        };
        this.materialProfundidad.depthTest = false;
        this.materialProfundidad.depthWrite = false;
        this.horizontal = new THREE.ShaderMaterial(HorizontalBlurShader);
        this.horizontal.depthTest = false;
        this.vertical = new THREE.ShaderMaterial(VerticalBlurShader);
        this.vertical.depthTest = false;
        this.velo = new THREE.Mesh(this.plano.geometry);
        this.velo.visible = false;
    }

    private difuminar(renderer: THREE.WebGLRenderer, cantidad: number): void {
        this.velo.visible = true;
        this.velo.material = this.horizontal;
        this.horizontal.uniforms.tDiffuse.value = this.destino.texture;
        this.horizontal.uniforms.h.value = cantidad / 256;
        renderer.setRenderTarget(this.desenfoque);
        renderer.render(this.velo, this.camara);
        this.velo.material = this.vertical;
        this.vertical.uniforms.tDiffuse.value = this.desenfoque.texture;
        this.vertical.uniforms.v.value = cantidad / 256;
        renderer.setRenderTarget(this.destino);
        renderer.render(this.velo, this.camara);
        this.velo.visible = false;
    }

    actualizar(renderer: THREE.WebGLRenderer, escena: THREE.Scene): void {
        const fondo = escena.background;
        const override = escena.overrideMaterial;
        const anteriorDestino = renderer.getRenderTarget();
        const anteriorClaro = renderer.getClearAlpha();
        escena.background = null;
        this.plano.visible = false;
        escena.overrideMaterial = this.materialProfundidad;
        renderer.setClearAlpha(0);
        renderer.setRenderTarget(this.destino);
        renderer.clear();
        const sombras = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.autoUpdate = false;
        renderer.render(escena, this.camara);
        renderer.shadowMap.autoUpdate = sombras;
        escena.overrideMaterial = override;
        this.difuminar(renderer, this.difuminado);
        this.difuminar(renderer, this.difuminado * 0.5);
        this.difuminar(renderer, this.difuminado * 0.25);
        renderer.setRenderTarget(anteriorDestino);
        renderer.setClearAlpha(anteriorClaro);
        escena.background = fondo;
        this.plano.visible = true;
    }

    liberar(): void {
        this.destino.dispose();
        this.desenfoque.dispose();
        this.materialProfundidad.dispose();
        this.horizontal.dispose();
        this.vertical.dispose();
        this.plano.geometry.dispose();
        (this.plano.material as THREE.Material).dispose();
    }
}

// ── Escena completa ──────────────────────────────────────────────
export interface OpcionesEscenaSimbolo {
    /** Sombra de contacto bajo la pieza (no en la vista frontal de comprobación). */
    sombraContacto?: boolean;
    /** Resolución del mapa de sombras de la luz principal. */
    resolucionSombra?: number;
}

export interface EscenaSimbolo {
    escena: THREE.Scene;
    /** Pivote que flota y gira; dentro, el modelo. */
    pivote: THREE.Group;
    modelo: THREE.Group;
    iris: THREE.Group;
    /** Genera el entorno con PMREM (llamar una vez con el renderer). */
    prepararEntorno(renderer: THREE.WebGLRenderer): void;
    /** Pose en el instante t (s); puntero en [-1, 1]. `quieto` = sin movimiento. */
    pose(t: number, puntero: { x: number; y: number }, quieto?: boolean): void;
    /** Pasada previa al render (sombra de contacto). */
    antesDeRender(renderer: THREE.WebGLRenderer): void;
    liberar(): void;
}

/** Pose por defecto (tres cuartos suave) en radianes. */
export const POSE_REPOSO = { guinada: THREE.MathUtils.degToRad(16), cabeceo: THREE.MathUtils.degToRad(6) } as const;

export function crearEscenaSimbolo(opciones: OpcionesEscenaSimbolo = {}): EscenaSimbolo {
    const escena = new THREE.Scene();
    const liberables: Array<{ dispose(): void }> = [];
    const usar = <T extends { dispose(): void }>(x: T): T => {
        liberables.push(x);
        return x;
    };

    // Materiales físicos.
    const satinSup = usar(new THREE.MeshPhysicalMaterial({
        color: COLOR_BASE.discoSuperior, roughness: 0.42, metalness: 0,
        clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffffff"),
    }));
    const satinInf = usar(new THREE.MeshPhysicalMaterial({
        color: COLOR_BASE.discoInferior, roughness: 0.5, metalness: 0,
        clearcoat: 0.25, clearcoatRoughness: 0.35,
    }));
    const cristal = (color: string) => usar(new THREE.MeshPhysicalMaterial({
        color, roughness: 0.2, metalness: 0, ior: 1.8, specularIntensity: 0.8,
        clearcoat: 1, clearcoatRoughness: 0.04, flatShading: true,
    }));
    const rojo = cristal(COLOR_BASE.rojo);
    const verde = cristal(COLOR_BASE.verde);
    const amarillo = cristal(COLOR_BASE.amarillo);
    const azul = cristal(COLOR_BASE.azul);
    // La esclerótica brilla un poco por sí misma (esmalte translúcido): el blanco de la marca es blanco.
    const blancoOjo = usar(new THREE.MeshPhysicalMaterial({ color: COLOR_BASE.blancoOjo, emissive: "#ffffff", emissiveIntensity: 0.22, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
    const parpado = usar(new THREE.MeshPhysicalMaterial({ color: COLOR_BASE.parpado, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 }));
    const irisMat = usar(new THREE.MeshPhysicalMaterial({
        color: COLOR_BASE.iris, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.5,
    }));
    // El brillo del diseño es emisivo: no depende de la luz.
    const brilloMat = usar(new THREE.MeshBasicMaterial({ color: OJO.brillo.color, toneMapped: false }));
    const lunaMat = usar(new THREE.MeshBasicMaterial({ color: OJO.brillo.lunaColor, toneMapped: false }));

    const modelo = new THREE.Group();
    modelo.name = "simbolo-starseed";
    const malla = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], sombra = true) => {
        usar(geo);
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = sombra;
        m.receiveShadow = true;
        modelo.add(m);
        return m;
    };

    malla(geometriaDisco(CY_SUP, false), satinSup);
    malla(geometriaDisco(CY_INF, true), satinInf);
    malla(geometriaGema("arriba"), [rojo, verde, azul]);
    malla(geometriaGema("abajo"), [rojo, amarillo, azul]);

    const abajoDe = (x: number) => arcosOjo(x).abajo;
    const parpadoDe = (x: number) => arcosOjo(x).parpado;
    const arribaDe = (x: number) => arcosOjo(x).arriba;
    malla(geometriaAlmendra(abajoDe, parpadoDe, () => 0), blancoOjo);
    // Párpado: banda superior un poco más alta, con el canto inferior redondeado.
    malla(geometriaAlmendra(parpadoDe, arribaDe, (vn) => FORMA.parpado * Math.sqrt(Math.min(1, vn * 4))), parpado);

    // Iris + brillo (grupo propio: sigue un poco al puntero).
    const iris = new THREE.Group();
    const irisMalla = new THREE.Mesh(usar(geometriaIris()), irisMat);
    irisMalla.castShadow = true;
    irisMalla.receiveShadow = true;
    iris.add(irisMalla);
    const [bx, by] = pxAModelo(OJO.brillo.cx, OJO.brillo.cy);
    const rB = OJO.brillo.r / 1000;
    const alturaCupula = zIris;
    const luna = new THREE.Mesh(usar(new THREE.CircleGeometry(rB, 64)), lunaMat);
    luna.position.set(bx, by, alturaCupula(bx, by) + 0.002);
    const brillo = new THREE.Mesh(usar(new THREE.ShapeGeometry(contornoBrillo(), 1)), brilloMat);
    brillo.position.set(bx, by, alturaCupula(bx, by) + 0.0035);
    // Orienta los dos discos del brillo con la normal de la cúpula para que no floten.
    const e = 0.001;
    const normal = new THREE.Vector3(
        -(alturaCupula(bx + e, by) - alturaCupula(bx - e, by)) / (2 * e),
        -(alturaCupula(bx, by + e) - alturaCupula(bx, by - e)) / (2 * e),
        1,
    ).normalize();
    const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    luna.quaternion.copy(giro);
    brillo.quaternion.copy(giro);
    iris.add(luna, brillo);
    modelo.add(iris);

    const pivote = new THREE.Group();
    pivote.add(modelo);
    escena.add(pivote);

    // Luz de tres puntos.
    const clave = new THREE.DirectionalLight("#fff4e6", 3.2);
    clave.position.set(3.0, 1.3, 0.9);
    clave.castShadow = true;
    const res = opciones.resolucionSombra ?? 1024;
    clave.shadow.mapSize.set(res, res);
    clave.shadow.camera.left = -1.1;
    clave.shadow.camera.right = 1.1;
    clave.shadow.camera.top = 1.1;
    clave.shadow.camera.bottom = -1.1;
    clave.shadow.camera.near = 0.5;
    clave.shadow.camera.far = 7;
    clave.shadow.radius = 5;
    clave.shadow.bias = -0.0004;
    clave.shadow.normalBias = 0.012;
    const relleno = new THREE.DirectionalLight("#cfe0ff", 0.4);
    relleno.position.set(-2.2, 0.4, 1.8);
    const contra = new THREE.DirectionalLight("#bfe8ff", 3.0);
    contra.position.set(-1.1, 1.0, -3.0);
    escena.add(clave, clave.target, relleno, contra);

    let sombra: SombraContacto | null = null;
    if (opciones.sombraContacto) {
        sombra = new SombraContacto(1.6, 1.6);
        sombra.grupo.position.y = FORMA.sueloY;
        escena.add(sombra.grupo);
    }

    let entorno: THREE.Texture | null = null;

    return {
        escena,
        pivote,
        modelo,
        iris,
        prepararEntorno(renderer) {
            if (entorno) return;
            const pmrem = new THREE.PMREMGenerator(renderer);
            const sala = new RoomEnvironment();
            entorno = pmrem.fromScene(sala, 0.04).texture;
            sala.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                    m.geometry.dispose();
                    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
                }
            });
            pmrem.dispose();
            escena.environment = entorno;
            escena.environmentIntensity = 0.4;
        },
        pose(t, puntero, quieto = false) {
            if (quieto) {
                pivote.position.y = 0;
                pivote.rotation.set(POSE_REPOSO.cabeceo, POSE_REPOSO.guinada, 0);
                iris.position.x = 0;
                iris.position.y = 0;
                return;
            }
            // Flotación lenta (≈ 6 s) y unos grados de guiñada (≈ 14 s).
            pivote.position.y = Math.sin((t * Math.PI * 2) / 6) * 0.018;
            pivote.rotation.y = POSE_REPOSO.guinada + Math.sin((t * Math.PI * 2) / 14) * THREE.MathUtils.degToRad(6) + puntero.x * THREE.MathUtils.degToRad(5);
            pivote.rotation.x = POSE_REPOSO.cabeceo - puntero.y * THREE.MathUtils.degToRad(4);
            iris.position.x = puntero.x * 0.005;
            iris.position.y = puntero.y * 0.005;
        },
        antesDeRender(renderer) {
            sombra?.actualizar(renderer, escena);
        },
        liberar() {
            liberables.forEach((x) => x.dispose());
            sombra?.liberar();
            entorno?.dispose();
            clave.shadow.map?.dispose();
        },
    };
}
