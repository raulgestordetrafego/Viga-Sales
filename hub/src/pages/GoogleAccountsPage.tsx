
import React from 'react';
import { Client, Page } from '../types';
import { ArrowLeftIcon, MagnifyingGlassIcon, ExternalLinkIcon } from '../components/icons';

interface GoogleAccountsPageProps {
  clients: Client[];
  navigateTo: (page: Page) => void;
}

const GoogleAccountsPage: React.FC<GoogleAccountsPageProps> = ({ clients, navigateTo }) => {
  const activeClients = clients.filter(c => c.StatusCliente === 'Ativo');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex items-center space-x-4">
        <button 
          onClick={() => navigateTo('home')} 
          title="Voltar para o Dashboard" 
          className="p-2 rounded-full hover:bg-slate-200 transition-colors"
        >
          <ArrowLeftIcon className="w-6 h-6 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Contas de Anúncios - Google</h1>
          <p className="text-slate-500 mt-1">Selecione um cliente para acessar o gerenciador de anúncios.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {activeClients.map(client => {
          const hasLink = !!client.googleAdsLink;
          
          const cardContent = (
            <div className="flex flex-col items-center justify-center text-center p-6 h-full">
              <div className={`mb-4 p-4 rounded-full ${hasLink ? 'bg-red-100' : 'bg-slate-100'}`}>
                <MagnifyingGlassIcon className={`w-8 h-8 ${hasLink ? 'text-red-600' : 'text-slate-400'}`} />
              </div>
              <h2 className={`font-bold text-lg ${hasLink ? 'text-slate-800' : 'text-slate-500'}`}>{client.Nome}</h2>
              <p className={`text-sm mt-1 ${hasLink ? 'text-slate-500' : 'text-slate-400'}`}>{client.Nicho}</p>
              {hasLink && (
                  <div className="mt-4 flex items-center text-red-600 font-semibold text-sm">
                      Acessar Gerenciador
                      <ExternalLinkIcon className="w-4 h-4 ml-2" />
                  </div>
              )}
            </div>
          );

          if (hasLink) {
            return (
              <a
                key={client.ClienteID}
                href={client.googleAdsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer block"
              >
                {cardContent}
              </a>
            );
          }

          return (
            <div
              key={client.ClienteID}
              className="bg-white rounded-xl shadow-sm border border-dashed border-slate-300 opacity-70"
              title="Link de anúncios não configurado"
            >
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GoogleAccountsPage;
