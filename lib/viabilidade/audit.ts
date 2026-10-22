import { mkdir, appendFile, readdir, readFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Decision } from './domain/types';

export function auditRecord(decision: Decision, leadId: number | null = null) {
  return {
    id: decision.id, evaluatedAt: decision.evaluatedAt, origin: decision.origin,
    leadId,
    status: decision.status, recommendedCtoId: decision.recommendedCtoId,
    reasons: decision.reasons, policyVersion: decision.policyVersion,
    sourceTimes: decision.sources,
    region: decision.region ?? null,
    candidates: decision.candidates.map(({ ctoId, status, reasons, routeMeters, routeSource, routeComponents, ixcCapacity, sheetCapacity }) => ({
      ctoId, status, routeMeters, routeSource, routeComponents, ixcCapacity, sheetCapacity, reasons
    }))
  };
}

export function createAuditWriter(directory: string, now: () => Date = () => new Date(), retentionDays: number | null = null, leadId: number | null = null) {
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1)) throw new Error('AUDIT_RETENTION_INVALID');
  if (leadId !== null && (!Number.isSafeInteger(leadId) || leadId < 1)) throw new Error('AUDIT_LEAD_ID_INVALID');
  return async (decision: Decision): Promise<void> => {
    await mkdir(directory, { recursive: true });
    const day = now().toISOString().slice(0, 10);
    const filePath = join(directory, 'decisions-' + day + '.jsonl');
    await appendFile(filePath, JSON.stringify(auditRecord(decision, leadId)) + '\n', { encoding: 'utf8', mode: 0o600 });
    if (retentionDays !== null) {
      const cutoff = Date.parse(day + 'T00:00:00Z') - retentionDays * 86_400_000;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const match = entry.name.match(/^decisions-(\d{4}-\d{2}-\d{2})\.jsonl$/);
        if (entry.isFile() && match && Date.parse(match[1]! + 'T00:00:00Z') < cutoff) {
          await unlink(join(directory, entry.name));
        }
      }
    }
  };
}

export type AuditRecord = ReturnType<typeof auditRecord>;
export function createAuditReader(directory: string, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('AUDIT_HISTORY_LIMIT_INVALID');
  return async (): Promise<AuditRecord[]> => {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('AUDIT_HISTORY_UNAVAILABLE'); }
    const files = entries.filter(e => e.isFile() && /^decisions-\d{4}-\d{2}-\d{2}\.jsonl$/.test(e.name))
      .sort((a,b) => b.name.localeCompare(a.name));
    const records: AuditRecord[] = [];
    for (const entry of files.slice(0,90)) {
      const path = join(directory,entry.name);
      if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error('AUDIT_HISTORY_TOO_LARGE');
      for (const line of (await readFile(path,'utf8')).split('\n').filter(Boolean)) {
        let row;
        try { row = JSON.parse(line); } catch { throw new Error('AUDIT_HISTORY_INVALID'); }
        if (!row || typeof row.id !== 'string' || !Number.isFinite(Date.parse(row.evaluatedAt))
          || !['VIAVEL','INVIAVEL','ANALISE_TECNICA'].includes(row.status) || !['DEMO','LIVE'].includes(row.origin)
          || !Array.isArray(row.reasons) || !Array.isArray(row.candidates) || typeof row.policyVersion !== 'string') {
          throw new Error('AUDIT_HISTORY_INVALID');
        }
        // Reprojeta os campos conhecidos: arquivos não podem injetar dados privados na API.
        const leadId = row.leadId === undefined || row.leadId === null ? null : row.leadId;
        if (leadId !== null && (!Number.isSafeInteger(leadId) || leadId < 1)) throw new Error('AUDIT_HISTORY_INVALID');
        records.push({id:row.id,evaluatedAt:row.evaluatedAt,origin:row.origin,status:row.status,leadId,
          region:row.region==='AC'||row.region==='CP'?row.region:null,recommendedCtoId:row.recommendedCtoId??null,
          reasons:row.reasons.filter((x:unknown)=>typeof x==='string'&&/^[A-Z0-9_]+$/.test(x)),policyVersion:row.policyVersion,
          sourceTimes:{ixcFetchedAt:String(row.sourceTimes?.ixcFetchedAt??''),sheetsFetchedAt:String(row.sourceTimes?.sheetsFetchedAt??''),
            ...(typeof row.sourceTimes?.roadGraphVersion==='string'&&/^[a-f0-9]{20}$/.test(row.sourceTimes.roadGraphVersion)
              ?{roadGraphVersion:row.sourceTimes.roadGraphVersion}:{}),
            ...(typeof row.sourceTimes?.roadGraphUpdatedAt==='string'&&Number.isFinite(Date.parse(row.sourceTimes.roadGraphUpdatedAt))
              ?{roadGraphUpdatedAt:row.sourceTimes.roadGraphUpdatedAt}:{})},
          candidates:row.candidates.map((c:Record<string,unknown>)=>({ctoId:String(c.ctoId??''),status:c.status as Decision['status'],
            routeMeters:typeof c.routeMeters==='number'&&Number.isFinite(c.routeMeters)?c.routeMeters:null,
            routeSource:c.routeSource==='CONFIRMED'||c.routeSource==='FIBERDOCS_ESTIMATE'||c.routeSource==='OSM_ESTIMATE'?c.routeSource:null,
            routeComponents:readRouteComponents(c.routeComponents),
            ixcCapacity:typeof c.ixcCapacity==='number'&&Number.isFinite(c.ixcCapacity)?c.ixcCapacity:null,
            sheetCapacity:typeof c.sheetCapacity==='number'&&Number.isFinite(c.sheetCapacity)?c.sheetCapacity:null,
            reasons:Array.isArray(c.reasons)?c.reasons.filter((x:unknown)=>typeof x==='string'&&/^[A-Z0-9_]+$/.test(x)):[]}))});
      }
    }
    return records.sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt)).slice(0,limit);
  };
}

function readRouteComponents(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = ['lineMeters', 'installAccessMeters', 'ctoAccessMeters', 'reserveMeters', 'totalMeters'] as const;
  if (keys.some(key => typeof item[key] !== 'number' || !Number.isFinite(item[key]) || (item[key] as number) < 0)) return null;
  if (item.reserveMeters !== 20) return null;
  const sum = (item.lineMeters as number) + (item.installAccessMeters as number) + (item.ctoAccessMeters as number) + 20;
  if (Math.abs(sum - (item.totalMeters as number)) > 0.01) return null;
  return {
    lineMeters: item.lineMeters as number,
    installAccessMeters: item.installAccessMeters as number,
    ctoAccessMeters: item.ctoAccessMeters as number,
    reserveMeters: 20 as const,
    totalMeters: item.totalMeters as number,
  };
}
