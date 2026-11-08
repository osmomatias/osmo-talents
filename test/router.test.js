const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("../src/router");

test("router matches method and numeric path parameters", () => {
  const router = createRouter();
  const handler = () => "ok";
  router.route("GET", "/api/jobs/:id", handler, { auth: false });

  const result = router.match("GET", "/api/jobs/42");
  assert.equal(result.handler, handler);
  assert.deepEqual(result.params, { id: 42 });
  assert.equal(result.auth, false);
  assert.equal(router.match("POST", "/api/jobs/42"), null);
  assert.equal(router.match("GET", "/api/jobs/not-a-number"), null);
  assert.equal(router.match("GET", "/api/jobs/42/extra"), null);
});

test("router preserves role, raw-body, and default authentication options", () => {
  const router = createRouter();
  router.route("POST", "/api/files/:id", () => {}, { role: "cliente", raw: 1024 });
  const result = router.match("POST", "/api/files/7");
  assert.equal(result.auth, true);
  assert.equal(result.role, "cliente");
  assert.equal(result.raw, 1024);
  assert.equal(router.size, 1);
});
