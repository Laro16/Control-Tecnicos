import { useCallback, useRef, useState } from 'react'
import { supabase } from '../supabase.jsx'
import { importarParticularesExcel } from '../utils/particulares.js'

export default function useImportacionParticulares() {
  const [estado, setEstado] = useState('inactivo')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const cola = useRef(Promise.resolve())
  const ultimo = useRef(null)

  const importar = useCallback((filas, archivo) => {
    // Serializar sin descartar un archivo si coinciden dos eventos de carga.
    const trabajo = cola.current.then(async () => {
      ultimo.current = { filas, archivo }
      setEstado('importando'); setError(''); setResultado({ archivo })
      try {
        setResultado(await importarParticularesExcel(supabase, filas, archivo))
        setEstado('listo')
      } catch (fallo) {
        setResultado(fallo.resultado || { archivo })
        setError(fallo.message || 'No se pudieron guardar las particulares. Vuelve a intentar.')
        setEstado('error')
      } finally {
        // Refrescar también si hubo un guardado parcial. No modifica el modal.
        setRevision(actual => actual + 1)
      }
    })
    cola.current = trabajo.catch(() => {})
    return trabajo
  }, [])

  const reintentar = useCallback(() => {
    if (ultimo.current) importar(ultimo.current.filas, ultimo.current.archivo)
  }, [importar])

  return { estado, resultado, error, revision, importar, reintentar }
}
