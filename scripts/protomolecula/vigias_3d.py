#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigías de la Biblioteca (AV1011G): avisan y crean la tarea cuando UniMate, Filigree3D o BTC3D publican código.

Una pasada (a lo sumo una cada ~20 h, guarda con reloj inyectable):
  1. observa en la red pública qué hay de cada herramienta (repositorio, README, sondas, licencias, pesos);
  2. lo compara con LO QUE EL PROYECTO DA POR SABIDO (`vigias_3d_datos.LINEA_BASE`, contrato §1);
  3. cada diferencia se avisa UNA sola vez (estado en ~/.starseed/vigia-3d.json) en el Chat Director;
  4. si el código pasa a estar publicado, deja la tarea del adaptador en `starseed_memory_root/olas/`; si los
     pesos no son de uso libre, la deja como PROPUESTA en `olas/propuestas/` (no entra al enjambre sin Alex).

Honestidad: lo que no se pudo leer queda como «sin datos» y NO se compara; nunca se escribe un cambio inventado.
`--en-seco` mira la red pero no escribe nada (ni estado, ni cola, ni aviso).
Uso: python3 scripts/protomolecula/vigias_3d.py [--en-seco] [--forzar] [--solo unimate,btc3d] [--json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from actualizar_catalogo import _escribir_atomico as escribir_atomico  # noqa: E402
from vigias_3d_cola import crear_cola, orden_encolar  # noqa: E402
from vigias_3d_datos import FECHA_BASE, LINEA_BASE, VIGIAS, Vigia  # noqa: E402
from vigias_3d_fuentes import NO_EXISTE, OK, SIN_DATOS, Fuentes, clasificar_licencia, licencia_hf, repo_de_url, senales_readme, uso_de_licencia  # noqa: E402

ESTADO = Path.home() / ".starseed" / "vigia-3d.json"
RAIZ_OS = Path(os.environ.get("STARSEED_ROOT") or Path.home() / "Documents" / "starseed-os-main")
OLAS = RAIZ_OS / "starseed_memory_root" / "olas"
HORAS_ENTRE_PASADAS = 20
DE = "vigia-3d"


# ───────────────────────────── observar ─────────────────────────────
def _vacia(v: Vigia) -> dict:
    return {
        "id": v.id, "repo": None, "repo_origen": None, "repo_existe": None, "codigo_publicado": None, "sondas": {},
        "comando_inferencia": None, "fecha_codigo": None, "anuncia_pendiente": None, "pendiente": None,
        "inferencia_marcada": None, "contradiccion": False, "licencia_codigo": None,
        "modelos_oficiales": [], "modelos_otros": [], "licencias_pesos": {}, "licencia_pesos": None, "uso_pesos": None,
        "hf_indexado": None, "articulo": None, "sin_datos": [],
    }


def observar(v: Vigia, f: Fuentes, atom: dict | None) -> dict:
    """Lo que hay HOY en la red de una herramienta. Un campo que no se pudo leer queda en None y se anota en `sin_datos`."""
    o = _vacia(v)
    faltan: list[str] = o["sin_datos"]
    if atom and v.arxiv in atom:
        o["articulo"] = {k: atom[v.arxiv][k] for k in ("titulo", "actualizado")}

    # Hugging Face: el artículo (si alguien lo citó en un README) trae el repo y los modelos que lo enlazan.
    estado, art = f.articulo_hf(v.arxiv)
    enlazados: list[str] = []
    repo_hf: str | None = None
    if estado == OK and isinstance(art, dict):
        o["hf_indexado"] = True
        repo_hf = repo_de_url(art.get("githubRepo"))
        enlazados = [m["id"] for m in art.get("linkedModels") or [] if isinstance(m, dict) and isinstance(m.get("id"), str)]
    elif estado == NO_EXISTE:
        o["hf_indexado"] = False  # «no indexado» es una respuesta, no un fallo
    else:
        faltan.append("hf-articulo")
    e2, lista = f.modelos_de_arxiv(v.arxiv)
    if e2 == OK:
        enlazados += [m["id"] for m in lista if isinstance(m, dict) and isinstance(m.get("id"), str) and m["id"] not in enlazados]
    elif e2 == SIN_DATOS:
        faltan.append("hf-modelos")

    # Repositorio: el que da el contrato, si no el que enlaza Hugging Face, si no uno citado en el resumen de arXiv.
    if v.repo:
        o["repo"], o["repo_origen"] = v.repo, "contrato"
    elif repo_hf:
        o["repo"], o["repo_origen"] = repo_hf, "huggingface"
    elif atom and v.arxiv in atom and atom[v.arxiv]["repos"]:
        o["repo"], o["repo_origen"] = atom[v.arxiv]["repos"][0], "arxiv"

    if o["repo"]:
        _leer_repo(v, f, o)

    # Pesos: oficiales = los que el contrato nombra o cuyo autor es el dueño del repo; el resto son pista.
    dueno = (o["repo"] or "/").split("/")[0].lower()
    for m in dict.fromkeys([*v.modelos_hf, *enlazados]):
        if m in v.modelos_hf or (dueno and m.split("/")[0].lower() == dueno):
            o["modelos_oficiales"].append(m)
        else:
            o["modelos_otros"].append(m)
    for m in o["modelos_oficiales"]:
        e3, modelo = f.modelo_hf(m)
        if e3 == OK:
            o["licencias_pesos"][m] = licencia_hf(modelo)
        elif e3 == SIN_DATOS:
            faltan.append(f"hf-modelo:{m}")
    declaradas = [lic for lic in o["licencias_pesos"].values() if lic]
    if declaradas:
        o["licencia_pesos"] = declaradas[0]
        o["uso_pesos"] = uso_de_licencia(declaradas[0])
    return o


def _leer_repo(v: Vigia, f: Fuentes, o: dict) -> None:
    repo = o["repo"]
    faltan = o["sin_datos"]
    estado, readme, rama = f.texto_raw(repo, "README.md", v.rama)
    sondas_ok = False
    if estado == OK:
        o.update(senales_readme(readme))
    elif estado == SIN_DATOS:
        faltan.append("readme")
    for ruta in v.sondas:
        e, _, r = f.texto_raw(repo, ruta, rama or v.rama, rango=True)
        o["sondas"][ruta] = True if e == OK else False if e == NO_EXISTE else None
        sondas_ok = sondas_ok or e == OK
        rama = rama or r
        if e == SIN_DATOS:
            faltan.append(f"sonda:{ruta}")
    e, lic, _ = f.texto_raw(repo, "LICENSE", rama or v.rama)
    if e == OK:
        o["licencia_codigo"] = clasificar_licencia(lic)
    elif e == SIN_DATOS:
        faltan.append("licencia")
    if estado == SIN_DATOS and not sondas_ok:
        return  # sin README ni sonda no se afirma nada del código
    o["repo_existe"] = estado == OK or sondas_ok
    # Código publicado = el repo existe y hay prueba de inferencia: una sonda, un comando en el README o una casilla MARCADA
    # que nombra la inferencia. Una sonda que existe pesa más que un «coming soon» olvidado. Sin sonda, un pendiente de
    # INFERENCIA o de código en general (el de entrenamiento o datos no cuenta, ver `pendiente_de_codigo`) choca con la
    # prueba: no se afirma ni se niega (None) y se marca la contradicción para decirla en el aviso, no para callarla.
    hay_prueba = sondas_ok or bool(o["comando_inferencia"]) or bool(o["inferencia_marcada"])
    if not o["repo_existe"]:
        o["codigo_publicado"] = False
    elif hay_prueba:
        if sondas_ok or not o["anuncia_pendiente"]:
            o["codigo_publicado"] = True
        else:
            o["codigo_publicado"], o["contradiccion"] = None, True
    elif any(valor is None for valor in o["sondas"].values()):
        o["codigo_publicado"] = None  # una sonda sin respuesta no es un «no»: se dice que no se sabe
    else:
        o["codigo_publicado"] = False


# ───────────────────────────── comparar ─────────────────────────────
def novedades(v: Vigia, obs: dict) -> list[dict]:
    """Diferencias REALES con la línea base. Un dato sin leer (None) no es una diferencia."""
    base = LINEA_BASE[v.id]
    salida: list[dict] = []

    def nueva(clave: str, valor: str, texto: str) -> None:
        salida.append({"clave": clave, "valor": valor, "texto": texto, "llave": f"{v.id}:{clave}={valor}"})

    if obs["repo"] and not base["repo"]:
        nueva("repo", obs["repo"], f"ya tiene repositorio: https://github.com/{obs['repo']} (encontrado por {obs['repo_origen']}).")
    if obs["codigo_publicado"] is True and not base["codigo_publicado"]:
        cuando = f" (su README lo anuncia el {obs['fecha_codigo']})" if obs.get("fecha_codigo") else ""
        cmd = f" Comando de inferencia: {obs['comando_inferencia']}." if obs.get("comando_inferencia") else ""
        nueva("codigo", "publicado", f"el código de inferencia está publicado{cuando}.{cmd}")
    if obs["contradiccion"] and not base["codigo_publicado"]:
        prueba = f"el comando `{obs['comando_inferencia']}`" if obs["comando_inferencia"] else "una casilla marcada que nombra la inferencia"
        nueva("codigo-dudoso", (obs["comando_inferencia"] or "casilla-marcada")[:80],
              f"señales contradictorias sobre el código: el README trae {prueba} pero también dice «{obs['pendiente']}». "
              f"No se crea la tarea hasta aclararlo: compruébalo en https://github.com/{obs['repo']}.")
    if obs["licencia_codigo"] and obs["licencia_codigo"] != base["licencia_codigo"]:
        nueva("licencia-codigo", obs["licencia_codigo"], f"licencia del código: {obs['licencia_codigo']}.")
    for m in obs["modelos_oficiales"]:
        if m not in base["modelos_hf"]:
            nueva("pesos", m, f"pesos oficiales nuevos en Hugging Face: {m}.")
    if obs["licencia_pesos"] and obs["licencia_pesos"] != base["licencia_pesos"]:
        uso = obs["uso_pesos"] or "sin clasificar"
        nueva("licencia-pesos", obs["licencia_pesos"], f"los pesos declaran la licencia {obs['licencia_pesos']} (uso {uso}).")
    return salida


def texto_aviso(v: Vigia, obs: dict, nuevas: list[dict], cola: dict | None) -> str:
    lineas = [f"Vigía 3D · {v.nombre} ({v.etapa}): hay novedades respecto a lo que el contrato da por sabido ({FECHA_BASE})."]
    lineas += [f"- {n['texto']}" for n in nuevas]
    if obs["modelos_otros"]:
        lineas.append("- Derivados de terceros que citan su artículo (pista, no dependencia): " + ", ".join(obs["modelos_otros"][:5]) + ".")
    if cola and cola.get("estado") == "creada":
        lineas.append(f"- Tarea {cola['tarea']} creada en la cola {cola['cola']}: adaptador local en el taller 3D.")
    elif cola and cola.get("estado") == "propuesta":
        sigue = "sigue PROPUESTA" if cola.get("ya_estaba") else "PROPUESTA"
        lineas.append(f"- Tarea {cola['tarea']} {sigue}, sin encolar (pesos no libres o sin comprobar: {cola.get('reservada')}). "
                      f"Encolarla es tu visto bueno; después sigue el camino normal del enjambre. Para encolarla: {orden_encolar(cola.get('ruta'))}")
    elif cola and cola.get("estado") == "ya-existe":
        lineas.append(f"- La tarea {cola['tarea']} ya constaba: no se crea otra.")
    elif cola and cola.get("estado") == "invalida":
        lineas.append(f"- No se pudo crear la tarea: {cola.get('motivo')}. La novedad no se da por avisada: se reintenta en la próxima pasada.")
    lineas.append("Pendiente de una persona: actualizar el estado de la herramienta en src/lib/avatares/adn/motores.ts cuando el adaptador esté integrado.")
    return "\n".join(lineas)


# ───────────────────────────── estado y pasada ─────────────────────────────
def cargar_estado(ruta: Path) -> dict:
    try:
        d = json.loads(ruta.read_text("utf-8"))
        if isinstance(d, dict) and d.get("version") == 1:
            return d
    except (OSError, ValueError):
        pass
    return {"version": 1, "ultima_pasada": None, "ultima_epoch": 0.0, "avisados": {}, "tareas": {}}


def avisar_al_chat(texto: str) -> str:
    """Al Chat Director de Genesis. Devuelve «avisado» o el motivo de no haber podido (que se reintenta mañana)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "puente"))
        import director_chat

        director_chat.publicar(texto, de=DE, rol="director", tipo="aviso")
        return "avisado"
    except Exception as e:  # noqa: BLE001  un chat caído no debe parar al vigía: queda sin marcar y se reintenta
        return f"no pude avisar ({type(e).__name__})"


def ejecutar(fuentes: Fuentes, estado_ruta: Path = ESTADO, olas: Path = OLAS, ahora: Callable[[], float] = time.time,
             en_seco: bool = False, forzar: bool = False, solo: set[str] | None = None,
             avisar: Callable[[str], str] = avisar_al_chat) -> dict:
    estado = cargar_estado(estado_ruta)
    t = ahora()
    if not (forzar or en_seco) and t - float(estado.get("ultima_epoch") or 0) < HORAS_ENTRE_PASADAS * 3600:
        return {"omitida": f"ya se vigiló hace menos de {HORAS_ENTRE_PASADAS} h ({estado.get('ultima_pasada')})", "vigias": {}, "escrito": False}
    elegidos = [v for v in VIGIAS if not solo or v.id in solo]
    e_atom, atom = fuentes.atom([v.arxiv for v in elegidos])
    dia = datetime.fromtimestamp(t, timezone.utc)
    informe: dict = {"vigias": {}, "arxiv": e_atom, "escrito": False, "llamadas": 0}
    hubo_datos = e_atom == OK
    for v in elegidos:
        obs = observar(v, fuentes, atom if e_atom == OK else None)
        if e_atom != OK:
            obs["sin_datos"].append("arxiv")
        hubo_datos = hubo_datos or obs["hf_indexado"] is not None or obs["repo_existe"] is not None or bool(obs["licencias_pesos"])
        todas = novedades(v, obs)
        nuevas = [n for n in todas if n["llave"] not in estado["avisados"]]
        fila = {"observado": obs, "novedades": todas, "nuevas": [n["llave"] for n in nuevas], "cola": None, "aviso": None}
        informe["vigias"][v.id] = fila
        if not nuevas:
            continue
        if any(n["clave"] == "codigo" for n in nuevas):
            fila["cola"] = crear_cola(olas, v, obs, dia, ya_conocidas=set(estado["tareas"]), escribir=not en_seco)
        # Una cola inválida SÍ avisa, con su causa: desde el gancho diario nadie lee el informe impreso y el
        # fallo se repetiría cada día en silencio. Pero la novedad no se da por avisada: se reintenta mañana.
        invalida = bool(fila["cola"]) and fila["cola"]["estado"] == "invalida"
        texto = texto_aviso(v, obs, nuevas, fila["cola"])
        if en_seco:
            fila["aviso"] = "en seco: " + texto.split("\n")[0]
            continue
        fila["aviso"] = avisar(texto)
        if fila["aviso"] != "avisado" or invalida:
            continue
        for n in nuevas:
            estado["avisados"][n["llave"]] = dia.strftime("%Y-%m-%dT%H:%M:%SZ")
        if fila["cola"] and fila["cola"]["estado"] in ("creada", "propuesta", "ya-existe"):  # recordarla evita recrearla si la cola se retira
            estado["tareas"].setdefault(fila["cola"]["tarea"], {"cola": fila["cola"].get("cola"), "creada": dia.strftime("%Y-%m-%dT%H:%M:%SZ")})
        informe["escrito"] = True
    informe["llamadas"] = fuentes.llamadas
    if not en_seco and hubo_datos:  # una pasada sin ningún dato no cuenta: se reintenta pronto
        estado["ultima_pasada"] = dia.strftime("%Y-%m-%dT%H:%M:%SZ")
        estado["ultima_epoch"] = t
        escribir_atomico(estado_ruta, json.dumps(estado, ensure_ascii=False, indent=2) + "\n")
        informe["escrito"] = True
    return informe


def resumen(informe: dict) -> str:
    if informe.get("omitida"):
        return f"Vigía 3D: {informe['omitida']}."
    partes = []
    for id_, fila in informe["vigias"].items():
        o = fila["observado"]
        if o["sin_datos"] and o["repo_existe"] is None and not o["licencias_pesos"]:
            estado = "sin datos (" + ", ".join(o["sin_datos"][:3]) + ")"
        elif o["codigo_publicado"]:
            estado = "código publicado"
        elif o["contradiccion"]:
            estado = "señales contradictorias sobre el código (comando y pendiente)"
        elif o["repo"]:
            estado = "repositorio sin código de inferencia"
        else:
            estado = "sin repositorio público"
        extra = f" · aviso: {fila['aviso']}" if fila["aviso"] else ""
        if fila["cola"]:
            seco = " (ya estaba)" if fila["cola"].get("ya_estaba") else ("" if fila["cola"].get("escrita", True) else " (en seco: sin escribir)")
            extra += f" · cola: {fila['cola']['estado']} {fila['cola'].get('cola') or ''}".rstrip() + seco
        partes.append(f"{id_}: {estado}{extra}")
    return f"Vigía 3D ({informe['llamadas']} llamadas) · " + " | ".join(partes)


def main(argv: list[str] | None = None, ahora: Callable[[], float] = time.time) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--en-seco", action="store_true", help="mira la red pero no escribe estado, cola ni aviso")
    p.add_argument("--forzar", action="store_true", help="ignora la guarda de una pasada cada ~20 h")
    p.add_argument("--solo", help="ids separados por coma (unimate, filigree3d, btc3d)")
    p.add_argument("--estado", type=Path, default=ESTADO)
    p.add_argument("--olas", type=Path, default=OLAS)
    p.add_argument("--pausa", type=float, default=0.4)
    p.add_argument("--json", action="store_true", help="imprime el informe completo")
    a = p.parse_args(argv)
    informe = ejecutar(Fuentes(pausa=a.pausa), a.estado, a.olas, ahora=ahora, en_seco=a.en_seco, forzar=a.forzar, solo=set(a.solo.split(",")) if a.solo else None)
    print(json.dumps(informe, ensure_ascii=False, indent=2) if a.json else resumen(informe))
    return 0


if __name__ == "__main__":
    sys.exit(main())
