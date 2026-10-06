export function validarLocalPreventivo(form, catalogo = [], nuevo = true) {
  const marca=String(form.marca??'').trim().toUpperCase()
  const codigo=String(form.codigo??'').trim().replace(/^0+(?=\d)/,'')
  const nombre=String(form.nombre??'').trim()
  if(!['GRANJERO','CAMPERO'].includes(marca)) throw new Error('Selecciona la marca del restaurante.')
  if(!/^\d{1,20}$/.test(codigo)) throw new Error('Indica un código numérico de hasta 20 dígitos.')
  if(nuevo&&catalogo.some(l=>l.marca===marca&&l.codigo===codigo)) throw new Error('Ese código ya existe para esta marca. Puedes editar su programación o reactivarlo desde Cerrados.')
  if(!nombre||nombre.length>200) throw new Error('Indica un nombre de hasta 200 caracteres.')
  const mes_base=Number(form.mes_base)
  if(!Number.isInteger(mes_base)||mes_base<1||mes_base>4) throw new Error('Selecciona los meses de mantenimiento.')
  const direccion=String(form.direccion??'').trim(),telefono=String(form.telefono??'').trim(),semana=String(form.semana??'').trim()
  if(direccion.length>1000||telefono.length>80||semana.length>100) throw new Error('La dirección, teléfono o semana supera el tamaño permitido.')
  const equipos=form.equipos===''||form.equipos==null?null:Number(form.equipos)
  if(equipos!==null&&(!Number.isInteger(equipos)||equipos<1||equipos>500)) throw new Error('Indica entre 1 y 500 equipos o deja la cantidad vacía.')
  return {marca,codigo,nombre,mes_base,direccion,telefono,semana,equipos}
}
