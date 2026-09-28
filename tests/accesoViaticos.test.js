import test from 'node:test'
import assert from 'node:assert/strict'
import { resultadoAltaViaticos, mensajeErrorIngresoViaticos } from '../src/utils/accesoViaticos.js'

test('alta de Viáticos distingue confirmación pendiente y cuenta existente', () => {
  assert.match(resultadoAltaViaticos({ data: { user: { identities: [{}] }, session: null } }).aviso, /confirmar el correo/)
  assert.match(resultadoAltaViaticos({ data: { user: { identities: [] }, session: null } }).error, /ya tiene una cuenta/)
  assert.match(resultadoAltaViaticos({ error: { code: 'email_exists' } }).error, /no cambia la anterior/)
})

test('ingreso de Viáticos explica el motivo sin revelar si existe la cuenta', () => {
  assert.match(mensajeErrorIngresoViaticos({ code: 'email_not_confirmed' }), /no está confirmado/)
  assert.match(mensajeErrorIngresoViaticos({ code: 'invalid_credentials' }), /No existe una cuenta con esos datos o la contraseña no coincide/)
})
