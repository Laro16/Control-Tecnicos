import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.jsx'

export function anioCMIValido(anio) {
  return Number.isInteger(Number(anio)) && Number(anio) >= 2020 && Number(anio) <= 2100
}

export default function useVueltaActivaCMI(habilitado = true) {
  const [seleccion, setSeleccion] = useState(() => {
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
    const [anio, mes] = fecha.split('-').map(Number)
    return { anio, vuelta: Math.ceil(mes / 4) }
  })
  const [guardada, setGuardada] = useState(null)
  const [ocupado, setOcupado] = useState(habilitado)
  const [error, setError] = useState('')
  const [consulta, setConsulta] = useState(0)
  const guardando = useRef(false)

  useEffect(() => {
    if (!habilitado) return
    let vigente = true
    async function cargar() {
      setOcupado(true)
      try {
        const { data, error } = await supabase.from('preventivos_vuelta_activa').select('*').eq('id', 1).maybeSingle()
        if (error) throw error
        if (vigente) {
          const periodo = data && { anio: data.anio, vuelta: data.vuelta }
          if (periodo) setSeleccion(periodo)
          setGuardada(periodo)
          setError('')
        }
      } catch (fallo) {
        if (vigente) setError(fallo.message || 'No se pudo consultar la vuelta de carga.')
      } finally {
        if (vigente) setOcupado(false)
      }
    }
    cargar()
    return () => { vigente = false }
  }, [habilitado, consulta])

  async function elegir(anio, vuelta) {
    if (ocupado || guardando.current) return
    setSeleccion({ anio, vuelta })
    setError('')
    if (!anioCMIValido(anio)) return
    guardando.current = true
    setOcupado(true)
    try {
      const { data, error } = await supabase.from('preventivos_vuelta_activa')
        .upsert({ id: 1, anio: Number(anio), vuelta }).select().single()
      if (error) throw error
      if (!data || data.anio !== Number(anio) || data.vuelta !== vuelta) throw new Error('No se confirmó la vuelta elegida.')
      setGuardada({ anio: data.anio, vuelta: data.vuelta })
    } catch (fallo) {
      setError(fallo.message || 'No se pudo guardar la vuelta de carga.')
    } finally {
      guardando.current = false
      setOcupado(false)
    }
  }

  const confirmada = !ocupado && !error && guardada?.anio === Number(seleccion.anio) && guardada.vuelta === seleccion.vuelta
  return { ...seleccion, destino: confirmada ? guardada : null, ocupado, error, elegir, actualizar: () => setConsulta(v => v + 1) }
}
