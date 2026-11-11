// MLL1111C · Sustituto de `@/lib/aurora/senses/request-permission` para el banco: el motor de permisos de Aurora no entra
// en el paquete (vive fuera de src/lib/llamadas), y sin él `obtenerMedios` no abría ni la cámara falsa de Chromium.
export async function solicitarMedios(c: MediaStreamConstraints, md?: MediaDevices): Promise<MediaStream> {
  return (md ?? navigator.mediaDevices).getUserMedia(c);
}
export async function solicitarPantalla(c?: DisplayMediaStreamOptions, md?: MediaDevices): Promise<MediaStream> {
  return (md ?? navigator.mediaDevices).getDisplayMedia(c);
}
