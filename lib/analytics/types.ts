export type AnalyticsSource = 'opa' | 'ixc' | 'indique';
export type IdentifierKind = 'phone' | 'client_id' | 'contract_id' | 'protocol' | 'metric' | 'unknown';
export type LinkStatus = 'vinculado' | 'nao_vinculado' | 'ambiguo' | 'nao_aplicavel';

export interface RawIdentifier {
  rawValue: string | null;
  kind: IdentifierKind;
}

export interface OpaAttendanceRecord {
  source_id: string;
  protocolo: string | null;
  contato_bruto: string | null;
  tipo_identificador: IdentifierKind;
  canal: string | null;
  status: string | null;
  status_vinculo: LinkStatus;
  data_referencia: string | null;
  data_abertura?: string | null;
  data_finalizacao?: string | null;
  source_updated_at?: string | null;
}

export interface IxcCancellationRecord {
  source_id: string;
  contract_source_id?: string | null;
  motivo: string | null;
  tipo: 'cancelamento' | 'renovacao' | 'upgrade' | 'downgrade' | 'outro';
  data_referencia: string | null;
  source_updated_at?: string | null;
}

export interface DateStampedMetricRecord {
  source_id: string;
  data_referencia: string | null;
}

export interface GeneralMetricInput {
  leads: readonly DateStampedMetricRecord[];
  sales: readonly DateStampedMetricRecord[];
  contracts: readonly DateStampedMetricRecord[];
  preContracts: readonly DateStampedMetricRecord[];
}
