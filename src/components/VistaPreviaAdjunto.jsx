import { useEffect, useState } from 'react'
import { Download, ExternalLink, RotateCcw, X } from 'lucide-react'
import { cargarVistaPreviaAdjunto, descargarAdjunto } from '../utils/adjuntosParticulares.js'
import Dialogo from './Dialogo'

export default function VistaPreviaAdjunto({ archivo, onCerrar, resolverArchivo }) {
  const [vista, setVista] = useState({ cargando: true })
  const [intento, setIntento] = useState(0)
  const [descargando, setDescargando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState('')
  const nombre = archivo.nombre || 'Documento adjunto'

  useEffect(() => {
    const controlador = new AbortController()
    let activo = true
    let temporal
    setVista({ cargando: true })
    setErrorDescarga('')
    const cargar = async () => {
      const resuelto = resolverArchivo ? await resolverArchivo(archivo) : archivo
      controlador.signal.throwIfAborted()
      return cargarVistaPreviaAdjunto(resuelto, { signal: controlador.signal })
    }
    cargar().then(({ tipo, blob }) => {
      if (!activo) return
      if (blob) temporal = URL.createObjectURL(blob)
      setVista({ cargando: false, tipo, url: temporal })
    }).catch(error => {
      if (activo) setVista({ cargando: false, error: error.message || 'No se pudo cargar la vista previa.' })
    })
    return () => {
      activo = false
      controlador.abort()
      if (temporal) URL.revokeObjectURL(temporal)
    }
  }, [archivo, intento, resolverArchivo])

  async function descargar() {
    setDescargando(true)
    setErrorDescarga('')
    try {
      const resuelto = resolverArchivo ? await resolverArchivo(archivo) : archivo
      await descargarAdjunto(resuelto)
    }
    catch (error) { setErrorDescarga(error.message || 'No se pudo descargar el archivo.') }
    finally { setDescargando(false) }
  }

  return (
    <Dialogo titulo={`Vista previa de ${nombre}`} onCerrar={onCerrar} cerrarFuera>
      <section className="app-dialog-panel attachment-preview-panel">
        <header className="app-dialog-header">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-700">Vista previa</p>
            <h2 className="break-words text-base font-extrabold">{nombre}</h2>
          </div>
          <button type="button" className="btn-ghost" aria-label="Cerrar vista previa" onClick={onCerrar}><X size={18}/></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-slate-50 p-3" aria-busy={vista.cargando}>
          {vista.cargando ? <p role="status" className="m-auto flex items-center gap-2 p-4 text-sm"><RotateCcw size={18} className="animate-spin"/> Cargando vista previa…</p>
            : vista.error ? <div className="m-auto space-y-3 p-4 text-center"><p role="alert" className="text-sm text-rose-700">{vista.error}</p><button type="button" className="btn-ghost" onClick={() => setIntento(i => i + 1)}>Reintentar vista previa</button></div>
            : vista.tipo === 'pdf' ? <iframe src={`${vista.url}#toolbar=0&navpanes=0&view=FitH`} title={`PDF: ${nombre}`} tabIndex={0} className="min-h-0 w-full flex-1 rounded-lg border border-slate-300 bg-white"/>
            : vista.tipo === 'imagen' ? <img src={vista.url} alt={`Vista previa de ${nombre}`} className="min-h-0 w-full flex-1 object-contain" onError={() => setVista(v => ({ ...v, error: 'El navegador no pudo mostrar esta imagen. Puedes descargar el archivo.' }))}/>
            : <p className="m-auto max-w-md p-4 text-center text-sm text-slate-600">Este formato no tiene vista previa. Puedes visualizar PDF e imágenes; para este archivo utiliza Descargar.</p>}
        </div>
        <footer className="border-t border-slate-200 p-3">
          {vista.tipo === 'pdf' && !vista.error && <p className="mb-2 text-xs text-slate-600">Si tu navegador no muestra el PDF, utiliza «Abrir en otra pestaña».</p>}
          {errorDescarga && <p role="alert" className="mb-2 text-sm text-rose-700">{errorDescarga}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {vista.url && !vista.error && <a href={vista.url} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex min-h-11 items-center gap-2"><ExternalLink size={15}/> Abrir en otra pestaña</a>}
            <button type="button" disabled={descargando} className="btn-primary inline-flex min-h-11 items-center gap-2" onClick={descargar}><Download size={15}/>{descargando ? 'Descargando…' : 'Descargar'}</button>
          </div>
        </footer>
      </section>
    </Dialogo>
  )
}
