// Los respaldos son privados. Los enlaces temporales nunca se guardan en la ficha.
export async function resolverRespaldoGarantia(cliente, archivo) {
  if (!archivo?.path || typeof archivo.path !== 'string' || !archivo.path.trim()) {
    throw new Error('El respaldo no tiene una ruta válida.')
  }
  const { data, error } = await cliente.storage.from('respaldos-garantia').createSignedUrl(archivo.path, 300)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('No se pudo obtener el enlace temporal del respaldo.')
  return { ...archivo, url: data.signedUrl }
}
