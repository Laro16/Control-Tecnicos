import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { nombreVueltaCMI } from './VueltaActivaCMI'

const formatos = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.tsv', '.ods']

export default function CargaExcelDiario({ archivoRef, cargar, ocupado, nombreArchivo, fecha, periodoCMI }) {
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')

  function recibir(archivos) {
    if (ocupado || !archivos.length) return
    if (archivos.length !== 1) return setError('Selecciona un solo reporte a la vez.')
    const [archivo] = archivos
    if (!formatos.some(ext => archivo.name.toLowerCase().endsWith(ext))) {
      return setError('Formato no admitido. Usa ' + formatos.join(', ') + '.')
    }
    setError('')
    cargar(archivo)
  }

  return <section aria-label="Carga del reporte diario" className="mb-3">
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-dashed px-4 py-2.5 ${arrastrando ? 'border-sky-600 bg-sky-50 dark:bg-slate-800' : 'border-slate-400 bg-white dark:bg-slate-900'}`}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = ocupado ? 'none' : 'copy'
        setArrastrando(!ocupado)
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setArrastrando(false)
      }}
      onDrop={event => {
        event.preventDefault()
        setArrastrando(false)
        recibir(event.dataTransfer.files)
      }}>
      <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
        <FileSpreadsheet size={22} aria-hidden="true" className="shrink-0 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0">
          <strong className="block text-sm">Reporte diario</strong>
          <span className="text-xs text-slate-600 dark:text-slate-300">{arrastrando ? 'Suelta el archivo para cargarlo' : 'Arrastra el Excel aquí'}</span>
          {periodoCMI && <span className="block text-xs font-semibold">{periodoCMI.ocupado ? 'Confirmando la vuelta CMI…' : periodoCMI.destino
            ? `Destino CMI · ${nombreVueltaCMI(periodoCMI.destino.vuelta)} de ${periodoCMI.destino.anio}`
            : 'Selecciona la vuelta en Preventivos CMI para cargar sus órdenes.'}</span>}
          {nombreArchivo && <span className="block truncate text-xs text-slate-500 dark:text-slate-300" title={nombreArchivo}>Último: {nombreArchivo}{fecha && ' · ' + fecha}</span>}
        </div>
      </div>
      <button type="button" disabled={ocupado} onClick={() => archivoRef.current?.click()}
        className="btn-primary flex w-full items-center justify-center gap-2 whitespace-nowrap sm:w-auto">
        {ocupado && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {ocupado ? 'Cargando…' : 'Seleccionar Excel'}
      </button>
      <input type="file" ref={archivoRef} hidden disabled={ocupado} accept={formatos.join(',')} onChange={event => {
        recibir(event.target.files)
        event.target.value = ''
      }} />
    </div>
    {error && <p role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
  </section>
}
