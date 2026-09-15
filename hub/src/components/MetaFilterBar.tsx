
import React, { useState, useRef, useEffect } from 'react';
import { MetaFilter, MetaFilterType, MetaFilterOperator } from '../types';
import { MagnifyingGlassIcon, XIcon, ChevronDownIcon } from './icons';

interface MetaFilterBarProps {
  filters: MetaFilter[];
  onAddFilter: (filter: MetaFilter) => void;
  onRemoveFilter: (id: string) => void;
  onClearAll: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

const MetaFilterBar: React.FC<MetaFilterBarProps> = ({ filters, onAddFilter, onRemoveFilter, onClearAll, searchTerm, onSearchChange }) => {
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [activeDraft, setActiveDraft] = useState<{ type: MetaFilterType; operator: MetaFilterOperator; value: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowFieldMenu(false);
      if (draftRef.current && !draftRef.current.contains(e.target as Node)) setActiveDraft(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fields: { id: MetaFilterType; label: string; isNumeric?: boolean }[] = [
    { id: 'campaign_name', label: 'Nome da campanha' },
    { id: 'adset_name', label: 'Nome do conjunto de anúncios' },
    { id: 'ad_name', label: 'Nome do anúncio' },
    { id: 'impressions', label: 'Impressões (Campanha)', isNumeric: true },
  ];

  const handleAddField = (type: MetaFilterType) => {
    const isNum = fields.find(f => f.id === type)?.isNumeric;
    setActiveDraft({
      type,
      operator: isNum ? 'greater_than' : 'contains',
      value: ''
    });
    setShowFieldMenu(false);
  };

  const applyFilter = () => {
    if (!activeDraft) return;
    onAddFilter({
      id: Math.random().toString(36).substr(2, 9),
      type: activeDraft.type,
      operator: activeDraft.operator,
      value: activeDraft.type === 'impressions' ? Number(activeDraft.value) : activeDraft.value
    });
    setActiveDraft(null);
  };

  const getLabelByType = (type: string) => fields.find(f => f.id === type)?.label || type;
  
  const getOperatorLabel = (op: MetaFilterOperator) => {
    switch(op) {
      case 'contains': return 'contém tudo de';
      case 'not_contains': return 'não contém nenhum de';
      case 'greater_than': return 'é maior que';
      case 'less_than': return 'é menor que';
      case 'equal_to': return 'é igual a';
      default: return op;
    }
  };

  return (
    <div className="bg-[#f0f2f5] border border-slate-200 rounded-lg p-1.5 flex flex-wrap items-center gap-2 relative transition-all min-h-[44px]">
      {/* Filtros Ativos (Pills) */}
      {filters.map(f => (
        <div key={f.id} className="flex items-center bg-white border border-[#ccd0d5] rounded-md px-2 py-1 shadow-sm h-7">
          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
            {getLabelByType(f.type)} {getOperatorLabel(f.operator)} <span className="font-bold text-slate-800">{f.value}</span>
          </span>
          <button onClick={() => onRemoveFilter(f.id)} className="ml-2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400">
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ))}
      
      {/* Input de Pesquisa Unificado */}
      <div className="flex-1 relative min-w-[300px]">
        <div className="flex items-center h-8">
            <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 ml-2" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => !activeDraft && setShowFieldMenu(true)}
              placeholder={filters.length === 0 ? "Pesquise para filtrar por: nome, identificação..." : "Adicionar filtro..."}
              className="w-full bg-transparent border-none focus:ring-0 text-sm py-0 px-3 placeholder:text-slate-400 font-medium"
            />
        </div>

        {/* Menu de Seleção de Campo */}
        {showFieldMenu && (
          <div ref={menuRef} className="absolute top-full left-0 w-64 bg-white shadow-2xl border border-slate-200 rounded-lg mt-1 z-[110] overflow-hidden py-2 animate-in fade-in zoom-in-95 duration-150">
             <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b mb-1">Filtrar por métrica</div>
             {fields.map(field => (
                <button 
                  key={field.id}
                  onClick={() => handleAddField(field.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-sm text-slate-700 flex items-center transition-colors font-medium"
                >
                  {field.label}
                </button>
             ))}
             {searchTerm && (
                <div className="px-4 py-2 text-[9px] text-slate-400 italic border-t mt-1">
                   Dica: Pressione Enter para buscar apenas por texto.
                </div>
             )}
          </div>
        )}

        {/* Menu de Configuração do Filtro (Draft) */}
        {activeDraft && (
          <div ref={draftRef} className="absolute top-full left-0 w-[420px] bg-white shadow-2xl border border-slate-300 rounded-xl mt-2 z-[120] overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b bg-slate-50">
              <h4 className="text-sm font-bold text-slate-800">{getLabelByType(activeDraft.type)}</h4>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-md px-3 py-2 min-w-[140px] shadow-sm">
                   {getLabelByType(activeDraft.type)}
                </div>
                
                <div className="relative flex-1">
                  <select 
                    value={activeDraft.operator}
                    onChange={(e) => setActiveDraft({...activeDraft, operator: e.target.value as MetaFilterOperator})}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md text-sm py-2 pl-3 pr-8 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 appearance-none shadow-sm h-[38px]"
                  >
                    {activeDraft.type === 'impressions' ? (
                      <>
                        <option value="greater_than">é maior que</option>
                        <option value="less_than">é menor que</option>
                        <option value="equal_to">é igual a</option>
                      </>
                    ) : (
                      <>
                        <option value="contains">contém tudo de</option>
                        <option value="not_contains">não contém nenhum de</option>
                      </>
                    )}
                  </select>
                  <ChevronDownIcon className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                <div className="flex-[1.5]">
                  <input 
                    type={activeDraft.type === 'impressions' ? 'number' : 'text'}
                    autoFocus
                    value={activeDraft.value}
                    onChange={(e) => setActiveDraft({...activeDraft, value: e.target.value})}
                    placeholder={activeDraft.type === 'impressions' ? '0' : 'Termo...'}
                    className="w-full bg-white border border-slate-300 text-slate-900 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-orange-500 shadow-sm h-[38px] placeholder:text-slate-400"
                    onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setActiveDraft(null)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-all"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={applyFilter}
                className="px-6 py-2 text-sm font-bold text-white bg-[#0064d2] hover:bg-[#0052a3] rounded-md shadow-md transition-all active:scale-95"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {(filters.length > 0 || searchTerm) && (
        <button 
          onClick={() => { onClearAll(); onSearchChange(''); }}
          className="px-3 py-1 text-xs font-bold text-slate-500 hover:text-orange-500 hover:bg-white rounded transition-all ml-auto"
        >
          Limpar Tudo
        </button>
      )}
    </div>
  );
};

export default MetaFilterBar;
