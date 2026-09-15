import React, { useState, useMemo, useEffect } from 'react';
import { hubApi } from '../api';
import { Client, MonthlyReport } from '../types';
import { MagnifyingGlassIcon, ChartPieIcon, PlusIcon, ExternalLinkIcon, PencilIcon, TrashIcon } from '../components/icons';
import MonthlyReportModal from '../components/MonthlyReportModal';

interface MonthlyReportsPageProps {
  clients: Client[];
}

const MonthlyReportsPage: React.FC<MonthlyReportsPageProps> = ({ clients }) => {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [modalState, setModalState] = useState<{ isOpen: boolean, report: MonthlyReport | null }>({ isOpen: false, report: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await hubApi.relatorios.list();
        if (active) setReports(data || []);
      } catch (error) {
        console.error("Erro ao carregar relatórios mensais:", error);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const filteredReports = useMemo(() => {
    if (!selectedClientId) return [];
    return reports
      .filter(r => r.ClienteID === selectedClientId && r.MesReferencia.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => new Date(b.DataCriacao).getTime() - new Date(a.DataCriacao).getTime());
  }, [reports, selectedClientId, searchTerm]);

  const handleSaveReport = async (reportData: Omit<MonthlyReport, 'ReportID'> | MonthlyReport) => {
    if ('ReportID' in reportData) {
      const { ReportID, ...rest } = reportData;
      await hubApi.relatorios.update(ReportID, rest);
    } else {
      await hubApi.relatorios.create(reportData);
    }
    const data = await hubApi.relatorios.list();
    setReports(data || []);
    setModalState({ isOpen: false, report: null });
  };

  const handleDeleteReport = async (id: string) => {
    if (confirm("Deseja realmente remover este link de relatório?")) {
      await hubApi.relatorios.remove(id);
      setReports(prev => prev.filter(r => r.ReportID !== id));
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-full mx-auto animate-in fade-in duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <ChartPieIcon className="w-8 h-8 text-orange-500" />
          Repositório de Relatórios Mensais
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Armazene e acesse os links de fechamento estratégico de cada cliente.</p>
      </header>
      
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="w-full md:w-1/3">
          <label htmlFor="client-select" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Selecionar Cliente</label>
          <select
            id="client-select"
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setSearchTerm('');
            }}
            className="w-full border border-slate-200 rounded-xl shadow-sm focus:ring-orange-500 focus:border-orange-500 bg-white text-slate-900 p-3 font-bold text-sm"
          >
            <option value="">Selecione um cliente...</option>
            {clients.map(client => (
              <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-2/3">
          <label htmlFor="report-search" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 ml-1">Filtrar por Mês</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              id="report-search"
              placeholder="Ex: Outubro, Novembro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={!selectedClientId}
              className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl shadow-sm bg-white text-slate-900 placeholder-slate-400 focus:ring-orange-500 focus:border-orange-500 disabled:bg-slate-50 font-medium text-sm"
            />
          </div>
        </div>
      </div>

      {selectedClientId ? (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div className="flex items-center gap-2">
                  <ChartPieIcon className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Histórico de Fechamentos</h3>
              </div>
               <button
                  onClick={() => setModalState({ isOpen: true, report: null })}
                  className="flex items-center justify-center bg-orange-500 hover:bg-orange-700 text-white font-black uppercase text-[11px] tracking-widest py-3 px-5 rounded-2xl transition-all shadow-lg active:scale-95"
               >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Novo Relatório
               </button>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-500 border-collapse">
                  <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-100">
                      <tr>
                          <th scope="col" className="px-6 py-4">Mês de Referência</th>
                          <th scope="col" className="px-6 py-4">Link de Acesso</th>
                          <th scope="col" className="px-6 py-4">Ata da Reunião</th>
                          <th scope="col" className="px-6 py-4">Data do Registro</th>
                          <th scope="col" className="px-6 py-4 text-center">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                      {filteredReports.map((report) => (
                          <tr key={report.ReportID} className="bg-white hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                  <span className="font-black text-slate-900 uppercase tracking-tight">{report.MesReferencia}</span>
                              </td>
                              <td className="px-6 py-4">
                                  <a 
                                      href={report.LinkRelatorio} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-500 rounded-lg font-bold text-xs hover:bg-orange-100 transition-colors border border-orange-100"
                                  >
                                      Abrir Relatório <ExternalLinkIcon className="w-4 h-4" />
                                  </a>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="max-w-xs">
                                      <p className="text-xs font-medium text-slate-600 line-clamp-2 italic">
                                          {report.AtaReuniao || 'Nenhuma anotação registrada.'}
                                      </p>
                                  </div>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-400 text-xs">
                                  {new Date(report.DataCriacao).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="flex items-center justify-center gap-3">
                                      <button 
                                          onClick={() => setModalState({ isOpen: true, report: report })} 
                                          className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                                          title="Editar Link"
                                      >
                                          <PencilIcon className="w-4 h-4" />
                                      </button>
                                      <button 
                                          onClick={() => handleDeleteReport(report.ReportID)} 
                                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                          title="Excluir Registro"
                                      >
                                          <TrashIcon className="w-4 h-4" />
                                      </button>
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          
          {filteredReports.length === 0 && (
              <div className="text-center py-20 text-slate-400">
                  <ChartPieIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-bold uppercase text-[10px] tracking-[0.2em]">Nenhum relatório vinculado a este cliente.</p>
              </div>
          )}
        </div>
      ) : (
        <div className="text-center py-32 bg-white rounded-[3rem] shadow-sm border border-dashed border-slate-200">
          <ChartPieIcon className="mx-auto h-16 w-16 text-slate-200 mb-4" />
          <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase">Selecione uma conta</h3>
          <p className="mt-1 text-slate-400 font-medium max-w-sm mx-auto">Escolha um cliente no filtro acima para visualizar ou adicionar relatórios mensais.</p>
        </div>
      )}

      {modalState.isOpen && (
          <MonthlyReportModal
            isOpen={modalState.isOpen}
            onClose={() => setModalState({ isOpen: false, report: null })}
            onSave={handleSaveReport}
            report={modalState.report}
            clients={clients}
            initialClientId={selectedClientId}
          />
      )}
    </div>
  );
};

export default MonthlyReportsPage;
