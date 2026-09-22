'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Toggle } from '@/components/ui/form-controls';
import { Input, Select } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/Modal';

export interface FlashscoreStandingsSource {
  seasonId: string;
  groupKeyPrefix: string | null;
  expectedRows: number | null;
}

export interface CreateCompetitionPayload {
  apiFootballId: number;
  name: string;
  nameEn: string | null;
  country: string | null;
  countryEn: string | null;
  type: 'league' | 'cup';
  flashscoreSlug: string | null;
  flashscoreSeasonId: string | null;
  flashscoreStandingsSources: FlashscoreStandingsSource[] | null;
  currentSeasonYear: string | null;
  seasonDisplayLabel: string | null;
  supportsQuiniela: boolean;
  isNationalTeamCompetition: boolean;
}

export function StandingsSourcesEditor({
  value,
  onChange,
}: {
  value: FlashscoreStandingsSource[];
  onChange: (value: FlashscoreStandingsSource[]) => void;
}) {
  const patch = (index: number, update: Partial<FlashscoreStandingsSource>) =>
    onChange(value.map((source, i) => (i === index ? { ...source, ...update } : source)));

  return (
    <div className="space-y-2">
      {value.map((source, index) => (
        <div key={index} className="grid grid-cols-[90px_1fr_100px_auto] gap-2 items-center">
          <Input
            aria-label={`Group prefix ${index + 1}`}
            value={source.groupKeyPrefix ?? ''}
            onChange={(e) => patch(index, { groupKeyPrefix: e.target.value.toUpperCase() || null })}
            placeholder="A"
            maxLength={12}
          />
          <Input
            aria-label={`Flashscore season ID ${index + 1}`}
            value={source.seasonId}
            onChange={(e) => patch(index, { seasonId: e.target.value })}
            placeholder="Season ID"
            maxLength={32}
          />
          <Input
            aria-label={`Expected rows ${index + 1}`}
            type="number"
            min={2}
            max={128}
            value={source.expectedRows ?? ''}
            onChange={(e) => patch(index, { expectedRows: e.target.value ? Number(e.target.value) : null })}
            placeholder="Rows"
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove standings source ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={value.length >= 8}
        onClick={() => onChange([...value, { seasonId: '', groupKeyPrefix: null, expectedRows: null }])}
      >
        <Plus size={14} /> Add standings source
      </Button>
      <p className="text-[11px] text-text-muted/60 font-sans">
        Use one row per Flashscore edition. A prefix namespaces numeric groups: prefix A + Group 1 becomes A1.
      </p>
    </div>
  );
}

export function CreateCompetitionModal({
  open,
  pending,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (payload: CreateCompetitionPayload) => void;
}) {
  const [apiFootballId, setApiFootballId] = useState('');
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [country, setCountry] = useState('');
  const [countryEn, setCountryEn] = useState('');
  const [type, setType] = useState<'league' | 'cup'>('league');
  const [flashscoreSlug, setFlashscoreSlug] = useState('');
  const [flashscoreSeasonId, setFlashscoreSeasonId] = useState('');
  const [currentSeasonYear, setCurrentSeasonYear] = useState('');
  const [seasonDisplayLabel, setSeasonDisplayLabel] = useState('');
  const [sources, setSources] = useState<FlashscoreStandingsSource[]>([]);
  const [national, setNational] = useState(false);
  const [supportsQuiniela, setSupportsQuiniela] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const id = Number(apiFootballId);
    const normalizedSlug = flashscoreSlug.trim().replace(/\/+$/, '');
    if (!Number.isInteger(id) || id <= 0) return setError('API-Football ID must be a positive integer.');
    if (!name.trim()) return setError('Name (ES) is required.');
    if (normalizedSlug && !/^football\/[a-z0-9-]{1,64}\/[a-z0-9-]{1,96}$/.test(normalizedSlug)) {
      return setError('Flashscore slug must use football/region/competition.');
    }
    if (flashscoreSeasonId && !/^[A-Za-z0-9]{1,32}$/.test(flashscoreSeasonId)) {
      return setError('The primary Flashscore season ID must be alphanumeric.');
    }
    if (currentSeasonYear && !/^\d{4}$/.test(currentSeasonYear)) {
      return setError('Current season year must have four digits.');
    }
    if ((flashscoreSeasonId || sources.length > 0) && !currentSeasonYear) {
      return setError('Current season year is required for tournament standings.');
    }
    if (sources.length > 8) return setError('A competition can have at most eight standings sources.');
    const prefixes = new Set<string>();
    const seasonIds = new Set<string>();
    for (const source of sources) {
      const prefix = source.groupKeyPrefix?.trim().toUpperCase() ?? '';
      if (!/^[A-Za-z0-9]{1,32}$/.test(source.seasonId)) return setError('Every standings source needs a valid season ID.');
      if (prefix && !/^[A-Z0-9]{1,12}$/.test(prefix)) return setError('Standings prefixes must be alphanumeric.');
      if (source.expectedRows != null && (!Number.isInteger(source.expectedRows) || source.expectedRows < 2 || source.expectedRows > 128)) {
        return setError('Expected rows must be an integer between 2 and 128.');
      }
      if (prefixes.has(prefix) || seasonIds.has(source.seasonId)) return setError('Standings prefixes and season IDs must be unique.');
      prefixes.add(prefix);
      seasonIds.add(source.seasonId);
    }
    setError(null);
    onCreate({
      apiFootballId: id,
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      country: country.trim() || null,
      countryEn: countryEn.trim() || null,
      type,
      flashscoreSlug: normalizedSlug || null,
      flashscoreSeasonId: flashscoreSeasonId.trim() || null,
      flashscoreStandingsSources: sources.length > 0 ? sources.map((s) => ({ ...s, groupKeyPrefix: s.groupKeyPrefix?.trim().toUpperCase() || null })) : null,
      currentSeasonYear: currentSeasonYear.trim() || null,
      seasonDisplayLabel: seasonDisplayLabel.trim() || null,
      supportsQuiniela,
      isNationalTeamCompetition: national,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add competition"
      description="Create a competition and make it available to backend sync jobs."
      size="lg"
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={submit}>Create competition</Button>
        </>
      }
    >
      <div className="space-y-1">
        <Field label="API-Football ID"><Input type="number" min={1} value={apiFootballId} onChange={(e) => setApiFootballId(e.target.value)} /></Field>
        <Field label="Name (ES)"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Name (EN)"><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></Field>
        <Field label="Country (ES)"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Field>
        <Field label="Country (EN)"><Input value={countryEn} onChange={(e) => setCountryEn(e.target.value)} /></Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as 'league' | 'cup')}>
            <option value="league">League</option>
            <option value="cup">Cup / tournament</option>
          </Select>
        </Field>
        <Field label="Flashscore slug"><Input value={flashscoreSlug} onChange={(e) => setFlashscoreSlug(e.target.value)} placeholder="football/europe/uefa-nations-league" /></Field>
        <Field label="Primary season ID"><Input value={flashscoreSeasonId} onChange={(e) => setFlashscoreSeasonId(e.target.value)} /></Field>
        <Field label="Current season year"><Input value={currentSeasonYear} onChange={(e) => setCurrentSeasonYear(e.target.value)} placeholder="2026" maxLength={4} /></Field>
        <Field label="Season display label"><Input value={seasonDisplayLabel} onChange={(e) => setSeasonDisplayLabel(e.target.value)} placeholder="2026/27" maxLength={24} /></Field>
        <Field label="Standings sources" info="Use multiple sources when Flashscore splits one competition across separate editions.">
          <StandingsSourcesEditor value={sources} onChange={setSources} />
        </Field>
        <Field label="National teams"><Toggle value={national} onChange={setNational} /></Field>
        <Field label="Supports quiniela"><Toggle value={supportsQuiniela} onChange={setSupportsQuiniela} /></Field>
        {error && <p role="alert" className="text-xs text-danger font-sans pt-2">{error}</p>}
      </div>
    </Modal>
  );
}
