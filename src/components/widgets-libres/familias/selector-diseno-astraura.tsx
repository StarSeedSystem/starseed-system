import * as React from 'react'
import { DISENOS } from '@/lib/widgets/astraura/disenos'
import { EleccionDiseno } from '@/lib/widgets/astraura/disenos'
import { Target } from 'lucide-react'

import { useId } from 'react'

export function SelectorDisenoAstraura({
    valor,
    onCambiar,
    degradado
}: {
    valor: EleccionDiseno
    onCambiar: (e: EleccionDiseno) => void
    degradado: boolean
}) {
    const [abierto, setAbierto] = React.useState(false)
    const [index, setIndex] = React.useState(0)
    const ids = React.useMemo(() => Object.keys(DISENOS), [])
    const optionIndex = ids.indexOf(valor === 'auto' ? 'acciones' : valor)
    React.useEffect(() => {
        setIndex(optionIndex)
    }, [valor])
    const buttonRef = React.useRef<HTMLButtonElement>(null)
    const radiogroupId = useId()
    const handleOpen = () => {
        setIndex(optionIndex)
        setAbierto(true)
    }
    const close = () => {
        setAbierto(false)
        buttonRef.current?.focus()
    }
    const handleKey = (e: React.KeyboardEvent) => {
        if (!abierto) return
        if (e.key === 'Escape') {
            e.preventDefault()
            close()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const step = e.key === 'ArrowDown' ? 1 : -1
            const newIndex = (index + step + ids.length) % ids.length
            setIndex(newIndex)
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const val = ids[index] as EleccionDiseno
            onCambiar(val)
            close()
        }
    }
    const handleSelect = (i: number) => {
        const val = ids[i] as EleccionDiseno
        onCambiar(val)
        close()
    }

    return (
        <div>
            <button
                type="button"
                ref={buttonRef}
                onClick={handleOpen}
                aria-haspopup="dialog"
                className="flex items-center gap-1 bg-transparent text-muted-foreground"
            >
                <Target className="h-10 w-10" />
                <span>Diseño</span>
            </button>
            {abierto && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onKeyDown={handleKey}
                    className="p-2"
                >
                    <div role="radiogroup" aria-labelledby={radiogroupId}>
                        {ids.map((id, i) => (
                            <label key={id} className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="radio"
                                    name="diseno"
                                    checked={i === index}
                                    onChange={() => handleSelect(i)}
                                    className="sr-only"
                                    aria-describedby={`${id}-desc`}
                                />
                                <span>{DISENOS[id as keyof typeof DISENOS].nombre}</span>
                                <div id={`${id}-desc`} className="sr-only">
                                    {DISENOS[id as keyof typeof DISENOS].sirvePara}
                                </div>
                            </label>
                        ))}
                    </div>
                    {degradado && (
                        <p role="status" className="mt-2 text-xs text-muted-foreground">
                            Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
