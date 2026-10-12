// Faux client Supabase pour les tests unitaires de `core` : chaque appel de table ou de
// fonction renvoie la réponse programmée ; les filtres appliqués sont enregistrés.
import type { DbClient, ServiceClient } from '@pubeka/db';

export interface FakeResponse {
  data: unknown;
  error: { code?: string; message: string } | null;
}

export class FakeClient {
  readonly calls: { target: string; ops: [string, ...unknown[]][] }[] = [];
  private readonly queue: FakeResponse[] = [];

  reply(...responses: FakeResponse[]): this {
    this.queue.push(...responses);
    return this;
  }

  private next(): FakeResponse {
    return this.queue.shift() ?? { data: null, error: null };
  }

  private builder(target: string): unknown {
    const call = { target, ops: [] as [string, ...unknown[]][] };
    this.calls.push(call);
    let response: FakeResponse | undefined;
    const settle = (): FakeResponse => (response ??= this.next());
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'then') {
            return (resolve: (v: FakeResponse) => void) => {
              resolve(settle());
            };
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  from(table: string): unknown {
    return this.builder(table);
  }

  rpc(fn: string, args?: unknown): unknown {
    const b = this.builder(`rpc:${fn}`);
    this.calls[this.calls.length - 1]?.ops.push(['args', args]);
    return b;
  }

  asDb(): DbClient {
    return this as unknown as DbClient;
  }

  asService(): ServiceClient {
    return this as unknown as ServiceClient;
  }
}
