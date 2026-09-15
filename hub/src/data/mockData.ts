import { Investment } from '../types';

export const mockInvestments: Investment[] = [
  { InvestimentoID: 'inv-001', ClienteID: 'cli-001', Periodo: '2023-10', Canal: 'Meta', Valor: 1500 },
  { InvestimentoID: 'inv-002', ClienteID: 'cli-001', Periodo: '2023-10', Canal: 'Google', Valor: 1000 },
  { InvestimentoID: 'inv-003', ClienteID: 'cli-002', Periodo: '2023-10', Canal: 'Meta', Valor: 2500 },
  { InvestimentoID: 'inv-004', ClienteID: 'cli-003', Periodo: '2023-10', Canal: 'Google', Valor: 1200 },
  { InvestimentoID: 'inv-005', ClienteID: 'cli-004', Periodo: '2023-10', Canal: 'Meta', Valor: 2000 },
];