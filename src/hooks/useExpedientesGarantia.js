import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.jsx'
import { leerExpedientes, referenciaExpediente } from '../utils/expedientesGarantia.js'

export default function useExpedientesGarantia() {
  const [porReferencia, setPorReferencia] = useState({})
  const [estado, setEstado] = useState('cargando')
  const solicitud = useRef(0)
  const cargar = useCallback(async () => {
    const turno = ++solicitud.current
    try {
      const rows = await leerExpedientes(supabase)
      if (turno !== solicitud.current) return
      setPorReferencia(Object.fromEntries(rows.map(r => [referenciaExpediente(r.referencia), r])))
      setEstado('listo')
    } catch {
      if (turno === solicitud.current) { setPorReferencia({}); setEstado('error') }
    }
  }, [])
  useEffect(() => {
    cargar()
    const visible = () => { if (document.visibilityState === 'visible') cargar() }
    window.addEventListener('expediente-garantia-guardado', cargar)
    document.addEventListener('visibilitychange', visible)
    return () => { ++solicitud.current; window.removeEventListener('expediente-garantia-guardado', cargar); document.removeEventListener('visibilitychange', visible) }
  }, [cargar])
  return { porReferencia, estado }
}
