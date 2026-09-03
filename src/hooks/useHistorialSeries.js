import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.jsx'
import { claveAtencion, combinarHistorial, extraerAtencionesFinalizadas } from '../utils/historialSeries.js'

async function leerHistorial() {
  const registros = []
  // Supabase pagina las respuestas. No se limita el historial a los primeros
  // 1.000 registros cuando la operación crezca.
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await supabase.from('historial_series')
      .select('serie,referencia,cliente,negocio,tecnico,fecha_cierre,registrado_en')
      .order('serie').order('referencia').range(desde, desde + 499)
    if (error) throw error
    registros.push(...data)
    if (data.length < 500) return registros
  }
}

export default function useHistorialSeries(tickets) {
  const [guardado, setGuardado] = useState([])
  const [observado, setObservado] = useState([])
  const [estado, setEstado] = useState('cargando')
  const cola = useRef(new Map())
  const ocupado = useRef(false)
  const repetir = useRef(false)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  const sincronizar = useCallback(async () => {
    if (ocupado.current) { repetir.current = true; return }
    ocupado.current = true
    if (montado.current) setEstado('guardando')
    try {
      do {
        repetir.current = false
        const existentes = await leerHistorial()
        for (const registro of existentes) cola.current.delete(claveAtencion(registro))
        while (cola.current.size) {
          const lote = [...cola.current.values()].slice(0, 250)
          const { error } = await supabase.from('historial_series').upsert(lote, {
            onConflict: 'serie,referencia', ignoreDuplicates: true,
          })
          if (error) throw error
          lote.forEach(registro => cola.current.delete(claveAtencion(registro)))
        }
        const actualizados = await leerHistorial()
        if (montado.current) setGuardado(actualizados)
      } while (repetir.current && montado.current)
      if (montado.current) setEstado('listo')
    } catch (error) {
      if (montado.current) setEstado(['42P01', 'PGRST205'].includes(error.code) ? 'sin-configurar' : 'error')
    } finally {
      ocupado.current = false
    }
  }, [])

  useEffect(() => {
    const atenciones = extraerAtencionesFinalizadas(tickets)
    atenciones.forEach(registro => cola.current.set(claveAtencion(registro), registro))
    setObservado(anterior => combinarHistorial(anterior, atenciones))
    sincronizar()
  }, [tickets, sincronizar])

  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') sincronizar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [sincronizar])

  // Lo observado es una cola temporal, no un historial persistido en el
  // navegador. La interfaz distingue claramente si falta guardarlo en nube.
  const historial = useMemo(() => combinarHistorial(guardado, observado), [guardado, observado])
  return { historial, estado, reintentar: sincronizar }
}
