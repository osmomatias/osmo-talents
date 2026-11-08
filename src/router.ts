// Central route registry and matcher shared by the HTTP server and tests.
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

export interface RouteOptions<TRole extends string = string> {
  auth?: boolean;
  role?: TRole;
  raw?: number;
}

export type RouteHandler<TContext = unknown, TResult = unknown> =
  (context: TContext) => TResult | Promise<TResult>;

export interface RegisteredRoute<
  TContext = unknown,
  TResult = unknown,
  TRole extends string = string,
> {
  method: HttpMethod;
  re: RegExp;
  keys: string[];
  handler: RouteHandler<TContext, TResult>;
  auth: boolean;
  role: TRole | undefined;
  raw: number | undefined;
}

export interface MatchedRoute<
  TContext = unknown,
  TResult = unknown,
  TRole extends string = string,
> extends RegisteredRoute<TContext, TResult, TRole> {
  params: Record<string, number>;
}

export interface Router<
  TContext = unknown,
  TResult = unknown,
  TRole extends string = string,
> {
  route(
    method: HttpMethod,
    pattern: string,
    handler: RouteHandler<TContext, TResult>,
    opts?: RouteOptions<TRole>,
  ): void;
  match(method: string | undefined, pathname: string): MatchedRoute<TContext, TResult, TRole> | null;
  readonly size: number;
}

export function createRouter<
  TContext = unknown,
  TResult = unknown,
  TRole extends string = string,
>(): Router<TContext, TResult, TRole> {
  const routes: RegisteredRoute<TContext, TResult, TRole>[] = [];

  function route(
    method: HttpMethod,
    pattern: string,
    handler: RouteHandler<TContext, TResult>,
    opts: RouteOptions<TRole> = {},
  ): void {
    const keys: string[] = [];
    const source = pattern.replace(/:(\w+)/g, (_match: string, key: string) => {
      keys.push(key);
      return "(\\d+)";
    });
    routes.push({ method, re: new RegExp(`^${source}$`), keys, handler,
      auth: opts.auth !== false, role: opts.role, raw: opts.raw });
  }

  function match(method: string | undefined, pathname: string): MatchedRoute<TContext, TResult, TRole> | null {
    for (const item of routes) {
      if (item.method !== method) continue;
      const found = pathname.match(item.re);
      if (!found) continue;
      const params: Record<string, number> = Object.fromEntries(
        item.keys.map((key, i) => [key, Number(found[i + 1])]),
      );
      return { ...item, params };
    }
    return null;
  }

  return { route, match, get size() { return routes.length; } };
}
