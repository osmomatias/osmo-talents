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
}
const source = (name: string) => fs.readFileSync(path.join(PROJECT_ROOT, "public", name), "utf8");
const english = JSON.parse(source("i18n/en-US.json")) as TranslationDictionary;

// Exercise the emitted classic scripts with storage and fetch contained entirely in the VM.
async function client(search = "", saved?: string, languages = ["pt-BR"], hostname = "example.test") {
  const storage = new Map<string, string>(saved ? [["osmo-lang", saved]] : []);
  const requests: string[] = [], replacements: string[] = [], attributes = new Map<string, string>();
  const window: { OsmoI18nCore?: I18nCore; I18N?: ClientI18n } = {};
  const html = { setAttribute: (key: string, value: string) => attributes.set(key, value), classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    window, self: window, URL, HTMLScriptElement: class {},
    location: { search, hostname, href: "https://" + hostname + "/perfil" + search + "#prefs", replace: (url: string) => replacements.push(url) },
    navigator: { languages, language: languages[0] },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    document: { documentElement: html, head: { appendChild() {} }, currentScript: null, readyState: "loading",
      createElement: () => ({ textContent: "" }), querySelectorAll: () => [], addEventListener() {} },
    MutationObserver: class { observe() {} takeRecords() { return []; } },
    setTimeout: () => 0,
    fetch: async (url: string) => { requests.push(url); return { ok: true, status: 200, json: async () => english }; },
  });
  vm.runInContext(source("i18n-core.js"), context, { filename: "i18n-core.js" });
  vm.runInContext(source("i18n.js"), context, { filename: "i18n.js" });
  assert.ok(window.I18N);
  await window.I18N.ready;
  return { api: window.I18N, storage, requests, replacements, attributes };
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
