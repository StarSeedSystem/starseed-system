#!/usr/bin/env python3
"""estudio.py — la puerta única del Estudio MetaGeminis (motor 3D propio, gratis y repetible).

  python3 scripts/sociales/estudio/estudio.py render --campana siembra-starseed --pieza reel --formato instagram-reels [--borrador]
  python3 scripts/sociales/estudio/estudio.py lote   --campana siembra-starseed
  python3 scripts/sociales/estudio/estudio.py listar|verificar|galeria|vista|validar --campana <id>

La campaña se lee de `campanas/<id>.json`; cada pieza emite una ficha (sha256, formato, duración, peso, medio) en
`<salida>/<campana>/_estado/` y `manifiesto.json` junta todas. Nada se publica: todo queda «para_aprobar».
Un solo Chromium a la vez y cede el turno mientras haya `next build` o `vitest` (el contenedor tiene 2 CPU).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import audio  # noqa: E402
import captura  # noqa: E402
import codificar  # noqa: E402
import manifiesto  # noqa: E402
import nucleo  # noqa: E402
import verificar  # noqa: E402
from servidor import Servidor  # noqa: E402

TMP = Path(os.environ.get("ESTUDIO_TMP", "/tmp/estudio-metageminis"))
ESCENAS_ESTILO_AUDIO = {"semilla-estelar": "semilla", "malla-viva": "malla", "cristal-liquido": "cristal", "espiral-omnifrecuencias": "espiral"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ───────────────────────── contexto ─────────────────────────

def cargar(args) -> tuple[dict, dict, list[nucleo.Trabajo], Path]:
    formatos = nucleo.cargar_formatos()
    campana = nucleo.cargar_campana(args.campana)
    problemas = nucleo.validar_campana(campana, formatos)
    if problemas:
        raise SystemExit("La campaña no pasa la validación:\n  - " + "\n  - ".join(problemas))
    piezas = [x for x in (getattr(args, "pieza", None) or "").split(",") if x] or None
    fmts = [x for x in (getattr(args, "formato", None) or "").split(",") if x] or None
    idiomas = [x for x in (getattr(args, "idioma", None) or "").split(",") if x] or None
    trabajos = nucleo.plan_campana(campana, formatos, piezas, idiomas, fmts)
    if not trabajos:
        raise SystemExit("Ningún trabajo coincide con esos filtros (¿pieza/formato/idioma?).")
    salida = Path(getattr(args, "salida", None) or nucleo.SALIDA_DEFECTO) / campana["id"]
    return campana, formatos, trabajos, salida


_QR: dict[str, dict] = {}


def qr_para(campana: dict, trabajo: nucleo.Trabajo) -> dict | None:
    if not any(b.get("qr") for b in nucleo.beats_de(campana, trabajo)):
        return None
    url = campana["marca"].get("url_qr") or "https://" + campana["marca"]["url"]
    if url not in _QR:
        _QR[url] = {"matriz": nucleo.qr_matriz(url)["matriz"], "url": url}
    return _QR[url]


def indices_de_muestra(beats: list[dict], fps: int, n: int) -> list[int]:
    """Fotogramas donde se mide contraste y zona segura: la mitad (ya asentada) de cada beat, más el final."""
    out = set()
    for b in beats:
        t0 = b.get("t", 0)
        d = b.get("d", 2.0)
        t = t0 + (min(d, 3.0) * 0.62 if not b.get("fin") else 1.7)
        out.add(min(n - 1, max(0, int(round(t * fps)))))
    out.add(max(0, n - 12))
    return sorted(out)


def tope_de(f: dict, tipo: str = "video", estandar: int | None = nucleo.TOPE_VIDEO_BYTES) -> int | None:
    """Tope de peso de un archivo: el menor entre el estándar (15 MB para vídeo) y el que declara el formato para ese tipo."""
    pm = (f.get("pesoMax") or {}).get(tipo)
    if pm and estandar:
        return min(estandar, int(pm))
    return int(pm) if pm else estandar


def resumen_contraste(medidas: list[dict]) -> dict:
    if not medidas:
        return {"capas": 0, "minimo": None, "fallos": []}
    fallos = [m for m in medidas if not m["ok"]]
    return {"capas": len(medidas), "minimo": min(m["razon"] for m in medidas), "fallos": [{k: m[k] for k in ("id", "texto", "razon", "umbral")} for m in fallos]}


def sintetizar_audio(pz: dict, escena_id: str, dur: float, destino: Path) -> Path | None:
    a = pz.get("audio")
    if a is None or a is False:
        return None
    estilo = a.get("estilo") or ESCENAS_ESTILO_AUDIO.get(escena_id, "semilla")
    y = audio.sintetizar(dur, a.get("pulsos", []), estilo, a.get("eventos"), a.get("semilla", 11))
    crudo = destino.with_name("audio-crudo.wav")
    audio.escribir_wav(crudo, y)
    codificar.normalizar_wav(crudo, destino)
    return destino


# ───────────────────────── vídeo ─────────────────────────

def hacer_video(srv: Servidor, campana: dict, t: nucleo.Trabajo, o) -> tuple[list[dict], dict]:
    pz = t.pieza
    cfg = nucleo.cfg_motor(campana, t, borrador=o.borrador, depurar=o.depurar, qr=qr_para(campana, t))
    fps, dur = t.fps, float(t.duracion)
    n = int(round(dur * fps))
    if o.max_fotogramas:
        n = min(n, o.max_fotogramas)
        dur = n / fps
    tmp = TMP / campana["id"] / t.id
    shutil.rmtree(tmp, ignore_errors=True)
    (tmp / "claves").mkdir(parents=True)
    master = tmp / "maestro.mp4"
    muestras = set(indices_de_muestra(cfg["textos"], fps, n))
    contrastes: list[dict] = []
    zonas: list[dict] = []
    factor = 0.5 if o.borrador else 1.0
    t0 = time.time()
    with captura.Sesion(srv, cfg, factor_captura=factor) as s:
        with codificar.Maestro(master, fps, crf=22 if o.borrador else 12, preset="ultrafast" if o.borrador else "veryfast") as m:
            for i in range(n):
                tt = i / fps
                s.render(tt)
                png = s.captura()
                m.escribir(png)
                if i in muestras:
                    capas = s.capas()
                    zonas += [dict(z, t=round(tt, 2)) for z in verificar.comprobar_zona_segura(capas, t.maestro | {"margenes": t.margenes, "evitar": t.evitar})]
                    codificar.a_imagen(png).save(tmp / "claves" / f"{i:04d}.jpg", quality=88)
                    s.render(tt, sin_texto=True)
                    png2 = s.captura()
                    contrastes += [dict(c, t=round(tt, 2)) for c in verificar.medir_contraste(png2, capas, t.maestro["ancho"], t.maestro["alto"])]
                if i and i % (fps * 3) == 0:
                    log(f"  {t.id}: {i}/{n} fotogramas ({(time.time() - t0) / i:.2f} s/fotograma)")
        consola = s.consola
    log(f"  {t.id}: {n} fotogramas en {time.time() - t0:.0f} s")
    destellos = verificar.destellos_por_segundo(verificar.luminancias_por_fotograma(master), fps)
    wav = sintetizar_audio(pz, cfg["escena"]["id"], dur, tmp / "audio.wav")
    meta = {"trabajo": t.id, "escena": cfg["escena"]["id"], "idioma": t.idioma, "contraste": resumen_contraste(contrastes), "zona_segura": zonas, "destellos_por_segundo": destellos, "consola": consola[:5], "segundos_render": round(time.time() - t0)}
    base = (Path(o.salida_borrador) if o.borrador else None)
    entradas: list[dict] = []
    vistos: dict[str, dict] = {}
    escena = cfg["escena"]["id"]
    for e in t.entregas:
        if e.compartida:
            ref = vistos.get(e.archivo)
            if ref is None:
                continue
            entradas.append(manifiesto.entrada(campana["id"], pz, e, o.salida_final / e.archivo, t.idioma, escena, dur, fps, ref["tam"], ref["sha"], ref["verif"]))
            continue
        f = e.formato
        if o.borrador:
            destino = base / f"{t.id}.mp4"
            destino.parent.mkdir(parents=True, exist_ok=True)
            codificar.derivar_mp4(master, destino, t.maestro["ancho"] // 2, t.maestro["alto"] // 2, fps, dur, wav, 40_000_000, crf=24, preset="veryfast")
            log(f"  borrador: {destino} ({destino.stat().st_size / 1e6:.1f} MB)")
            shutil.copytree(tmp / "claves", base / f"{t.id}-claves", dirs_exist_ok=True)
            break
        destino = o.salida_final / e.archivo
        destino.parent.mkdir(parents=True, exist_ok=True)
        info = codificar.derivar_mp4(master, destino, f["ancho"], f["alto"], fps, dur, wav, tope_de(f, "video"))
        vv = verificar.verificar_video(destino, {"ancho": f["ancho"], "alto": f["alto"], "fps": fps, "duracion": dur, "tope_bytes": tope_de(f, "video"), "con_audio": wav is not None})
        verif = {"video": vv["ok"], "problemas": vv["problemas"], "sonoridad_lufs": (vv["sonoridad"] or {}).get("lufs"), "pico_dbtp": (vv["sonoridad"] or {}).get("pico_dbtp"), "codificacion": info,
                 "contraste_min": meta["contraste"]["minimo"], "contraste_fallos": len(meta["contraste"]["fallos"]), "zona_segura_ok": not zonas, "destellos_por_segundo": destellos, "bajo_tope": info["bajo_tope"]}
        sha = manifiesto.sha256_archivo(destino)
        vistos[e.archivo] = {"tam": (f["ancho"], f["alto"]), "sha": sha, "verif": verif}
        entradas.append(manifiesto.entrada(campana["id"], pz, e, destino, t.idioma, escena, dur, fps, (f["ancho"], f["alto"]), sha, verif))
        log(f"  {e.archivo}: {destino.stat().st_size / 1e6:.2f} MB · {'OK' if vv['ok'] else 'PROBLEMAS ' + str(vv['problemas'])}")
        if pz.get("webm") and not o.borrador and not f.get("_sin_webm") and e is [x for x in t.entregas if not x.compartida][0]:
            dw = destino.with_suffix(".webm")
            codificar.derivar_webm(master, dw, f["ancho"], f["alto"], dur, wav)
            ew = nucleo.Entrega(f, dw.relative_to(o.salida_final).as_posix(), "webm")
            shaw = manifiesto.sha256_archivo(dw)
            entradas.append(manifiesto.entrada(campana["id"], pz, ew, dw, t.idioma, escena, dur, fps, (f["ancho"], f["alto"]), shaw, dict(verif, video=True, problemas=[], webm=True)))
            log(f"  {ew.archivo}: {dw.stat().st_size / 1e6:.2f} MB")
    if not o.conservar:
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        meta["tmp"] = str(tmp)
    return entradas, meta


# ───────────────────────── estáticos (imagen, cartel, carrusel, banner) ─────────────────────────

def hacer_estatico(srv: Servidor, campana: dict, t: nucleo.Trabajo, o) -> tuple[list[dict], dict]:
    pz = t.pieza
    cfg = nucleo.cfg_motor(campana, t, borrador=o.borrador, depurar=o.depurar, qr=qr_para(campana, t))
    tmp = TMP / campana["id"] / t.id
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    tt = float(cfg["t_estatico"])
    factor = 0.5 if o.borrador else 1.0
    gif = pz.get("gif")
    contrastes: list[dict] = []
    zonas: list[dict] = []
    frames_gif: list = []
    t0 = time.time()
    with captura.Sesion(srv, cfg, factor_captura=factor) as s:
        tiempos = list(gif["tiempos"]) if gif else []
        for tg in tiempos + [tt]:
            s.render(tg)
            png = s.captura()
            capas = s.capas()
            zonas += [dict(z, t=round(tg, 2)) for z in verificar.comprobar_zona_segura(capas, t.maestro | {"margenes": t.margenes, "evitar": t.evitar})]
            s.render(tg, sin_texto=True)
            png2 = s.captura()
            contrastes += [dict(c, t=round(tg, 2)) for c in verificar.medir_contraste(png2, capas, t.maestro["ancho"], t.maestro["alto"])]
            if tg in tiempos:
                frames_gif.append(codificar.a_imagen(png))
        principal = png
        if any(e.contenedor == "pdf" for e in t.entregas) and not o.borrador:
            f0 = t.maestro
            dpi = f0.get("dpi") or 300
            pdf_tmp = tmp / "cartel.pdf"
            s.render(tt)
            s.pdf(pdf_tmp, f0["ancho"] / dpi * 25.4, f0["alto"] / dpi * 25.4)
        consola = s.consola
    img = codificar.a_imagen(principal)
    qr_ok = None
    if cfg.get("qr"):
        qr_ok = verificar.decodificar_qr(principal, cfg["qr"]["url"])
    meta = {"trabajo": t.id, "escena": cfg["escena"]["id"], "idioma": t.idioma, "contraste": resumen_contraste(contrastes), "zona_segura": zonas, "qr": qr_ok, "consola": consola[:5], "segundos_render": round(time.time() - t0)}
    entradas: list[dict] = []
    vistos: dict[str, dict] = {}
    escena = cfg["escena"]["id"]
    lam = t.lamina
    for e in t.entregas:
        f = e.formato
        if e.compartida:
            ref = vistos.get(e.archivo)
            if ref:
                entradas.append(manifiesto.entrada(campana["id"], pz, e, o.salida_final / e.archivo, t.idioma, escena, ref.get("dur"), None, ref["tam"], ref["sha"], ref["verif"], lamina=lam))
            continue
        if o.borrador:
            d = Path(o.salida_borrador) / f"{t.id}.png"
            d.parent.mkdir(parents=True, exist_ok=True)
            img.save(d)
            log(f"  borrador: {d}")
            break
        destino = o.salida_final / e.archivo
        destino.parent.mkdir(parents=True, exist_ok=True)
        dur_gif = None
        tope_img = tope_de(f, "imagen", None)
        if e.contenedor == "png":
            codificar.guardar_png(img, destino, tope_img)
        elif e.contenedor == "jpg":
            codificar.guardar_jpg(img, destino, pz.get("calidad_jpg", 92), tope_img)
        elif e.contenedor == "pdf":
            shutil.copyfile(tmp / "cartel.pdf", destino)
        elif e.contenedor == "gif":
            durs = list(gif["duraciones"]) + [gif.get("duracion_final", 2600)]
            info = codificar.gif_animado(frames_gif + [img], destino, durs[: len(frames_gif) + 1], tope_img or 150_000, gif.get("colores", 128))
            dur_gif = sum(durs[: len(frames_gif) + 1]) / 1000
            meta["gif"] = info
        elif e.contenedor == "apng":
            durs = list(gif["duraciones"]) + [gif.get("duracion_final", 2600)]
            codificar.apng_animado(frames_gif + [img], destino, durs[: len(frames_gif) + 1])
            dur_gif = sum(durs[: len(frames_gif) + 1]) / 1000
        else:
            raise SystemExit(f"contenedor no soportado para estáticos: {e.contenedor}")
        if e.contenedor == "pdf":
            ver = {"ok": destino.stat().st_size > 1000, "problemas": [], "bytes": destino.stat().st_size, "tamano": [f["ancho"], f["alto"]]}
        else:
            ver = verificar.verificar_estatico(destino, {"ancho": f["ancho"], "alto": f["alto"], "tope_bytes": tope_de(f, "imagen", None)})
        verif = {"archivo": ver["ok"], "problemas": ver["problemas"], "contraste_min": meta["contraste"]["minimo"], "contraste_fallos": len(meta["contraste"]["fallos"]), "zona_segura_ok": not zonas, "qr": None if qr_ok is None else qr_ok["ok"]}
        sha = manifiesto.sha256_archivo(destino)
        vistos[e.archivo] = {"tam": (f["ancho"], f["alto"]), "sha": sha, "verif": verif, "dur": dur_gif}
        entradas.append(manifiesto.entrada(campana["id"], pz, e, destino, t.idioma, escena, dur_gif, None, (f["ancho"], f["alto"]), sha, verif, lamina=lam))
        log(f"  {e.archivo}: {destino.stat().st_size / 1000:.0f} KB · {'OK' if ver['ok'] else 'PROBLEMAS ' + str(ver['problemas'])}")
    if o.conservar:
        img.convert("RGB").save(tmp / "final.png")
        meta["tmp"] = str(tmp)
    else:
        shutil.rmtree(tmp, ignore_errors=True)
    return entradas, meta


def documento_carrusel(campana: dict, pz: dict, idioma: str, o) -> list[dict]:
    """PDF de documento (LinkedIn) con las láminas del carrusel, en orden."""
    from PIL import Image

    d = o.salida_final / "linkedin"
    d.mkdir(parents=True, exist_ok=True)
    lams = sorted((o.salida_final / "instagram").glob(f"{pz['id']}-instagram-carrusel-??-{idioma}.png"))
    if len(lams) != len(pz["laminas"]):
        log(f"  PDF de documento: faltan láminas ({len(lams)}/{len(pz['laminas'])}); se omite")
        return []
    destino = d / f"{pz['id']}-linkedin-documento-{idioma}.pdf"
    codificar.pdf_de_imagenes([Image.open(p).convert("RGB") for p in lams], destino, 120)
    formatos = nucleo.cargar_formatos()
    f = formatos["linkedin-documento"]
    e = nucleo.Entrega(f, destino.relative_to(o.salida_final).as_posix(), "pdf")
    sha = manifiesto.sha256_archivo(destino)
    log(f"  {e.archivo}: {destino.stat().st_size / 1000:.0f} KB ({len(lams)} páginas)")
    return [manifiesto.entrada(campana["id"], pz, e, destino, idioma, "varias", None, None, (f["ancho"], f["alto"]), sha, {"archivo": True, "problemas": [], "paginas": len(lams)})]


# ───────────────────────── comandos ─────────────────────────

def opciones(args, salida: Path):
    class O:
        pass

    o = O()
    o.borrador = bool(getattr(args, "borrador", False))
    o.depurar = bool(getattr(args, "depurar", False))
    o.conservar = bool(getattr(args, "conservar", False))
    o.max_fotogramas = getattr(args, "max_fotogramas", None)
    o.salida_final = salida
    o.salida_borrador = salida / "_borradores"
    return o


def ejecutar(srv: Servidor, campana: dict, t: nucleo.Trabajo, o) -> tuple[list[dict], dict]:
    return (hacer_video if t.pieza["salida"] == "video" else hacer_estatico)(srv, campana, t, o)


def ya_hecho(salida: Path, t: nucleo.Trabajo) -> bool:
    ficha = salida / manifiesto.ESTADO / f"{t.id}.json"
    if not ficha.is_file():
        return False
    try:
        datos = json.loads(ficha.read_text(encoding="utf8"))
    except Exception:
        return False
    return all((salida / e["tabla"]["ruta"]).is_file() for e in datos["entradas"]) and bool(datos["entradas"])


def cmd_render(args, lote: bool = False) -> int:
    campana, formatos, trabajos, salida = cargar(args)
    o = opciones(args, salida)
    captura.esperar_carga_pesada()
    hechos = 0
    with Servidor() as srv:
        for i, t in enumerate(trabajos, 1):
            if lote and not args.rehacer and not o.borrador and ya_hecho(salida, t):
                log(f"[{i}/{len(trabajos)}] {t.id}: ya hecho (usa --rehacer para repetirlo)")
                continue
            if i > 1 and t.pieza["salida"] == "video":
                captura.esperar_carga_pesada()
            log(f"[{i}/{len(trabajos)}] {t.id}  ({t.maestro['ancho']}x{t.maestro['alto']}, {'vídeo ' + str(t.duracion) + ' s' if t.pieza['salida'] == 'video' else t.pieza['salida']}, {len(t.entregas)} entregas)")
            entradas, meta = ejecutar(srv, campana, t, o)
            if not o.borrador:
                manifiesto.guardar_trabajo(salida, t.id, entradas, meta)
                hechos += 1
    if not o.borrador:
        # PDF de documento para carruseles completos
        for pz in campana["piezas"]:
            if pz["salida"] == "carrusel" and pz.get("pdf_documento") and (not args.pieza or pz["id"] in args.pieza.split(",")):
                for idioma in [i for i in pz.get("idiomas", ["es"]) if not args.idioma or i in args.idioma.split(",")]:
                    ent = documento_carrusel(campana, pz, idioma, o)
                    if ent:
                        manifiesto.guardar_trabajo(salida, f"{pz['id']}__documento__{idioma}", ent, {"trabajo": "documento", "idioma": idioma})
        mf = manifiesto.agregar(salida, campana)
        log(f"manifiesto: {mf['totales']['filas']} filas, {mf['totales']['archivos_unicos']} archivos, {mf['totales']['bytes'] / 1e6:.1f} MB → {salida / 'manifiesto.json'}")
    return 0


def cmd_listar(args) -> int:
    campana, formatos, trabajos, salida = cargar(args)
    tot_fr = 0
    for t in trabajos:
        n = int(round((t.duracion or 0) * t.fps)) if t.pieza["salida"] == "video" else 1
        tot_fr += n
        ents = ", ".join(f"{e.formato['id']}{'*' if e.compartida else ''}.{e.contenedor}" for e in t.entregas)
        print(f"{t.id:64} {t.maestro['ancho']}x{t.maestro['alto']:<5} {n:4} fot.  {ents}")
    print(f"\n{len(trabajos)} trabajos · {tot_fr} fotogramas · (* = reutiliza el archivo de otro formato del mismo tamaño)")
    return 0


def cmd_validar(args) -> int:
    formatos = nucleo.cargar_formatos()
    campana = nucleo.cargar_campana(args.campana)
    p = nucleo.validar_campana(campana, formatos)
    if p:
        print("PROBLEMAS:\n  - " + "\n  - ".join(p))
        return 1
    print(f"campaña «{campana['id']}»: válida ({len(campana['piezas'])} piezas)")
    return 0


def cmd_vista(args) -> int:
    """Renderiza fotogramas sueltos (JPG) para revisar a ojo antes de gastar un render completo."""
    campana, formatos, trabajos, salida = cargar(args)
    t = trabajos[0]
    cfg = nucleo.cfg_motor(campana, t, borrador=args.borrador, depurar=args.depurar, qr=qr_para(campana, t))
    out = TMP / campana["id"] / "vista"
    out.mkdir(parents=True, exist_ok=True)
    tiempos = [float(x) for x in args.tiempos.split(",")]
    captura.esperar_carga_pesada()
    with Servidor() as srv, captura.Sesion(srv, cfg, factor_captura=0.5 if args.borrador else 1.0) as s:
        for tt in tiempos:
            s.render(tt)
            p = out / f"{t.id}_{tt:06.2f}.jpg"
            codificar.a_imagen(s.captura()).save(p, quality=90)
            print(p)
    return 0


def cmd_verificar(args) -> int:
    campana, formatos, trabajos, salida = cargar(args)
    mf = manifiesto.agregar(salida, campana)
    malos = 0
    for e in mf["piezas"]:
        p = salida / e["tabla"]["ruta"]
        problemas = list(e["problemas_tabla"])
        if not p.is_file():
            problemas.append("falta el archivo")
        elif e["contenedor"] in ("mp4",):
            s = codificar.sondear(p)
            if s["bytes"] > nucleo.TOPE_VIDEO_BYTES:
                problemas.append(f"vídeo de {s['bytes'] / 1e6:.1f} MB (> 15 MB)")
            if s["codec"] != "h264" or s["pix_fmt"] != "yuv420p":
                problemas.append(f"{s['codec']}/{s['pix_fmt']}")
            if not codificar.faststart_ok(p):
                problemas.append("sin +faststart")
        v = e["verificacion"]
        if v.get("contraste_fallos"):
            problemas.append(f"{v['contraste_fallos']} textos bajo AA")
        if v.get("zona_segura_ok") is False:
            problemas.append("texto fuera de la zona segura")
        if v.get("problemas"):
            problemas += v["problemas"]
        if problemas:
            malos += 1
            print(f"✗ {e['tabla']['ruta']}: {'; '.join(problemas)}")
    print(f"{len(mf['piezas']) - malos}/{len(mf['piezas'])} filas sin problemas")
    return 1 if malos else 0


def cmd_galeria(args) -> int:
    import galeria

    campana, formatos, trabajos, salida = cargar(args)
    mf = manifiesto.agregar(salida, campana)
    ruta = galeria.generar(salida, campana, mf)
    print(ruta)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Estudio MetaGeminis: render de campañas con motor 3D propio")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def comunes(p, pieza=True):
        p.add_argument("--campana", required=True, help="id de campanas/<id>.json")
        p.add_argument("--salida", help="carpeta de salida (por defecto /mnt/user-data/outputs/metageminis)")
        if pieza:
            p.add_argument("--pieza", help="id de pieza (o varias, separadas por coma)")
            p.add_argument("--formato", help="id de formato del catálogo (o varios)")
            p.add_argument("--idioma", help="es, en o es,en")

    p = sub.add_parser("render", help="una pieza en uno o varios formatos")
    comunes(p)
    p.add_argument("--borrador", action="store_true", help="3D a baja resolución, mitad de tamaño, sin manifiesto")
    p.add_argument("--depurar", action="store_true", help="dibuja la zona segura y las zonas que tapa la interfaz")
    p.add_argument("--conservar", action="store_true", help="no borra los temporales (fotogramas clave, maestro)")
    p.add_argument("--max-fotogramas", type=int, help="limita los fotogramas (pruebas)")
    p.set_defaults(fn=lambda a: cmd_render(a, False), rehacer=True)
    p = sub.add_parser("lote", help="toda la campaña (reanuda lo ya hecho)")
    comunes(p)
    p.add_argument("--rehacer", action="store_true")
    p.add_argument("--borrador", action="store_true")
    p.add_argument("--depurar", action="store_true")
    p.add_argument("--conservar", action="store_true")
    p.add_argument("--max-fotogramas", type=int)
    p.set_defaults(fn=lambda a: cmd_render(a, True))
    p = sub.add_parser("listar", help="el plan de render sin renderizar")
    comunes(p)
    p.set_defaults(fn=cmd_listar)
    p = sub.add_parser("validar", help="valida la campaña contra el catálogo y el filtro de verdad")
    comunes(p, pieza=False)
    p.set_defaults(fn=cmd_validar)
    p = sub.add_parser("vista", help="fotogramas sueltos para revisar a ojo")
    comunes(p)
    p.add_argument("--tiempos", default="1,5,9,12.5")
    p.add_argument("--borrador", action="store_true")
    p.add_argument("--depurar", action="store_true")
    p.set_defaults(fn=cmd_vista)
    p = sub.add_parser("verificar", help="revisa lo entregado y reescribe el manifiesto")
    comunes(p)
    p.set_defaults(fn=cmd_verificar)
    p = sub.add_parser("galeria", help="galeria.html autocontenida")
    comunes(p)
    p.set_defaults(fn=cmd_galeria)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
