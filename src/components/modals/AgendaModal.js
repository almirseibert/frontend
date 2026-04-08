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
    const [colorHex, setColorHex] = useState('#22C55E'); // Verde padrão

    useEffect(() => {
        if (isOpen) {
            carregarEventos();
        }
    }, [isOpen]);

    const carregarEventos = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/agenda');
            
            // PROTEÇÃO ADICIONADA: Verifica se a resposta é de fato um Array
            if (Array.isArray(response)) {
                const formattedEvents = response.map(evento => ({
                    ...evento,
                    start: new Date(evento.event_datetime),
                    end: new Date(evento.event_datetime), // Big Calendar precisa de start e end
                    title: evento.title
                }));
                setEventos(formattedEvents);
            } else {
                console.warn('A API não retornou um array válido para a agenda:', response);
                setEventos([]); // Evita o erro de .map mantendo um array vazio
            }
        } catch (error) {
            console.error("Erro ao buscar agenda:", error);
            setEventos([]); // Em caso de erro HTTP (ex: 401 token expirado), protege a tela
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        try {
            const datetime = `${eventDate}T${eventTime}:00`;
            await apiClient.post('/agenda', {
                title,
                description,
                event_datetime: datetime,
                color_hex: colorHex
            });
            
            setShowAddModal(false);
            carregarEventos();
            if (onEventUpdate) onEventUpdate(); // Atualiza painel do dashboard se necessário
            
            // Limpar form
            setTitle('');
            setDescription('');
            setEventDate('');
            setEventTime('08:00');
        } catch (error) {
            console.error('Erro ao adicionar evento:', error);
            alert('Erro ao criar evento. Verifique sua conexão ou tente fazer login novamente.');
        }
    };

    const excluirEvento = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este evento?')) return;
        try {
            await apiClient.delete(`/agenda/${id}`);
            setShowDetailModal(false);
            carregarEventos();
            if (onEventUpdate) onEventUpdate();
        } catch (error) {
            console.error('Erro ao excluir evento:', error);
            alert('Erro ao excluir evento.');
        }
    };

    const toggleConcluido = async (id, isCompleted) => {
        try {
            await apiClient.put(`/agenda/${id}/concluir`, { is_completed: !isCompleted });
            setShowDetailModal(false);
            carregarEventos();
            if (onEventUpdate) onEventUpdate();
        } catch (error) {
            console.error('Erro ao atualizar status do evento:', error);
        }
    };

    // Estilização customizada para os blocos da agenda
    const eventStyleGetter = (event) => {
        let backgroundColor = event.color_hex || '#3B82F6';
        let style = {
            backgroundColor: backgroundColor,
            borderRadius: '5px',
            opacity: event.is_completed ? 0.6 : 1,
            color: 'white',
            border: '0px',
            display: 'block',
            textDecoration: event.is_completed ? 'line-through' : 'none'
        };
        return { style };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative">
                
                {/* Header do Modal Principal */}
                <div className="bg-blue-900 p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="w-6 h-6 text-blue-300" />
                        <h2 className="text-xl font-bold">Agenda & Lembretes</h2>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setShowAddModal(true)}
                            className="bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2 rounded-lg text-sm font-semibold shadow flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Novo Evento
                        </button>
                        <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Corpo (Calendário) */}
                <div className="flex-1 p-4 bg-gray-50 overflow-hidden">
                    {loading ? (
                        <div className="w-full h-full flex justify-center items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-lg shadow h-full">
                            <Calendar
                                localizer={localizer}
                                events={eventos}
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: '100%' }}
                                messages={{
                                    next: "Próximo",
                                    previous: "Anterior",
                                    today: "Hoje",
                                    month: "Mês",
                                    week: "Semana",
                                    day: "Dia",
                                    agenda: "Lista",
                                    noEventsInRange: "Nenhum evento neste período."
                                }}
                                eventPropGetter={eventStyleGetter}
                                onSelectEvent={(event) => {
                                    setSelectedEvent(event);
                                    setShowDetailModal(true);
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* MODAL: ADICIONAR EVENTO */}
                {showAddModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40 p-4">
                        <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
                            <div className="flex justify-between items-center p-4 border-b">
                                <h3 className="font-bold text-lg text-gray-800">Criar Novo Evento</h3>
                                <button onClick={() => setShowAddModal(false)}><X className="text-gray-500 hover:text-red-500" /></button>
                            </div>
                            <form onSubmit={onSubmit} className="p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                                    <input 
                                        type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Ex: Revisão Trator 05"
                                    />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                                        <input 
                                            type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg p-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                                        <input 
                                            type="time" required value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg p-2"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição / Detalhes</label>
                                    <textarea 
                                        value={description} onChange={(e) => setDescription(e.target.value)} rows="3"
                                        className="w-full border border-gray-300 rounded-lg p-2"
                                    ></textarea>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Cor de Destaque</label>
                                    <div className="flex gap-3">
                                        {['#22C55E', '#3B82F6', '#EAB308', '#EF4444', '#8B5CF6'].map(color => (
                                            <button
                                                key={color} type="button" onClick={() => setColorHex(color)}
                                                className={`w-8 h-8 rounded-full border-2 ${colorHex === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 mt-6">
                                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Salvar Evento</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: DETALHES DO EVENTO */}
                {showDetailModal && selectedEvent && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-40 p-4">
                        <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
                            <div className="p-4 border-b flex justify-between items-start" style={{ borderTop: `4px solid ${selectedEvent.color_hex || '#3B82F6'}` }}>
                                <div>
                                    <h3 className={`font-bold text-xl ${selectedEvent.is_completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                        {selectedEvent.title}
                                    </h3>
                                    <div className="flex items-center text-sm text-gray-500 mt-1 gap-1">
                                        <Clock className="w-4 h-4" />
                                        {moment(selectedEvent.start).format('DD/MM/YYYY [às] HH:mm')}
                                    </div>
                                </div>
                                <button onClick={() => setShowDetailModal(false)}><X className="text-gray-400 hover:text-gray-700" /></button>
                            </div>
                            
                            <div className="p-4">
                                {selectedEvent.description ? (
                                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{selectedEvent.description}</p>
                                ) : (
                                    <p className="text-gray-400 text-sm italic">Nenhuma descrição informada.</p>
                                )}
                            </div>

                            <div className="bg-gray-50 p-4 border-t">
                                <div className="flex justify-between items-center">
                                    <button 
                                        onClick={() => excluirEvento(selectedEvent.id)}
                                        className="text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                                    >
                                        <Trash2 className="w-4 h-4" /> Excluir
                                    </button>
                                    
                                    <button 
                                        onClick={() => toggleConcluido(selectedEvent.id, selectedEvent.is_completed)}
                                        className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
                                            selectedEvent.is_completed 
                                            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                                            : 'bg-green-500 text-white hover:bg-green-600'
                                        }`}
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        {selectedEvent.is_completed ? 'Desmarcar' : 'Concluir'}
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