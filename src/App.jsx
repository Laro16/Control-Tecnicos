import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Users, CheckSquare, Upload, Copy, MessageCircle, FileText, Image as ImageIcon, Trash2, Edit2, Plus, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('tecnicos');
  
  // ==========================================
  // ESTADOS - MÓDULO TÉCNICOS
  // ==========================================
  const [ticketsPorTecnico, setTicketsPorTecnico] = useState({});
  const [fileName, setFileName] = useState('');

  // ==========================================
  // ESTADOS - MÓDULO PENDIENTES
  // ==========================================
  const [pendientes, setPendientes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ id: null, titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente' });

  // ==========================================
  // EFECTOS
  // ==========================================
  useEffect(() => {
    if (activeTab === 'pendientes') {
      fetchPendientes();
    }
  }, [activeTab]);

  // ==========================================
  // LÓGICA - MÓDULO TÉCNICOS
  // ==========================================
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0]; // Regla: Tomar únicamente la PRIMERA HOJA
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const estadosValidos = ['Asignada a Técnico', 'En Proceso', 'Asignada a Agencia'];
      const agrupados = {};

      data.forEach(row => {
        const estado = row['ESTADO'];
        if (estadosValidos.includes(estado)) {
          let tecnico = row['TÉCNICO'];
          
          if (!tecnico || tecnico.trim() === '') {
            tecnico = 'SIN TÉCNICO';
          }
          if (estado === 'Asignada a Agencia') {
            tecnico = tecnico || 'SIN TÉCNICO';
          }

          if (!agrupados[tecnico]) agrupados[tecnico] = [];
          agrupados[tecnico].push(row);
        }
      });

      setTicketsPorTecnico(agrupados);
    };
    reader.readAsBinaryString(file);
  };

  const getTextoFormateado = (tecnico, tickets) => {
    const fecha = new Date().toLocaleDateString('es-ES');
    let texto = `🔧 TÉCNICO: ${tecnico} FECHA: ${fecha}\n\n`;
    
    tickets.forEach(t => {
      texto += `📌 REFERENCIA: ${t['N° REFERENCIA'] || 'N/A'}\n`;
      texto += `🏪 NEGOCIO: ${t['NEGOCIO'] || 'N/A'}\n`;
      texto += `📍 DIRECCIÓN: ${t['DIRECCIÓN'] || 'N/A'}\n`;
      texto += `👤 CLIENTE: ${t['CLIENTE'] || 'N/A'}\n`;
      texto += `🧊 SERIE: ${t['SERIE'] || 'N/A'}\n`;
      texto += `📦 MODELO: ${t['MODELO'] || 'N/A'}\n`;
      texto += `📝 DESCRIPCIÓN:\n${t['DESCRIPCIÓN INICIAL'] || 'N/A'}\n`;
      texto += `___________________________\n\n`;
    });
    return texto;
  };

  const handleCopiar = (tecnico, tickets) => {
    const texto = getTextoFormateado(tecnico, tickets);
    navigator.clipboard.writeText(texto);
    alert('¡Texto copiado al portapapeles!');
  };

  const handleWhatsApp = (tecnico, tickets) => {
    const numero = prompt('Ingresa el número de WhatsApp (con código de país, ej: 50212345678):');
    if (!numero) return;
    
    const texto = getTextoFormateado(tecnico, tickets);
    const textoCodificado = encodeURIComponent(texto);
    window.open(`https://wa.me/${numero.replace(/\D/g,'')}?text=${textoCodificado}`, '_blank');
  };

  // Generador de Imagen y PDF optimizado para alta resolución (scale: 2)
  const getCanvasElement = async (elementId) => {
    const elemento = document.getElementById(elementId);
    return await html2canvas(elemento, { 
      scale: 2, 
      backgroundColor: '#ffffff',
      useCORS: true 
    });
  };

  const handleImagen = async (tecnico, elementId) => {
    const canvas = await getCanvasElement(elementId);
    const link = document.createElement('a');
    link.download = `Reporte_${tecnico.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handlePDF = async (tecnico, elementId) => {
    const canvas = await getCanvasElement(elementId);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Reporte_${tecnico.replace(/\s+/g, '_')}.pdf`);
  };


  // ==========================================
  // LÓGICA - MÓDULO PENDIENTES
  // ==========================================
  const fetchPendientes = async () => {
    const { data, error } = await supabase.from('pendientes').select('*').order('created_at', { ascending: false });
    if (!error) setPendientes(data);
  };

  const savePendiente = async (e) => {
    e.preventDefault();
    if (formData.id) {
      await supabase.from('pendientes').update(formData).eq('id', formData.id);
    } else {
      const { id, ...insertData } = formData;
      await supabase.from('pendientes').insert([insertData]);
    }
    setShowModal(false);
    fetchPendientes();
  };

  const deletePendiente = async (id) => {
    if(confirm('¿Seguro que deseas eliminar este pendiente?')) {
      await supabase.from('pendientes').delete().eq('id', id);
      fetchPendientes();
    }
  };

  const editPendiente = (p) => {
    setFormData(p);
    setShowModal(true);
  };

  const changeStatus = async (id, currentStatus) => {
    const estados = ['Pendiente', 'En proceso', 'Realizado', 'Cancelado'];
    const currentIndex = estados.indexOf(currentStatus);
    const nextStatus = estados[(currentIndex + 1) % estados.length];
    
    await supabase.from('pendientes').update({ estado: nextStatus }).eq('id', id);
    fetchPendientes();
  };

  const openNewModal = () => {
    setFormData({ id: null, titulo: '', descripcion: '', fecha: new Date().toISOString().split('T')[0], prioridad: 'Media', estado: 'Pendiente' });
    setShowModal(true);
  };

  // ==========================================
  // RENDERIZADO
  // ==========================================
  return (
    <div className="min-h-screen bg-brand-light font-sans text-brand-dark">
      {/* HEADER TABS */}
      <nav className="bg-white shadow-sm px-4 py-4 sticky top-0 z-10 flex gap-4">
        <button 
          onClick={() => setActiveTab('tecnicos')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${activeTab === 'tecnicos' ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <Users size={18} /> Técnicos
        </button>
        <button 
          onClick={() => setActiveTab('pendientes')}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${activeTab === 'pendientes' ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          <CheckSquare size={18} /> Pendientes
        </button>
      </nav>

      <main className="p-4 max-w-7xl mx-auto">
        
        {/* ================= MÓDULO TÉCNICOS ================= */}
        {activeTab === 'tecnicos' && (
          <div className="space-y-6">
            
            {/* Uploader */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
              <label className="cursor-pointer inline-flex flex-col items-center gap-2">
                <div className="bg-brand-blue/20 p-4 rounded-full text-blue-600">
                  <Upload size={32} />
                </div>
                <span className="font-semibold text-gray-700">Subir archivo Excel (.xlsx)</span>
                <span className="text-sm text-gray-400">{fileName || 'Ningún archivo seleccionado'}</span>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {/* Listado Técnicos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(ticketsPorTecnico).map(([tecnico, tickets]) => {
                const elementId = `reporte-${tecnico.replace(/\s+/g, '-')}`;
                
                return (
                  <div key={tecnico} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    
                    {/* Tarjeta Visual para Captura (Oculta scrollbar visualmente en web pero la mantiene en imagen) */}
                    <div id={elementId} className="p-5 bg-white">
                      <div className="flex justify-between items-center border-b pb-3 mb-4">
                        <h2 className="text-lg font-bold uppercase">{tecnico}</h2>
                        <span className="bg-brand-dark text-white px-3 py-1 rounded-full text-xs font-bold">
                          {tickets.length} TICKETS
                        </span>
                      </div>
                      
                      <div className="space-y-4">
                        {tickets.map((t, idx) => (
                          <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm flex flex-col gap-1">
                            <p><span className="font-semibold text-gray-500">REF:</span> {t['N° REFERENCIA']}</p>
                            <p><span className="font-semibold text-gray-500">NEGOCIO:</span> {t['NEGOCIO']}</p>
                            <p><span className="font-semibold text-gray-500">DIR:</span> {t['DIRECCIÓN']}</p>
                            <p><span className="font-semibold text-gray-500">CLIENTE:</span> {t['CLIENTE']}</p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <p><span className="font-semibold text-gray-500">SERIE:</span> {t['SERIE']}</p>
                              <p><span className="font-semibold text-gray-500">MOD:</span> {t['MODELO']}</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <p className="font-semibold text-gray-500 text-xs uppercase mb-1">Descripción:</p>
                              <p className="text-gray-800">{t['DESCRIPCIÓN INICIAL']}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2 mt-auto">
                      <button onClick={() => handleCopiar(tecnico, tickets)} className="flex items-center justify-center gap-1 text-xs font-semibold py-2 px-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">
                        <Copy size={14} /> Copiar
                      </button>
                      <button onClick={() => handleWhatsApp(tecnico, tickets)} className="flex items-center justify-center gap-1 text-xs font-semibold py-2 px-3 bg-[#25D366] text-white rounded-lg hover:bg-[#1DA851] transition">
                        <MessageCircle size={14} /> WhatsApp
                      </button>
                      <button onClick={() => handleImagen(tecnico, elementId)} className="flex items-center justify-center gap-1 text-xs font-semibold py-2 px-3 bg-brand-dark text-white rounded-lg hover:bg-black transition">
                        <ImageIcon size={14} /> Imagen
                      </button>
                      <button onClick={() => handlePDF(tecnico, elementId)} className="flex items-center justify-center gap-1 text-xs font-semibold py-2 px-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                        <FileText size={14} /> PDF
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= MÓDULO PENDIENTES ================= */}
        {activeTab === 'pendientes' && (
          <div className="space-y-6">
            <button onClick={openNewModal} className="w-full md:w-auto bg-brand-dark text-white px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-sm">
              <Plus size={20} /> Crear Pendiente
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pendientes.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{p.titulo}</h3>
                    <span onClick={() => changeStatus(p.id, p.estado)} className={`cursor-pointer px-2 py-1 rounded text-xs font-bold uppercase transition-colors
                      ${p.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' : 
                        p.estado === 'En proceso' ? 'bg-blue-100 text-blue-800' :
                        p.estado === 'Realizado' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {p.estado}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-3">{p.descripcion}</p>
                  
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-50">
                    <div className="text-xs text-gray-400 font-medium">
                      {new Date(p.fecha).toLocaleDateString('es-ES')} • 
                      <span className={`ml-1 ${p.prioridad === 'Alta' ? 'text-red-500' : p.prioridad === 'Media' ? 'text-yellow-500' : 'text-green-500'}`}>
                        Pri: {p.prioridad}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => editPendiente(p)} className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deletePendiente(p.id)} className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* ================= MODAL PENDIENTES ================= */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <h2 className="text-xl font-bold mb-5">{formData.id ? 'Editar Pendiente' : 'Nuevo Pendiente'}</h2>
            
            <form onSubmit={savePendiente} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">TÍTULO</label>
                <input required type="text" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-dark outline-none transition" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">DESCRIPCIÓN</label>
                <textarea rows="3" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-dark outline-none transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">FECHA</label>
                  <input required type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-dark outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">PRIORIDAD</label>
                  <select value={formData.prioridad} onChange={e => setFormData({...formData, prioridad: e.target.value})} className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-brand-dark outline-none transition bg-white">
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-brand-dark text-white font-bold py-3 rounded-lg hover:bg-black transition-colors mt-2">
                Guardar
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
