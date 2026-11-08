// Central route registry and matcher shared by the HTTP server and tests.
function createRouter() {
  const routes = [];

  function route(method, pattern, handler, opts = {}) {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return "(\\d+)";
    });
    routes.push({ method, re: new RegExp(`^${source}$`), keys, handler,
      auth: opts.auth !== false, role: opts.role, raw: opts.raw });
  }

  function match(method, pathname) {
    for (const item of routes) {
      if (item.method !== method) continue;
      const found = pathname.match(item.re);
      if (!found) continue;
      const params = Object.fromEntries(item.keys.map((key, i) => [key, Number(found[i + 1])]));
      return { ...item, params };
    }
    return null;
  }

  return { route, match, get size() { return routes.length; } };
}

module.exports = { createRouter };
