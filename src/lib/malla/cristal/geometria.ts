// Malla cristalina SiO₂ amorfa: geometría puра, sin node:* ni Supabase
import { Medio, NeuronaReticula, SenalMedida } from './tipos'

export function distanciaPorSenal(s: SenalMedida): number | null {
  const { medio, rssiDbm, snrDb } = s
  switch (medio) {
    case 'wifi-lan':
    case 'wifi-mesh':
    case 'ble': {
      const refPower = medio === 'ble' ? -59 : -40 // dBm
      const exponent = 2.7
      if (rssiDbm === null || rssiDbm === undefined) return null
      // Log-distance model: distance = 10^((refPower - rssi) / (10 * exponent))
      const distance = Math.pow(10, (refPower - rssiDbm) / (10 * exponent))
      // Clamp to [1, 300]
      return Math.max(1, Math.min(300, distance))
    }
    case 'lora': {
      if (snrDb === null || snrDb === undefined) return null
      // snr >= 10 -> 500 m
      // snr <= -20 -> 15000 m
      // linear interpolation in between
      let distance
      if (snrDb >= 10) {
        distance = 500
      } else if (snrDb <= -20) {
        distance = 15000
      } else {
        // Map snrDb from [-20, 10] to [15000, 500]
        distance = 500 + (15000 - 500) * (10 - snrDb) / (10 - (-20))
      }
      return distance
    }
    case 'nfc':
      return 0.1
    case 'webrtc':
    case 'servidor':
    case 'reticulum':
    case 'serie':
      return null
    default:
      return null
  }
}

export function multilateracion(anclas: Array<{x: number; y: number; d: number}>): {x: number; y: number} | null {
  if (anclas.length < 3) return null

  // Initial guess: centroid of anchors
  let x = 0
  let y = 0
  for (const {x: xi, y: yi} of anclas) {
    x += xi
    y += yi
  }
  x /= anclas.length
  y /= anclas.length

  const maxIterations = 25
  const tolerance = 1e-6

  for (let iter = 0; iter < maxIterations; iter++) {
    let f1 = 0
    let f2 = 0
    let J11 = 0
    let J12 = 0
    let J21 = 0
    let J22 = 0
    let weighted = 0

    for (const {x: xi, y: yi, d: di} of anclas) {
      const dx = x - xi
      const dy = y - yi
      const dist = Math.sqrt(dx * dx + dy * dy)
      // Avoid division by zero
      if (dist < 1e-9) {
        // If we are exactly at an anchor, we cannot compute direction
        // Skip this anchor? Or perturb? We'll skip by continuing.
        continue
      }
      const residual = dist - di
      f1 += residual * (dx / dist)
      f2 += residual * (dy / dist)
      J11 += (dx * dx) / (dist * dist)
      J12 += (dx * dy) / (dist * dist)
      J21 += (dx * dy) / (dist * dist)
      J22 += (dy * dy) / (dist * dist)
      weighted++
    }

    if (weighted === 0) {
      // All anchors were at the same point? Break.
      break
    }

    // Average the residuals and Jacobian? Actually, we are summing.
    // We'll solve: J^T J * delta = - J^T f
    // But note: we have computed J^T f as (f1, f2) and J^T J as [[J11, J12], [J21, J22]]
    // Actually, we have:
    //   f1 = sum residual * (dx/dist) = sum ( (dist-di) * (dx/dist) ) = sum (dx - xi*dx/dist) ??? 
    // Let me derive properly.

    // We want to minimize: sum_i ( (x-xi)^2 + (y-yi)^2 - di^2 )^2
    // Let r_i = (x-xi)^2 + (y-yi)^2 - di^2
    // Then we have:
    //   dr_i/dx = 2*(x-xi)
    //   dr_i/dy = 2*(y-yi)
    // So the Jacobian for the residual vector r is:
    //   J_i = [ 2*(x-xi), 2*(y-yi) ]
    // And we are solving J^T r = 0 for the minimum.

    // Alternatively, we can use the Gauss-Newton on the residual r_i.
    // But note: the above code is for the residual of the distance: f_i = sqrt((x-xi)^2+(y-yi)^2) - di
    // Then the Jacobian for f_i is:
    //   df_i/dx = (x-xi) / sqrt((x-xi)^2+(y-yi)^2)
    //   df_i/dy = (y-yi) / sqrt((x-xi)^2+(y-yi)^2)
    // And we are solving J^T f = 0.

    // So we have computed:
    //   f1 = sum f_i * (df_i/dx) = sum f_i * (dx/dist)
    //   f2 = sum f_i * (df_i/dy) = sum f_i * (dy/dist)
    //   J11 = sum (df_i/dx)^2 = sum (dx/dist)^2
    //   J12 = sum (df_i/dx)*(df_i/dy) = sum (dx/dist)*(dy/dist)
    //   J21 = J12
    //   J22 = sum (df_i/dy)^2 = sum (dy/dist)^2

    // Then we solve: [J11 J12; J21 J22] * [delta_x; delta_y] = -[f1; f2]

    // Compute determinant
    const det = J11 * J22 - J12 * J21
    if (Math.abs(det) < 1e-12) {
      // Singular matrix, break
      break
    }
    const deltaX = (-f1 * J22 + f2 * J12) / det
    const deltaY = (f1 * J21 - f2 * J11) / det

    x += deltaX
    y += deltaY

    if (Math.abs(deltaX) < tolerance && Math.abs(deltaY) < tolerance) {
      break
    }
  }

  return { x, y }
}

export function posicionesEstimadas(neuronas: NeuronaReticula[], senales: SenalMedida[]): Record<string, {x: number; y: number; estimada: boolean}> {
  const knownPositions: Record<string, {x: number; y: number}> = {}
  const result: Record<string, {x: number; y: number; estimada: boolean}> = {}

  // First, process neuronas that have posicion from data
  for (const neur of neuronas) {
    if (neur.posicion) {
      knownPositions[neur.id] = { x: neur.posicion.x, y: neur.posicion.y }
      result[neur.id] = { x: neur.posicion.x, y: neur.posicion.y, estimada: false }
    }
  }

  // Collect neuronas without position, sorted by id
  const neuronasSinPosicion = neuronas
    .filter(neur => !neur.posicion)
    .sort((a, b) => a.id.localeCompare(b.id))

  // Compute centroid of known positions (from data)
  let centroidX = 0
  let centroidY = 0
  let count = 0
  for (const pos of Object.values(knownPositions)) {
    centroidX += pos.x
    centroidY += pos.y
    count++
  }
  if (count > 0) {
    centroidX /= count
    centroidY /= count
  }

  // For each neuron without position
  for (const neur of neuronasSinPosicion) {
    const anchors: Array<{x: number; y: number; d: number}> = []
    for (const sen of senales) {
      if (sen.de === neur.id || sen.a === neur.id) {
        const otherId = sen.de === neur.id ? sen.a : sen.de
        const otherPos = knownPositions[otherId]
        if (otherPos) {
          const dist = distanciaPorSenal(sen)
          if (dist !== null) {
            anchors.push({ x: otherPos.x, y: otherPos.y, d: dist })
          }
        }
      }
    }

    let pos: {x: number; y: number} | null = null
    if (anchors.length >= 3) {
      pos = multilateracion(anchors)
    }
    if (pos === null) {
      // Fallback: deterministic circle around centroid
      const index = neuronasSinPosicion.findIndex(n => n.id === neur.id)
      const angle = (index * 2 * Math.PI) / neuronasSinPosicion.length
      pos = {
        x: centroidX + 50 * Math.cos(angle),
        y: centroidY + 50 * Math.sin(angle)
      }
    }
    result[neur.id] = { x: pos.x, y: pos.y, estimada: true }
  }

  return result
}