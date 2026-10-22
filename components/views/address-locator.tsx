'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { StreetPlace } from '@/lib/viabilidade/geocoding';
import type { Point, Region } from '@/lib/viabilidade/domain/types';

const errors: Record<string, string> = {
  UNAUTHORIZED: 'Sua sessão expirou. Entre novamente no painel.',
  GEOCODING_BUSY: 'A busca está atendendo outra consulta. Aguarde 2 segundos e tente novamente.',
  ADDRESS_INPUT_INVALID: 'Confira a rua, o bairro e a cidade. Não inclua telefone ou dados pessoais nesses campos.',
  ADDRESS_SEARCH_UNAVAILABLE: 'A busca de ruas está indisponível. Tente novamente em instantes.',
};
const inputClass = 'mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-transparent p-2.5 dark:border-zinc-700';

export default function AddressLocator({ region, onLocated, onInvalidated, onAddressChange, onUseCoordinates }: {
  region: Region;
  onLocated(point: Point): void;
  onInvalidated(): void;
  onAddressChange(address: string): void;
  onUseCoordinates(): void;
}) {
  const [fields, setFields] = useState({ street: '', number: '', neighborhood: '', city: region === 'CP' ? 'Capanema' : 'Augusto Corrêa' });
  const [places, setPlaces] = useState<StreetPlace[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notFound, setNotFound] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function edit(key: keyof typeof fields, value: string) {
    active.current?.abort(); active.current = null;
    const next = { ...fields, [key]: value };
    setFields(next); setPlaces([]); setError(''); setNotFound(false); setBusy(false);
    onInvalidated();
    onAddressChange([next.street, next.number, next.neighborhood, next.city, 'PA'].filter(Boolean).join(', ').slice(0, 240));
  }

  async function search(cityOnly = false) {
    setError(''); setPlaces([]); setNotFound(false); onInvalidated();
    if (!fields.city.trim() || !cityOnly && !fields.street.trim()) { setError('Informe a rua e a cidade para localizar o endereço.'); return; }
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch('/api/viabilidade/endereco', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', signal: controller.signal,
        body: JSON.stringify({ street: cityOnly ? '' : fields.street.trim(), neighborhood: cityOnly ? '' : fields.neighborhood.trim(), city: fields.city.trim() }) });
      if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw Error('Sua sessão expirou. Entre novamente no painel.');
      const body = await response.json();
      if (!response.ok) throw Error(errors[body.error] ?? 'Não foi possível localizar a rua. Confira o endereço e tente novamente.');
      if (active.current !== controller || controller.signal.aborted) return;
      setPlaces(body.places);
      if (!body.places.length) {
        if (cityOnly) setError('Cidade não encontrada. Confira a grafia e tente novamente.');
        else setNotFound(true);
      }
    } catch (e) {
      if (active.current === controller) setError(controller.signal.aborted ? 'A busca excedeu o tempo de espera. Tente novamente.' : (e as Error).message);
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  return <div className="space-y-4" onKeyDown={event => {
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); void search(); }
  }}>
    <label className="block text-sm font-medium">Cidade<input aria-label="Cidade" value={fields.city} onChange={e => edit('city', e.target.value)} maxLength={80} autoComplete="address-level2" className={inputClass}/></label>
    <label className="block text-sm font-medium">Rua<input aria-label="Rua" value={fields.street} onChange={e => edit('street', e.target.value)} maxLength={120} autoComplete="address-line1" placeholder="Ex.: Passagem Floriano" className={inputClass}/></label>
    <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
      <label className="block text-sm font-medium">Número<input aria-label="Número" value={fields.number} onChange={e => edit('number', e.target.value)} maxLength={20} placeholder="123 ou s/n" className={inputClass}/></label>
      <label className="block text-sm font-medium">Bairro<input aria-label="Bairro" value={fields.neighborhood} onChange={e => edit('neighborhood', e.target.value)} maxLength={100} autoComplete="address-level3" className={inputClass}/></label>
    </div>
    <button type="button" disabled={busy} onClick={() => void search()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-700 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/40">
      {busy ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>} {busy ? 'Localizando rua…' : 'Localizar endereço'}
    </button>
    <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">A busca localiza a rua. O número fica no painel; confirme a casa no mapa antes da consulta.</p>
    {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {notFound && <div role="status" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <p>A rua não apareceu. Marque o imóvel no mapa da cidade ou informe latitude e longitude.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <button type="button" disabled={busy} onClick={() => void search(true)} className="font-semibold underline">Abrir mapa da cidade</button>
        <button type="button" disabled={busy} onClick={onUseCoordinates} className="font-semibold underline">Informar latitude e longitude</button>
      </div>
    </div>}
    {places.length > 0 && <div className="space-y-2" aria-live="polite"><p className="text-xs font-medium text-slate-600 dark:text-zinc-400">Selecione o local e ajuste o imóvel no mapa</p>
      {places.map(place => <button key={place.id} type="button" onClick={() => onLocated(place.location)} className="block w-full rounded-lg border border-slate-200 px-3 py-3 text-left text-sm hover:border-sky-600 hover:bg-sky-50 dark:border-zinc-700 dark:hover:bg-sky-950/40">{place.label}</button>)}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="inline-block text-xs text-slate-500 underline dark:text-zinc-400">Busca: OpenStreetMap / Nominatim</a>
    </div>}
  </div>;
}
