export type Region = 'CP' | 'AC';
export type Status = 'VIAVEL' | 'INVIAVEL' | 'ANALISE_TECNICA';
export type Point = { latitude: number; longitude: number };
export type Request = { location: Point; region: Region; address?: string };
export type IxcCto = {
  id: string; originalName: string; region: Region; active: boolean;
  capacity: number | null; location: Point | null;
};
export type SheetCto = {
  originalName: string; region: Region; available: number | null;
  capacity: number | null; location: Point | null; updatedOn: string | null;
  observations: string[]; sheet: string; row: number; issues: string[];
  olt?: string | null; pon?: string | null;
};
export type SheetMatchEvidence = {
  originalName: string; sheet: string; row: number; olt: string | null; pon: string | null;
  available: number | null; capacity: number | null; updatedOn: string | null;
};
export type Snapshot<T> = {
  rows: T[]; fetchedAt: string; complete: boolean; origin: 'DEMO' | 'LIVE'; issues: string[];
};
export type RouteEvidence = {
  ctoId: string; location: Point; meters: number; confirmedAt: string; reference: string;
};
export type RouteSource = 'CONFIRMED' | 'FIBERDOCS_ESTIMATE' | 'OSM_ESTIMATE';
export type RouteComponents = {
  lineMeters: number;
  installAccessMeters: number;
  ctoAccessMeters: number;
  reserveMeters: number;
  totalMeters: number;
};
export type RouteGeometry = { ctoId: string; source: Exclude<RouteSource, 'CONFIRMED'>; points: Point[] };
export type RouteEstimate = {
  ctoId: string;
  location: Point;
  meters: number;
  source?: Exclude<RouteSource, 'CONFIRMED'>;
  components?: RouteComponents;
};
export type Policy = {
  maxDistanceMeters: 500; maxUpdateAgeDays: number | null;
  freshnessMode?: 'ROW_DATE' | 'CURRENT_SNAPSHOT';
  version: string; regionalCoverageConfirmed: boolean;
};
export type Candidate = {
  ctoId: string; key: string | null; status: Status;
  geographicMeters: number | null; routeMeters: number | null;
  routeSource: RouteSource | null;
  routeComponents: RouteComponents | null;
  available: number | null; ixcCapacity: number | null; sheetCapacity: number | null;
  updatedOn: string | null; sheetCtoName: string | null; sheet: string | null; row: number | null;
  sheetMatches: SheetMatchEvidence[]; reasons: string[];
};
export type Decision = {
  region?: Region;
  id: string; evaluatedAt: string; origin: 'DEMO' | 'LIVE'; status: Status;
  recommendedCtoId: string | null; candidates: Candidate[]; reasons: string[];
  policyVersion: string; sources: {
    ixcFetchedAt: string;
    sheetsFetchedAt: string;
    roadGraphVersion?: string;
    roadGraphUpdatedAt?: string;
  };
};
