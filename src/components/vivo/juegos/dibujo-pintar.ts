/**
 * Pintado del lienzo del Dibujo-adivina en un canvas 2D. Función pura sobre el contexto: pinta el
 * fondo y todos los trazos suavizados (curvas por los puntos medios). `ancho` es el ancho del
 * canvas en píxeles del dispositivo; la escala sale de él.
 */
import { ALTO_LIENZO, ANCHO_LIENZO, FONDO_LIENZO, GROSORES, PALETA, type Lienzo } from "@/lib/vivo/juegos/dibujo-trazos";

export function pintarLienzo(ctx: CanvasRenderingContext2D, lienzo: Lienzo, ancho: number, alto: number): void {
    const k = ancho / ANCHO_LIENZO;
    ctx.save();
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = FONDO_LIENZO;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const t of lienzo.trazos) {
        const color = PALETA[t.c]?.valor ?? "#F8FAFC";
        const grosor = (GROSORES[t.g]?.valor ?? 9) * k;
        const p = t.p;
        if (p.length < 2) continue;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = grosor;
        if (p.length < 4) {
            ctx.beginPath();
            ctx.arc(p[0] * k, p[1] * k, grosor / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        ctx.beginPath();
        ctx.moveTo(p[0] * k, p[1] * k);
        for (let i = 2; i < p.length - 2; i += 2) {
            const mx = ((p[i] + p[i + 2]) / 2) * k;
            const my = ((p[i + 1] + p[i + 3]) / 2) * k;
            ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, mx, my);
        }
        ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
        ctx.stroke();
    }
    ctx.restore();
}

/** Alto del canvas para un ancho dado (la proporción del lienzo lógico: 4:3). */
export function altoParaAncho(ancho: number): number {
    return Math.round((ancho * ALTO_LIENZO) / ANCHO_LIENZO);
}
