import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/pt-br';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import apiClient from '../../services/apiClient';
import { X, Clock, CheckCircle, Trash2, Plus, Calendar as CalendarIcon } from 'lucide-react';

// Configura o Moment.js para Português
moment.locale('pt-br');
const localizer = momentLocalizer(moment);

export default function AgendaModal({ isOpen, onClose, onEventUpdate }) {
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // States para Modais Internos
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);

    // States do Formulário
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('08:00');
    const [colorHex, setColorHex] = useState('#22C55E'); // Verde

    useEffect(() => {
        if (isOpen) {
            carregarEventos();
        }
    }, [isOpen]);

    const carregarEventos = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/api/agenda');
            
            // Formatando para o react-big-calendar
            const formatados = response.data.map(ev => {
                const start = new Date(ev.event_datetime);
                const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hora visual
                
                return {
                    id: ev.id,
                    title: ev.title,
                    start: start,
                    end: end,
                    is_completed: ev.is_completed,
                    description: ev.description,
                    color_hex: ev.color_hex,
                    related_type: ev.related_type
                };
            });
            
            setEventos(formatados);
            if(onEventUpdate) onEventUpdate(); // Atualiza o sininho no dashboard
        } catch (error) {
            console.error('Erro ao buscar agenda:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdicionarEvento = async (e) => {
        e.preventDefault();
        try {
            const datetime = `${eventDate} ${eventTime}:00`;
            await apiClient.post('/api/agenda', {
                title, description, event_datetime: datetime,
                color_hex: colorHex, related_type: 'manual'
            });
            
            setShowAddModal(false);
            resetForm();
            carregarEventos();
        } catch (error) {
            console.error('Erro ao adicionar evento:', error);
            alert('Erro ao criar evento.');
        }
    };

    const toggleConcluido = async (id, isCompleted) => {
        try {
            await apiClient.patch(`/api/agenda/${id}/concluir`, { is_completed: !isCompleted });
            setShowDetailModal(false);
            carregarEventos();
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
        }
    };

    const excluirEvento = async (id) => {
        if (!window.confirm('Excluir este evento permanentemente?')) return;
        try {
            await apiClient.delete(`/api/agenda/${id}`);
            setShowDetailModal(false);
            carregarEventos();
        } catch (error) {
            console.error('Erro ao excluir:', error);
        }
    };

    const resetForm = () => {
        setTitle(''); setDescription(''); setEventDate(''); setEventTime('08:00'); setColorHex('#22C55E');
    };

    // Ações do Calendário
    const handleSlotSelect = ({ start }) => {
        setEventDate(moment(start).format('YYYY-MM-DD'));
        setEventTime('08:00');
        setShowAddModal(true);
    };

    const handleEventSelect = (evento) => {
        setSelectedEvent(evento);
        setShowDetailModal(true);
    };

    // Customização de Cores dos Eventos no Calendário
    const eventPropGetter = (event) => ({
        style: {
            backgroundColor: event.color_hex || '#3B82F6',
            opacity: event.is_completed ? 0.6 : 1,
            textDecoration: event.is_completed ? 'line-through' : 'none',
            border: 'none',
            borderRadius: '4px',
            color: '#fff'
        }
    });

    if (!isOpen) return null;

    return (
        /* CORREÇÃO AQUI: z-[9999] garante que a agenda fique por cima do mapa (Leaflet/Maps) */
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-fade-in">
                
                {/* Header do Modal */}
                <div className="bg-gray-800 p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <CalendarIcon className="w-6 h-6 text-blue-400" />
                        <h2 className="text-xl font-bold">Agenda & Planejamento</h2>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => { resetForm(); setShowAddModal(true); }}
                            className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Nova Tarefa
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Corpo (Calendário) */}
                <div className="flex-1 p-4 overflow-hidden bg-gray-50">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-gray-500">Carregando calendário...</div>
                    ) : (
                        <Calendar
                            localizer={localizer}
                            events={eventos}
                            startAccessor="start"
                            endAccessor="end"
                            selectable
                            onSelectSlot={handleSlotSelect}
                            onSelectEvent={handleEventSelect}
                            eventPropGetter={eventPropGetter}
                            messages={{
                                next: "Próximo", previous: "Anterior", today: "Hoje",
                                month: "Mês", week: "Semana", day: "Dia", agenda: "Lista"
                            }}
                            className="bg-white rounded-lg shadow-sm border p-4 h-full"
                        />
                    )}
                </div>

                {/* --- SUB-MODAL: ADICIONAR EVENTO --- */}
                {showAddModal && (
                    /* CORREÇÃO AQUI: z-[10000] para o modal de adicionar tarefa não ficar oculto */
                    <div className="fixed inset-0 bg-black/40 z-[10000] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                                <h2 className="text-lg font-bold text-gray-800">Nova Tarefa</h2>
                                <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-500" /></button>
                            </div>
                            <form onSubmit={handleAdicionarEvento} className="p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Ligar para fornecedor..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" rows="2"></textarea>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                                        <input type="date" required value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full p-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                                        <input type="time" required value={eventTime} onChange={e => setEventTime(e.target.value)} className="w-full p-2 border rounded-lg" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor (Categoria)</label>
                                    <div className="flex gap-3">
                                        <button type="button" onClick={() => setColorHex('#22C55E')} className={`w-8 h-8 rounded-full bg-green-500 ${colorHex === '#22C55E' ? 'ring-2 ring-offset-2 ring-green-500' : ''}`} title="Comum" />
                                        <button type="button" onClick={() => setColorHex('#3B82F6')} className={`w-8 h-8 rounded-full bg-blue-500 ${colorHex === '#3B82F6' ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} title="Informativo" />
                                        <button type="button" onClick={() => setColorHex('#EAB308')} className={`w-8 h-8 rounded-full bg-yellow-500 ${colorHex === '#EAB308' ? 'ring-2 ring-offset-2 ring-yellow-500' : ''}`} title="Atenção" />
                                        <button type="button" onClick={() => setColorHex('#EF4444')} className={`w-8 h-8 rounded-full bg-red-500 ${colorHex === '#EF4444' ? 'ring-2 ring-offset-2 ring-red-500' : ''}`} title="Urgente" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-6">
                                    <button type="submit" className="px-4 py-2 w-full bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Salvar Tarefa</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* --- SUB-MODAL: DETALHES DO EVENTO --- */}
                {showDetailModal && selectedEvent && (
                    /* CORREÇÃO AQUI: z-[10000] para o modal de detalhe ficar no topo */
                    <div className="fixed inset-0 bg-black/40 z-[10000] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                            <div className="p-4 flex justify-between items-start" style={{ borderBottom: `4px solid ${selectedEvent.color_hex}` }}>
                                <div>
                                    <h2 className={`text-xl font-bold ${selectedEvent.is_completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                        {selectedEvent.title}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        {moment(selectedEvent.start).format('DD/MM/YYYY [às] HH:mm')}
                                    </p>
                                </div>
                                <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-4 space-y-4">
                                {selectedEvent.description && (
                                    <div className="bg-gray-50 p-3 rounded-lg text-gray-700 text-sm">
                                        {selectedEvent.description}
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-center pt-4 border-t">
                                    <button 
                                        onClick={() => excluirEvento(selectedEvent.id)}
                                        className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                                    >
                                        <Trash2 className="w-4 h-4" /> Excluir
                                    </button>
                                    
                                    <button 
                                        onClick={() => toggleConcluido(selectedEvent.id, selectedEvent.is_completed)}
                                        className={`px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors ${
                                            selectedEvent.is_completed 
                                            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                                            : 'bg-green-500 text-white hover:bg-green-600'
                                        }`}
                                    >
                                        <CheckCircle className="w-5 h-5" />
                                        {selectedEvent.is_completed ? 'Desmarcar Concluído' : 'Marcar como Concluído'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}