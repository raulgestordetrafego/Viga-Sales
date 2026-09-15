
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DateRange } from '../types';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface MetaDateRangePickerProps {
  currentRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  align?: 'left' | 'right'; // Nova prop de alinhamento
}

// Helper para fuso de Brasília
const getFormattedDate = (date: Date) => {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(date);
};

const getBrasiliaDate = (offsetDays = 0) => {
  const d = new Date();
  const brasiliaDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  if (offsetDays !== 0) brasiliaDate.setDate(brasiliaDate.getDate() + offsetDays);
  return brasiliaDate;
};

const MetaDateRangePicker: React.FC<MetaDateRangePickerProps> = ({ currentRange, onRangeChange, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Estado do Calendário (Mês visível)
  const [viewDate, setViewDate] = useState(getBrasiliaDate());
  const [selectingStep, setSelectingStep] = useState<'since' | 'until'>('since');

  const presets = [
    { label: 'Hoje', getValue: () => {
        const d = getBrasiliaDate();
        const s = getFormattedDate(d);
        return { since: s, until: s, label: 'Hoje' };
    }},
    { label: 'Ontem', getValue: () => {
        const d = getBrasiliaDate(-1);
        const s = getFormattedDate(d);
        return { since: s, until: s, label: 'Ontem' };
    }},
    { label: 'Últimos 7 dias', getValue: () => {
        const u = getBrasiliaDate();
        const s = getBrasiliaDate(-7);
        return { since: getFormattedDate(s), until: getFormattedDate(u), label: 'Últimos 7 dias' };
    }},
    { label: 'Últimos 30 dias', getValue: () => {
        const u = getBrasiliaDate();
        const s = getBrasiliaDate(-30);
        return { since: getFormattedDate(s), until: getFormattedDate(u), label: 'Últimos 30 dias' };
    }},
    { label: 'Este mês', getValue: () => {
        const u = getBrasiliaDate();
        const s = new Date(u.getFullYear(), u.getMonth(), 1);
        return { since: getFormattedDate(s), until: getFormattedDate(u), label: 'Este mês' };
    }},
    { label: 'Mês passado', getValue: () => {
        const d = getBrasiliaDate();
        const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const u = new Date(d.getFullYear(), d.getMonth(), 0);
        return { since: getFormattedDate(s), until: getFormattedDate(u), label: 'Mês passado' };
    }}
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lógica do Calendário
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Espaços vazios do mês anterior
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        days.push(null);
    }
    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
    }
    return days;
  }, [viewDate]);

  const handleDayClick = (day: Date) => {
    const iso = getFormattedDate(day);
    
    if (selectingStep === 'since') {
        onRangeChange({ since: iso, until: iso, label: 'Personalizado' });
        setSelectingStep('until');
    } else {
        if (iso < currentRange.since) {
            onRangeChange({ since: iso, until: currentRange.since, label: 'Personalizado' });
        } else {
            onRangeChange({ ...currentRange, until: iso, label: 'Personalizado' });
        }
        setSelectingStep('since');
    }
  };

  const isInRange = (day: Date) => {
    const iso = getFormattedDate(day);
    return iso >= currentRange.since && iso <= currentRange.until;
  };

  const isEdge = (day: Date) => {
    const iso = getFormattedDate(day);
    return iso === currentRange.since || iso === currentRange.until;
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:border-orange-300 transition-all text-sm font-bold text-slate-700 h-11"
      >
        <CalendarIcon className="w-5 h-5 text-orange-500" />
        <span className="truncate">
            {currentRange.label === 'Personalizado' 
                ? `${currentRange.since.split('-').reverse().join('/')} - ${currentRange.until.split('-').reverse().join('/')}`
                : currentRange.label}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-2 flex bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] ring-1 ring-black ring-opacity-5 z-[150] border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150`}>
          
          {/* Coluna Presets (Esquerda) */}
          <div className="w-48 border-r border-slate-100 bg-slate-50/50 py-2">
            <div className="px-4 py-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atalhos</span>
            </div>
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  onRangeChange(p.getValue());
                  setSelectingStep('since');
                }}
                className={`flex items-center w-full px-4 py-2.5 text-xs transition-colors text-left font-bold ${
                  currentRange.label === p.label ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-white hover:text-orange-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Área Calendário (Direita) */}
          <div className="p-5 w-[300px]">
            <div className="flex items-center justify-between mb-4">
                <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                ><ChevronLeftIcon className="w-5 h-5"/></button>
                <span className="text-sm font-black text-slate-800 uppercase tracking-tight">
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(viewDate)}
                </span>
                <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                ><ChevronRightIcon className="w-5 h-5"/></button>
            </div>

            <div className="grid grid-cols-7 mb-2">
                {['D','S','T','Q','Q','S','S'].map(d => (
                    <div key={d} className="text-center text-[10px] font-black text-slate-300 p-1">{d}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
                {calendarDays.map((day, i) => {
                    if (!day) return <div key={`empty-${i}`} className="p-1"></div>;
                    const active = isInRange(day);
                    const edge = isEdge(day);
                    const isToday = getFormattedDate(day) === getFormattedDate(getBrasiliaDate());

                    return (
                        <button
                            key={day.getTime()}
                            onClick={() => handleDayClick(day)}
                            className={`
                                relative p-2 text-xs font-bold transition-all rounded-lg
                                ${active ? (edge ? 'bg-orange-500 text-white shadow-lg' : 'bg-orange-50 text-orange-500') : 'text-slate-600 hover:bg-slate-100'}
                                ${isToday && !edge ? 'border border-orange-200' : ''}
                            `}
                        >
                            {day.getDate()}
                        </button>
                    );
                })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[10px] text-slate-400 font-bold uppercase">
                    {selectingStep === 'since' ? 'Selecione Início' : 'Selecione Fim'}
                </div>
                <button 
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-black"
                >Atualizar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetaDateRangePicker;
