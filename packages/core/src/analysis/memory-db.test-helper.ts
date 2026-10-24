// Base et stockage EN MÉMOIRE pour les tests unitaires de `analysis` : le sous-ensemble du client Supabase que ces cas
// d'usage emploient (select, insert, update, delete, eq, in, order, limit, maybeSingle, single, `.select()` après une écriture).
// Les contraintes de la vraie base (RLS, CHECK) sont prouvées par les tests PGlite et par les tests d'intégration.
import type { DbClient, ServiceClient } from '@pubeka/db';

export type Row = Record<string, unknown>;
export interface Result {
  data: unknown;
  error: { code?: string; message: string } | null;
  /** Rempli par `select(…, { count: 'exact' })` : nombre de lignes qui correspondent, avant `limit` et `range`. */
  count?: number;
}

const DEFAULTS: Record<string, () => Row> = {
  analyses: () => ({
    status: 'queued',
    flags: [],
    unreadable_sources: [],
    source_ids: [],
    error_code: null,
    blocked_reason: null,
    business_profile_id: null,
  }),
  uploads: () => ({ status: 'pending', verified_mime: null, verified_size: null }),
  sources: () => ({ status: 'ok', extractor: null, extracted_text: null }),
  business_profiles: () => ({ answers: [], conflicts: [], sensitive_signals: [], flags: [] }),
  campaign_proposals: () => ({
    status: 'ready',
    chosen: false,
    error_code: null,
    agent_run_id: null,
    created_at: new Date().toISOString(),
  }),
  campaigns: () => ({
    version: 1,
    status: 'draft',
    editable: true,
    platform: 'meta',
    geo: {},
    targeting: {},
    copy: {},
    tracking: null,
    ab_test: false,
    daily_budget_usd_cents: null,
    start_date: null,
    end_date: null,
    objective: null,
    destination: null,
    optimization_goal: null,
    visual_brief: null,
    vat_rate: null,
    fx_rate_xaf: null,
    published_at: null,
    chosen_proposal_version: null,
    meta_campaign_id: null,
    meta_adset_id: null,
    publish_ref: null,
    publish_attempt: 0,
    publish_idempotency_key: null,
    publish_phase: 'none',
    publish_started_at: null,
    publish_error: null,
    quota_state: 'none',
    paused_at: null,
  }),
  ads: () => ({ meta_creative_id: null, status: null, variant: null }),
};

/** Contraintes simulées d'une table (les vraies sont prouvées par PGlite et les tests d'intégration). */
export interface TableRules {
  /** Jeux de colonnes uniques ; une valeur `null` ne viole jamais l'unicité (comme SQL). */
  unique?: string[][];
  /** Chaque mise à jour augmente `version` de 1 (déclencheur `bump_version`). */
  bumpVersion?: boolean;
}

export class MemoryDb {
  readonly rules: Record<string, TableRules> = {};
  /** Appelé juste avant chaque insertion : permet de simuler une écriture concurrente. */
  beforeInsert: ((table: string, db: MemoryDb) => void) | undefined;
  /** Appelé juste avant chaque mise à jour : permet de simuler une modification concurrente. */
  beforeUpdate: ((table: string, db: MemoryDb) => void) | undefined;
  readonly tables: Record<string, Row[]> = {};
  /** Comme le plafond de lignes de PostgREST (`max-rows`) : une lecture sans `range` est coupée SILENCIEUSEMENT à ce nombre. */
  maxRows: number | undefined;
  readonly objects = new Map<string, { bytes: Uint8Array; createdAt: string }>();
  readonly storageCalls: string[] = [];
  /** Fait échouer la prochaine requête sur cette table (`table:op`). */
  failNext = new Set<string>();
  /** Code SQL renvoyé par un échec simulé (`table:op` → ex. `23514`) ; `XX000` par défaut. */
  failCodes: Record<string, string> = {};
  private counter = 0;

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  nextId(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  from(table: string): Query {
    return new Query(this, table);
  }

  readonly storage = {
    from: (bucket: string) => ({
      info: (
        path: string,
      ): Promise<{
        data: { size: number; createdAt: string } | null;
        error: { message: string } | null;
      }> => {
        const object = this.objects.get(`${bucket}/${path}`);
        return Promise.resolve(
          object === undefined
            ? { data: null, error: { message: 'Object not found' } }
            : { data: { size: object.bytes.length, createdAt: object.createdAt }, error: null },
        );
      },
      download: (
        path: string,
      ): Promise<{ data: Blob | null; error: { message: string } | null }> => {
        const object = this.objects.get(`${bucket}/${path}`);
        return Promise.resolve(
          object === undefined
            ? { data: null, error: { message: 'Object not found' } }
            : { data: new Blob([Uint8Array.from(object.bytes)]), error: null },
        );
      },
      upload: (
        path: string,
        bytes: Uint8Array,
      ): Promise<{ data: unknown; error: { message: string } | null }> => {
        this.storageCalls.push(`upload:${bucket}/${path}`);
        if (this.failNext.delete('storage:upload'))
          return Promise.resolve({ data: null, error: { message: 'down' } });
        this.objects.set(`${bucket}/${path}`, { bytes, createdAt: new Date().toISOString() });
        return Promise.resolve({ data: { path }, error: null });
      },
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> => {
        this.storageCalls.push(`sign:${bucket}/${path}`);
        if (this.failNext.delete('storage:sign'))
          return Promise.resolve({ data: null, error: { message: 'down' } });
        if (!this.objects.has(`${bucket}/${path}`))
          return Promise.resolve({ data: null, error: { message: 'Object not found' } });
        return Promise.resolve({
          data: { signedUrl: `https://storage.test/${bucket}/${path}?ttl=${String(expiresIn)}` },
          error: null,
        });
      },
      remove: (paths: string[]): Promise<{ data: unknown; error: null }> => {
        for (const path of paths) {
          this.storageCalls.push(`remove:${bucket}/${path}`);
          this.objects.delete(`${bucket}/${path}`);
        }
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };

  put(bucket: string, path: string, bytes: Uint8Array, createdAt = new Date().toISOString()): void {
    this.objects.set(`${bucket}/${path}`, { bytes, createdAt });
  }

  asDb(): DbClient {
    return this as unknown as DbClient;
  }

  asService(): ServiceClient {
    return this as unknown as ServiceClient;
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private returning = false;
  private mode: 'many' | 'maybe' | 'single' = 'many';
  private max = Infinity;
  private from = 0;
  private ranged = false;
  private wantsCount = false;
  private headOnly = false;
  private sort: { column: string; ascending: boolean; nullsFirst: boolean } | undefined;

  constructor(
    private readonly db: MemoryDb,
    private readonly table: string,
  ) {}

  /** Les colonnes demandées ne changent rien en mémoire : toute la ligne est rendue. `count` et `head` sont pris en compte. */
  select(_columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    if (this.op !== 'select') this.returning = true;
    if (options?.count !== undefined) this.wantsCount = true;
    if (options?.head === true) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: null): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push(
      (row) => (row[column] ?? null) !== null && String(row[column]) >= String(value),
    );
    return this;
  }
  lt(column: string, value: unknown): this {
    this.filters.push(
      (row) => (row[column] ?? null) !== null && String(row[column]) < String(value),
    );
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  lte(column: string, value: unknown): this {
    this.filters.push(
      (row) => (row[column] ?? null) !== null && String(row[column]) <= String(value),
    );
    return this;
  }
  /** Seul `.not(colonne, 'is', null)` (« n'est pas nul ») est pris en charge. */
  not(column: string, operator: string, value: unknown): this {
    if (operator !== 'is' || value !== null) throw new Error('not() : seul « is null » est simulé');
    this.filters.push((row) => (row[column] ?? null) !== null);
    return this;
  }
  /** Comme PostgreSQL : en ordre croissant les valeurs nulles viennent EN DERNIER, sauf `nullsFirst`. */
  order(column?: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    if (column !== undefined) {
      const ascending = options?.ascending !== false;
      this.sort = { column, ascending, nullsFirst: options?.nullsFirst ?? !ascending };
    }
    return this;
  }
  range(fromIndex: number, toIndex: number): this {
    this.from = fromIndex;
    this.max = toIndex - fromIndex + 1;
    this.ranged = true;
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  maybeSingle(): this {
    this.mode = 'maybe';
    return this;
  }
  single(): this {
    this.mode = 'single';
    return this;
  }

  private run(): Result {
    if (this.db.failNext.delete(`${this.table}:${this.op}`)) {
      const code = this.db.failCodes[`${this.table}:${this.op}`] ?? 'XX000';
      return { data: null, error: { code, message: 'échec simulé' } };
    }
    const rows = this.db.rows(this.table);
    let affected: Row[];
    let total: number | undefined;
    if (this.op === 'insert') {
      this.db.beforeInsert?.(this.table, this.db);
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      affected = list.map((row) => ({
        id: this.db.nextId(),
        ...(DEFAULTS[this.table]?.() ?? {}),
        ...row,
      }));
      for (const candidate of affected) {
        for (const columns of this.db.rules[this.table]?.unique ?? []) {
          const clash = rows.some((row) =>
            columns.every(
              (c) => candidate[c] !== null && candidate[c] !== undefined && row[c] === candidate[c],
            ),
          );
          if (clash) {
            return {
              data: null,
              error: { code: '23505', message: `doublon sur ${columns.join(', ')}` },
            };
          }
        }
      }
      rows.push(...affected);
    } else {
      if (this.op === 'update') this.db.beforeUpdate?.(this.table, this.db);
      const matching = rows.filter((row) => this.filters.every((f) => f(row)));
      if (this.op === 'update') {
        for (const row of matching) {
          Object.assign(row, this.payload);
          if (this.db.rules[this.table]?.bumpVersion === true)
            row.version = Number(row.version) + 1;
        }
      } else if (this.op === 'delete') {
        for (const row of matching) rows.splice(rows.indexOf(row), 1);
      }
      const ordered =
        this.sort === undefined ? matching : [...matching].sort((a, b) => compare(a, b, this.sort));
      const cap = this.ranged ? this.max : Math.min(this.max, this.db.maxRows ?? Infinity);
      total = ordered.length;
      affected = ordered.slice(this.from, this.from + cap);
    }
    if ((this.op === 'insert' || this.op === 'update' || this.op === 'delete') && !this.returning) {
      return { data: null, error: null };
    }
    if (this.wantsCount && this.op === 'select') {
      const count = total ?? affected.length;
      if (this.headOnly) return { data: null, error: null, count };
      const rowsOut = affected.map((row) => ({ ...row }));
      return { data: rowsOut, error: null, count };
    }
    const copy = affected.map((row) => ({ ...row }));
    if (this.mode === 'many') return { data: copy, error: null };
    if (copy.length === 0) {
      return this.mode === 'single'
        ? { data: null, error: { code: 'PGRST116', message: 'aucune ligne' } }
        : { data: null, error: null };
    }
    return { data: copy[0], error: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

function compare(
  a: Row,
  b: Row,
  sort: { column: string; ascending: boolean; nullsFirst: boolean } | undefined,
): number {
  if (sort === undefined) return 0;
  const nullA = (a[sort.column] ?? null) === null;
  const nullB = (b[sort.column] ?? null) === null;
  if (nullA || nullB) {
    if (nullA && nullB) return 0;
    return nullA === sort.nullsFirst ? -1 : 1;
  }
  const x = a[sort.column] as number | string;
  const y = b[sort.column] as number | string;
  const order = x < y ? -1 : x > y ? 1 : 0;
  return sort.ascending ? order : -order;
}
