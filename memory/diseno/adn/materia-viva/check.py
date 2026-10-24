#!/usr/bin/env python3
import json
import sys


def dictamen(metricas):
    salida = []

    def emitir(pid, ok=None, motivo="métrica no disponible"):
        estado = "manual" if ok is None else "aprobado" if ok else "suspenso"
        salida.append((pid, estado, motivo))

    cobertura = {c.get("hex", "").upper(): c.get("pct") for c in metricas.get("coberturaColor", []) if isinstance(c, dict)}
    fondo = cobertura.get("#0D130E")
    oro = cobertura.get("#E9C46A")
    emitir("p1", None if fondo is None else fondo > 40, f"fondo medido {fondo}% (más de 40%)" if fondo is not None else "sin cobertura medida del fondo")
    emitir("p2", None if oro is None else oro < 20, f"oro medido {oro}% (menos de 20%)" if oro is not None else "sin cobertura medida del oro")

    shell = metricas.get("shellOpaco")
    emitir("p3", None if not isinstance(shell, bool) else not shell, "shell opaco detectado" if shell else "sin shell opaco" if shell is False else "sin métrica de opacidad del shell")
    contraste = metricas.get("contraste")
    emitir("p4", None if not isinstance(contraste, (int, float)) else contraste >= 4.5, f"contraste {contraste}:1 (mínimo 4.5:1)" if isinstance(contraste, (int, float)) else "sin pares de texto y fondo medidos")
    radial = metricas.get("crecimientoRadial")
    emitir("p5", radial if isinstance(radial, bool) else None, "crecimiento radial presente" if radial else "crecimiento radial ausente" if radial is False else "sin métrica de crecimiento radial")
    oro_cafe = metricas.get("oroSobreCafe")
    emitir("p6", None if not isinstance(oro_cafe, bool) else not oro_cafe, "oro sobre Café detectado" if oro_cafe else "sin oro sobre Café" if oro_cafe is False else "sin métrica de combinación oro/Café")
    emitir("p7", None, "la jugada rara requiere revisión visual")
    glow = metricas.get("glowSutil")
    emitir("p8", glow if isinstance(glow, bool) else None, "glow sutil" if glow else "glow no sutil" if glow is False else "sin métrica de intensidad del glow")
    return salida


if __name__ == "__main__":
    resultados = dictamen(json.load(sys.stdin))
    for pid, estado, motivo in resultados:
        print(f"{pid}: manual ({motivo})" if estado == "manual" else f"{pid}: {estado} · {motivo}")
    raise SystemExit(int(any(estado != "aprobado" for _, estado, _ in resultados)))
