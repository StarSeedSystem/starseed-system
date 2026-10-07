"""Oracle Always Free: cuenta vinculada, comprobación y estado (OR1007A)."""
import json, os, subprocess, sys
from typing import Dict, List, Optional, Union
class EstadoOracle:
    def __init__(self, vinculado=False, region="", detalle=""):
        self.vinculado = vinculado; self.region = region; self.detalle = detalle
def vinculada(home="") -> bool:
    ruta = os.path.join(home or os.path.expanduser("~"), ".oci", "config")
    if not os.path.isfile(ruta): return False
    try:
        import configparser
        cfg = configparser.ConfigParser(); cfg.read(ruta)
        defaults = cfg.defaults()
        secciones = [s for s in cfg.sections() if cfg.has_option(s, "key_file")]
        perfil = os.environ.get("OCI_CLI_PROFILE", "DEFAULT")
        seccion = None
        if secciones:
            seccion = perfil if perfil in secciones else secciones[0]
        elif "key_file" in defaults:
            seccion = "DEFAULT"
        else:
            return False
        key_path = defaults.get("key_file") if seccion == "DEFAULT" else cfg.get(seccion, "key_file")
        if not key_path: return False
        if not os.path.isabs(key_path): key_path = os.path.join(os.path.dirname(ruta), key_path)
        return os.path.isfile(key_path) and os.access(key_path, os.R_OK)
    except Exception:
        return False
def parsear_instancias(salida_json: Union[dict, list], vnics: Optional[Dict[str, str]] = None) -> List[dict]:
    datos = salida_json if isinstance(salida_json, list) else (salida_json.get("data", []) if isinstance(salida_json, dict) else [])
    res: List[dict] = []
    for item in (datos if isinstance(datos, list) else []):
        if not isinstance(item, dict): continue
        nombre = item.get("display-name", "")
        res.append({"nombre": nombre, "forma": item.get("shape", ""), "ocpus": item.get("ocpus", 0), "gb": item.get("memory-in-gbs", 0), "estado": item.get("lifecycle-state", ""), "ip_publica": (vnics or {}).get(nombre, "")})
    return res
def parsear_vnics(salida_json: Union[dict, list]) -> Dict[str, str]:
    datos = salida_json if isinstance(salida_json, list) else (salida_json.get("data", []) if isinstance(salida_json, dict) else [])
    mapa: Dict[str, str] = {}
    for item in (datos if isinstance(datos, list) else []):
        if not isinstance(item, dict): continue
        nombre_inst = item.get("display-name", "")
        if nombre_inst:
            mapa[str(nombre_inst)] = str(item.get("public-ip", item.get("public_ip", "")))
    return mapa
def comprobar(correr) -> Dict[str, Union[str, bool, List]]:
    res = {"autenticado": False, "limites": {}, "instancias": [], "detalle": ""}
    tenancy = ""
    try:
        salida = correr(["oci", "iam", "availability-domain", "list"])
        texto = salida.get("stdout", salida.get("texto", "")) if isinstance(salida, dict) else str(salida)
        if "NotAuthenticated" in texto or "NotAuthorized" in texto:
            res["detalle"] = "Perfil OCI no válido o clave faltante."
            return res
        res["autenticado"] = bool(texto and (texto.startswith("[") or texto.startswith("{") or "availability_domain" in texto or "display-name" in texto))
    except Exception as exc:
        msg = str(exc)
        res["detalle"] = "Tiempo excedido (60 s): sin conectividad." if "timeout" in msg.lower() else ("Perfil OCI no autenticado." if "NotAuthenticated" in msg else ("Perfil OCI no autorizado." if "NotAuthorized" in msg else f"Error OCI: {msg}"))
        return res
    ruta_config = os.path.join(os.path.expanduser("~"), ".oci", "config")
    if os.path.isfile(ruta_config):
        import configparser
        cfg = configparser.ConfigParser(); cfg.read(ruta_config)
        defaults = cfg.defaults(); secciones = [s for s in cfg.sections() if cfg.has_option(s, "tenancy")]
        perfil = os.environ.get("OCI_CLI_PROFILE", "DEFAULT")
        seccion = perfil if perfil in secciones else (secciones[0] if secciones else ("DEFAULT" if "tenancy" in defaults else None))
        if seccion: tenancy = (defaults.get("tenancy") if seccion == "DEFAULT" else cfg.get(seccion, "tenancy")) if cfg.has_option(seccion, "tenancy") or (seccion == "DEFAULT" and "tenancy" in defaults) else ""
    # Límites
    try:
        salida_lim = correr(["oci", "limits", "value", "list", "--service-name", "compute", "--compartment-id", tenancy or ""])
        texto_lim = salida_lim.get("stdout", salida_lim.get("texto", "")) if isinstance(salida_lim, dict) else str(salida_lim)
        res["limites"] = {"nota": "Parser básico; mejora pendiente con contrato §4."}
    except Exception as exc:
        res["limites"] = {"nota": f"No se obtuvieron límites: {exc}"}
    # Vnics
    vnics_resultado: Dict[str, str] = {}
    try:
        salida_vnic = correr(["oci", "compute", "instance", "list-vnics", "--compartment-id", tenancy or ""])
        texto_vnic = salida_vnic.get("stdout", salida_vnic.get("texto", "")) if isinstance(salida_vnic, dict) else str(salida_vnic)
        datos_vnic = json.loads(texto_vnic) if texto_vnic.startswith(("{", "[")) else {}
        vnics_resultado = parsear_vnics(datos_vnic.get("data", datos_vnic) if isinstance(datos_vnic, dict) else datos_vnic)
    except Exception:
        pass
    # Instancias
    try:
        salida_inst = correr(["oci", "compute", "instance", "list", "--compartment-id", tenancy or ""])
        texto_inst = salida_inst.get("stdout", salida_inst.get("texto", "")) if isinstance(salida_inst, dict) else str(salida_inst)
        datos_inst = json.loads(texto_inst) if texto_inst.startswith(("{", "[")) else {}
        datos_inst = {"data": datos_inst} if isinstance(datos_inst, list) else datos_inst
        res["instancias"] = parsear_instancias(datos_inst.get("data", datos_inst), vnics_resultado)
    except Exception:
        res["instancias"] = []
    return res
def escribir_estado(ruta: str, estado: EstadoOracle) -> None:
    destino = ruta or os.path.join(os.path.expanduser("~"), ".starseed", "oracle.json")
    dir_destino = os.path.dirname(destino)
    if dir_destino and not os.path.isdir(dir_destino):
        os.makedirs(dir_destino, mode=0o700, exist_ok=True)
    tmp = destino + ".tmp"
    contenido = {"vinculado": estado.vinculado, "region": estado.region, "detalle": estado.detalle}
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(contenido, f, ensure_ascii=False, indent=2); f.write("\n")
    os.chmod(tmp, 0o600)
    os.rename(tmp, destino)
def correr_predeterminado(args: List[str], timeout: int = 60) -> Union[dict, str]:
    cmd = ["/opt/homebrew/bin/oci"] if os.path.isfile("/opt/homebrew/bin/oci") else ["oci"]
    cmd += args
    try:
        resultado = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"stdout": resultado.stdout or resultado.stderr or "", "codigo": resultado.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "codigo": -1, "texto": f"timeout: {timeout}s"}
    except Exception as exc:
        return {"stdout": "", "codigo": -1, "texto": str(exc)}
def cli_estado(ruta_archivo: str = "", salir_json: bool = False) -> int:
    destino = ruta_archivo or os.path.join(os.path.expanduser("~"), ".starseed", "oracle.json")
    datos = {}
    if os.path.isfile(destino):
        try:
            with open(destino, "r", encoding="utf-8") as f:
                datos = json.load(f)
        except Exception:
            datos = {}
    vinculado = datos.get("vinculado", False)
    region = datos.get("region", "")
    detalle = datos.get("detalle", "")
    with open(destino, "r", encoding="utf-8") as f:
        contenido_raw = f.read()
    detalle_limpio = detalle
    if "ocid1." in contenido_raw:
        detalle_limpio += " [ADVERTENCIA: id detectado en archivo de estado]"
    if salir_json:
        print(json.dumps({"vinculado": bool(vinculado), "region": region, "detalle": detalle_limpio}, ensure_ascii=False))
    else:
        print(f"Oracle Always Free: {'vinculado' if vinculado else 'no vinculado'}")
        print(f"Región: {region or '—'}")
        print(f"Detalle: {detalle_limpio or '—'}")
    return 0
def cli_comprobar(correr=None, director_chat=None) -> int:
    archivo_estado = os.path.join(os.path.expanduser("~"), ".starseed", "oracle.json")
    estaba_vinculada = False
    if os.path.isfile(archivo_estado):
        try:
            with open(archivo_estado, "r", encoding="utf-8") as f:
                estaba_vinculada = bool(json.load(f).get("vinculado", False))
        except Exception:
            estaba_vinculada = False
    ejecutar = correr or correr_predeterminado
    resultado = comprobar(ejecutar)
    vinculado_ahora = bool(resultado.get("autenticado", False))
    detalle_str: str = str(resultado.get("detalle", ""))
    detalle_final: str = detalle_str if detalle_str else ("Autenticación exitosa con Oracle Cloud." if vinculado_ahora else "No autenticado.")
    estado = EstadoOracle(vinculado=vinculado_ahora, region="", detalle=detalle_final)
    escribir_estado(archivo_estado, estado)
    with open(archivo_estado, "r", encoding="utf-8") as f:
        contenido_nuevo = f.read()
    if "ocid1." in contenido_nuevo:
        datos = json.loads(contenido_nuevo)
        datos["detalle"] = datos.get("detalle", "").replace("ocid1.", "[oculto]")
        tmp = archivo_estado + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
        os.chmod(tmp, 0o600)
        os.rename(tmp, archivo_estado)
    if vinculado_ahora and not estaba_vinculada:
        if director_chat is not None:
            try:
                director_chat.publicar(de="director-nube", mensaje=f"Oracle Cloud vinculado: {detalle_final}")
            except Exception:
                pass
    cli_estado(archivo_estado, salir_json=False)
    return 0 if vinculado_ahora else 1
def main(argv: Optional[List[str]] = None):
    args = argv or sys.argv[1:]
    salir_json = "--json" in args
    if "--json" in args: args.remove("--json")
    if not args or args[0] == "estado":
        return cli_estado(salir_json=salir_json)
    if args[0] == "comprobar":
        return cli_comprobar()
    print(f"Uso: {sys.argv[0]} [estado [--json] | comprobar]")
    return 1
if __name__ == "__main__":
    sys.exit(main())
