#!/usr/bin/env python3
"""Genera `siembra-starseed.json`: la primera campaña real del Estudio MetaGeminis.

Se escribe en Python (y no a mano en JSON) para no repetir los textos en cada medio y para que los números que dependen de
otros (tiempos de un guion → tiempos de los pulsos de audio y de las «luces» de la escena) salgan siempre coherentes.
Regla de verdad: solo hechos reales (código abierto AGPL-3.0, StarSeed OS en starseed-os.vercel.app, malla P2P, IA local de 1,58
bits, Omnifrecuencias) y lo que está en marcha se dice «en construcción». Cero cifras, logros ni testimonios inventados.
Uso: python3 generar_siembra_starseed.py   (reescribe siembra-starseed.json junto a este archivo)
"""
from __future__ import annotations

import json
from pathlib import Path

AQUI = Path(__file__).resolve().parent
URL = "starseed-os.vercel.app"

PALETA = {"zenith": "#007FFF", "horizonte": "#10B981", "logica": "#FFBF00", "anchor": "#DC143C", "nieve": "#F8F9FA", "fondo": "#02040A"}

# ───────────────────────── textos (es/en) ─────────────────────────
AVISO_ES = "Código abierto · AGPL-3.0 · Donaciones: enlace próximamente"
AVISO_EN = "Open source · AGPL-3.0 · Donations: link coming soon"
LISTA_ES = ["Participa", "Voluntariado", "Aporta código", "Dona"]
LISTA_EN = ["Take part", "Volunteer", "Contribute code", "Donate"]
COLORES = ["zenith", "horizonte", "logica", "anchor"]
# Velo de legibilidad de los banners: el texto es pequeño y la escena pasa justo debajo, y el contraste se mide sobre el
# percentil 95 del fondo real. El velo es fuerte detrás del texto y deja respirar la escena en los bordes (smoothstep, sin codos).
def _suave(puntos, pasos=6):
    """Degradado con interpolación smoothstep entre (posición %, alfa)."""
    out = []
    for (x0, a0), (x1, a1) in zip(puntos, puntos[1:]):
        for k in range(pasos + (1 if (x1, a1) == puntos[-1] else 0)):
            u = k / pasos
            e = u * u * (3 - 2 * u)
            out.append(f"rgba(2,6,16,{a0 + (a1 - a0) * e:.3f}) {x0 + (x1 - x0) * u:.1f}%")
    return ", ".join(out)


def velo_banner(fila: bool, fuerza: float = 1.0) -> str:
    f = lambda a: round(min(0.92, a * fuerza), 3)
    if fila:  # apaisados: elipse centrada en el texto
        return f"radial-gradient(ellipse 62% 150% at 50% 50%, rgba(2,6,16,{f(0.7)}) 0%, rgba(2,6,16,{f(0.7)}) 55%, rgba(2,6,16,{f(0.28)}) 100%)"
    return "linear-gradient(180deg, " + _suave([(0, f(0.45)), (14, f(0.5)), (30, f(0.66)), (74, f(0.66)), (92, f(0.3)), (100, f(0.2))]) + ")"


def lista(textos, t0=0.0, paso=1.1):
    return [{"texto": x, "color": c, "t": round(t0 + i * paso, 2)} for i, (x, c) in enumerate(zip(textos, COLORES))]


def guion_reel(en: bool, lista_t=6.0, fin_t=11.4):
    return [
        {"t": 0.3, "d": 2.5, "kicker": "Seed phase" if en else "Fase Semilla", "titular": "It all starts with a *seed*" if en else "Todo comienza con una *semilla*", "acento": "logica"},
        {"t": 3.5, "d": 2.5, "titular": "An open, social operating system for *everyone*" if en else "Un sistema operativo social, abierto y de *todos*", "sub": "We're building it in the open" if en else "Lo estamos construyendo en abierto", "acento": "zenith"},
        # Cuatro caminos, 0,95 s entre uno y otro: «Dona», el último, queda más de dos segundos a la vista.
        {"t": lista_t, "d": fin_t - lista_t, "lista": lista(LISTA_EN if en else LISTA_ES, 0.0, 0.95), "acento": "zenith"},
        {"t": fin_t, "d": 15.0 - fin_t, "fin": True, "sello": True, "titular": "Sow with *us*" if en else "Siembra con *nosotros*", "cta": URL, "aviso": AVISO_EN if en else AVISO_ES, "acento": "horizonte"},
    ]


def guion_youtube(en: bool):
    return [
        {"t": 0.4, "d": 4.2, "kicker": "StarSeed OS", "titular": "A network with no *center*" if en else "Una red sin *centro*", "acento": "zenith"},
        {"t": 4.8, "d": 4.4, "titular": "Your device is a *node*" if en else "Tu dispositivo es un *nodo*", "sub": "A peer-to-peer mesh between you and your community, in the making" if en else "Una malla entre tú y tu comunidad, en construcción", "acento": "horizonte"},
        {"t": 9.6, "d": 4.6, "titular": "AI that runs *locally*" if en else "IA que corre en *local*", "sub": "Astraura, a 1.58-bit model, in the making" if en else "Astraura, un modelo de 1,58 bits, en construcción", "acento": "logica"},
        {"t": 14.4, "d": 5.2, "kicker": "Seed phase" if en else "Fase Semilla", "lista": lista(LISTA_EN if en else LISTA_ES, 0.0, 0.9), "acento": "zenith"},
        {"t": 20.0, "d": 4.0, "fin": True, "sello": True, "titular": "Sow with *us*" if en else "Siembra con *nosotros*", "cta": URL, "aviso": AVISO_EN if en else AVISO_ES, "acento": "horizonte"},
    ]


def guion_cuadrado(en: bool):
    return [
        {"t": 0.3, "d": 3.0, "kicker": "StarSeed OS", "titular": "Four ways to *join in*" if en else "Cuatro formas de *sumar*", "acento": "zenith"},
        {"t": 3.4, "d": 4.8, "lista": lista(LISTA_EN if en else LISTA_ES, 0.0, 0.9), "acento": "zenith"},
        {"t": 8.2, "d": 2.0, "fin": True, "sello": True, "titular": "Sow with *us*" if en else "Siembra con *nosotros*", "cta": URL, "aviso": AVISO_EN if en else AVISO_ES, "acento": "horizonte"},
    ]


def guion_vertical45(en: bool):
    return [
        {"t": 0.3, "d": 3.4, "kicker": "Omnifrecuencias", "titular": "Sound is open source *too*" if en else "El sonido también es *código abierto*", "acento": "logica"},
        {"t": 3.8, "d": 4.2, "titular": "Tones and frequencies, inside *StarSeed OS*" if en else "Tonos y frecuencias, dentro de *StarSeed OS*", "sub": "Live stations in the making" if en else "Estaciones en vivo, en construcción", "acento": "zenith"},
        {"t": 8.2, "d": 2.0, "fin": True, "sello": True, "titular": "Sow with *us*" if en else "Siembra con *nosotros*", "cta": URL, "aviso": AVISO_EN if en else AVISO_ES, "acento": "horizonte"},
    ]


def guion_corto(en: bool):
    return [
        {"t": 0.3, "d": 3.3, "kicker": "Seed phase" if en else "Fase Semilla", "titular": "It all starts with a *seed*" if en else "Todo comienza con una *semilla*", "acento": "logica"},
        {"t": 3.8, "d": 3.8, "titular": "An open, social operating system for *everyone*" if en else "Un sistema operativo social, abierto y de *todos*", "sub": "We're building it in the open" if en else "Lo estamos construyendo en abierto", "acento": "zenith"},
        {"t": 7.8, "d": 4.2, "fin": True, "sello": True, "titular": "Sow with *us*" if en else "Siembra con *nosotros*", "cta": URL, "aviso": AVISO_EN if en else AVISO_ES, "acento": "horizonte"},
    ]


# ───────────────────────── carrusel ─────────────────────────
def carrusel():
    def n(i):
        return f"{i}/5"

    es = [
        {"numero": n(1), "kicker": "Siembra StarSeed", "titular": "Un sistema operativo *social*, abierto y de todos", "cuerpo": "Lo estamos construyendo en abierto. Así puedes sumarte.", "desliza": "Desliza", "acento": "zenith", "tam_titular": 0.125},
        {"numero": n(2), "kicker": "Qué estamos construyendo", "titular": "StarSeed *OS*", "acento": "zenith", "tam_titular": 0.13, "columnas": 1,
         "tarjetas": [{"titulo": "Abierto", "texto": "Código bajo licencia AGPL-3.0, auditable por cualquiera.", "color": "zenith"}, {"titulo": "Descentralizado", "texto": "Se diseña como una red de nodos federados, sin servidor único.", "color": "horizonte"}, {"titulo": "Tuyo", "texto": "Principio de diseño: cada persona es dueña de su identidad y de sus datos.", "color": "logica"}]},
        {"numero": n(3), "kicker": "Cómo lo hacemos", "titular": "Tecnología *en común*", "acento": "horizonte", "tam_titular": 0.115, "columnas": 1,
         "tarjetas": [{"titulo": "Malla P2P", "texto": "Tus dispositivos y tu comunidad, conectados entre sí. En construcción.", "color": "zenith"}, {"titulo": "IA local", "texto": "Astraura, un modelo de 1,58 bits en tu dispositivo. En construcción.", "color": "horizonte"}, {"titulo": "Omnifrecuencias", "texto": "Tonos y estaciones de sonido dentro del sistema. En construcción.", "color": "logica"}]},
        {"numero": n(4), "kicker": "Fase Semilla", "titular": "Cuatro formas de *sumarte*", "acento": "logica", "tam_titular": 0.1, "columnas": 1, "tam_tarjeta": 0.052,
         "tarjetas": [{"titulo": "Participa", "texto": "Prueba el sistema y cuéntanos qué ves.", "color": "zenith"}, {"titulo": "Voluntariado", "texto": "Ayuda con diseño, traducción, pruebas o comunidad.", "color": "horizonte"}, {"titulo": "Aporta código", "texto": "El repositorio es abierto: issues y pull requests.", "color": "logica"}, {"titulo": "Dona", "texto": "Enlace de donación: próximamente.", "color": "anchor"}]},
        {"numero": n(5), "kicker": "Empieza hoy", "titular": "Siembra con *nosotros*", "cuerpo": "Entra, mira cómo se construye y elige tu camino.", "qr": True, "qr_texto": "Escanea el código o entra:", "cta": URL, "pie": AVISO_ES, "acento": "horizonte", "tam_titular": 0.125, "qr_tam": 0.3},
    ]
    en = [
        {"numero": n(1), "kicker": "Sow StarSeed", "titular": "An open, *social* operating system for everyone", "cuerpo": "We're building it in the open. Here's how to join in.", "desliza": "Swipe", "acento": "zenith", "tam_titular": 0.125},
        {"numero": n(2), "kicker": "What we're building", "titular": "StarSeed *OS*", "acento": "zenith", "tam_titular": 0.13, "columnas": 1,
         "tarjetas": [{"titulo": "Open", "texto": "AGPL-3.0 licensed code that anyone can audit.", "color": "zenith"}, {"titulo": "Decentralized", "texto": "Designed as a network of federated nodes, with no single server.", "color": "horizonte"}, {"titulo": "Yours", "texto": "Design principle: everyone owns their identity and their data.", "color": "logica"}]},
        {"numero": n(3), "kicker": "How we do it", "titular": "Technology *in common*", "acento": "horizonte", "tam_titular": 0.115, "columnas": 1,
         "tarjetas": [{"titulo": "P2P mesh", "texto": "Your devices and your community, connected. In the making.", "color": "zenith"}, {"titulo": "Local AI", "texto": "Astraura, a 1.58-bit model on your device. In the making.", "color": "horizonte"}, {"titulo": "Omnifrecuencias", "texto": "Tones and sound stations inside the system. In the making.", "color": "logica"}]},
        {"numero": n(4), "kicker": "Seed phase", "titular": "Four ways to *join in*", "acento": "logica", "tam_titular": 0.1, "columnas": 1, "tam_tarjeta": 0.052,
         "tarjetas": [{"titulo": "Take part", "texto": "Try the system and tell us what you see.", "color": "zenith"}, {"titulo": "Volunteer", "texto": "Help with design, translation, testing or community.", "color": "horizonte"}, {"titulo": "Contribute code", "texto": "The repository is open: issues and pull requests.", "color": "logica"}, {"titulo": "Donate", "texto": "Donation link: coming soon.", "color": "anchor"}]},
        {"numero": n(5), "kicker": "Start today", "titular": "Sow with *us*", "cuerpo": "Come in, see how it's built and pick your path.", "qr": True, "qr_texto": "Scan the code or visit:", "cta": URL, "pie": AVISO_EN, "acento": "horizonte", "tam_titular": 0.125, "qr_tam": 0.3},
    ]
    escenas = [
        {"id": "semilla-estelar", "semilla": 7, "t": 12.5, "params": {}},
        {"id": "malla-viva", "semilla": 21, "t": 13.0, "params": {"r_final": 22}},
        {"id": "espiral-omnifrecuencias", "semilla": 5, "t": 13.0, "params": {"ty": 0.4}},
        {"id": "cristal-liquido", "semilla": 9, "t": 13.0, "params": {"ty": 0.6}},
        {"id": "semilla-estelar", "semilla": 7, "t": 14.0, "params": {"ty_final": -0.2}},
    ]
    return [{"es": e1, "en": e2, "escena": sc} for e1, e2, sc in zip(es, en, escenas)]


# ───────────────────────── piezas fijas ─────────────────────────
def lamina_imagen(es: dict, en: dict, escena: dict, **extra) -> list[dict]:
    d = {"es": es, "en": en, "escena": escena}
    d.update(extra)
    return [d]


def banner(pid: str, fid: str, w: int, h: int, tip: dict, fila: bool, fuerza_velo: float = 1.0, **extra) -> dict:
    """Banner IAB: PNG (mensaje final) + GIF ligero de tres cuadros (el árbol crece)."""
    es = [
        {"t": 2.0, "d": 2.6, "titular": "Siembra *StarSeed*", "acento": "horizonte", "sello": fila, "fila": fila},
        {"t": 5.0, "d": 3.0, "titular": "Participa · Voluntariado · Código · *Dona*", "acento": "logica", "fila": fila},
        {"t": 8.4, "d": 4.0, "fin": True, "titular": "Siembra con *nosotros*", "cta": "Entra", "acento": "horizonte", "sello": fila, "fila": fila},
    ]
    en = [
        {"t": 2.0, "d": 2.6, "titular": "Sow *StarSeed*", "acento": "horizonte", "sello": fila, "fila": fila},
        {"t": 5.0, "d": 3.0, "titular": "Take part · Volunteer · Code · *Donate*", "acento": "logica", "fila": fila},
        {"t": 8.4, "d": 4.0, "fin": True, "titular": "Sow with *us*", "cta": "Visit", "acento": "horizonte", "sello": fila, "fila": fila},
    ]
    return {
        "id": pid, "titulo": f"Banner {w}×{h}", "tipo": "anuncio", "salida": "banner", "layout": "kinetico", "formatos": [fid], "idiomas": ["es", "en"],
        "guion": f"banner-{w}x{h}", "contenedores": ["png", "gif"], "tipografia": tip, "marca_pos": "oculta" if fila else "arriba-izq", "velo": velo_banner(fila, fuerza_velo),
        "gif": {"tiempos": [3.9, 7.4], "duraciones": [2300, 2600], "duracion_final": 3200, "colores": 128}, "t_estatico": 12.5, **extra,
    }, {f"banner-{w}x{h}": {"es": es, "en": en}}


def construir() -> dict:
    guiones: dict = {}
    piezas: list[dict] = []

    # 1. Reel / TikTok / Short 9:16 (escena «Semilla estelar»)
    guiones["reel"] = {"es": guion_reel(False), "en": guion_reel(True)}
    piezas.append({
        "id": "reel", "titulo": "Reel · Semilla estelar", "tipo": "animacion3d", "salida": "video", "layout": "kinetico", "guion": "reel", "duracion": 15, "fps": 30, "idiomas": ["es", "en"],
        "formatos": ["instagram-reels", "tiktok", "youtube-shorts"], "compatibles": ["instagram-stories", "whatsapp-estado", "pinterest-video", "threads-video"],
        "escena": {"id": "semilla-estelar", "semilla": 7, "params": {"pilares_t": [6.1, 7.05, 8.0, 8.95]}}, "escala3d": 0.8,
        "audio": {"estilo": "semilla", "pulsos": [2.7, 4.2, 5.7, 6.1, 7.05, 8.0, 8.95, 11.4, 12.9], "eventos": [{"t": 2.7, "tipo": "germinar"}, {"t": 11.4, "tipo": "barrido", "dur": 2.4}, {"t": 11.4, "tipo": "campana", "hz": 528}]},
    })

    # 2. YouTube 16:9 + LinkedIn (escena «Malla viva»), derivados 1280x720 para el resto
    guiones["youtube"] = {"es": guion_youtube(False), "en": guion_youtube(True)}
    ytp = [14.4 + 0.4 + i * 0.9 for i in range(4)]  # una por camino de la lista (0,9 s entre uno y otro)
    piezas.append({
        "id": "youtube", "titulo": "Vídeo largo · Malla viva", "tipo": "animacion3d", "salida": "video", "layout": "kinetico", "guion": "youtube", "duracion": 24, "fps": 30, "idiomas": ["es", "en"],
        "formatos": ["youtube-horizontal", "linkedin-video"], "compatibles": [],
        "ancla": "izq", "ancho_texto": 0.52,
        "escena": {"id": "malla-viva", "semilla": 21, "params": {"pilares_t": [round(x, 2) for x in ytp], "centro": [0.46, 0.0], "r_final": 21}}, "escala3d": 0.75,
        "audio": {"estilo": "malla", "pulsos": [1.0, 2.5, 4.0, 5.5, 7.0, 8.5, 10.0, 11.5, 13.0, round(ytp[0], 1), round(ytp[1], 1), round(ytp[2], 1), round(ytp[3], 1), 20.0], "eventos": [{"t": 20.0, "tipo": "barrido", "dur": 2.0}, {"t": 20.0, "tipo": "campana", "hz": 528}]},
    })

    # 3. Corto horizontal 16:9 para X, Bluesky y Mastodon (escena «Semilla estelar» apaisada)
    guiones["corto"] = {"es": guion_corto(False), "en": guion_corto(True)}
    piezas.append({
        "id": "corto", "titulo": "Vídeo corto horizontal · Semilla estelar", "tipo": "animacion3d", "salida": "video", "layout": "kinetico", "guion": "corto", "duracion": 12, "fps": 30, "idiomas": ["es"],
        "formatos": ["x-video", "bluesky-video", "mastodon-video"], "compatibles": ["telegram-video", "discord-video"],
        "ancla": "izq", "ancho_texto": 0.52,
        "escena": {"id": "semilla-estelar", "semilla": 7, "params": {"centro": [0.5, 0.0], "pilares_t": [5.2, 6.0, 6.8, 7.6]}}, "escala3d": 0.85,
        "audio": {"estilo": "semilla", "pulsos": [2.7, 3.9, 5.2, 6.0, 6.8, 7.6, 8.0], "eventos": [{"t": 2.7, "tipo": "germinar"}, {"t": 7.8, "tipo": "campana", "hz": 528}]},
    })

    # 4. Feed 1:1 (escena «Cristal líquido»)
    guiones["cuadrado"] = {"es": guion_cuadrado(False), "en": guion_cuadrado(True)}
    piezas.append({
        "id": "feed-cuadrado", "titulo": "Feed 1:1 · Cristal líquido", "tipo": "animacion3d", "salida": "video", "layout": "kinetico", "guion": "cuadrado", "duracion": 10, "fps": 30, "idiomas": ["es", "en"],
        "formatos": ["instagram-feed-1x1"], "compatibles": ["reddit-video"], "webm": True,
        "ancla": "izq", "ancho_texto": 0.64, "tipografia": {"titular": 92},
        "escena": {"id": "cristal-liquido", "semilla": 9, "params": {"pilares_t": [3.9, 4.8, 5.7, 6.6], "centro": [0.55, 0.0], "ty": 0.0}}, "escala3d": 0.8,
        "audio": {"estilo": "cristal", "pulsos": [3.9, 4.8, 5.7, 6.6, 8.2], "eventos": [{"t": 8.2, "tipo": "campana", "hz": 528}]},
    })

    # 5. Feed 4:5 (escena «Espiral Omnifrecuencias»)
    guiones["vertical45"] = {"es": guion_vertical45(False), "en": guion_vertical45(True)}
    piezas.append({
        "id": "feed-vertical", "titulo": "Feed 4:5 · Espiral Omnifrecuencias", "tipo": "animacion3d", "salida": "video", "layout": "kinetico", "guion": "vertical45", "duracion": 10, "fps": 30, "idiomas": ["es"],
        "formatos": ["instagram-feed-4x5"], "compatibles": ["facebook-post"],
        "escena": {"id": "espiral-omnifrecuencias", "semilla": 5, "params": {"ty": 0.2}}, "escala3d": 0.8,
        "audio": {"estilo": "espiral", "pulsos": [1.0, 2.2, 3.4, 4.6, 5.8, 7.0, 8.2], "eventos": [{"t": 8.2, "tipo": "campana", "hz": 528}]},
    })

    # 6. Estáticos de redes (lámina editorial sobre la escena)
    def still(pid, titulo, fmts, compat, es, en, escena, tam_titular=0.11, **extra):
        guiones_local = lamina_imagen(es, en, escena, **extra.pop("lam", {}))
        piezas.append({"id": pid, "titulo": titulo, "tipo": "imagen", "salida": "imagen", "layout": "lamina", "formatos": fmts, "compatibles": compat, "idiomas": ["es", "en"], "laminas": guiones_local, "contenedores": extra.pop("contenedores", ["jpg"]), **extra})

    sc_a = {"id": "semilla-estelar", "semilla": 7, "t": 13.5, "params": {}}
    sc_c = {"id": "cristal-liquido", "semilla": 9, "t": 13.0, "params": {"ty": 0.0, "centro": [0.5, 0.0]}}
    sc_b = {"id": "malla-viva", "semilla": 21, "t": 13.0, "params": {"r_final": 17, "centro": [0.45, 0.0]}}
    sc_d = {"id": "espiral-omnifrecuencias", "semilla": 5, "t": 13.0, "params": {"ty": 0.3}}
    sc_a_ancha = {"id": "semilla-estelar", "semilla": 7, "t": 13.5, "params": {"centro": [0.46, 0.0], "r_final": 12.5}}
    sc_a_cinta = {"id": "semilla-estelar", "semilla": 7, "t": 13.5, "params": {"centro": [0.5, 0.0], "r_final": 21}}

    still("imagen-cuadrada", "Imagen 1:1", ["instagram-feed-1x1"], ["reddit-imagen"],
          {"kicker": "Siembra StarSeed", "titular": "Cuatro formas de *sumar*", "cuerpo": "Participa, voluntariado, aporta código o dona.", "cta": URL, "acento": "zenith", "tam_titular": 0.12, "ancho_bloque": 0.62, "pie_derecha": AVISO_ES},
          {"kicker": "Sow StarSeed", "titular": "Four ways to *join in*", "cuerpo": "Take part, volunteer, contribute code or donate.", "cta": URL, "acento": "zenith", "tam_titular": 0.12, "ancho_bloque": 0.62, "pie_derecha": AVISO_EN},
          sc_c)
    still("imagen-vertical", "Imagen 4:5", ["instagram-feed-4x5"], ["threads-imagen", "facebook-post"],
          {"kicker": "Fase Semilla", "titular": "Un sistema operativo *social*, abierto y de todos", "cuerpo": "Lo estamos construyendo en abierto.", "cta": URL, "acento": "zenith", "tam_titular": 0.115, "pie_derecha": AVISO_ES},
          {"kicker": "Seed phase", "titular": "An open, *social* operating system for everyone", "cuerpo": "We're building it in the open.", "cta": URL, "acento": "zenith", "tam_titular": 0.115, "pie_derecha": AVISO_EN},
          sc_a)
    still("miniatura", "Miniatura de YouTube", ["youtube-miniatura"], ["telegram-imagen", "mastodon-imagen", "discord-imagen"],
          {"kicker": "StarSeed OS", "titular": "Una red sin *centro*", "acento": "horizonte", "tam_titular": 0.2, "ancho_bloque": 0.6, "pie": ""},
          {"kicker": "StarSeed OS", "titular": "A network with no *center*", "acento": "horizonte", "tam_titular": 0.2, "ancho_bloque": 0.6, "pie": ""},
          sc_b, contenedores=["jpg"])
    still("imagen-x", "Imagen para X", ["x-imagen"], [],
          {"kicker": "Siembra StarSeed", "titular": "Un sistema operativo social, abierto y de *todos*", "cta": URL, "acento": "zenith", "tam_titular": 0.095, "ancho_bloque": 0.62},
          {"kicker": "Sow StarSeed", "titular": "An open social operating system for *everyone*", "cta": URL, "acento": "zenith", "tam_titular": 0.095, "ancho_bloque": 0.62},
          sc_a_ancha, lam={"layout": "lamina"})
    still("imagen-linkedin", "Imagen para LinkedIn y Bluesky", ["linkedin-imagen"], ["bluesky-imagen"],
          {"kicker": "Código abierto · AGPL-3.0", "titular": "Construimos un sistema operativo *social* en abierto", "cuerpo": "Participa, voluntariado, aporta código o dona.", "cta": URL, "acento": "horizonte", "tam_titular": 0.085, "ancho_bloque": 0.64},
          {"kicker": "Open source · AGPL-3.0", "titular": "We're building a *social* operating system in the open", "cuerpo": "Take part, volunteer, contribute code or donate.", "cta": URL, "acento": "horizonte", "tam_titular": 0.085, "ancho_bloque": 0.64},
          sc_b)
    still("open-graph", "Imagen para enlaces (Open Graph)", ["open-graph"], ["facebook-enlace"],
          {"kicker": "StarSeed OS", "titular": "Sistema operativo *social*, abierto y de todos", "cuerpo": "En construcción · código abierto AGPL-3.0", "acento": "zenith", "tam_titular": 0.088, "ancho_bloque": 0.6},
          {"kicker": "StarSeed OS", "titular": "An open *social* operating system for everyone", "cuerpo": "In the making · open source AGPL-3.0", "acento": "zenith", "tam_titular": 0.088, "ancho_bloque": 0.6},
          sc_a_ancha, contenedores=["jpg"])
    still("pin", "Pin vertical", ["pinterest-pin"], [],
          {"kicker": "Siembra StarSeed", "titular": "Un sistema operativo *social* y abierto", "cuerpo": "Participa, voluntariado, código o donación.", "cta": URL, "acento": "zenith", "tam_titular": 0.13},
          {"kicker": "Sow StarSeed", "titular": "An open, *social* operating system", "cuerpo": "Take part, volunteer, code or donate.", "cta": URL, "acento": "zenith", "tam_titular": 0.13},
          sc_d)
    still("correo-cabecera", "Cabecera de correo", ["correo-cabecera"], [],
          {"titular": "Siembra con *nosotros*", "acento": "horizonte", "tam_titular": 0.085, "ancho_bloque": 0.55, "hueco_min": 0.02},
          {"titular": "Sow with *us*", "acento": "horizonte", "tam_titular": 0.085, "ancho_bloque": 0.55, "hueco_min": 0.02},
          sc_a_cinta, contenedores=["png"])

    # 7. Carrusel de 5 láminas 4:5 + documento PDF para LinkedIn
    piezas.append({"id": "carrusel", "titulo": "Carrusel · Qué es StarSeed", "tipo": "carrusel", "salida": "carrusel", "layout": "lamina", "formatos": ["instagram-carrusel"], "idiomas": ["es", "en"],
                   "laminas": carrusel(), "contenedores": ["png"], "pdf_documento": True})

    # 8. Cartel A3 (PNG a 300 ppp + PDF con texto vectorial)
    piezas.append({"id": "cartel", "titulo": "Cartel A3", "tipo": "cartel", "salida": "cartel", "layout": "lamina", "formatos": ["cartel-a3"], "idiomas": ["es", "en"], "contenedores": ["png", "pdf"], "escala3d": 0.8,
                   "laminas": [{"es": {"kicker": "Fase Semilla", "titular": "Siembra *StarSeed*", "cuerpo": "Un sistema operativo social, abierto y de todos. Lo estamos construyendo en abierto.", "columnas": 2, "tam_tarjeta": 0.05,
                                       "tarjetas": [{"titulo": "Participa", "texto": "Prueba el sistema y cuéntanos qué ves.", "color": "zenith"}, {"titulo": "Voluntariado", "texto": "Diseño, traducción, pruebas o comunidad.", "color": "horizonte"},
                                                    {"titulo": "Aporta código", "texto": "Repositorio abierto: issues y pull requests.", "color": "logica"}, {"titulo": "Dona", "texto": "Enlace de donación: próximamente.", "color": "anchor"}],
                                       "qr": True, "qr_texto": "Escanea el código o entra:", "cta": URL, "pie": AVISO_ES, "acento": "horizonte", "tam_titular": 0.17, "qr_tam": 0.27},
                                "en": {"kicker": "Seed phase", "titular": "Sow *StarSeed*", "cuerpo": "An open, social operating system for everyone. We're building it in the open.", "columnas": 2, "tam_tarjeta": 0.05,
                                       "tarjetas": [{"titulo": "Take part", "texto": "Try the system and tell us what you see.", "color": "zenith"}, {"titulo": "Volunteer", "texto": "Design, translation, testing or community.", "color": "horizonte"},
                                                    {"titulo": "Contribute code", "texto": "Open repository: issues and pull requests.", "color": "logica"}, {"titulo": "Donate", "texto": "Donation link: coming soon.", "color": "anchor"}],
                                       "qr": True, "qr_texto": "Scan the code or visit:", "cta": URL, "pie": AVISO_EN, "acento": "horizonte", "tam_titular": 0.17, "qr_tam": 0.27},
                                "escena": {"id": "semilla-estelar", "semilla": 7, "t": 14.0, "params": {"ty_final": -0.3}}}]})

    # 9. Banners IAB (PNG + GIF ligero)
    for w, h, tip, fila in [
        (300, 250, {"titular": 34, "cta": 15, "marca": 30, "kicker": 11}, False),
        (728, 90, {"titular": 30, "cta": 16, "marca": 40}, True),
        (320, 50, {"titular": 17, "cta": 11, "marca": 28}, True),
        (300, 600, {"titular": 44, "cta": 17, "marca": 34}, False),
        (160, 600, {"titular": 27, "cta": 13, "marca": 30}, False),
        (970, 250, {"titular": 56, "cta": 22, "marca": 74}, True),
    ]:
        # Los banners apaisados (8:1, 6:1, 4:1) no leen el árbol vertical: una galaxia plana sí.
        escena_b = ({"id": "espiral-omnifrecuencias", "semilla": 5, "params": {"ty": 0.0, "inclinacion": 1.15}} if fila
                    else {"id": "semilla-estelar", "semilla": 7, "params": {"centro": [0.0, 0.0]}})
        extra = {"escena": escena_b}
        pz, g = banner(f"banner-{w}x{h}", f"iab-{w}x{h}", w, h, tip, fila, fuerza_velo=1.2 if h <= 60 else 1.0, **extra)
        piezas.append(pz)
        guiones.update(g)

    acompanantes = {
        "instagram": {"es": "Todo comienza con una semilla. StarSeed es un sistema operativo social, abierto y de todos, y lo estamos construyendo en abierto. Participa, ofrece tu tiempo como voluntaria o voluntario, aporta código o dona (enlace de donación: próximamente). Entra: starseed-os.vercel.app #StarSeed #CodigoAbierto #SoftwareLibre #Comunidad",
                      "en": "It all starts with a seed. StarSeed is an open, social operating system for everyone, and we're building it in the open. Take part, volunteer your time, contribute code or donate (donation link: coming soon). Visit starseed-os.vercel.app #StarSeed #OpenSource #FreeSoftware #Community"},
        "tiktok": {"es": "Todo comienza con una semilla. Sistema operativo social, abierto y de todos, en construcción. starseed-os.vercel.app #StarSeed #CodigoAbierto #Comunidad",
                   "en": "It all starts with a seed. An open, social operating system for everyone, in the making. starseed-os.vercel.app #StarSeed #OpenSource #Community"},
        "youtube": {"es": "Siembra StarSeed: un sistema operativo social, abierto y de todos. Una malla entre tu dispositivo y tu comunidad, IA local de 1,58 bits y estaciones de sonido, todo en construcción y bajo licencia AGPL-3.0. Participa, voluntariado, aporta código o dona (enlace de donación próximamente): https://starseed-os.vercel.app",
                    "en": "Sow StarSeed: an open, social operating system for everyone. A mesh between your device and your community, local 1.58-bit AI and sound stations, all in the making and AGPL-3.0 licensed. Take part, volunteer, contribute code or donate (donation link coming soon): https://starseed-os.vercel.app"},
        "x_twitter": {"es": "Un sistema operativo social, abierto y de todos. Lo estamos construyendo en abierto (AGPL-3.0). Participa, voluntariado, aporta código o dona (enlace pronto). https://starseed-os.vercel.app #StarSeed",
                      "en": "An open, social operating system for everyone. We're building it in the open (AGPL-3.0). Take part, volunteer, contribute code or donate (link soon). https://starseed-os.vercel.app #StarSeed"},
        "linkedin": {"es": "Construimos StarSeed OS, un sistema operativo social, abierto y descentralizado, en abierto y bajo licencia AGPL-3.0. Hay cuatro formas de sumarse: participar, voluntariado, aportar código y donar (enlace de donación próximamente). Todo está en construcción: se agradece cualquier ojo crítico. https://starseed-os.vercel.app",
                     "en": "We're building StarSeed OS, an open, decentralized social operating system, in the open and under the AGPL-3.0 licence. There are four ways to join in: take part, volunteer, contribute code and donate (donation link coming soon). Everything is a work in progress, and critical eyes are welcome. https://starseed-os.vercel.app"},
        "bluesky": {"es": "Un sistema operativo social, abierto y de todos, en construcción y con código abierto (AGPL-3.0). Participa o aporta código: https://starseed-os.vercel.app",
                    "en": "An open, social operating system for everyone, in the making and open source (AGPL-3.0). Take part or contribute code: https://starseed-os.vercel.app"},
        "mastodon": {"es": "StarSeed OS: un sistema operativo social, abierto y descentralizado, en construcción y bajo AGPL-3.0. Participa, voluntariado, aporta código o dona (enlace de donación próximamente). https://starseed-os.vercel.app #StarSeed #CodigoAbierto #Fediverso",
                     "en": "StarSeed OS: an open, decentralized social operating system, in the making and under AGPL-3.0. Take part, volunteer, contribute code or donate (donation link coming soon). https://starseed-os.vercel.app #StarSeed #OpenSource #Fediverse"},
        "telegram": {"es": "Siembra StarSeed: sistema operativo social, abierto y de todos, en construcción. https://starseed-os.vercel.app",
                     "en": "Sow StarSeed: an open, social operating system for everyone, in the making. https://starseed-os.vercel.app"},
    }

    return {
        "id": "siembra-starseed",
        "nombre": "Siembra StarSeed · participar, voluntariado, código y donación",
        "descripcion": "Campaña de arranque de la Fase Semilla: invita a participar, ofrecer tiempo, aportar código abierto o donar. Piezas originales hechas por código con el motor 3D propio del Estudio; todo queda para aprobar y no se ha publicado nada.",
        "marca": {"nombre": "StarSeed", "url": URL, "url_qr": "https://" + URL, "simbolo": "/repo/public/starseed-symbol.png"},
        "paleta": PALETA,
        "objetivo": "visitas y voluntarios",
        "reglas": ["solo hechos reales", "lo que está en marcha se dice «en construcción»", "enlace de donación: próximamente (no hay enlace de pago confirmado)", "sin música ni imágenes de terceros", "audio sintetizado"],
        "guiones": guiones,
        "piezas": piezas,
        "textos_acompanantes": acompanantes,
    }


if __name__ == "__main__":
    c = construir()
    destino = AQUI / "siembra-starseed.json"
    destino.write_text(json.dumps(c, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"{destino}: {len(c['piezas'])} piezas, {len(c['guiones'])} guiones")
