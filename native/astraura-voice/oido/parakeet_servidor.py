"""Servidor Parakeet v3 para oír.

POST /v1/audio/transcriptions, GET /salud.
"""

import json,os
from http.server import BaseHTTPRequestHandler,HTTPServer

from .oido_logica import (
    ErrorValidacionSolicitud,
    formatear_respuesta,
    validar_y_normalizar_solicitud,
)

try:
    import onnx_asr
except ImportError as e:
    raise ImportError(
        "Falta onnx_asr: pip install onnx-asr[cpu,hub]"
    ) from e

PUERTO=int(os.getenv("ASTRAURA_OIDO_PARAKEET_PUERTO","4471"))
MODELO="nemo-parakeet-tdt-0.6b-v3"
CUANT="int8"
_modelo=None

def _cargar_modelo():
    global _modelo
    if _modelo is None:_modelo=onnx_asr.load_model(MODELO,quantization=CUANT)
    return _modelo

class _Handler(BaseHTTPRequestHandler):
    def _json(self,status,data=None):
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.end_headers()
        if data:self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_GET(self):
        if self.path=="/salud":self._json(200,{"status":"ok"})
        else:self._json(404,{"error":"No encontrado"})

    def do_POST(self):
        if self.path!="/v1/audio/transcriptions":
            self._json(404,{"error":"No encontrado"});return
        ct=self.headers.get("Content-Type","")
        if not ct.startswith("multipart/form-data"):
            self._json(400,{"error":"Se espera multipart/form-data"});return
        cl=self.headers.get("Content-Length")
        if cl is None:
            self._json(411,{"error":"Falta Content-Length"});return
        try:cl=int(cl)
        except ValueError:self._json(400,{"error":"Content-Length no es entero"});return
        if cl>25*1024*1024:
            self._json(413,{"error":f"Archivo demasiado grande. Máx: {25*1024*1024} bytes"});return
        body=self.rfile.read(cl)
        if len(body)<cl:
            self._json(400,{"error":"Cuerpo incompleto"});return
        import cgi,io
        env={"REQUEST_METHOD":"POST","CONTENT_TYPE":self.headers["Content-Type"],"CONTENT_LENGTH":str(cl)}
        fs=cgi.FieldStorage(fp=io.BytesIO(body),environ=env,keep_blank_values=True)
        if "file" not in fs:
            self._json(400,{"error":"Falta 'file'"});return
        fitem=fs["file"]
        if not fitem.file:
            self._json(400,{"error":"'file' vacío"});return
        partes={"file":fitem.file.read()}
        for campo in("model","language"):
            if campo not in fs:
                self._json(400,{"error":f"Falta '{campo}'"});return
            partes[campo]=fs[campo].value
        try:
            audio,_,lang=validar_y_normalizar_solicitud(partes)
        except ErrorValidacionSolicitud as e:
            self._json(400,{"error":str(e)});return
        modelo=_cargar_modelo()
        try:
            texto=modelo.transcribe(audio)
        except Exception as e:
            self._json(500,{"error":f"Error transcripción: {str(e)}"});return
        self._json(200,formatear_respuesta(texto,lang))

def _main():
    httpd=HTTPServer(("127.0.0.1",PUERTO),_Handler)
    print(f"Servidor Parakeet en http://127.0.0.1:{PUERTO}")
    print("Ctrl+C para detener")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
        httpd.server_close()

if __name__=="__main__":
    _cargar_modelo()
    _main()