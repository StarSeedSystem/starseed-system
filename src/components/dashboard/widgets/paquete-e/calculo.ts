/**
 * Calculadora del paquete E — analizador SEGURO (descenso recursivo), sin eval ni new Function.
 *
 * Entiende lo que se escribe en una calculadora de verdad: + − × ÷ (y * / -), potencias (^),
 * paréntesis, raíz (√), π, coma o punto decimal, signo negativo, multiplicación implícita
 * («2π», «3(4+1)») y el porcentaje de calculadora: «200 + 10 %» = 220, «50 × 10 %» = 5.
 * PURO: sin DOM, sin red; se prueba entero.
 */

export type ResultadoCalculo =
    | { ok: true; valor: number }
    | { ok: false; error: string };

type Token =
    | { t: "num"; v: number }
    | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
    | { t: "pct" }
    | { t: "(" }
    | { t: ")" }
    | { t: "raiz" }
    | { t: "pi" };

const OPERADORES: Record<string, "+" | "-" | "*" | "/" | "^"> = {
    "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "x": "*", "·": "*", "/": "/", "÷": "/", "^": "^",
};

class ErrorCalculo extends Error {}

export function tokenizar(entrada: string): Token[] {
    const s = entrada.replace(/\s+/g, "");
    const out: Token[] = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/[0-9.,]/.test(c)) {
            let j = i;
            let decimal = false;
            let texto = "";
            while (j < s.length && /[0-9.,]/.test(s[j])) {
                if (s[j] === "." || s[j] === ",") {
                    if (decimal) throw new ErrorCalculo("Número con dos comas");
                    decimal = true;
                    texto += ".";
                } else texto += s[j];
                j++;
            }
            if (texto === ".") throw new ErrorCalculo("Falta un número");
            out.push({ t: "num", v: Number(texto) });
            i = j;
            continue;
        }
        if (c in OPERADORES) { out.push({ t: "op", v: OPERADORES[c] }); i++; continue; }
        if (c === "%") { out.push({ t: "pct" }); i++; continue; }
        if (c === "(" || c === ")") { out.push({ t: c }); i++; continue; }
        if (c === "√") { out.push({ t: "raiz" }); i++; continue; }
        if (c === "π") { out.push({ t: "pi" }); i++; continue; }
        if (s.startsWith("pi", i)) { out.push({ t: "pi" }); i += 2; continue; }
        if (s.startsWith("sqrt", i)) { out.push({ t: "raiz" }); i += 4; continue; }
        throw new ErrorCalculo(`Símbolo desconocido «${c}»`);
    }
    return out;
}

interface Valor { v: number; pct: boolean }

/** Evalúa la expresión. Nunca lanza: los fallos vuelven como `{ ok: false, error }` en español. */
export function calcular(entrada: string): ResultadoCalculo {
    let tokens: Token[];
    try {
        tokens = tokenizar(entrada);
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Expresión no válida" };
    }
    if (tokens.length === 0) return { ok: false, error: "Vacío" };
    let p = 0;
    const ver = () => tokens[p];
    const tomar = () => tokens[p++];

    // Empieza un factor (para la multiplicación implícita): número, π, √ o paréntesis.
    const empiezaFactor = (k: Token | undefined) => !!k && (k.t === "num" || k.t === "pi" || k.t === "raiz" || k.t === "(");

    const primario = (): Valor => {
        const k = tomar();
        if (!k) throw new ErrorCalculo("Expresión incompleta");
        if (k.t === "num") return { v: k.v, pct: false };
        if (k.t === "pi") return { v: Math.PI, pct: false };
        if (k.t === "raiz") {
            const x = unario();
            if (x.v < 0) throw new ErrorCalculo("Raíz de un número negativo");
            return { v: Math.sqrt(x.v), pct: false };
        }
        if (k.t === "(") {
            const x = expresion();
            // Paréntesis sin cerrar al final: se cierran solos (como en el móvil).
            if (ver()?.t === ")") tomar();
            else if (ver()) throw new ErrorCalculo("Falta cerrar un paréntesis");
            return { v: x.v, pct: false };
        }
        throw new ErrorCalculo("Expresión incompleta");
    };

    const postfijo = (): Valor => {
        let x = primario();
        while (ver()?.t === "pct") { tomar(); x = { v: x.v / 100, pct: true }; }
        return x;
    };

    const potencia = (): Valor => {
        const base = postfijo();
        const k = ver();
        if (k?.t === "op" && k.v === "^") {
            tomar();
            const exp = unario();
            return { v: Math.pow(base.v, exp.v), pct: false };
        }
        return base;
    };

    function unario(): Valor {
        const k = ver();
        if (k?.t === "op" && (k.v === "-" || k.v === "+")) {
            tomar();
            const x = unario();
            return { v: k.v === "-" ? -x.v : x.v, pct: x.pct };
        }
        return potencia();
    }

    const termino = (): Valor => {
        let x = unario();
        for (;;) {
            const k = ver();
            if (k?.t === "op" && (k.v === "*" || k.v === "/")) {
                tomar();
                const y = unario();
                if (k.v === "/" && y.v === 0) throw new ErrorCalculo("No se puede dividir entre cero");
                x = { v: k.v === "*" ? x.v * y.v : x.v / y.v, pct: false };
            } else if (empiezaFactor(k)) {
                const y = unario();
                x = { v: x.v * y.v, pct: false };
            } else return x;
        }
    };

    function expresion(): Valor {
        let x = termino();
        for (;;) {
            const k = ver();
            if (k?.t === "op" && (k.v === "+" || k.v === "-")) {
                tomar();
                const y = termino();
                // Porcentaje de calculadora: «a ± b %» es «a ± a·b/100».
                const d = y.pct ? x.v * y.v : y.v;
                x = { v: k.v === "+" ? x.v + d : x.v - d, pct: false };
            } else return x;
        }
    }

    try {
        const r = expresion();
        if (p < tokens.length) {
            const k = tokens[p];
            throw new ErrorCalculo(k.t === ")" ? "Sobra un paréntesis" : "Expresión incompleta");
        }
        if (!Number.isFinite(r.v)) return { ok: false, error: "Resultado demasiado grande" };
        return { ok: true, valor: r.v };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Expresión no válida" };
    }
}

/** Redondeo que borra el ruido de coma flotante (0,1 + 0,2 = 0,3). */
export function limpiarNumero(n: number): number {
    if (!Number.isFinite(n) || n === 0) return n;
    return Number(n.toPrecision(12));
}

const FMT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 10, useGrouping: true });

/** Número para la pantalla, en español (1.234,5). Exponente para lo muy grande o muy pequeño. */
export function formatearNumero(n: number): string {
    const x = limpiarNumero(n);
    if (!Number.isFinite(x)) return "—";
    const abs = Math.abs(x);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
        return x.toExponential(6).replace(/\.?0+e/, "e").replace(".", ",");
    }
    // Intl agrupa desde 10.000 en es-ES; lo forzamos desde 1.000 para que se lea igual en todos lados.
    const [ent, dec] = FMT.format(x).replace(/\./g, "").split(",");
    const conPuntos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return dec ? `${conPuntos},${dec}` : conPuntos;
}

/** Número para volver a meter en la expresión (sin separador de miles). */
export function numeroParaExpresion(n: number): string {
    return String(limpiarNumero(n)).replace(".", ",");
}

/** Paréntesis «inteligente»: abre si no hay nada abierto o tras un operador; si no, cierra. */
export function parentesisInteligente(expr: string): "(" | ")" {
    const abiertos = (expr.match(/\(/g) ?? []).length - (expr.match(/\)/g) ?? []).length;
    const ultimo = expr.trim().slice(-1);
    if (abiertos <= 0 || ultimo === "" || /[+\-−×÷*/^(√]/.test(ultimo)) return "(";
    return ")";
}

/** Tecla física → símbolo de la calculadora (o null si no es suya). */
export function teclaACalculadora(tecla: string): string | null {
    if (/^[0-9]$/.test(tecla)) return tecla;
    const mapa: Record<string, string> = {
        ".": ",", ",": ",", "+": "+", "-": "−", "*": "×", "x": "×", "/": "÷", "^": "^", "%": "%", "(": "(", ")": ")",
        Enter: "=", "=": "=", Backspace: "⌫", Escape: "C", Delete: "C", p: "π", r: "√",
    };
    return mapa[tecla] ?? null;
}

/** Aplica una tecla a la expresión. Devuelve la nueva expresión (el «=» lo resuelve el widget). */
export function aplicarTecla(expr: string, tecla: string): string {
    if (tecla === "C") return "";
    if (tecla === "⌫") return expr.slice(0, -1);
    if (tecla === "()") return expr + parentesisInteligente(expr);
    const ultimo = expr.slice(-1);
    const esOp = (c: string) => c.length === 1 && "+−×÷^".includes(c);
    // Dos operadores seguidos: el nuevo sustituye al anterior (salvo «×−» / «÷−» para negativos).
    if (esOp(tecla) && esOp(ultimo)) {
        if (tecla === "−" && (ultimo === "×" || ultimo === "÷" || ultimo === "^")) return expr + tecla;
        return expr.slice(0, -1) + tecla;
    }
    if (esOp(tecla) && expr === "" && tecla !== "−") return expr;
    if (tecla === "," ) {
        const trozo = expr.split(/[+−×÷^()%√π]/).pop() ?? "";
        if (trozo.includes(",")) return expr;
        return expr + (trozo === "" ? "0," : ",");
    }
    if (expr.length >= 64) return expr;
    return expr + tecla;
}
