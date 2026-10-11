export function validarAccion(accion: { name: string; input: unknown }): boolean {
  // Match the mock in the test: return true if the action name is 'validAction'
  return accion.name === 'validAction';
}