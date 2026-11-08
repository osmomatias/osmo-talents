// Conteúdo público no primeiro HTML: o aplicativo pode continuar navegando sem recarga.
// Nenhum dado de sessão, documento de verificação ou anexo privado entra nesta camada.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pages as infoPages } from './seo-content';
import type { Category, JobList, PublicJob, PublicProfile, SearchInput, SeoDependencies, SeoPage, SeoService, TalentList } from './seo-types';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] ?? c));
const trim = (value: unknown, max = 200): string => String(value ?? '').trim().slice(0, max);
const amount = (value: unknown): string => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(value) || 0);
const asList = <T>(values: T[] | null | undefined): T[] => Array.isArray(values) ? values : [];
const list = (values: string[] | null | undefined): string => `<ul>${asList(values).map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
const paragraph = (value: unknown): string => `<p>${esc(value || 'A combinar.').replace(/\n/g, '<br>')}</p>`;
const safeLink = (value: string): string => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
function canonicalOrigin(): string {
  try {
    const u = new URL(process.env.PUBLIC_URL || 'https://osmo.com.br');
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('invalid origin');
    return u.origin;
  } catch { return 'https://osmo.com.br'; }
}

export function createSeo({ one, all, JOB_SELECT, jobOut, profileOf, hasFreelaSQL, payments = {}, publicDir }: SeoDependencies): SeoService {
  const origin = canonicalOrigin();
  const enabled = payments.enabled ?? payments.ENABLED ?? false;
  const sandbox = payments.sandbox ?? (payments.BASE ? /sandbox/.test(payments.BASE) : false);
  const paymentConfig = { enabled, sandbox, fee: payments.fee ?? payments.FEE_PCT ?? 10, autoRelease: payments.autoRelease ?? payments.AUTO_RELEASE_DAYS ?? 7 };
  let categories: Category[] = [];
  try { categories = (JSON.parse(fs.readFileSync(path.join(publicDir || path.join(__dirname, '..', '..', 'public'), 'taxonomia.json'), 'utf8')) as { categorias?: Category[] }).categorias || []; } catch {}
  const categoryNames = new Map(categories.map(c => [c.id, c.nome]));
  const freelance = typeof hasFreelaSQL === 'function' ? hasFreelaSQL('u') : hasFreelaSQL || "(u.role = 'freela' OR instr(',' || u.roles || ',', ',freela,') > 0)";
  const professional = "p.search_visible = 1 AND length(trim(p.title)) > 0 AND length(trim(p.bio)) >= 40";
  const pageSize = 24;
  // O conteúdo editorial é separado da camada de dados e não recebe campos pessoais.


  function result(canonicalPath: string, title: string, description: string, content: string, options: Partial<SeoPage> = {}): SeoPage {
    return { status: 200, canonicalPath, title, description, content, indexable: true, schema: [], breadcrumbs: [{ label: 'Início', href: '/' }, { label: title.replace(/ \| Osmo Talents$/, '') }], ...options };
  }
  function missing(label: string, parent: string, parentLabel: string): SeoPage {
    const absent = label === 'Vaga' || label.startsWith('Página') ? 'não encontrada' : 'não encontrado';
    return result('', `${label} ${absent} | Osmo Talents`, `${label} ${absent} na Osmo Talents.`, `<section class="stack"><h1>${esc(label)} ${absent}</h1><p>Este endereço não está disponível. Confira o endereço ou consulte a listagem.</p><p><a class="btn" href="${parent}">${esc(parentLabel)}</a></p></section>`, { status: 404, indexable: false, canonicalPath: null });
  }
  const pageNumber = (search: URLSearchParams): number => /^\d{1,8}$/.test(search.get('page') || '') ? Math.max(1, Number(search.get('page'))) : 1;
  function pagination(base: string, search: URLSearchParams, current: number, total: number): string {
    if (total <= pageSize) return '';
    const pages = Math.ceil(total / pageSize);
    const href = (n: number): string => { const p = new URLSearchParams(search); if (n > 1) p.set('page', String(n)); else p.delete('page'); return base + (p.size ? '?' + p : ''); };
    return `<nav class="row seo-pagination" aria-label="Paginação"><span>Página ${current} de ${pages}</span>${current > 1 ? `<a class="btn" rel="prev" href="${esc(href(current - 1))}">Página anterior</a>` : ''}${current < pages ? `<a class="btn" rel="next" href="${esc(href(current + 1))}">Próxima página</a>` : ''}</nav>`;
  }
  function queryPath(base: string, params: URLSearchParams, current: number): string {
    const p = new URLSearchParams(params); if (current > 1) p.set('page', String(current));
    return base + (p.size ? '?' + p : '');
  }
  function jobCard(j: PublicJob): string {
    return `<a class="job" href="/vagas/${Number(j.id)}"><div><h2>${esc(j.title)}</h2><p class="muted">${esc(j.company || j.client)} · ${esc(categoryNames.get(j.cat) || j.cat)}</p></div><div class="price"><b>${esc(amount(j.budget))}${j.budget_type === 'hora' ? '/h' : ''}</b><span>${j.budget_type === 'hora' ? 'Por hora' : 'Valor fixo'} · ${esc(j.duration)}</span></div><p>${j.async ? 'Comunicação assíncrona' : 'Com reuniões'}${j.flex ? ' · Prazo flexível' : ''} · Briefing ${Number(j.clarity) || 0}% preenchido</p></a>`;
  }
  function talentCard(p: PublicProfile): string {
    return `<a class="panel stack" href="/talentos/${Number(p.id)}"><h2>${esc(p.name)}</h2><p>${esc(p.title || 'Perfil em construção')}</p>${p.bio ? `<p>${esc(trim(p.bio, 180))}${p.bio.length > 180 ? '…' : ''}</p>` : ''}<p class="muted">${esc(asList(p.skills).slice(0, 6).join(' · '))}</p></a>`;
  }

  function listJobs(search: SearchInput = new URLSearchParams()): JobList {
    if (!(search instanceof URLSearchParams)) search = new URLSearchParams(search);
    const current = pageNumber(search), q = trim(search.get('q'), 80), cat = trim(search.get('cat'), 40), sort = search.get('sort');
    const conditions = ["j.status = 'aberta'"], args: (string | number)[] = [], normalized = new URLSearchParams();
    if (q) { conditions.push("(lower(j.title || ' ' || j.obj || ' ' || j.skills || ' ' || u.name || ' ' || coalesce(p.company,'')) LIKE lower(?))"); args.push('%' + q + '%'); normalized.set('q', q); }
    if (cat) { conditions.push('j.cat = ?'); args.push(cat); normalized.set('cat', cat); }
    for (const [key, sql] of [['clear', 'j.clarity >= 80'], ['async', 'j.is_async = 1'], ['flex', 'j.is_flex = 1']] as const) if (search.get(key) === '1') { conditions.push(sql); normalized.set(key, '1'); }
    if (sort === 'clareza' || sort === 'valor') normalized.set('sort', sort);
    const where = conditions.join(' AND ');
    const count = Number(one("SELECT count(*) n FROM jobs j JOIN users u ON u.id = j.client_id LEFT JOIN profiles p ON p.user_id = j.client_id WHERE " + where, ...args)?.n ?? 0);
    const ordering = sort === 'clareza' ? 'j.clarity DESC, j.id DESC' : sort === 'valor' ? "(CASE WHEN j.budget_type = 'hora' THEN j.budget * 15 ELSE j.budget END) DESC, j.id DESC" : 'j.created_at DESC, j.id DESC';
    const jobs = all(JOB_SELECT + ' WHERE ' + where + ' ORDER BY ' + ordering + ' LIMIT ? OFFSET ?', ...args, pageSize, (current - 1) * pageSize).map(jobOut);
    return { jobs, pagination: { page: current, pages: Math.max(1, Math.ceil(count / pageSize)), total: Number(count) }, normalized, q, cat };
  }

  function listTalents(search: SearchInput = new URLSearchParams()): TalentList {
    if (!(search instanceof URLSearchParams)) search = new URLSearchParams(search);
    const current = pageNumber(search), q = trim(search.get('q'), 80), args: string[] = [], normalized = new URLSearchParams();
    let where = freelance;
    if (q) { where += " AND lower(u.name || ' ' || p.title || ' ' || p.bio || ' ' || p.skills) LIKE lower(?)"; args.push('%' + q + '%'); normalized.set('q', q); }
    const count = Number(one('SELECT count(*) n FROM users u JOIN profiles p ON p.user_id = u.id WHERE ' + where, ...args)?.n ?? 0);
    const talents = all('SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE ' + where + " ORDER BY (trim(p.title) != '') DESC, u.id DESC LIMIT ? OFFSET ?", ...args, pageSize, (current - 1) * pageSize).map(r => profileOf(Number(r.id))).filter((p): p is PublicProfile => p !== null);
    return { talents, pagination: { page: current, pages: Math.max(1, Math.ceil(count / pageSize)), total: Number(count) }, normalized, q };
  }

  function page(pathname: string, search: SearchInput = new URLSearchParams()): SeoPage | null {
    if (!(search instanceof URLSearchParams)) search = new URLSearchParams(search);
    if (infoPages[pathname]) {
      const definition = infoPages[pathname];
      const info = typeof definition === 'function' ? definition(paymentConfig) : definition;
      return result(pathname, info.title, info.description, info.content, { breadcrumbs: [{ label: 'Início', href: '/' }, { label: info.label || info.title.replace(/ \| Osmo Talents$/, '') }] });
    }
    if (pathname === '/') {
      const jobs = all(JOB_SELECT + " WHERE j.status = 'aberta' ORDER BY j.created_at DESC, j.id DESC LIMIT 6").map(jobOut);
      return result('/', 'Trabalho freelance com briefing claro | Osmo Talents', 'Projetos freelance pensados para pessoas neurodivergentes, com briefing estruturado, comunicação combinada e propostas guiadas.', `<section class="hero"><div><span class="label">Trabalho freelance para mentes neurodivergentes</span><h1>Trabalho freelance, no seu ritmo, com regras claras.</h1><p class="lead">A Osmo Talents conecta quem contrata e quem realiza projetos freelance. Cada vaga organiza objetivos, entregas e preferências de comunicação para facilitar o combinado.</p><p class="row"><a class="btn hl" href="/vagas">Encontrar trabalho</a><a class="btn" href="/talentos">Encontrar talentos</a></p></div></section><section class="stack"><h2>Como funciona</h2><p>Escolha uma vaga com briefing estruturado, envie uma proposta guiada e combine as entregas e a comunicação antes de começar. São projetos freelance, não uma promessa de emprego.</p><p>${enabled && !sandbox ? 'Confira a disponibilidade, as condições e as taxas dos pagamentos integrados antes de contratar.' : 'Os pagamentos integrados estão em modo simulado durante o período de testes. Não há cobrança nem proteção financeira real pelo fluxo simulado.'} <a href="/pagamentos-e-taxas">Pagamentos e taxas</a>.</p><p><a href="/como-funciona">Entenda os passos para trabalhar e contratar</a> · <a href="/perguntas-frequentes">Perguntas frequentes</a> · <a href="/briefing-claro">O que significa a nota de clareza?</a></p></section><section class="stack"><h2>Explore por área</h2><div class="cats">${categories.map(c => `<a class="cat" href="/vagas?cat=${encodeURIComponent(c.id)}"><b>${esc(c.nome)}</b><span>${esc(c.resumo)}</span></a>`).join('')}</div></section><section class="stack"><h2>Projetos com vagas abertas</h2>${jobs.length ? `<div class="stack">${jobs.map(jobCard).join('')}</div><p><a href="/vagas">Ver todas as vagas</a></p>` : '<p>Nenhuma vaga aberta no momento. Consulte a listagem novamente em breve.</p>'}</section><section class="stack"><h2>Sobre a plataforma</h2><p>Briefing estruturado, propostas guiadas e ajustes de conforto ajudam a organizar o trabalho. <a href="/sobre">Conheça a Osmo Talents</a> e seus <a href="/acessibilidade">recursos de acessibilidade</a>.</p></section>`, { breadcrumbs: [{ label: 'Início' }], schema: [{ '@context': 'https://schema.org', '@type': 'Organization', '@id': origin + '/#organization', name: 'Osmo Talents', url: origin + '/' }, { '@context': 'https://schema.org', '@type': 'WebSite', '@id': origin + '/#website', name: 'Osmo Talents', url: origin + '/', inLanguage: 'pt-BR', publisher: { '@id': origin + '/#organization' } }] });
    }
    if (pathname === '/vagas') {
      const { jobs, pagination: paging, normalized, q, cat } = listJobs(search);
      const { page: current, total: count } = paging;
      if (current > paging.pages) return missing('Página de vagas', '/vagas', 'Ver vagas');
      const title = cat && categoryNames.has(cat) ? `Projetos freelance de ${categoryNames.get(cat)}` : 'Projetos freelance com briefing claro';
      const canonicalPath = queryPath('/vagas', normalized, current);
      return result(canonicalPath, `${title}${current > 1 ? ' — página ' + current : ''} | Osmo Talents`, 'Encontre oportunidades freelance com objetivos, entregas, orçamento e comunicação combinada. Consulte os projetos abertos na Osmo Talents.', `<section class="stack"><h1>${esc(title)}</h1><p>${Number(count)} ${count === 1 ? 'vaga encontrada' : 'vagas encontradas'}${q ? ' para “' + esc(q) + '”' : ''}. Confira as condições de cada projeto antes de enviar uma proposta.</p><form method="get" action="/vagas" class="search"><label>Buscar vagas <input class="input" name="q" value="${esc(q)}" maxlength="80"></label>${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ''}<button class="btn" type="submit">Buscar</button></form>${jobs.length ? `<div class="stack">${jobs.map(jobCard).join('')}</div>` : '<p>Nenhuma vaga corresponde aos filtros. <a href="/vagas">Ver todas as vagas</a>.</p>'}${pagination('/vagas', normalized, current, count)}</section>`, { indexable: !q && count > 0 && (!cat || categoryNames.has(cat)) && [...normalized.keys()].every(key => key === 'cat'), breadcrumbs: [{ label: 'Início', href: '/' }, { label: 'Vagas', ...(normalized.size || current > 1 ? { href: '/vagas' } : {}) }, ...(normalized.size || current > 1 ? [{ label: title + (current > 1 ? ' — página ' + current : '') }] : [])] });
    }
    let match = pathname.match(/^\/vagas\/(\d+)$/);
    if (match) {
      if (!Number.isSafeInteger(Number(match[1]!))) return missing('Vaga', '/vagas', 'Ver vagas');
      const row = one(JOB_SELECT + ' WHERE j.id = ?', Number(match[1]!));
      if (!row) return missing('Vaga', '/vagas', 'Ver vagas');
      const j = jobOut(row), canonicalPath = '/vagas/' + Number(j.id);
      const statuses: Record<string, string> = { aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', fechada: 'Fechada' };
      const status = statuses[j.status] || 'Encerrada';
      const date = /^\d{4}-\d{2}-\d{2}/.exec(String(j.created_at || ''))?.[0];
      const sections: [string, string][] = [['Objetivo', paragraph(j.brief.obj)], ['Entregas', list(j.brief.ent)], ['Fora do escopo', list(j.brief.fora)], ['Comunicação', paragraph(j.brief.com)], ['Feedback', paragraph(j.brief.fb)], ['Referências', paragraph(j.brief.ref)]];
      return result(canonicalPath, `${trim(j.title, 140)} | Osmo Talents`, trim(`${j.title}. ${j.brief.obj} ${amount(j.budget)}${j.budget_type === 'hora' ? ' por hora' : ' por projeto'}. ${j.duration}`, 220), `<article class="stack"><a href="/vagas">Voltar para vagas</a><h1>${esc(j.title)}</h1><p><strong>${esc(status)}</strong> · ${esc(categoryNames.get(j.cat) || j.cat)}${date ? ` · Publicada em <time datetime="${date}">${date.split('-').reverse().join('/')}</time>` : ''}</p>${j.status !== 'aberta' ? '<p>Esta vaga não está recebendo novas propostas.</p>' : ''}<section class="panel stack"><h2>Condições do projeto</h2><p><strong>${esc(amount(j.budget))}${j.budget_type === 'hora' ? '/h' : ''}</strong> · ${j.budget_type === 'hora' ? 'Por hora' : 'Valor fixo'} · Prazo: ${esc(j.duration)}</p><p>Contratante: ${esc(j.company || j.client)}.</p><p>${j.async ? 'Comunicação assíncrona' : 'Com reuniões'}${j.flex ? ' · Prazo flexível' : ''}.</p><p>Briefing ${Number(j.clarity) || 0}% preenchido. <a href="/briefing-claro">Entenda a nota de clareza</a>.</p></section>${sections.map(([heading, body]) => `<section><h2>${heading}</h2>${body}</section>`).join('')}${asList(j.skills).length ? `<section><h2>Habilidades</h2>${list(j.skills)}</section>` : ''}${j.status === 'aberta' ? `<p><a class="btn hl" href="${canonicalPath}/proposta">Entrar para enviar proposta</a></p>` : ''}<p class="hint">${enabled && !sandbox ? 'Confira condições e disponibilidade em ' : 'Pagamentos integrados em modo simulado durante os testes. Consulte '}<a href="/pagamentos-e-taxas">Pagamentos e taxas</a>.</p></article>`, { indexable: j.status === 'aberta', breadcrumbs: [{ label: 'Início', href: '/' }, { label: 'Vagas', href: '/vagas' }, { label: j.title }] });
    }
    if (pathname === '/talentos') {
      const { talents, pagination: paging, normalized, q } = listTalents(search);
      const { page: current, total: count } = paging;
      if (current > paging.pages) return missing('Página de talentos', '/talentos', 'Ver talentos');
      return result(queryPath('/talentos', normalized, current), `Talentos freelance${current > 1 ? ' — página ' + current : ''} | Osmo Talents`, 'Conheça habilidades, portfólios e especialidades dos profissionais freelance na Osmo Talents.', `<section class="stack"><h1>Talentos freelance</h1><p>Conheça as habilidades e o portfólio de quem realiza projetos. ${Number(count)} ${count === 1 ? 'perfil encontrado' : 'perfis encontrados'}.</p><form method="get" action="/talentos" class="search"><label>Buscar talentos <input class="input" name="q" value="${esc(q)}" maxlength="80"></label><button class="btn" type="submit">Buscar</button></form>${talents.length ? `<div class="grid2">${talents.map(talentCard).join('')}</div>` : '<p>Nenhum perfil encontrado para esta busca.</p>'}${pagination('/talentos', normalized, current, count)}</section>`, { indexable: !q && count > 0, breadcrumbs: [{ label: 'Início', href: '/' }, { label: 'Talentos', ...(current > 1 || q ? { href: '/talentos' } : {}) }, ...(current > 1 || q ? [{ label: q ? 'Busca de talentos' : 'Página ' + current }] : [])] });
    }
    match = pathname.match(/^\/talentos\/(\d+)$/);
    if (match) {
      const id = Number(match[1]!);
      if (!Number.isSafeInteger(id)) return missing('Perfil', '/talentos', 'Ver talentos');
      if (!one('SELECT u.id FROM users u WHERE u.id = ? AND ' + freelance, id)) return missing('Perfil', '/talentos', 'Ver talentos');
      const p = profileOf(id);
      if (!p) return missing('Perfil', '/talentos', 'Ver talentos');
      const complete = !!trim(p.title) && trim(p.bio, 100000).length >= 40;
      const canonicalPath = '/talentos/' + id;
      return result(canonicalPath, `${trim(p.name, 80)}${p.title ? ' — ' + trim(p.title, 100) : ''} | Osmo Talents`, trim(p.bio || `Conheça o perfil profissional de ${p.name} na Osmo Talents.`, 220), `<article class="stack"><a href="/talentos">Voltar para talentos</a><h1>${esc(p.name)}</h1><p class="lead">${esc(p.title || 'Perfil em construção')}</p>${p.bio ? `<section><h2>Sobre o trabalho</h2>${paragraph(p.bio)}</section>` : '<p>Este perfil ainda está sendo preenchido.</p>'}${asList(p.skills).length ? `<section><h2>Habilidades</h2>${list(p.skills)}</section>` : ''}${asList(p.portfolio).length ? `<section><h2>Portfólio</h2><ul>${p.portfolio.map(item => { const link = safeLink(item.link); return `<li>${link ? `<a href="${esc(link)}" rel="noopener nofollow ugc">${esc(item.title || 'Trabalho de portfólio')}</a>` : esc(item.title || 'Trabalho de portfólio')}</li>`; }).join('')}</ul></section>` : ''}<p><a class="btn" href="/publicar">Publicar um projeto</a></p></article>`, { indexable: complete && !!p.searchVisible, breadcrumbs: [{ label: 'Início', href: '/' }, { label: 'Talentos', href: '/talentos' }, { label: p.name }], schema: complete && p.searchVisible ? [{ '@context': 'https://schema.org', '@type': 'ProfilePage', url: origin + canonicalPath, mainEntity: { '@type': 'Person', name: p.name, jobTitle: p.title, url: origin + canonicalPath } }] : [] });
    }
    return null;
  }

  function sitemap(): string {
    const urls = ['/', '/vagas', '/talentos', '/privacidade', '/termos', ...Object.keys(infoPages)];
    for (const row of all("SELECT id FROM jobs WHERE status = 'aberta' ORDER BY id")) urls.push('/vagas/' + Number(row.id));
    for (const row of all('SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE ' + freelance + ' AND ' + professional + ' ORDER BY u.id')) urls.push('/talentos/' + Number(row.id));
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...new Set(urls)].map(u => `<url><loc>${esc(origin + u)}</loc></url>`).join('\n') + '\n</urlset>';
  }
  function robots(): string {
    return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  }
  return { page, sitemap, robots, origin, listJobs, listTalents };
}

