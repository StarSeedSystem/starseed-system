#!/usr/bin/env python3
import json
import re
import sys


def dictamen(metricas):
    salida = []

    def emitir(pid, ok=None, motivo="métrica no disponible"):
        estado = "manual" if ok is None else "aprobado" if ok else "suspenso"
        salida.append((pid, estado, motivo))

    cobertura = {c.get("hex", "").upper(): c.get("pct") for c in metricas.get("coberturaColor", []) if isinstance(c, dict)}
    for pid, color, umbral, mayor, nombre in (
        ("p1", "#A855F7", 30, True, "lila"),
        ("p2", "#D4AF37", 20, False, "oro"),
    ):
        pct = cobertura.get(color)
        ok = None if pct is None else pct > umbral if mayor else pct < umbral
        emitir(pid, ok, f"{nombre}: {pct}% ({'>' if mayor else '<'}{umbral}%)" if pct is not None else f"sin cobertura medida para {nombre}")

    estilos = [e for e in metricas.get("estilos", []) if isinstance(e, dict)]
    radios = [e.get("borderRadius", "") for e in estilos if e.get("borderRadius") and e.get("borderRadius") != "0px"]
    valores = [float(n) for radio in radios for n in re.findall(r"\d+(?:\.\d+)?(?=px)", radio)]
    emitir("p3", None if not valores else all(14 <= v <= 32 for v in valores), f"radios medidos {valores}px (14–32px)" if valores else "sin radios en px; no se puede verificar 0.875–2rem")

    contraste = metricas.get("contraste")
    emitir("p4", None if not isinstance(contraste, (int, float)) else contraste >= 4.5, f"contraste {contraste}:1 (mínimo 4.5:1)" if isinstance(contraste, (int, float)) else "sin pares de texto y fondo medidos")
    vr = metricas.get("vrNativo")
    emitir("p5", None if not isinstance(vr, bool) else not vr, "se detectó VR nativo" if vr else "sin VR nativo" if vr is False else "sin métrica de capacidades VR")
    controles = metricas.get("controles")
    visibles = [c.get("visible") for c in controles if isinstance(c, dict)] if isinstance(controles, list) else []
    emitir("p6", None if not visibles or any(not isinstance(v, bool) for v in visibles) else all(visibles), "controles visibles" if visibles and all(visibles) else "hay controles ocultos" if visibles and all(isinstance(v, bool) for v in visibles) else "sin visibilidad medida para controles")
    emitir("p7", None, "la jugada rara requiere revisión visual")
    audio = metricas.get("audioReactivo")
    emitir("p8", audio if isinstance(audio, bool) else None, "respuesta audio-reactiva" if audio else "respuesta audio-reactiva ausente" if audio is False else "sin métrica de respuesta al audio")
    return salida


if __name__ == "__main__":
    resultados = dictamen(json.load(sys.stdin))
    for pid, estado, motivo in resultados:
        print(f"{pid}: manual ({motivo})" if estado == "manual" else f"{pid}: {estado} · {motivo}")
    raise SystemExit(int(any(estado != "aprobado" for _, estado, _ in resultados)))
