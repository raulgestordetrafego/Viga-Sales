
import React, { useState, useMemo, useEffect } from 'react';
import { Client } from '../types';
import { LightBulbIcon } from '../components/icons';

const formatCurrency = (value: number) => {
  if (isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface Scenario {
  name: 'Pessimista' | 'Realista' | 'Otimista';
  cpl: number;
  conversionRate: number;
}

const initialScenarios: Scenario[] = [
  { name: 'Pessimista', cpl: 30, conversionRate: 1.0 },
  { name: 'Realista', cpl: 20, conversionRate: 2.0 },
  { name: 'Otimista', cpl: 9, conversionRate: 4.0 },
];

interface ScenarioProjectionPageProps {
  clients: Client[];
  preSelectedClient?: Client;
}

const ScenarioProjectionPage: React.FC<ScenarioProjectionPageProps> = ({ clients, preSelectedClient }) => {
  const [selectedClientId, setSelectedClientId] = useState<string>(preSelectedClient?.ClienteID || '');
  const [investment, setInvestment] = useState(0);
  const [ticket, setTicket] = useState(0);
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);

  // Carrega os valores padrão ao selecionar um novo cliente (ou quando preSelectedClient muda)
  useEffect(() => {
    const targetId = preSelectedClient ? preSelectedClient.ClienteID : selectedClientId;
    
    if (targetId) {
      const client = preSelectedClient || clients.find(c => c.ClienteID === targetId);
      if (client) {
        setTicket(client.ticketMedio || 0);
        setInvestment(client.OrcamentoMensal || 0);
      }
    } else {
        setInvestment(0);
        setTicket(0);
    }
  }, [selectedClientId, clients, preSelectedClient]);

  const handleScenarioChange = (index: number, field: 'cpl' | 'conversionRate', value: string) => {
    const numericValue = parseFloat(value) || 0;
    const newScenarios = [...scenarios];
    newScenarios[index] = { ...newScenarios[index], [field]: numericValue };
    setScenarios(newScenarios);
  };

  const calculatedResults = useMemo(() => scenarios.map(scenario => {
    const opportunities = scenario.cpl > 0 ? investment / scenario.cpl : 0;
    const sales = opportunities * (scenario.conversionRate / 100);
    const revenue = sales * ticket;
    const roas = investment > 0 ? (revenue / investment) * 100 : 0;
    return { opportunities, sales, revenue, roas };
  }), [investment, ticket, scenarios]);
  
  const getRowStyles = (name: Scenario['name']) => {
    switch (name) {
      case 'Pessimista': return { header: 'bg-red-500 text-white', calculated: 'bg-red-50' };
      case 'Realista': return { header: 'bg-yellow-500 text-white', calculated: 'bg-amber-50' };
      case 'Otimista': return { header: 'bg-green-500 text-white', calculated: 'bg-emerald-50' };
      default: return { header: 'bg-slate-500 text-white', calculated: 'bg-slate-50' };
    }
  };

  return (
    <div className={preSelectedClient ? "p-4" : "p-4 sm:p-6 lg:p-8 max-w-[90rem] mx-auto"}>
      {!preSelectedClient && (
        <>
            <header className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Projeção de Cenários</h1>
                <p className="text-slate-500 mt-1">Simule resultados com base em diferentes métricas de performance.</p>
            </header>

            <div className="mb-6 max-w-md">
                <label htmlFor="client-select" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Selecione um Cliente</label>
                <select
                id="client-select"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white text-slate-800 font-bold text-sm"
                >
                <option value="">-- Selecionar Cliente --</option>
                {clients.map(client => (
                    <option key={client.ClienteID} value={client.ClienteID}>{client.Nome}</option>
                ))}
                </select>
            </div>
        </>
      )}

      {selectedClientId || preSelectedClient ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-in fade-in duration-500">
          {preSelectedClient && <h2 className="text-xl font-black text-slate-800 mb-6">Projeção de Cenários</h2>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
              <label htmlFor="investment" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Investimento Total (R$)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                <input 
                  type="number" 
                  id="investment" 
                  value={investment} 
                  onChange={(e) => setInvestment(Number(e.target.value))}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent p-4 pl-12 text-2xl font-black text-slate-800 bg-slate-50/50" 
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="ticket" className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">Ticket Médio (R$)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                <input 
                  type="number" 
                  id="ticket" 
                  value={ticket} 
                  onChange={(e) => setTicket(Number(e.target.value))}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent p-4 pl-12 text-2xl font-black text-slate-800 bg-slate-50/50" 
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-slate-800">
              <thead>
                <tr className="bg-slate-50">
                  {['Cenários', 'CPL (R$)', 'Investimento', 'Oportunidades', 'Tx. Conversão (%)', 'Vendas', 'Ticket Médio', 'Faturamento', 'ROAS'].map(h => 
                    <th key={h} className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center border-b border-slate-200 whitespace-nowrap">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scenarios.map((scenario, index) => {
                  const result = calculatedResults[index];
                  const styles = getRowStyles(scenario.name);
                  return (
                    <tr key={scenario.name} className="hover:bg-slate-50/50 transition-colors">
                      <td className={`p-4 text-center font-black text-xs uppercase tracking-widest border-r border-slate-100 ${styles.header}`}>{scenario.name}</td>
                      <td className="p-2 border-r border-slate-100">
                        <input 
                          type="number" 
                          value={scenario.cpl} 
                          onChange={(e) => handleScenarioChange(index, 'cpl', e.target.value)} 
                          className="w-full p-2 text-right font-black text-orange-500 bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-200 rounded-lg"
                        />
                      </td>
                      <td className="p-4 text-right font-bold text-slate-400 border-r border-slate-100">{formatCurrency(investment)}</td>
                      <td className={`p-4 text-right font-black text-slate-800 border-r border-slate-100 ${styles.calculated}`}>{result.opportunities.toFixed(0)}</td>
                      <td className="p-2 border-r border-slate-100">
                        <input 
                          type="number" 
                          step="0.1" 
                          value={scenario.conversionRate} 
                          onChange={(e) => handleScenarioChange(index, 'conversionRate', e.target.value)} 
                          className="w-full p-2 text-right font-black text-orange-500 bg-transparent focus:outline-none focus:ring-2 focus:ring-orange-200 rounded-lg"
                        />
                      </td>
                      <td className={`p-4 text-right font-black text-slate-800 border-r border-slate-100 ${styles.calculated}`}>{result.sales.toFixed(1)}</td>
                      <td className="p-4 text-right font-bold text-slate-400 border-r border-slate-100">{formatCurrency(ticket)}</td>
                      <td className={`p-4 text-right font-black text-emerald-600 border-r border-slate-100 ${styles.calculated}`}>{formatCurrency(result.revenue)}</td>
                      <td className={`p-4 text-right font-black text-orange-500 ${styles.calculated}`}>{result.roas.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="mt-8 p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-start gap-4">
              <div className="p-2 bg-orange-500 rounded-lg text-white shadow-md">
                <LightBulbIcon className="w-5 h-5" />
              </div>
              <div>
                  <h4 className="text-sm font-bold text-orange-900">Dica de Performance</h4>
                  <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                    Você pode alterar o <strong>Investimento Total</strong> ou o <strong>Ticket Médio</strong> acima para ver como o faturamento escala proporcionalmente. 
                    Use os diferentes cenários para alinhar expectativas de ROAS com o cliente durante reuniões de estratégia.
                  </p>
              </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-slate-200">
          <LightBulbIcon className="mx-auto h-16 w-16 text-slate-200 mb-4" />
          <h3 className="text-xl font-bold text-slate-800">Nenhum cliente selecionado</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto text-sm">Selecione um cliente no filtro acima para carregar a calculadora e simular resultados de escala.</p>
        </div>
      )}
    </div>
  );
};

export default ScenarioProjectionPage;
