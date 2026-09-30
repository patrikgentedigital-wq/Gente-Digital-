import 'server-only';
import { fetchIxcWithTimeout, getIxcCredentials, type IxcConfig } from '@/lib/ixc';
import { isValidPhoneDigits, normalizePhoneDigits } from './phones';
import { parseIxcDate } from './metrics';
import {
  PostSaleDomainError,
  type ConversionCandidate,
  type IxcClientRecord,
  type IxcContractRecord,
  type IxcGateway,
  type PostSaleContact,
  type VerifiedOriginContract,
} from './contracts';

type IxcCredentials = Pick<IxcConfig, 'cleanDomain' | 'authHeader' | 'hasCredentials'>;

export interface IxcGatewayDependencies {
  getCredentials?: () => Promise<IxcCredentials>;
  fetchWithTimeout?: typeof fetchIxcWithTimeout;
}

interface IxcApiResponse {
  registros?: unknown;
}

function textualId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return '';
}

function rawObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapContract(value: unknown): IxcContractRecord {
  const row = rawObject(value);
  return {
    id: textualId(row.id),
    clientId: textualId(row.id_cliente),
    status: typeof row.status === 'string' ? row.status.trim() : '',
    activatedAt: typeof row.data === 'string' ? row.data : null,
  };
}

function mapClient(value: unknown): IxcClientRecord {
  const row = rawObject(value);
  return {
    id: textualId(row.id),
    name: typeof row.razao === 'string' ? row.razao.trim() : '',
    phones: ['telefone_celular', 'telefone', 'fone', 'whatsapp']
      .map((key) => row[key])
      .filter((phone): phone is string => typeof phone === 'string' && phone.trim() !== '')
      .map(normalizePhoneDigits)
      .filter(Boolean),
  };
}

export async function createIxcGateway(dependencies: IxcGatewayDependencies = {}): Promise<IxcGateway> {
  let credentials: IxcCredentials;
  try {
    credentials = await (dependencies.getCredentials ?? getIxcCredentials)();
  } catch {
    throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível carregar a configuração do IXC.');
  }

  if (!credentials.hasCredentials || !credentials.cleanDomain || !credentials.authHeader) {
    throw new PostSaleDomainError('ixc_unavailable', 'IXC indisponível: credenciais não configuradas.');
  }

  const fetchWithTimeout = dependencies.fetchWithTimeout ?? fetchIxcWithTimeout;

  async function requestRecords(table: 'cliente' | 'cliente_contrato', body: Record<string, string>): Promise<unknown[]> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `https://${credentials.cleanDomain}/webservice/v1/${table}`,
        {
          method: 'POST',
          headers: {
            Authorization: credentials.authHeader,
            'Content-Type': 'application/json',
            ixcsoft: 'listar',
          },
          body: JSON.stringify(body),
        },
        10_000,
      );
    } catch {
      throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível consultar o IXC agora.');
    }

    if (!response.ok) {
      throw new PostSaleDomainError('ixc_unavailable', `Consulta ao IXC falhou (HTTP ${response.status}).`);
    }

    let payload: IxcApiResponse;
    try {
      payload = await response.json() as IxcApiResponse;
    } catch {
      throw new PostSaleDomainError('ixc_unavailable', 'O IXC retornou uma resposta inválida.');
    }

    if (!Array.isArray(payload.registros)) {
      throw new PostSaleDomainError('ixc_unavailable', 'O IXC retornou uma resposta inválida.');
    }

    if (payload.registros.length >= 100) {
      throw new PostSaleDomainError('ixc_unavailable', 'A consulta do IXC excedeu o limite seguro de resultados.');
    }

    return payload.registros;
  }

  const baseQuery = (qtype: string, query: string, oper = '=') => ({
    qtype,
    query,
    oper,
    page: '1',
    rp: '100',
  });

  return {
    async getContractsById(contractId) {
      const rows = await requestRecords('cliente_contrato', baseQuery('id', contractId));
      return rows.map(mapContract);
    },
    async getClientsById(clientId) {
      const rows = await requestRecords('cliente', baseQuery('id', clientId));
      return rows.map(mapClient);
    },
    async findClientsByName(name) {
      const rows = await requestRecords('cliente', baseQuery('razao', name, 'L'));
      return rows.map(mapClient);
    },
    async listContractsByClientId(clientId) {
      const rows = await requestRecords('cliente_contrato', baseQuery('id_cliente', clientId));
      return rows.map(mapContract);
    },
  };
}

export async function validateOriginContract(
  contractId: string,
  ixc: IxcGateway,
): Promise<VerifiedOriginContract> {
  const exactContractId = contractId.trim();
  if (!exactContractId) {
    throw new PostSaleDomainError('invalid_contract', 'Informe um identificador de contrato válido.');
  }

  let contracts: IxcContractRecord[];
  try {
    contracts = await ixc.getContractsById(exactContractId);
  } catch {
    throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível validar o contrato no IXC.');
  }

  const exactMatches = contracts.filter((contract) => contract.id === exactContractId);
  if (exactMatches.length !== 1) {
    throw new PostSaleDomainError('invalid_contract', 'O contrato não foi localizado por um ID exato e único no IXC.');
  }

  const contract = exactMatches[0];
  if (contract.status !== 'A') {
    throw new PostSaleDomainError('invalid_contract', 'O contrato de origem não está ativo no IXC.');
  }

  if (!contract.clientId) {
    throw new PostSaleDomainError('invalid_contract', 'O contrato não possui um cliente verificável no IXC.');
  }

  let clients: IxcClientRecord[];
  try {
    clients = await ixc.getClientsById(contract.clientId);
  } catch {
    throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível confirmar o cliente do contrato no IXC.');
  }

  const exactClients = clients.filter((client) => client.id === contract.clientId);
  if (exactClients.length !== 1 || !exactClients[0].name) {
    throw new PostSaleDomainError('invalid_contract', 'O cliente do contrato não foi localizado de forma única no IXC.');
  }

  const soldAt = parseIxcDate(contract.activatedAt);
  if (!soldAt) {
    throw new PostSaleDomainError('invalid_contract', 'A data do contrato de origem é inválida no IXC.');
  }

  return {
    contractId: exactContractId,
    customerId: contract.clientId,
    customerName: exactClients[0].name,
    soldAt,
    phoneNumbers: Array.from(new Set(exactClients[0].phones.map(normalizePhoneDigits).filter(Boolean))),
  };
}

export async function reconcileContractsForContacts(
  contacts: PostSaleContact[],
  ixc: IxcGateway,
): Promise<ConversionCandidate[]> {
  const eligibleContacts = contacts.filter((contact) => (
    contact.state === 'created_lead'
    && contact.leadId !== null
    && isValidPhoneDigits(contact.phoneNormalized)
  ));
  const contactsByPhone = new Map<string, PostSaleContact[]>();
  for (const contact of eligibleContacts) {
    const matches = contactsByPhone.get(contact.phoneNormalized) ?? [];
    matches.push(contact);
    contactsByPhone.set(contact.phoneNormalized, matches);
  }

  const candidates = new Map<string, ConversionCandidate>();
  for (const contact of eligibleContacts) {
    let nameMatches: IxcClientRecord[];
    try {
      nameMatches = await ixc.findClientsByName(contact.name);
    } catch {
      throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível consultar clientes no IXC.');
    }

    const exactPhoneClients = Array.from(new Map(
      nameMatches
        .filter((client) => client.phones.some((phone) => normalizePhoneDigits(phone) === contact.phoneNormalized))
        .map((client) => [client.id, client]),
    ).values());

    for (const client of exactPhoneClients) {
      let clientContracts: IxcContractRecord[];
      try {
        clientContracts = await ixc.listContractsByClientId(client.id);
      } catch {
        throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível consultar contratos ativos no IXC.');
      }

      for (const contract of clientContracts) {
        if (contract.status !== 'A' || !contract.id || contract.clientId !== client.id) continue;

        let exactContractRows: IxcContractRecord[];
        try {
          exactContractRows = await ixc.getContractsById(contract.id);
        } catch {
          throw new PostSaleDomainError('ixc_unavailable', 'Não foi possível verificar o ID do contrato no IXC.');
        }

        const exactContracts = exactContractRows.filter((row) => row.id === contract.id);
        if (exactContracts.length === 0
          || exactContracts.length !== 1
          || exactContracts[0].clientId !== client.id
          || exactContracts[0].status !== 'A') {
          continue;
        }

        const activatedAt = parseIxcDate(exactContracts[0].activatedAt);
        if (!activatedAt) continue;

        const samePhoneContacts = contactsByPhone.get(contact.phoneNormalized) ?? [];
        const existingCandidate = candidates.get(contract.id);
        if (existingCandidate && existingCandidate.contactId !== contact.id) {
          candidates.set(contract.id, {
            ...existingCandidate,
            contactId: null,
            state: 'pending_review',
            reason: 'Associação ambígua: o contrato corresponde a mais de um contato da coleta.',
          });
          continue;
        }

        const ambiguousClient = exactPhoneClients.length !== 1;
        const ambiguousContact = samePhoneContacts.length !== 1;
        candidates.set(contract.id, {
          contractId: contract.id,
          activatedAt,
          contactId: ambiguousClient || ambiguousContact ? null : contact.id,
          state: ambiguousClient || ambiguousContact ? 'pending_review' : 'confirmed',
          reason: ambiguousClient
            ? 'O telefone corresponde a mais de um cliente no IXC.'
            : ambiguousContact
              ? 'O telefone corresponde a mais de um contato da coleta.'
              : null,
        });
      }
    }
  }

  return Array.from(candidates.values()).sort((left, right) => left.contractId.localeCompare(right.contractId));
}
