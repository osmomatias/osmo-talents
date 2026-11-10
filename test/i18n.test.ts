import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { LANGS, pick, T, tx } from "../src/i18n";
import { PROJECT_ROOT } from "../src/paths";
import type { I18nCore, LanguageEntry, TranslationDictionary } from "../shared/i18n";

interface ClientI18n {
  lang: string; locale: string; ativo: boolean; langs: LanguageEntry[]; ready: Promise<void>;
  t(key: string, ...args: unknown[]): string; tx(text: string): string; set(lang: string): void;
  withLanguage(href: string): string;
}
const source = (name: string) => fs.readFileSync(path.join(PROJECT_ROOT, "public", name), "utf8");
const english = JSON.parse(source("i18n/en-US.json")) as TranslationDictionary;

// Exercise the emitted classic scripts with storage and fetch contained entirely in the VM.
async function client(search = "", saved?: string, languages = ["pt-BR"], hostname = "example.test", destination?: string, anchorAttributes: readonly Record<string, string>[] = [], legalPages: readonly { lang: string; links: Record<string, string>[] }[] = []) {
  const storage = new Map<string, string>(saved ? [["osmo-lang", saved]] : []);
  const requests: string[] = [], replacements: string[] = [], readyListeners: (() => void)[] = [];
  const window: { OsmoI18nCore?: I18nCore; I18N?: ClientI18n } = {};
  const href = destination === undefined ? "https://" + hostname + "/perfil" + search + "#prefs" : new URL(destination, "https://" + hostname).href;
  const address = new URL(href);
  class ElementStub {
    readonly nodeType = 1;
    readonly isContentEditable = false;
    hidden = false;
    readonly dataset: Record<string, string> = {};
    readonly links: ElementStub[] = [];
    parentElement: ElementStub | null = null;
    readonly classList = { add() {}, remove() {} };
    readonly attributes: Map<string, string>;
    constructor(readonly tagName: string, attributes: Record<string, string> = {}) { this.attributes = new Map(Object.entries(attributes)); }
    getAttribute(key: string) { return this.attributes.get(key) ?? null; }
    hasAttribute(key: string) { return this.attributes.has(key); }
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    querySelectorAll(selector: string) { return selector === "a[href]" ? this.links : []; }
  }
  const html = new ElementStub("HTML"), attributes = html.attributes;
  const anchors = anchorAttributes.map(attrs => { const anchor = new ElementStub("A", attrs); anchor.parentElement = html; return anchor; });
  const legalDocuments = legalPages.map(page => {
    const doc = new ElementStub("DIV", { "data-doc": page.lang, translate: "no" }); doc.parentElement = html;
    doc.links.push(...page.links.map(attrs => { const anchor = new ElementStub("A", attrs); anchor.parentElement = doc; return anchor; }));
    return doc;
  });
  const context = vm.createContext({
    window, self: window, URL, HTMLScriptElement: class {}, HTMLInputElement: class {}, Element: ElementStub, HTMLElement: ElementStub,
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    location: { search: address.search, hostname, href, origin: address.origin, pathname: address.pathname, hash: address.hash, replace: (url: string) => replacements.push(url) },
    navigator: { languages, language: languages[0] },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    document: { documentElement: html, head: { appendChild() {} }, currentScript: null, readyState: "loading",
      createElement: () => ({ textContent: "" }), querySelectorAll: (selector: string) => selector === "[data-doc]" ? legalDocuments : [],
      querySelector: (selector: string) => legalDocuments.find(doc => selector === '[data-doc="' + doc.getAttribute("data-doc") + '"]') ?? null,
      addEventListener: (name: string, listener: () => void) => { if (name === "DOMContentLoaded") readyListeners.push(listener); },
      createTreeWalker: (_root: ElementStub, _what: number, filter: { acceptNode(node: ElementStub): number }) => {
        let index = 0; const nodes = [...anchors, ...legalDocuments];
        return { nextNode() { while (index < nodes.length) { const node = nodes[index++]; if (filter.acceptNode(node) === 1) return node; } return null; } };
      } },
    MutationObserver: class { observe() {} takeRecords() { return []; } },
    setTimeout: () => 0,
    fetch: async (url: string) => { requests.push(url); return { ok: true, status: 200, json: async () => english }; },
  });
  vm.runInContext(source("i18n-core.js"), context, { filename: "i18n-core.js" });
  vm.runInContext(source("i18n.js"), context, { filename: "i18n.js" });
  assert.ok(window.I18N);
  await window.I18N.ready;
  return { api: window.I18N, storage, requests, replacements, attributes, anchors, legalDocuments, dispatchDOMContentLoaded: () => readyListeners.forEach(listener => listener()) };
}

test("only Portuguese and English can be selected or translated by the backend", () => {
  assert.deepEqual(LANGS, ["pt-BR", "en-US"]);
  for (const lang of ["en", "en-GB", "en-US"]) assert.equal(pick(lang), "en-US");
  for (const lang of ["es", "es-MX", "es-419", "fr", "fr-FR", "fr-CA"]) {
    assert.equal(pick(lang), null, lang);
    assert.equal(T(lang, "Olá, {1}.", "Ana"), "Olá, Ana.", lang);
    assert.equal(tx(lang, 'Etapa "Logo" aprovada.'), 'Etapa "Logo" aprovada.', lang);
  }
  assert.equal(T("pt-BR", "Olá, {1}.", "Ana"), "Olá, Ana.");
});

test("English server messages retain placeholder values and translate complete system messages", () => {
  assert.equal(T("en-US", "Olá, {1}.", "Ana"), "Hi, Ana.");
  assert.equal(T("en-US", 'Etapa "{1}" aprovada. {2} liberado.', "Marca", "R$ 200"), 'Milestone "Marca" approved. R$ 200 released.');
  assert.equal(tx("en-US", 'Etapa "Marca" aprovada.'), 'Milestone "Marca" approved.');
  assert.equal(T("en-US", "Texto sem tradução: {1}", 42), "Texto sem tradução: 42");
});

test("long FAQ answers use exact translations while unknown long text keeps the safety limit", () => {
  const core = require(path.join(PROJECT_ROOT, "public", "i18n-core.js")) as I18nCore;
  const question = "Uma resposta extensa explica como publicar uma vaga e combinar as entregas. ".repeat(12).trim();
  const answer = "A detailed answer explains how to post a job and agree on deliverables. ".repeat(12).trim();
  const dictionary = core.compile({ [question]: answer, Ajuda: "Help" });
  assert.ok(question.length > 600);
  assert.equal(core.tr(dictionary, question), answer);
  assert.equal(core.translateText(dictionary, "  " + question + "\n"), "  " + answer + "\n");
  const unknown = Array.from({ length: 150 }, () => "Ajuda").join(" · ");
  assert.equal(core.tr(dictionary, unknown), null);
  assert.equal(core.translateText(dictionary, unknown), null);
  assert.equal(tx("en-US", unknown), unknown);
});

test("classic browser loader honors URL, saved language and browser preferences in that order", async () => {
  const cases: [string, string | undefined, string[], string][] = [
    ["?lang=en-GB", "pt-BR", ["pt-BR"], "en-US"],
    ["?lang=pt-BR", "en-US", ["en-US"], "pt-BR"],
    ["", "en-US", ["pt-BR"], "en-US"],
    ["", "pt-BR", ["en-US"], "pt-BR"],
    ["", undefined, ["en-GB", "pt-BR"], "en-US"],
    ["?lang=es-419", "en-US", ["pt-BR"], "en-US"],
    ["?lang=fr-CA", undefined, ["en"], "en-US"],
    ["", "fr-CA", ["fr-FR", "es-MX"], "pt-BR"],
    ["", "es-419", ["en-GB"], "en-US"],
    ["?lang=es", undefined, ["fr", "es"], "pt-BR"],
  ];
  for (const [query, saved, languages, expected] of cases) {
    const { api, requests, attributes } = await client(query, saved, languages);
    assert.equal(api.ativo, true);
    assert.deepEqual(Array.from(api.langs, ([code]) => code), ["pt-BR", "en-US"]);
    assert.equal(api.lang, expected, JSON.stringify({ query, saved, languages }));
    assert.equal(api.locale, expected);
    assert.equal(attributes.get("lang"), expected);
    assert.deepEqual(requests, expected === "en-US" ? ["/i18n/en-US.json"] : []);
    assert.equal(api.t("Olá, {1}.", "Ana"), expected === "en-US" ? "Hi, Ana." : "Olá, Ana.");
  }
});

test("browser language switching rejects hidden languages and saves a supported choice", async () => {
  const { api, storage, replacements } = await client("?lang=pt-BR&x=1");
  for (const lang of ["es-419", "fr-CA"]) api.set(lang);
  assert.equal(storage.get("osmo-lang"), "pt-BR");
  assert.deepEqual(replacements, []);
  api.set("en-US");
  assert.equal(storage.get("osmo-lang"), "en-US");
  assert.deepEqual(replacements, ["/perfil?x=1#prefs"]);
});

test("UK domains default to English even with a Portuguese browser", async () => {
  for (const hostname of ["osmodesign.co.uk", "www.osmodesign.co.uk", "OSMODESIGN.CO.UK", "osmodesign.co.uk.", "WWW.OSMODESIGN.CO.UK."]) {
    const { api, attributes, requests, storage } = await client("", undefined, ["pt-BR"], hostname);
    assert.equal(api.lang, "en-US", hostname);
    assert.equal(attributes.get("lang"), "en-US", hostname);
    assert.deepEqual(requests, ["/i18n/en-US.json"], hostname);
    assert.equal(api.t("Olá, {1}.", "Ana"), "Hi, Ana.", hostname);
    assert.equal(storage.get("osmo-lang"), undefined, "automatic domain choice is not an explicit preference");
  }
});

test("explicit language choices override the UK domain while unsupported choices fall through", async () => {
  const cases: [string, string | undefined, string][] = [
    ["", "pt-BR", "pt-BR"],
    ["?lang=pt-BR", "en-US", "pt-BR"],
    ["?lang=en-GB", "pt-BR", "en-US"],
    ["?lang=es-419", "fr-CA", "en-US"],
    ["?lang=fr-CA", "es-419", "en-US"],
  ];
  for (const [query, saved, expected] of cases) {
    const { api } = await client(query, saved, ["pt-BR"], "osmodesign.co.uk");
    assert.equal(api.lang, expected, JSON.stringify({ query, saved }));
  }
});

test("similar domains and arbitrary UK subdomains preserve browser language detection", async () => {
  for (const hostname of ["app.osmodesign.co.uk", "studio.osmodesign.co.uk", "notosmodesign.co.uk", "osmodesign.co.uk.example.test", "www.osmodesign.co.uk.evil.test", "osmodesign.com.br"]) {
    assert.equal((await client("", undefined, ["pt-BR"], hostname)).api.lang, "pt-BR", hostname);
    assert.equal((await client("", undefined, ["en-GB"], hostname)).api.lang, "en-US", hostname);
  }
});

test("manual language changes on the UK domain survive the next page load", async () => {
  const first = await client("", undefined, ["pt-BR"], "osmodesign.co.uk");
  assert.equal(first.api.lang, "en-US");
  first.api.set("pt-BR");
  assert.deepEqual(first.replacements, ["/perfil#prefs"]);
  const second = await client("", first.storage.get("osmo-lang"), ["pt-BR"], "osmodesign.co.uk");
  assert.equal(second.api.lang, "pt-BR");
  second.api.set("en-US");
  const third = await client("", second.storage.get("osmo-lang"), ["pt-BR"], "osmodesign.co.uk");
  assert.equal(third.api.lang, "en-US");
});

test("Brazilian root and www domains open in Portuguese before saved or browser preferences", async () => {
  for (const hostname of ["osmo.com.br", "www.osmo.com.br", "OSMO.COM.BR", "osmo.com.br.", "WWW.OSMO.COM.BR."]) {
    for (const query of ["", "?lang=es-419", "?lang=fr-CA"]) {
      const { api, requests, attributes } = await client(query, "en-US", ["en-GB"], hostname);
      assert.equal(api.lang, "pt-BR", hostname + query);
      assert.equal(attributes.get("lang"), "pt-BR");
      assert.deepEqual(requests, []);
    }
    assert.equal((await client("?lang=en-GB", "pt-BR", ["pt-BR"], hostname)).api.lang, "en-US");
  }
  for (const hostname of ["app.osmo.com.br", "notosmo.com.br", "osmo.com.br.example.test"]) {
    assert.equal((await client("", "en-US", ["pt-BR"], hostname)).api.lang, "en-US", hostname);
  }
});

test("English navigation on the Brazilian domain adds language only to internal HTML destinations", async () => {
  const { api } = await client("?lang=en-US", "pt-BR", ["pt-BR"], "osmo.com.br");
  for (const href of ["/vagas", "/vagas?q=brand#lista", "talentos?cat=design#top", "/privacidade.html", "https://osmo.com.br/perfil?tab=skills#bio"]) {
    const result = new URL(api.withLanguage(href), "https://osmo.com.br/perfil");
    const original = new URL(href, "https://osmo.com.br/perfil");
    assert.equal(result.origin, original.origin, href);
    assert.equal(result.pathname, original.pathname, href);
    assert.equal(result.hash, original.hash, href);
    const expected = new URLSearchParams(original.search); expected.set("lang", "en-US");
    assert.equal(result.searchParams.toString(), expected.toString(), href);
  }
  for (const href of ["/vagas?lang=pt-BR&cat=design#lista", "/perfil?lang=en-GB", "/vagas?lang=es-419", "https://example.test/vagas", "//example.test/vagas", "#faq", "/auth/google?role=freela", "/api/jobs", "/arquivo/123", "/avatar/7", "/portfolio/4", "/guia.PDF?download=1#p2", "/favicon.svg", "mailto:hi@example.test", "javascript:alert(1)", "blob:https://osmo.com.br/document-id", "http://["]) {
    assert.equal(api.withLanguage(href), href, href);
  }
});

test("language navigation leaves Portuguese pages and other domains unchanged", async () => {
  for (const [hostname, query, languages] of [
    ["osmo.com.br", "", ["en-GB"]],
    ["osmodesign.co.uk", "", ["pt-BR"]],
    ["example.test", "?lang=en-US", ["en-GB"]],
  ] as [string, string, string[]][]) {
    const { api } = await client(query, undefined, languages, hostname);
    assert.equal(api.withLanguage("/vagas?cat=design#lista"), "/vagas?cat=design#lista", hostname);
  }
});

test("Brazilian English selection survives internal hard navigation and refresh through its URL", async () => {
  const initial = await client("", "en-US", ["en-GB"], "osmo.com.br");
  assert.equal(initial.api.lang, "pt-BR");
  initial.api.set("en-US");
  assert.deepEqual(initial.replacements, ["/perfil?lang=en-US#prefs"]);
  assert.equal(initial.storage.get("osmo-lang"), "en-US");
  const englishPage = await client("", initial.storage.get("osmo-lang"), ["pt-BR"], "osmo.com.br", initial.replacements[0]);
  assert.equal(englishPage.api.lang, "en-US");
  const link = englishPage.api.withLanguage("/vagas?q=brand#lista");
  const navigated = await client("", englishPage.storage.get("osmo-lang"), ["pt-BR"], "osmo.com.br", link);
  assert.equal(navigated.api.lang, "en-US");
  const refreshed = await client("", navigated.storage.get("osmo-lang"), ["pt-BR"], "osmo.com.br", link);
  assert.equal(refreshed.api.lang, "en-US");
  refreshed.api.set("pt-BR");
  assert.deepEqual(refreshed.replacements, ["/vagas?q=brand#lista"]);
  const portuguesePage = await client("", refreshed.storage.get("osmo-lang"), ["en-GB"], "osmo.com.br", refreshed.replacements[0]);
  assert.equal(portuguesePage.api.lang, "pt-BR");
  assert.equal((await client("", "en-US", ["en-GB"], "osmo.com.br")).api.lang, "pt-BR");
});

test("DOMContentLoaded carries English into editorial anchors while preserving downloads and untranslated content", async () => {
  const page = await client("?lang=en-US", undefined, ["pt-BR"], "osmo.com.br", undefined, [
    { href: "/privacidade?source=footer#dados", title: "Publicar vaga" },
    { href: "/privacidade?download=1", download: "privacy.html" },
    { href: "/privacidade#original", translate: "no", title: "Publicar vaga" },
  ]);
  assert.equal(page.anchors[0].getAttribute("href"), "/privacidade?source=footer#dados");
  page.dispatchDOMContentLoaded();
  assert.equal(page.anchors[0].getAttribute("href"), "/privacidade?source=footer&lang=en-US#dados");
  assert.equal(page.anchors[0].getAttribute("title"), english["Publicar vaga"]);
  assert.equal(page.anchors[1].getAttribute("href"), "/privacidade?download=1");
  assert.equal(page.anchors[2].getAttribute("href"), "/privacidade#original");
  assert.equal(page.anchors[2].getAttribute("title"), "Publicar vaga");
});

test("active English legal documents preserve navigation language without translating protected content", async () => {
  const page = await client("?lang=en-US", undefined, ["pt-BR"], "osmo.com.br", undefined, [], [
    { lang: "pt-BR", links: [{ href: "/" }] },
    { lang: "en-US", links: [{ href: "/", title: "Publicar vaga" }, { href: "/privacidade?lang=pt-BR#dados" }] },
  ]);
  page.dispatchDOMContentLoaded();
  const [portuguese, englishDoc] = page.legalDocuments;
  assert.equal(portuguese.hidden, true);
  assert.equal(portuguese.links[0].getAttribute("href"), "/");
  assert.equal(englishDoc.hidden, false);
  assert.equal(englishDoc.links[0].getAttribute("href"), "/?lang=en-US");
  assert.equal(englishDoc.links[0].getAttribute("title"), "Publicar vaga");
  assert.equal(englishDoc.links[1].getAttribute("href"), "/privacidade?lang=pt-BR#dados");
});
