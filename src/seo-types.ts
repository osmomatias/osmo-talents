/** Public SEO contracts, shared by rendering, editorial content and document metadata. */
export type SqlValue = string | number | bigint | null | Uint8Array;
export type DatabaseRow = Record<string, SqlValue>;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type StructuredData = { [key: string]: JsonValue };
export interface PaymentConfig {
  enabled: boolean;
  sandbox?: boolean;
  fee: number;
  autoRelease: number;
}
export interface PaymentInput extends Partial<PaymentConfig> {
  ENABLED?: boolean;
  BASE?: string;
  FEE_PCT?: number;
  AUTO_RELEASE_DAYS?: number;
}
export interface Breadcrumb { label: string; href?: string }
export interface DocumentPage {
  title: string;
  description: string;
  canonicalPath?: string | null;
  content?: string;
  indexable?: boolean;
  breadcrumbs?: Breadcrumb[];
  schema?: StructuredData[];
}
export interface SeoPage extends DocumentPage {
  status: number;
  content: string;
  indexable: boolean;
  breadcrumbs: Breadcrumb[];
  schema: StructuredData[];
}
export interface EditorialPage { title: string; description: string; content: string; label?: string }
export type EditorialPages = Record<string, (config: PaymentConfig) => EditorialPage>;
export interface PublicJob {
  id: number;
  client_id: number;
  client: string;
  company: string;
  title: string;
  cat: string;
  brief: { obj: string; ent: string[]; fora: string[]; com: string; fb: string; ref: string };
  budget_type: string;
  budget: number;
  duration: string;
  skills: string[];
  async: boolean;
  flex: boolean;
  clarity: number;
  status: string;
  created_at: string;
  proposals?: number;
}
export interface PortfolioItem { id: number; title: string; link: string; image?: string }
export interface PublicProfile {
  id: number;
  name: string;
  title: string;
  bio: string;
  skills: string[];
  portfolio: PortfolioItem[];
  searchVisible: boolean;
}
export interface Category { id: string; nome: string; resumo: string }
export interface Pagination { page: number; pages: number; total: number }
export interface JobList {
  jobs: PublicJob[];
  pagination: Pagination;
  normalized: URLSearchParams;
  q: string;
  cat: string;
}
export interface TalentList {
  talents: PublicProfile[];
  pagination: Pagination;
  normalized: URLSearchParams;
  q: string;
}
export type SearchInput = URLSearchParams | string | Record<string, string> | string[][];
export interface SeoDependencies {
  one(sql: string, ...params: SqlValue[]): DatabaseRow | undefined;
  all(sql: string, ...params: SqlValue[]): DatabaseRow[];
  JOB_SELECT: string;
  jobOut(row: DatabaseRow): PublicJob;
  profileOf(id: number): PublicProfile | null;
  hasFreelaSQL?: string | ((alias: string) => string);
  payments?: PaymentInput;
  publicDir?: string;
}
export interface SeoService {
  origin: string;
  page(pathname: string, search?: SearchInput): SeoPage | null;
  sitemap(): string;
  robots(): string;
  listJobs(search?: SearchInput): JobList;
  listTalents(search?: SearchInput): TalentList;
}
