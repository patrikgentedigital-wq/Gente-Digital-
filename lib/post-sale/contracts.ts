export type PostSaleOutcome = 'contacts_collected' | 'no_referral';

export type PostSaleContactState = 'created_lead' | 'duplicate_existing' | 'invalid';

export type PostSaleConversionState = 'confirmed' | 'pending_review';

export interface PostSaleContact {
  id: string;
  collectionId: string;
  name: string;
  phoneRaw: string;
  phoneNormalized: string;
  state: PostSaleContactState;
  reason: string | null;
  leadId: number | null;
  createdAt?: string;
  leadStatus?: string | null;
  firstAttendanceAt?: string | null;
}

export interface VerifiedOriginContract {
  contractId: string;
  customerId: string;
  customerName: string;
  soldAt: string;
  phoneNumbers: string[];
}

export interface IxcContractRecord {
  id: string;
  clientId: string;
  status: string;
  activatedAt: string | null;
}

export interface IxcClientRecord {
  id: string;
  name: string;
  phones: string[];
}

export interface IxcGateway {
  getContractsById(contractId: string): Promise<IxcContractRecord[]>;
  getClientsById(clientId: string): Promise<IxcClientRecord[]>;
  findClientsByName(name: string): Promise<IxcClientRecord[]>;
  listContractsByClientId(clientId: string): Promise<IxcContractRecord[]>;
}

export interface ConversionCandidate {
  contractId: string;
  activatedAt: string;
  contactId: string | null;
  state: PostSaleConversionState;
  reason: string | null;
}

export interface PostSaleCollectionMetricRow {
  id: string;
  originContractId: string;
  soldAt: string;
  collectorColaboradorId: string;
  outcome: PostSaleOutcome;
}

export interface PostSaleMetricConversion {
  id: string;
  ixcContractId: string;
  contactId: string | null;
  activatedAt: string;
  verifiedAt: string;
  state: PostSaleConversionState;
}

export interface PostSaleDataset {
  collections: PostSaleCollectionMetricRow[];
  contacts: PostSaleContact[];
  conversions: PostSaleMetricConversion[];
}

export interface PostSaleDateRange {
  start: string;
  end: string;
}

export interface PostSaleWindow {
  collection: PostSaleDateRange;
  conversion: PostSaleDateRange;
}

export interface PostSaleMetrics {
  registeredOriginSales: number;
  contactsReceived: number;
  validContacts: number;
  duplicateContacts: number;
  invalidContacts: number;
  leadsInProgress: number;
  pendingReviews: number;
  convertedContacts: number;
  confirmedContracts: number;
  conversionRate: number | null;
  averageMinutesToFirstAttendance: number | null;
}

export class PostSaleDomainError extends Error {
  constructor(
    readonly code: 'invalid_contract' | 'ixc_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'PostSaleDomainError';
  }
}
