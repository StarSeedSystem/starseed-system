/**
 * Palabras del Dibujo-adivina: cosas que se dejan dibujar en unos trazos. Sin nombres propios
 * ni nada que un grupo pueda tomar a mal. El dibujante elige entre tres al azar.
 */
export const PALABRAS_DIBUJO: readonly string[] = [
    // Naturaleza
    "árbol", "montaña", "río", "volcán", "isla", "cascada", "nube", "arcoíris", "luna", "sol",
    "estrella", "flor", "girasol", "cactus", "seta", "hoja", "playa", "cueva", "trueno", "nieve",
    // Animales
    "gato", "perro", "caballo", "pez", "pájaro", "mariposa", "abeja", "araña", "serpiente", "tortuga",
    "elefante", "jirafa", "pingüino", "delfín", "búho", "conejo", "vaca", "cangrejo", "pulpo", "caracol",
    // Casa y objetos
    "casa", "puerta", "ventana", "llave", "paraguas", "reloj", "lámpara", "silla", "mesa", "cama",
    "espejo", "escalera", "tijeras", "martillo", "cuchara", "tenedor", "taza", "botella", "vela", "candado",
    "maleta", "gafas", "sombrero", "zapato", "guitarra", "piano", "tambor", "libro", "lápiz", "globo",
    // Comida
    "manzana", "plátano", "pizza", "helado", "tarta", "huevo", "queso", "pan", "sandía", "uvas",
    "zanahoria", "hamburguesa", "café", "naranja", "cereza", "piña", "tomate", "galleta", "sopa", "paella",
    // Transporte y lugares
    "bicicleta", "coche", "avión", "barco", "tren", "cohete", "globo aerostático", "autobús", "faro", "puente",
    "castillo", "molino", "tienda de campaña", "iglesia", "hospital", "escuela", "granja", "semáforo", "tractor", "submarino",
    // Cuerpo y personas
    "mano", "ojo", "nariz", "corazón", "pie", "diente", "oreja", "cabeza", "bebé", "payaso",
    "pirata", "astronauta", "bruja", "dragón", "sirena", "robot", "fantasma", "hada", "gigante", "detective",
    // Acciones y cosas del día a día
    "dormir", "nadar", "bailar", "correr", "cocinar", "pescar", "volar", "llover", "cumpleaños", "vacaciones",
    "telescopio", "ordenador", "teléfono", "cámara", "balón", "raqueta", "medalla", "tesoro", "brújula", "mapa",
];

/** Tres (o `n`) palabras distintas al azar. `azar` devuelve un número en [0, 1). */
export function opcionesDePalabras(azar: () => number = Math.random, n = 3): string[] {
    const bolsa = PALABRAS_DIBUJO.slice();
    const out: string[] = [];
    while (out.length < n && bolsa.length > 0) {
        const i = Math.min(bolsa.length - 1, Math.floor(azar() * bolsa.length));
        out.push(bolsa.splice(i, 1)[0]);
    }
    return out;
}

/** Minúsculas, sin acentos, sin signos ni espacios: «Globo Aerostático!» → «globoaerostatico». */
export function normalizarPalabra(texto: string): string {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function distancia(a: string, b: string): number {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/** ¿El intento es la palabra? Tolera una errata en palabras de 5 letras o más, y el plural. */
export function esAcierto(intento: string, palabra: string): boolean {
    const a = normalizarPalabra(intento);
    const p = normalizarPalabra(palabra);
    if (a.length === 0 || p.length === 0) return false;
    if (a === p || a === `${p}s` || `${a}s` === p) return true;
    return p.length >= 5 && distancia(a, p) <= 1;
}

/** ¿Está cerca sin ser la palabra? Para el «¡casi!» que solo ve quien lo intentó. */
export function esCercano(intento: string, palabra: string): boolean {
    const a = normalizarPalabra(intento);
    const p = normalizarPalabra(palabra);
    if (a.length < 3 || p.length < 4 || esAcierto(intento, palabra)) return false;
    return distancia(a, p) <= 2 || (a.length >= 4 && (p.includes(a) || a.includes(p)));
}
