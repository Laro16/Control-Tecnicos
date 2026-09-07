import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.jsx'
import useExpedientesGarantia from './useExpedientesGarantia.js'
import { guardarVencimientoGarantia, leerVencimientosGarantia } from '../utils/vencimientosGarantia.js'

export default function useVencimientosGarantia() {
  const expedientes = useExpedientesGarantia()
  const [porSerie, setPorSerie] = useState({})
  const [estado, setEstado] = useState('cargando')
  const [guardando, setGuardando] = useState(false)
  const solicitud = useRef(0)
  const escritura = useRef(false)
  const montado = useRef(true)
  const cargar = useCallback(async () => {
    if (escritura.current) return
    const actual = ++solicitud.current
    setEstado('cargando')
    try {
      const datos = await leerVencimientosGarantia(supabase)
      if (montado.current && actual === solicitud.current) { setPorSerie(datos); setEstado('listo') }
    } catch (error) {
      if (montado.current && actual === solicitud.current) setEstado(['42P01', 'PGRST205'].includes(error.code) ? 'sin-configurar' : 'error')
    }
  }, [])
  useEffect(() => {
    montado.current = true
    cargar()
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { montado.current = false; ++solicitud.current; document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  const guardar = useCallback(async (serie, fecha) => {
    if (escritura.current) throw new Error('Espera a que termine el guardado actual.')
    escritura.current = true
    ++solicitud.current
    setGuardando(true)
    try {
      const registro = await guardarVencimientoGarantia(supabase, serie, fecha)
      if (montado.current) setPorSerie(prev => ({ ...prev, [registro.serie]: registro }))
      return registro
    } finally {
      escritura.current = false
      if (montado.current) setGuardando(false)
    }
  }, [])
  return { porSerie, estado, guardando, guardar, reintentar: cargar, expedientes }
}
