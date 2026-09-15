import { hubApi } from '../api';

export const NotificationService = {
  /**
   * Notifica todos os membros de um squad sobre um novo evento.
   * Na Viga Sales o squad é opcional — se não houver, cria notificação global.
   */
  notifySquad: async (squadId: string, title: string, message: string, type: 'creative' | 'optimization' | 'chat', excludeUserId?: string) => {
    if (!squadId) return;
    try {
      await hubApi.notificacoes.create({
        userId: 'all',
        title,
        message,
        type,
        link: type === 'creative' ? 'creatives' : type === 'optimization' ? 'optimizations' : 'internalChat',
      });
    } catch (error) {
      console.error("Erro ao disparar notificações de squad:", error);
    }
  },

  notifyNewCreative: async (clientName: string, squadId: string, creatorName: string, creatorId: string) => {
    await NotificationService.notifySquad(
      squadId,
      'Novo Criativo Adicionado',
      `${creatorName} postou um novo criativo para o cliente ${clientName}.`,
      'creative',
      creatorId
    );
  },

  notifyNewMonthlyRequest: async (clientName: string, squadId: string, requesterName: string, requesterId: string, mesReferencia: string) => {
    await NotificationService.notifySquad(
      squadId,
      'Nova Solicitação de Criativos',
      `${requesterName} solicitou criativos para ${clientName} (Mês: ${mesReferencia}).`,
      'creative',
      requesterId
    );
  }
};
