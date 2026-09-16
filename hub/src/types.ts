
export enum LeadStatus {
  Lead = 'Lead',
  Agendamento = 'Agendamento',
  Comparecimento = 'Comparecimento',
  Venda = 'Venda',
  Perdido = 'Perdido'
}

export enum OptimizationStatus {
  Pendente = 'Pendente',
  Concluido = 'Concluido',
}

export enum EfetividadeStatus {
    NaoAvaliado = 'Não Avaliado',
    EmAnalise = 'Em Análise',
    Efetiva = 'Efetiva',
    NaoEfetiva = 'Não Efetiva'
}

export enum CreativeStatus {
  Aprovado = 'Aprovado',
  Pendente = 'Pendente',
  Reprovado = 'Reprovado',
  EmAnalise = 'Em Análise',
}

export enum RequestStatus {
  Pendente = 'Pendente',
  EmProducao = 'Em Produção',
  Finalizado = 'Finalizado',
}

export enum MoodStatus {
  Verde = 'Verde',
  Amarelo = 'Amarelo',
  Vermelho = 'Vermelho',
}

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  label: string;
}

export interface MetaInsightsData {
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  leads: number;
  reach: number;
  frequency: number;
  cpm: number;
  date_start: string;
  date_stop: string;
  account_id?: string;
  account_status?: number;
  amount_spent?: number;
  balance?: number;
  currency?: string;
}

export interface DailyPerformance {
  id: string; // IDCLIENTE_YYYY-MM-DD
  clienteId: string;
  data: string; // YYYY-MM-DD
  canal: 'Meta' | 'Google';
  spend: number;
  leads: number;
  cpl: number;
}

export type MetaCampaignCategory = 
  | 'DISTRIBUICAO_TRAFEGO' 
  | 'CAPTACAO_ENG_MSG' 
  | 'CAPTACAO_LEADS_MSG' 
  | 'CAPTACAO_LEADS_FORMS' 
  | 'CAPTACAO_LEADS_SITE'
  | 'CAPTACAO_LEADS_TIMTIM'
  | 'CAPTACAO_VENDAS_WHATSAPP'
  | 'OUTRO';

export interface MetaCampaignData {
  id: string;
  name: string;
  status: string;
  objective: string;
  category: MetaCampaignCategory;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  on_fb_leads: number;
  website_leads: number;
  website_contacts: number;
  msg_started: number;
  cost_per_on_fb_lead: number;
  cost_per_website_lead: number;
  cost_per_msg_started: number;
  cost_per_contact: number;
  leads: number;
  daily_budget?: number;
  lifetime_budget?: number;
}

export type MetaFilterType = 'campaign_name' | 'adset_name' | 'ad_name' | 'impressions';
export type MetaFilterOperator = 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'equal_to';

export interface MetaFilter {
  id: string;
  type: MetaFilterType;
  operator: MetaFilterOperator;
  value: string | number;
}

export interface Client {
  ClienteID: string;
  Nome: string;
  Nicho: string;
  Responsavel: string;
  SquadID?: string; // NOVO: ID do Squad Responsável
  DiaOtimizacao: 'Segunda' | 'Terça' | 'Quarta' | 'Quinta' | 'Sexta';
  Filmagem: 'Sim' | 'Não';
  OrcamentoMensal: number;
  StatusCliente: 'Ativo' | 'Pausado' | 'Encerrado';
  mood?: MoodStatus; // NOVO: Sentimento do Cliente (CSat)
  NovosSeguidores: number;
  ticketMedio: number;
  receitaGerada?: number;
  ctrLink?: number;
  clicksLink?: number;
  faturamentoMedio?: number;
  servicosVendidos?: string;
  metaAdsLink?: string;
  googleAdsLink?: string;
  instagram?: string;
  resumo?: string;
  doresDesejos?: string;
  produtoPrincipal?: string;
  fotoUrl?: string;
  logoUrl?: string;
  identidadeVisualUrl?: string;
  observacoes?: string;
  metaAdAccountId?: string;
  googleAdsAccountId?: string;
  metaAccessToken?: string;
  metaFormId?: string;
  usingN8N?: boolean;
  lastMetaInsights?: MetaInsightsData | null;
  lastMetaCampaigns?: MetaCampaignData[] | null;
  lastMetaSync?: string;
}

// Conta de anúncio descoberta via token do System User (GET /me/adaccounts)
export interface MetaAdAccount {
  id: string;
  name: string;
  status: number;
  statusLabel: string;
  currency: string;
  businessName?: string | null;
  timezone?: string | null;
  linkedClienteId?: string | null;
  linkedClienteNome?: string | null;
}

// Conta de anúncio Google descoberta via MCC (Google Ads API)
export interface GoogleAdAccount {
  id: string;
  name: string;
  currency?: string | null;
  timezone?: string | null;
  manager?: boolean;
  status?: string | null;
  parentId?: string;
  linkedClienteId?: string | null;
  linkedClienteNome?: string | null;
}

export interface Lead {
  LeadID: string;
  ClienteID: string;
  Nome: string;
  Telefone: string;
  Origem: string;
  DataEntrada: string;
  Responsavel: string;
  Status: LeadStatus;
  ValorVenda?: number;
  MotivoPerda?: string;
  metaLeadId?: string;
}

export interface Investment {
  InvestimentoID: string;
  ClienteID: string;
  Periodo: string;
  Canal: 'Meta' | 'Google' | 'Outro';
  Valor: number;
}

export interface Optimization {
  OtimizacaoID: string;
  ClienteID: string;
  Data: string;
  Responsavel: string;
  Status: OptimizationStatus;
  Descricao?: string;
  FonteTrafego?: 'Meta' | 'Google' | 'Outro';
  HipóteseResultado?: string;
  Efetividade?: EfetividadeStatus;
}

export interface Creative {
  CriativoID: string;
  ClienteID: string;
  Nome: string;
  Formato: 'Vídeo' | 'Imagem' | 'Carrossel' | 'Stories';
  Canal: 'Meta' | 'Google' | 'TikTok' | 'Outro';
  DataCriacao: string;
  Status: CreativeStatus;
  LinkVisualizacao: string;
  Performance?: string;
}

export interface MonthlyCreativeRequest {
    RequestID: string;
    ClienteID: string;
    MesReferencia: string;
    LinkDrive: string;
    DataSolicitacao: string;
    Status: RequestStatus;
}

export interface MonthlyReport {
    ReportID: string;
    ClienteID: string;
    MesReferencia: string;
    LinkRelatorio: string;
    DataCriacao: string;
    AtaReuniao?: string; // NOVO: Campo para anotações em texto
}

export type UserRole = 'adm_supremo' | 'admin' | 'user' | 'vendedor';
export type UserStatus = 'pending' | 'approved' | 'blocked';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  squadID?: string; // NOVO: Squad do Usuário
  photoUrl?: string;
  createdAt: string;
}

export interface Squad {
  id: string;
  nome: string;
  fotoUrl?: string;
  descricao?: string;
  createdAt: string;
}

export interface JarvisConfig {
  systemPrompt: string;
  lastUpdate?: string;
}

export interface ChatMessage {
  id?: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  timestamp: any;
  photoUrl?: string;
  channelId?: string; // NOVO: 'global', 'squad_id', etc.
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'creative' | 'optimization' | 'chat';
  read: boolean;
  timestamp: any;
  link?: string;
}

// Navigation Page Type
export type Page = 
  | 'home' 
  | 'clientList' 
  | 'leadsFunnel' 
  | 'clientDetail' 
  | 'calendar' 
  | 'creatives' 
  | 'reports'
  | 'dailyFollowUp'
  | 'scenarioProjection'
  | 'metaAccounts'
  | 'googleAccounts'
  | 'jarvis'
  | 'settings'
  | 'security'
  | 'optimizations'
  | 'monthlyReports'
  | 'internalChat'
  | 'churnometro'
  | 'trafficBrain'
  | 'searchConsole';
