import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// La capa vive fuera del contenido animado para cubrir toda la pantalla.
export default function Dialogo({ children, titulo, onCerrar, cerrarFuera = false, className = '' }) {
  const capaRef = useRef(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar

  useEffect(() => {
    const focoAnterior = document.activeElement
    const overflowAnterior = document.body.style.overflow
    const fondo = document.querySelector('.app-layout')
    const inerteAnterior = fondo?.inert
    if (fondo) fondo.inert = true
    document.body.style.overflow = 'hidden'
    const controles = () => [...(capaRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])]
      .filter(elemento => elemento.getClientRects().length && !elemento.closest('[inert]'))
    ;(controles()[0] || capaRef.current)?.focus()
    const teclado = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        cerrarRef.current?.()
      }
      if (event.key !== 'Tab') return
      const elementos = controles()
      const primero = elementos[0]
      const ultimo = elementos[elementos.length - 1]
      if (!primero) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === primero || document.activeElement === capaRef.current)) {
        event.preventDefault(); ultimo.focus()
      } else if (!event.shiftKey && (document.activeElement === ultimo || document.activeElement === capaRef.current)) {
        event.preventDefault(); primero.focus()
      }
    }
    const capa = capaRef.current
    capa?.addEventListener('keydown', teclado)
    return () => {
      capa?.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflowAnterior
      if (fondo) fondo.inert = inerteAnterior
      if (focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div ref={capaRef} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}
      className={`app-dialog-root ${className}`}
      onClick={event => { if (cerrarFuera && event.target === event.currentTarget) cerrarRef.current?.() }}>
      {children}
    </div>, document.body
  )
}
