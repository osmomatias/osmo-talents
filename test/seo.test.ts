import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeRequest, json } from "./http-fixture";
import type { PublicJob } from "../src/seo-types";
import crypto from "node:crypto";

// Isolate every fixture from the working database and external payment services.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osmo-seo-test-'));
process.env.DB_PATH = path.join(dir, 'seo.sqlite');
process.env.PUBLIC_URL = 'https://seo.example.test';
process.env.ASAAS_API_KEY = '';
process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
const { server } = require('../server') as typeof import("../server");
const { db, run } = require('../src/db') as typeof import("../src/db");
const origin = 'https://seo.example.test';
const bio = 'Profissional de design com experiência em identidades visuais, comunicação e projetos de marcas.';
const attack = 'Projeto </script><script id="breakout">alert(1)</script> & revisão';

const request = makeRequest(server, { host: 'seo.example.test' });
interface TestSchema { '@type': string; itemListElement: { name: string }[] }
interface JobResponse { jobs: PublicJob[]; pagination: { total: number; page: number; pages: number } }
interface ProfileResponse { profile: { searchVisible: boolean } }
interface MeResponse { user: { profile: { searchVisible: boolean } } }
const title = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1];
const canonical = (html: string) => html.match(/<link rel="canonical" href="([^"]*)"/g) || [];
function schemas(html: string): TestSchema[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(match => JSON.parse(match[1]) as TestSchema[]);
}

// The oldest matching item is deliberately outside the old 300-row window.
run("INSERT INTO users(id,name,email,pass_hash,role) VALUES(1,'Cliente','client@seo.example.test','x','cliente')");
run("INSERT INTO profiles(user_id,company) VALUES(1,'Empresa de projetos')");
for (const [id, label, visibility, description] of [[2, 'Sem autorização', 0, bio], [3, 'Perfil completo autorizado', 1, bio], [4, 'Perfil incompleto', 1, 'Curta']] as [number, string, number, string][]) {
  run("INSERT INTO users(id,name,email,pass_hash,role) VALUES(?,?,?,'x','freela')", id, label, `profile${id}@seo.example.test`);
  run('INSERT INTO profiles(user_id,title,bio,search_visible,tag,ws_com) VALUES(?,?,?,?,?,?)', id, 'Designer', description, visibility, 'DIAGNOSTICO_PRIVADO_NAO_RENDERIZAR', 'PREFERENCIA_NAO_ESTRUTURAR');
}
run("INSERT INTO portfolio_items(user_id,pos,title,link) VALUES(3,0,'Link inseguro','javascript:alert(1)')");
run("INSERT INTO jobs(id,client_id,title,cat,obj,created_at) VALUES(1,1,'Projeto raro antigo','ia','Objetivo exclusivo mais antigo','2025-01-01 00:00:00')");
for (let id = 2; id <= 305; id++) run("INSERT INTO jobs(id,client_id,title,cat,obj,duration,budget) VALUES(?,1,?,'design','Criar uma identidade visual clara.','Duas semanas',900)", id, id === 2 ? attack : `Projeto de design ${id}`);
run("INSERT INTO jobs(id,client_id,title,cat,status) VALUES(306,1,'Projeto encerrado','design','fechada')");

test('public HTML contains main content, crawlable links and unique metadata before JavaScript', async () => {
  const home = await request('/');
  const jobs = await request('/vagas');
  const detail = await request('/vagas/305');
  for (const response of [home, jobs, detail]) {
    assert.equal(response.status, 200);
    assert.match(response.body, /<h1\b/);
    assert.doesNotMatch(response.body, /<p class="loading">Carregando…<\/p>/);
    assert.equal(canonical(response.body).length, 1);
    assert.match(response.body, /<meta name="description" content="[^"]+">/);
    assert.match(response.body, /<meta property="og:image" content="https:\/\/seo\.example\.test\/icons\/icon-512\.png">/);
  }
  assert.equal(new Set([title(home.body), title(jobs.body), title(detail.body)]).size, 3);
  assert.match(home.body, /href="\/vagas"/);
  assert.match(jobs.body, /href="\/vagas\/305"/);
  assert.match(detail.body, /<h1>Projeto de design 305<\/h1>/);
  assert.match(detail.body, /<h2>Objetivo<\/h2>/);
  assert.match(detail.body, /Criar uma identidade visual clara/);
  assert.match(detail.body, /rel="canonical" href="https:\/\/seo\.example\.test\/vagas\/305"/);
  assert.ok(schemas(home.body).some(value => value['@type'] === 'Organization'));
  assert.ok(schemas(detail.body).some(value => value['@type'] === 'BreadcrumbList'));
});

test('untrusted titles cannot break out of markup or JSON-LD, and schema preserves their text', async () => {
  const response = await request('/vagas/2');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /<script id="breakout">/);
  assert.match(response.body, /&lt;\/script&gt;&lt;script id=&quot;breakout&quot;&gt;/);
  const breadcrumb = schemas(response.body).find(value => value['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumb);
  assert.equal(breadcrumb.itemListElement.at(-1)?.name, attack);
  assert.equal((response.body.match(/id="seo-schema"/g) || []).length, 1);
});

test('missing entities return document 404 and closed opportunities are noindex', async () => {
  for (const url of ['/vagas/999999', '/talentos/999999', '/talentos/1']) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.match(response.headers['x-robots-tag'], /noindex/);
    assert.match(response.body, /não encontrad[oa]/);
  }
  const closed = await request('/vagas/306');
  assert.equal(closed.status, 200);
  assert.match(closed.headers['x-robots-tag'], /noindex/);
  assert.match(closed.body, /não está recebendo novas propostas/);
  assert.ok(!schemas(closed.body).some(value => value['@type'] === 'JobPosting'));
});

test('editorial pages work without the SPA and explain simulated payments consistently', async () => {
  for (const url of ['/sobre', '/como-funciona', '/pagamentos-e-taxas', '/perguntas-frequentes', '/briefing-claro', '/acessibilidade']) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.match(response.body, /<h1\b/);
    assert.doesNotMatch(response.body, /<script\b[^>]*src="\/app\.js/);
    assert.match(response.body, /rel="canonical"/);
  }
  const home = await request('/');
  const terms = await request('/termos');
  const payments = await request('/pagamentos-e-taxas');
  assert.match(home.body, /modo simulado/);
  assert.match(terms.body, /Estado atual: pagamentos simulados/);
  assert.match(payments.body, /simulad/i);
  assert.doesNotMatch(home.body, /O valor fica protegido e é liberado a cada etapa aprovada/);
});

test('sitemap and profile indexability require complete professional data and explicit opt-in', async () => {
  const sitemap = await request('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers['content-type'], /application\/xml/);
  assert.match(sitemap.body, /<loc>https:\/\/seo\.example\.test\/vagas\/1<\/loc>/);
  assert.doesNotMatch(sitemap.body, /\/vagas\/306<\/loc>/);
  assert.match(sitemap.body, /\/talentos\/3<\/loc>/);
  assert.doesNotMatch(sitemap.body, /\/talentos\/(?:2|4)<\/loc>/);
  assert.doesNotMatch(sitemap.body, /\/(?:admin|painel|mensagens|recuperar|entrar)<\/loc>/);
  assert.match(sitemap.body, /\/como-funciona<\/loc>/);
  for (const id of [2, 4]) {
    const response = await request(`/talentos/${id}`);
    assert.match(response.headers['x-robots-tag'], /noindex/);
    assert.ok(!schemas(response.body).some(value => value['@type'] === 'ProfilePage'));
  }
  const optedIn = await request('/talentos/3');
  assert.equal(optedIn.status, 200);
  assert.match(optedIn.body, /<meta name="robots" content="index, follow/);
  assert.ok(schemas(optedIn.body).some(value => value['@type'] === 'ProfilePage'));
  assert.doesNotMatch(optedIn.body, /DIAGNOSTICO_PRIVADO_NAO_RENDERIZAR|PREFERENCIA_NAO_ESTRUTURAR|href="javascript:/);
  run('UPDATE profiles SET search_visible = 0 WHERE user_id = 3');
  assert.match((await request('/talentos/3')).headers['x-robots-tag'], /noindex/);
  assert.doesNotMatch((await request('/sitemap.xml')).body, /\/talentos\/3<\/loc>/);
  run('UPDATE profiles SET search_visible = 1 WHERE user_id = 3');
});

test('canonical redirects preserve path and query without trusting arbitrary host names', async () => {
  for (const host of ['www.seo.example.test', 'app.seo.example.test']) {
    const response = await request('/vagas/305?utm_source=teste', { host });
    assert.equal(response.status, 301);
    assert.equal(response.headers.location, origin + '/vagas/305?utm_source=teste');
  }
  for (const [url, target] of [['/index.html?utm_source=teste', '/?utm_source=teste'], ['/vagas/?cat=design', '/vagas?cat=design'], ['/sobre/', '/sobre'], ['/termos.html', '/termos']]) {
    const response = await request(url);
    assert.equal(response.status, 301, url);
    assert.equal(response.headers.location, origin + target);
  }
  const untrusted = await request('/vagas/305', { host: 'attacker.example' });
  assert.equal(untrusted.status, 200);
  assert.doesNotMatch(untrusted.body, /attacker\.example/);
  assert.match(untrusted.body, /rel="canonical" href="https:\/\/seo\.example\.test\/vagas\/305"/);
});

test('API filters before pagination, including matching records older than 300 newer opportunities', async () => {
  const filtered = json<JobResponse>(await request('/api/jobs?cat=ia&q=antigo&page=1'));
  assert.equal(filtered.jobs.length, 1);
  assert.equal(filtered.jobs[0].id, 1);
  assert.deepEqual(filtered.pagination, { page: 1, pages: 1, total: 1 });
  const first = json<JobResponse>(await request('/api/jobs?page=1'));
  const second = json<JobResponse>(await request('/api/jobs?page=2'));
  assert.equal(first.jobs.length, 24);
  assert.equal(second.jobs.length, 24);
  assert.equal(first.pagination.total, 305);
  assert.ok(second.jobs.every(row => !first.jobs.some(other => other.id === row.id)));
  const last = await request('/vagas?page=13');
  assert.match(last.body, /href="\/vagas\/1"/);
  assert.match(last.body, /href="\/vagas\?page=12"/);
  const search = await request('/vagas?cat=ia&q=antigo');
  assert.match(search.headers['x-robots-tag'], /noindex/);
  assert.match(search.body, /Projeto raro antigo/);
});

test('utility documents have noindex while robots points to the public sitemap', async () => {
  for (const url of ['/entrar', '/painel', '/admin', '/recuperar']) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.match(response.headers['x-robots-tag'], /noindex/);
    assert.match(response.body, /<meta name="robots" content="noindex, follow">/);
  }
  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.body, /User-agent: \*/);
  assert.match(robots.body, /Sitemap: https:\/\/seo\.example\.test\/sitemap\.xml/);
});

test('HEAD on public documents, sitemap and robots sends headers with no body', async () => {
  for (const url of ['/', '/vagas', '/vagas/305', '/sobre', '/termos', '/robots.txt', '/sitemap.xml']) {
    const response = await request(url, { method: 'HEAD' });
    assert.equal(response.status, 200, url);
    assert.equal(response.body, '', url);
    assert.ok(response.headers['content-type'], url);
  }
});

test('authenticated profile updates persist explicit search consent and preserve omitted preferences', async () => {
  function sessionFor(userId: number) {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', hash, userId, new Date(Date.now() + 60_000).toISOString());
    return 'osmo_sid=' + token;
  }
  const cookie = sessionFor(2);
  const body = { name: 'Profissional com preferência', title: 'Designer de marcas', bio, location: 'Vitória', rate: 90, hours: 20, skills: ['Identidade visual'], how: { com: 'Texto', resp: 'A combinar', fb: 'Lista', foco: '' }, tag: '', company: '' };
  assert.match((await request('/talentos/2')).headers['x-robots-tag'], /noindex/);

  const enabled = await request('/api/me/profile', { method: 'PUT', cookie, body: { ...body, searchVisible: true } });
  assert.equal(enabled.status, 200);
  assert.equal(json<ProfileResponse>(enabled).profile.searchVisible, true);
  assert.match((await request('/talentos/2')).body, /<meta name="robots" content="index, follow/);
  assert.match((await request('/sitemap.xml')).body, /\/talentos\/2<\/loc>/);
  assert.equal(json<MeResponse>(await request('/api/me', { cookie })).user.profile.searchVisible, true);

  const omittedWhileEnabled = await request('/api/me/profile', { method: 'PUT', cookie, body });
  assert.equal(omittedWhileEnabled.status, 200);
  assert.equal(json<ProfileResponse>(omittedWhileEnabled).profile.searchVisible, true);

  const disabled = await request('/api/me/profile', { method: 'PUT', cookie, body: { ...body, searchVisible: false } });
  assert.equal(disabled.status, 200);
  assert.equal(json<ProfileResponse>(disabled).profile.searchVisible, false);
  assert.match((await request('/talentos/2')).headers['x-robots-tag'], /noindex/);
  assert.doesNotMatch((await request('/sitemap.xml')).body, /\/talentos\/2<\/loc>/);
  const omittedWhileDisabled = await request('/api/me/profile', { method: 'PUT', cookie, body });
  assert.equal(json<ProfileResponse>(omittedWhileDisabled).profile.searchVisible, false);

  // The client editor omits this freelancer preference; that must never reset it.
  run('UPDATE profiles SET search_visible = 1 WHERE user_id = 1');
  const clientUpdate = await request('/api/me/profile', { method: 'PUT', cookie: sessionFor(1), body: { ...body, name: 'Cliente de projetos', company: 'Empresa de projetos' } });
  assert.equal(clientUpdate.status, 200);
  assert.equal(json<ProfileResponse>(clientUpdate).profile.searchVisible, true);
});

test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
