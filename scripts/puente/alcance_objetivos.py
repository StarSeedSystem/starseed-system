import os
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

class AlcanceObjetivos:
    def __init__(self, home: str):
        self.store_dir = os.path.join(home, ".starseed", "alcance")
        self.objetivos_file = os.path.join(self.store_dir, "objetivos.json")
        self.supresion_file = os.path.join(self.store_dir, "supresion.json")
        self._inicializar()

    def _inicializar(self):
        if not os.path.exists(self.store_dir):
            os.makedirs(self.store_dir, mode=0o700)
        
        if not os.path.exists(self.objetivos_file):
            with open(self.objetivos_file, 'w') as f:
                json.dump({}, f)
            os.chmod(self.objetivos_file, 0o600)
            
        if not os.path.exists(self.supresion_file):
            with open(self.supresion_file, 'w') as f:
                json.dump([], f)
            os.chmod(self.supresion_file, 0o600)

    def validar_objetivo(self, obj: Dict[str, Any]):
        prohibidos = [
            "salud", "religión", "creencias", "orientación", 
            "política", "familia", "ubicación", "ingresos", "teléfonos"
        ]
        # Simplistic validation: check for keywords in string fields
        for key, value in obj.items():
            if isinstance(value, str):
                for p in prohibidos:
                    if p in value.lower():
                        raise ValueError(f"Campo {key} contiene información prohibida: {p}")
        
        if "canal_contacto" in obj:
            if "fuente_url" not in obj["canal_contacto"]:
                raise ValueError("canal_contacto debe tener fuente_url pública")
        
        # Check level
        if "nivel" not in obj:
            obj["nivel"] = "alto"
            
    def suprimir(self, identificador: str):
        h = hashlib.sha256(identificador.encode()).hexdigest()
        with open(self.supresion_file, 'r+') as f:
            data = json.load(f)
            if h not in data:
                data.append(h)
                f.seek(0)
                json.dump(data, f)
                f.truncate()

    def puede_contactar(self, obj: Dict[str, Any], registro: Dict[str, Any], ahora: datetime) -> bool:
        # Check suppression
        canal = obj.get("canal_contacto", {})
        identificador = f"{canal.get('valor')}|{canal.get('medio')}"
        h = hashlib.sha256(identificador.encode()).hexdigest()
        with open(self.supresion_file, 'r') as f:
            supresiones = json.load(f)
            if h in supresiones:
                return False

        if obj.get("nivel") == "alto":
            return False # High profile -> never automatic

        # Check daily limit (e.g. 5)
        contactos_hoy = [c for c in registro.get("contactos", []) 
                        if datetime.fromisoformat(c["fecha"]).date() == ahora.date()]
        if len(contactos_hoy) >= 5:
            return False

        # Check status and pauses
        estado = obj.get("estado")
        fechas = obj.get("fechas", {})
        if estado == "rechazado_alex" and "ultimo_contacto" in fechas:
            ultimo = datetime.fromisoformat(fechas["ultimo_contacto"])
            if (ahora - ultimo).days < 90:
                return False
        elif estado == "rechazado_destinatario" and "ultimo_contacto" in fechas:
            ultimo = datetime.fromisoformat(fechas["ultimo_contacto"])
            if (ahora - ultimo).days < 180:
                return False

        return True
