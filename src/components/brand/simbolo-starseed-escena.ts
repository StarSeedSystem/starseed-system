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
// ESC1110B: flor fundida, ojo que mira y parpadea, y archivo de símbolo.
import { CENTRO_FLOR, PASO_FLOR, RADIO_ENVOLVENTE, RADIO_FLOR, centrosFlor } from "./simbolo-flor";
import { angulosMirada, type Mirada } from "./simbolo-ojo";
import { SIMBOLO_OFICIAL, type ArchivoSimbolo } from "./simbolo-archivo";

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

// ── Flor de la Vida fundida (ESC1110B) ───────────────────────────
// Los anillos viven en la MISMA escena y bajo el mismo padre que los discos,
// sobre la misma lámina plegada (z = frente del disco − medio grosor): el
// anillo del centro coincide con el canto del disco inferior y su vecino de
// arriba con el del superior en cualquier pose, no solo de frente.

/**
 * z de la lámina de la flor, a la altura del canto que dibuja la silueta de
 * cada disco (medido en el banco: el canto delantero manda con la pose de
 * reposo). Arriba sigue al disco superior y abajo al inferior, que va
 * `retrasoInferior` más atrás; entre ambos, dentro de los discos, se funde.
 */
export const Z_FLOR = -0.006;
export const Z_FLOR_INFERIOR = Z_FLOR - FORMA.retrasoInferior;
/** Ancho de la cinta de cada anillo (unidades del modelo): núcleo fino + halo. */
const ANCHO_CINTA = 0.05;

function geometriaFlor(): THREE.BufferGeometry {
    const segmentos = 192;
    const centro: number[] = [];
    const ang: number[] = [];
    const lado: number[] = [];
    const radio: number[] = [];
    const tipo: number[] = [];
    const idx: number[] = [];
    let base = 0;
    const anillo = (cx: number, cy: number, r: number, t: number) => {
        for (let i = 0; i <= segmentos; i++) {
            const a = (i / segmentos) * Math.PI * 2;
            for (const l of [-1, 1]) {
                centro.push(cx, cy);
                ang.push(a);
                lado.push(l);
                radio.push(r);
                tipo.push(t);
            }
        }
        for (let i = 0; i < segmentos; i++) {
            const a = base + i * 2;
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        base += (segmentos + 1) * 2;
    };
    for (const [x, y] of centrosFlor(0)) anillo(x, y, RADIO_FLOR, 0);
    anillo(0, 0, RADIO_ENVOLVENTE, 1);
    anillo(0, 0, RADIO_ENVOLVENTE + 0.035, 1);
    const geo = new THREE.BufferGeometry();
    // `position` es obligatoria para three: la real la calcula el sombreador.
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lado.length * 3), 3));
    geo.setAttribute("aCentro", new THREE.Float32BufferAttribute(centro, 2));
    geo.setAttribute("aAng", new THREE.Float32BufferAttribute(ang, 1));
    geo.setAttribute("aLado", new THREE.Float32BufferAttribute(lado, 1));
    geo.setAttribute("aRadio", new THREE.Float32BufferAttribute(radio, 1));
    geo.setAttribute("aTipo", new THREE.Float32BufferAttribute(tipo, 1));
    geo.setIndex(idx);
    // Caja generosa: el sombreador mueve los vértices y three no lo sabe.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CENTRO_FLOR[1], 0), RADIO_ENVOLVENTE + 0.2);
    return geo;
}

function materialFlor(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            uAngulo: { value: 0 },
            uTanPliegue: { value: Math.tan(FORMA.plegado) },
            uZ: { value: Z_FLOR },
            uZInf: { value: Z_FLOR_INFERIOR },
            uAncho: { value: ANCHO_CINTA },
            uCentroY: { value: CENTRO_FLOR[1] },
            uOpacidad: { value: 1 },
            uEnvolvente: { value: RADIO_ENVOLVENTE },
        },
        vertexShader: /* glsl */ `
            uniform float uAngulo, uTanPliegue, uZ, uZInf, uAncho, uCentroY;
            attribute vec2 aCentro;
            attribute float aAng, aLado, aRadio, aTipo;
            varying float vLado, vDist, vY, vTipo;
            void main() {
                float c = cos(uAngulo), s = sin(uAngulo);
                vec2 cen = vec2(aCentro.x * c - aCentro.y * s, aCentro.x * s + aCentro.y * c);
                float r = aRadio + aLado * uAncho * 0.5;
                vec2 p = cen + r * vec2(cos(aAng), sin(aAng));
                float yM = p.y + uCentroY;
                float zL = mix(uZInf, uZ, smoothstep(-0.2, 0.2, yM));
                vec3 pos = vec3(p.x, yM, -abs(p.x) * uTanPliegue + zL);
                vLado = aLado * uAncho * 0.5;
                vDist = length(p);
                vY = p.y;
                vTipo = aTipo;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform float uOpacidad, uEnvolvente;
            varying float vLado, vDist, vY, vTipo;
            void main() {
                float d = abs(vLado);
                // Núcleo nítido (~1 px) y halo suave: «anillo luminoso».
                float nucleo = exp(-pow(d / 0.0042, 2.0));
                float halo = 0.22 * exp(-pow(d / 0.016, 2.0));
                float k = vDist / uEnvolvente;
                vec3 cian = vec3(0.56, 0.91, 1.0);
                vec3 azul = vec3(0.25, 0.71, 1.0);
                vec3 violeta = vec3(0.49, 0.23, 0.93);
                vec3 col = mix(cian, azul, smoothstep(0.0, 0.55, k));
                col = mix(col, violeta, smoothstep(0.5, 1.0, k));
                // Se desvanece hacia fuera y detrás del texto (abajo), más viva junto al símbolo.
                float fuera = 1.0 - smoothstep(0.78, 1.06, k);
                fuera = mix(fuera, 0.55, vTipo);
                float texto = mix(0.32, 1.0, smoothstep(-1.05, -0.5, vY));
                float cerca = 1.0 + 0.55 * exp(-pow(vDist / 0.7, 2.0));
                float a = (nucleo + halo) * fuera * texto * cerca * 0.5 * uOpacidad;
                gl_FragColor = vec4(col * a, a);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true,
        side: THREE.DoubleSide,
    });
}

// ── Recorte a la almendra y párpado (ESC1110B) ───────────────────
const R_ALMENDRA = R;

/** Inyecta en un material el recorte a la almendra (en coordenadas del modelo). */
function recortarAAlmendra(mat: THREE.Material, invModelo: { value: THREE.Matrix4 }, margen = 0.0015): void {
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uInvModelo = invModelo;
        sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nuniform mat4 uInvModelo;\nvarying vec2 vPm;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvPm = (uInvModelo * modelMatrix * vec4(transformed, 1.0)).xy;");
        sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", `#include <common>\nvarying vec2 vPm;`)
            .replace("void main() {", `void main() {
                if (length(vPm - vec2(0.0, ${CY_SUP.toFixed(5)})) > ${(R_ALMENDRA - margen).toFixed(5)}
                    || length(vPm - vec2(0.0, ${CY_INF.toFixed(5)})) > ${(R_ALMENDRA - margen).toFixed(5)}) discard;`);
    };
    mat.customProgramCacheKey = () => `almendra-${margen}`;
}

/** Párpado móvil: cubre la almendra desde arriba hasta la línea de cierre. */
function materialParpadoMovil(invModelo: { value: THREE.Matrix4 }, cierre: { value: number }): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial({ color: OJO.parpado.color, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 });
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uInvModelo = invModelo;
        sh.uniforms.uCierre = cierre;
        sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "#include <common>\nuniform mat4 uInvModelo;\nvarying vec2 vPm;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvPm = (uInvModelo * modelMatrix * vec4(transformed, 1.0)).xy;");
        sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vPm;\nuniform float uCierre;")
            .replace("void main() {", `void main() {
                float hP = sqrt(max(0.0, ${(R * R).toFixed(6)} - vPm.x * vPm.x));
                float arribaP = ${CY_INF.toFixed(5)} + hP;
                float abajoP = ${CY_SUP.toFixed(5)} - hP;
                float lineaP = arribaP - uCierre * (arribaP - abajoP);
                if (vPm.y < lineaP) discard;`)
            .replace("#include <color_fragment>", `#include <color_fragment>
                // Canto del párpado: una línea oscura fina que dibuja el cierre.
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), smoothstep(0.016, 0.002, vPm.y - lineaP));`);
    };
    mat.customProgramCacheKey = () => "parpado-movil";
    return mat;
}

/**
 * Párpado del parpadeo: la almendra entera, levantada justo por encima de la
 * cúpula del iris (con holgura para el iris girado, que se desplaza hasta
 * ~0,11 de lado), sin hincharse hacia los cantos.
 */
function geometriaParpadoMovil(abajo: (x: number) => number, arriba: (x: number) => number): THREE.BufferGeometry {
    const geo = geometriaAlmendra(abajo, arriba, () => 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const rAmplio = OJO.iris.r / 1000 + 0.12;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const rho = Math.min(1, Math.hypot(x, y) / rAmplio);
        pos.setZ(i, pos.getZ(i) + 0.007 + (FORMA.alturaIris + 0.006) * Math.pow(Math.max(0, 1 - rho * rho), 0.55));
    }
    geo.computeVertexNormals();
    return geo;
}

// ── Escena completa ──────────────────────────────────────────────
export interface OpcionesEscenaSimbolo {
    /** Sombra de contacto bajo la pieza (sin flor; no en la vista frontal de comprobación). */
    sombraContacto?: boolean;
    /** Resolución del mapa de sombras de la luz principal. */
    resolucionSombra?: number;
    /** ESC1110B: la Flor de la Vida fundida detrás de los discos. */
    flor?: boolean;
    /** ESC1110B: el archivo de símbolo (luces, pose, comportamientos). Por defecto, el oficial. */
    archivo?: ArchivoSimbolo;
}

/** Lo que mueve cada fotograma (ESC1110B). */
export interface EstadoEscenaSimbolo {
    /** Tiempo (s) para la flotación. */
    t: number;
    /** Inclinación de toda la pieza hacia el puntero, en [-1, 1]. */
    inclinacion: { x: number; y: number };
    /** Mirada del ojo, en [-1, 1]. */
    mirada: Mirada;
    /** Cierre del párpado, 0 abierto … 1 cerrado. */
    cierre: number;
    /** Ángulo de la flor (rad). */
    anguloFlor: number;
    /** Sin movimiento propio (reposo exacto). */
    quieto: boolean;
}

export interface EscenaSimbolo {
    escena: THREE.Scene;
    /** Pivote que flota y gira; dentro, el modelo. */
    pivote: THREE.Group;
    modelo: THREE.Group;
    iris: THREE.Group;
    /** ESC1110B: la flor (null si se creó sin ella). */
    flor: THREE.Mesh | null;
    /** Genera el entorno con PMREM (llamar una vez con el renderer). */
    prepararEntorno(renderer: THREE.WebGLRenderer): void;
    /** Pose en el instante t (s); puntero en [-1, 1]. `quieto` = sin movimiento. */
    pose(t: number, puntero: { x: number; y: number }, quieto?: boolean): void;
    /** ESC1110B: pose completa (mirada, párpado y flor). */
    actualizar(e: EstadoEscenaSimbolo): void;
    /** ESC1110B: sustituye la forma oficial por un modelo propio (null = vuelve al oficial). */
    usarModeloPropio(objeto: THREE.Object3D | null): void;
    /** Pasada previa al render (sombra de contacto). */
    antesDeRender(renderer: THREE.WebGLRenderer): void;
    liberar(): void;
}

/** Pose por defecto (tres cuartos suave) en radianes. */
export const POSE_REPOSO = { guinada: THREE.MathUtils.degToRad(16), cabeceo: THREE.MathUtils.degToRad(6) } as const;

/** Profundidad del centro de giro del ojo (detrás de la almendra). */
export const CENTRO_GIRO_OJO = -0.22;
/** El brillo del diseño acompaña al ojo a menos de la mitad: es un reflejo de la luz, no una pintura. */
export const SEGUIMIENTO_BRILLO = 0.45;

/**
 * Encuadre de la cámara. Sin flor: el de ESC1110A (caja 2:3 del símbolo).
 * Con flor: un cuadrado centrado en el centro de la flor (= disco inferior)
 * que cabe la flor entera; `lado` en unidades del modelo.
 */
export function encuadreSimbolo(conFlor: boolean): { fov: number; posicion: [number, number, number]; mira: [number, number, number]; lado: number; aspecto: number } {
    if (!conFlor) return { fov: 22, posicion: [0, 0.05, 5], mira: [0, -0.06, 0], lado: 0, aspecto: 2 / 3 };
    const lado = 2 * (RADIO_ENVOLVENTE + 0.12);
    const fov = 22;
    const distancia = lado / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    return { fov, posicion: [0, CENTRO_FLOR[1], distancia], mira: [0, CENTRO_FLOR[1], 0], lado, aspecto: 1 };
}

export function crearEscenaSimbolo(opciones: OpcionesEscenaSimbolo = {}): EscenaSimbolo {
    const archivo = opciones.archivo ?? SIMBOLO_OFICIAL;
    const conFlor = !!opciones.flor;
    const escena = new THREE.Scene();
    const liberables: Array<{ dispose(): void }> = [];
    const usar = <T extends { dispose(): void }>(x: T): T => {
        liberables.push(x);
        return x;
    };
    const invModelo = { value: new THREE.Matrix4() };
    const cierreUniforme = { value: 0 };

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
    // ESC1110B: el iris y su brillo se recortan a la almendra cuando el ojo gira.
    recortarAAlmendra(irisMat, invModelo);
    recortarAAlmendra(brilloMat, invModelo, 0.004);
    recortarAAlmendra(lunaMat, invModelo, 0.004);

    const modelo = new THREE.Group();
    modelo.name = "simbolo-starseed";
    const oficial = new THREE.Group();
    oficial.name = "simbolo-oficial";
    modelo.add(oficial);
    const malla = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], sombra = true) => {
        usar(geo);
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = sombra;
        m.receiveShadow = true;
        oficial.add(m);
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

    // ESC1110B: párpado móvil del parpadeo, por encima de la cúpula del iris.
    const parpadoMovilMat = usar(materialParpadoMovil(invModelo, cierreUniforme));
    const parpadoMovil = malla(geometriaParpadoMovil(abajoDe, arribaDe), parpadoMovilMat, false);
    parpadoMovil.visible = false;
    parpadoMovil.renderOrder = 2;

    // Iris + brillo. ESC1110B: giran como un globo alrededor de un centro detrás de la almendra.
    const giroOjo = new THREE.Group();
    giroOjo.position.set(0, 0, CENTRO_GIRO_OJO);
    const iris = new THREE.Group();
    iris.position.set(0, 0, -CENTRO_GIRO_OJO);
    const irisMalla = new THREE.Mesh(usar(geometriaIris()), irisMat);
    irisMalla.castShadow = true;
    irisMalla.receiveShadow = true;
    iris.add(irisMalla);
    giroOjo.add(iris);
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
    const giroBrillo = new THREE.Group();
    giroBrillo.position.set(0, 0, CENTRO_GIRO_OJO);
    const brilloGrupo = new THREE.Group();
    brilloGrupo.position.set(0, 0, -CENTRO_GIRO_OJO + 0.0015);
    brilloGrupo.add(luna, brillo);
    giroBrillo.add(brilloGrupo);
    oficial.add(giroOjo, giroBrillo);

    // ESC1110B: la flor, en la misma lámina que los discos.
    let flor: THREE.Mesh | null = null;
    let materialDeFlor: THREE.ShaderMaterial | null = null;
    if (conFlor) {
        materialDeFlor = usar(materialFlor());
        flor = new THREE.Mesh(usar(geometriaFlor()), materialDeFlor);
        flor.name = "flor-de-la-vida";
        flor.frustumCulled = false;
        flor.renderOrder = 1;
        flor.visible = archivo.comportamientos.fusionFlor;
        modelo.add(flor);
    }

    const pivote = new THREE.Group();
    // Con flor, todo gira alrededor del centro de la flor (= disco inferior).
    const centroGiro = conFlor ? CENTRO_FLOR[1] : 0;
    pivote.position.y = centroGiro;
    modelo.position.y = -centroGiro;
    const escala = archivo.pose.escala;
    modelo.scale.setScalar(escala);
    modelo.position.y = -centroGiro * escala;
    pivote.add(modelo);
    escena.add(pivote);

    // Luz de tres puntos (del archivo).
    const L = archivo.luces;
    const clave = new THREE.DirectionalLight(L.clave.color, L.clave.intensidad);
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
    const relleno = new THREE.DirectionalLight(L.relleno.color, L.relleno.intensidad);
    relleno.position.set(-2.2, 0.4, 1.8);
    const contra = new THREE.DirectionalLight(L.contra.color, L.contra.intensidad);
    contra.position.set(-1.1, 1.0, -3.0);
    escena.add(clave, clave.target, relleno, contra);

    let sombra: SombraContacto | null = null;
    if (opciones.sombraContacto && !conFlor) {
        sombra = new SombraContacto(1.6, 1.6);
        sombra.grupo.position.y = FORMA.sueloY;
        escena.add(sombra.grupo);
    }

    let entorno: THREE.Texture | null = null;
    let propio: THREE.Object3D | null = null;
    const reposo = {
        guinada: THREE.MathUtils.degToRad(archivo.pose.guinada),
        cabeceo: THREE.MathUtils.degToRad(archivo.pose.cabeceo),
    };
    const ojoActivo = () => propio === null;

    const s: EscenaSimbolo = {
        escena,
        pivote,
        modelo,
        iris,
        flor,
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
            escena.environmentIntensity = L.entorno;
        },
        pose(t, puntero, quieto = false) {
            s.actualizar({ t, inclinacion: puntero, mirada: { x: 0, y: 0 }, cierre: 0, anguloFlor: 0, quieto });
        },
        actualizar(est) {
            const flota = archivo.pose.flotacion;
            if (est.quieto) {
                pivote.position.y = centroGiro;
                pivote.rotation.set(reposo.cabeceo, reposo.guinada, 0);
            } else {
                // Flotación lenta (≈ 6 s) y unos grados de guiñada (≈ 14 s).
                pivote.position.y = centroGiro + Math.sin((est.t * Math.PI * 2) / 6) * 0.018 * flota;
                pivote.rotation.y = reposo.guinada + Math.sin((est.t * Math.PI * 2) / 14) * THREE.MathUtils.degToRad(6) * flota + est.inclinacion.x * THREE.MathUtils.degToRad(5);
                pivote.rotation.x = reposo.cabeceo - est.inclinacion.y * THREE.MathUtils.degToRad(4);
            }
            const a = angulosMirada(ojoActivo() ? est.mirada : { x: 0, y: 0 });
            giroOjo.rotation.set(-a.cabeceo, a.guinada, 0);
            giroBrillo.rotation.set(-a.cabeceo * SEGUIMIENTO_BRILLO, a.guinada * SEGUIMIENTO_BRILLO, 0);
            const c = ojoActivo() ? Math.min(1, Math.max(0, est.cierre)) : 0;
            cierreUniforme.value = c;
            parpadoMovil.visible = c > 0.001;
            if (materialDeFlor) materialDeFlor.uniforms.uAngulo.value = est.anguloFlor;
            escena.updateMatrixWorld();
            invModelo.value.copy(modelo.matrixWorld).invert();
        },
        usarModeloPropio(objeto) {
            if (propio) modelo.remove(propio);
            propio = objeto;
            oficial.visible = !objeto;
            if (objeto) modelo.add(objeto);
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
    s.actualizar({ t: 0, inclinacion: { x: 0, y: 0 }, mirada: { x: 0, y: 0 }, cierre: 0, anguloFlor: 0, quieto: true });
    return s;
}

/** Comprobación numérica de la fusión: centros y radios de los discos frente a los anillos (unidades del modelo). */
export const MEDIDAS_FUSION = { radioDisco: R, radioAnillo: RADIO_FLOR, paso: PASO_FLOR, zFlor: Z_FLOR } as const;
