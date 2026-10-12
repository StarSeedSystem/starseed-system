import { planOptimizacion } from '@/lib/avatares/adn/optimizacion'
import { planificar, type PeticionPlan } from '@/lib/avatares/adn/canalizacion'
import { MOTORES_3D } from '@/lib/avatares/adn/motores'

export function PrepararImpresion() {
  // Example: preparing a model from an image for printing
  const optimizacion = planOptimizacion('impresion')
  
  // Example request for the workshop
  const peticion: PeticionPlan = {
    partida: 'imagen',
    esqueleto: 'ninguno', // no eskeleton for printing preparation
    capacidades: ['cpu'], // assume basic CPU only
    region: null,
    comercial: false,
    permitirDePago: false,
    cerrada: true, // we want a watertight mesh for printing
    prioridad: 'calidad', // prioritize quality for printing
  }
  
  const plan = planificar(peticion, MOTORES_3D)
  
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Preparar para imprimir</h2>
      
      <div className="border rounded-lg p-4">
        <h3 className="font-medium mb-2">Optimización según destino</h3>
        <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(optimizacion, null, 2)}</pre>
      </div>
      
      <div className="border rounded-lg p-4">
        <h3 className="font-medium mb-2">Plan del taller</h3>
        <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(plan, null, 2)}</pre>
      </div>
    </div>
  )
}