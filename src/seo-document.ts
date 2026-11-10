// Assemble the same public document for people and crawlers. Never use Host to build metadata.
import type { DocumentPage, JsonValue, PaymentConfig, StructuredData } from "./seo-types";

const escapeEntities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => escapeEntities[c] ?? c);
const json = (value: JsonValue | StructuredData[]): string => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
export function renderDocument(template: string, page: DocumentPage, origin: string, { standalone = false, payments }: { standalone?: boolean; payments?: PaymentConfig } = {}): string {
  const canonical = new URL(page.canonicalPath || "/", origin).href;
  const image = origin + "/icons/icon-512.png";
  const robots = page.indexable === false ? "noindex, follow" : "index, follow, max-image-preview:large";
  let html = template.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  const breadcrumbs = page.breadcrumbs || [];
  const schemas: StructuredData[] = [...(page.schema || [])];
  if (breadcrumbs.length > 1) schemas.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.label, item: new URL(b.href || page.canonicalPath || "/", origin).href })) });
  const head = `<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Osmo Talents">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:image:alt" content="Osmo Talents">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${escape(image)}">
${schemas.length ? `<script type="application/ld+json" id="seo-schema">${json(schemas)}</script>` : ""}`;
  html = html.replace("</head>", head + "\n</head>");
  if (page.content !== undefined) html = html.replace('<p class="loading">Carregando…</p>', page.content);
  if (breadcrumbs.length > 1) {
    const trail = `<span class="breadcrumbs-label">Você está em</span><ol>${breadcrumbs.map((b,i) => `<li>${i ? '<span class="breadcrumbs-separator" aria-hidden="true">/</span>' : ""}${i < breadcrumbs.length - 1 && b.href ? `<a href="${escape(b.href)}">${escape(b.label)}</a>` : `<span aria-current="page">${escape(b.label)}</span>`}</li>`).join("")}</ol>`;
    html = html.replace(/<nav class="wrap breadcrumbs" id="breadcrumbs"[^>]*><\/nav>/, `<nav class="wrap breadcrumbs" id="breadcrumbs" aria-label="Trilha de navegação">${trail}</nav>`);
  }
  if (payments) html = html.replace(/(<span id="payNote">)[\s\S]*?(<\/span>)/, (_: string, open: string, close: string) => open + (payments.enabled ? `Pagamentos por etapa via ${payments.provider === "stripe" ? "Stripe" : "Asaas"}${payments.sandbox ? " (ambiente de testes)" : ""}. Consulte as condições e taxas.` : "Pagamentos simulados durante o período de testes. Não há cobrança ou garantia de valores reais neste modo.") + close);
  if (payments && html.includes('<h2>Pagamentos</h2>')) {
    const note = payments.enabled && !payments.sandbox
      ? 'A integração de pagamentos está habilitada. Confira o estado de cada cobrança e as condições antes de iniciar.'
      : 'Estado atual: pagamentos simulados durante os testes, sem cobrança, custódia ou repasse real neste modo. As regras de pagamento abaixo descrevem o fluxo quando habilitado em produção.';
    html = html.replace('<h2>Pagamentos</h2>', `<h2>Pagamentos</h2><p class="legal-note">${note} <a href="/pagamentos-e-taxas">Consulte pagamentos e taxas.</a></p>`);
  }
  if (standalone) {
    html = html.replace(/<script\b[^>]*src="\/app\.js(?:\?[^"]*)?"[^>]*><\/script>/, "");
    html = html.replace(/<div[^>]*id="topActions"[^>]*><\/div>/, '<div class="top-actions" id="topActions"><a class="btn hl" href="/vagas">Ver vagas</a></div>');
    html = html.replace('class="wrap" id="view"', 'class="wrap seo-document" id="view"');
  }
  return html;
}
