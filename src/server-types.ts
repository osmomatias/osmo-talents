import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SQLInputValue } from 'node:sqlite';
import type { HttpMethod, RouteOptions } from './router';

/** Column types for the existing SQLite schema and the named projections used below.
 * Query callers still select the columns they consume; values stay in database form. */
export interface AppRow {
  search_visible: number;
  cpf_cnpj: string;
  asaas_customer_id: string;
  pay_id: string;
  pay_status: string;
  invoice_url: string;
  delivered_at: string;
  with_v: number;
  freela_verified: string;
  file_id: number;
  file_name: string;
  file_ext: string;
  file_size: number;
  k: string;
  assignee: string;
  n_comments: number;
  open: number;
  late: number;
  project: string;
  notify_token: string;
  notify_level: string;
  last: number;
  action: string;
  added_at: string;
  admin: string;
  admin_id: number;
  api_key_enc: string;
  asaas_account_id: string;
  assignee_id: number;
  auth: string;
  author: string;
  author_id: number;
  avatar_v: number;
  bio: string;
  body: string;
  budget: number;
  budget_type: string;
  cat: string;
  cid: number;
  clarity: number;
  client: string;
  client_id: number;
  client_name: string;
  client_read_at: string;
  code: string;
  color: number;
  com: string;
  comment: string;
  company: string;
  contract_id: number;
  count: number;
  created_at: string;
  created_by: number;
  crm: string;
  data: Uint8Array;
  days: number;
  detail: string;
  device: string;
  doc_sha256: string;
  done: number;
  done_at: string;
  due_date: string;
  duration: string;
  email: string;
  endpoint: string;
  energy: string;
  ent: string;
  entity: string;
  entity_id: number;
  escrow: number;
  event: string;
  expires_at: string;
  ext: string;
  fb: string;
  fora: string;
  freela: string;
  freela_id: number;
  freela_name: string;
  freela_read_at: string;
  held: number;
  hours: number;
  id: number;
  image: Uint8Array;
  is_async: number;
  is_flex: number;
  job: string;
  job_id: number;
  job_title: string;
  key_hash: string;
  kind: string;
  lang: string;
  last_at: string;
  last_ok_at: string;
  link: string;
  location: string;
  message_id: number;
  milestone_id: number;
  milestones: string;
  mime: string;
  n: number;
  n_props: number;
  name: string;
  next_pos: number;
  nonce: string;
  notes: string;
  notify: string;
  obj: string;
  own: number;
  owner_id: number;
  p256dh: string;
  paid: number;
  parent_id: number;
  pass_hash: string;
  phone: string;
  pin: string;
  portfolio: string;
  pos: number;
  project_id: number;
  proposal_id: number;
  provider: string;
  questions: string;
  rate: number;
  rating: number;
  read_at: string;
  ref: string;
  revocation: string;
  role: string;
  roles: string;
  section_id: number;
  seen_at: string;
  sender: string;
  sender_id: number;
  signed_at: string;
  size: number;
  skills: string;
  squad_id: number;
  state: string;
  status: string;
  sub: string;
  tag: string;
  tags: string;
  target_id: number;
  task_id: number;
  text: string;
  thread: number;
  thread_id: number;
  title: string;
  token: string;
  token_hash: string;
  total: number;
  tv_id: number;
  type: string;
  uid: number;
  unread: number;
  updated_at: string;
  user_id: number;
  v: number;
  value: number;
  verified_at: string;
  verifier: string;
  wallet_id: string;
  ws_com: string;
  ws_fb: string;
  ws_foco: string;
  ws_resp: string;
}
export type Role = 'freela' | 'cliente';
export interface SessionUser {
  id: number; name: string; email: string; role: Role; roles: Role[];
  energy: string; notify: string; lang: string; phone: string;
}
export type JsonBody = Record<string, unknown>;
export interface RouteContext<TBody = JsonBody, TUser = SessionUser> {
  req: IncomingMessage; res: ServerResponse; user: TUser;
  params: Record<string, number>; body: TBody; query: URLSearchParams; ip: string;
}
export type Handler<B = JsonBody, U = SessionUser> = (context: RouteContext<B, U>) => unknown | Promise<unknown>;
export type PublicHandler<B = JsonBody> = Handler<B, SessionUser | null>;
export type AppRouteOptions = RouteOptions<Role>;
export interface ClarityInput { title: string; cat: string; obj: string; ent: readonly unknown[]; fora: readonly unknown[]; com: string; fb: string; budget: number; duration: string }
export interface ProposalMilestone { title: string; value: number }
export type ProposalRow = Pick<AppRow, 'id' | 'job_id' | 'freela_id' | 'text' | 'value' | 'days' | 'questions' | 'milestones' | 'status' | 'created_at'> & {freela_name?: string};
export type MilestoneOutput = Omit<AppRow, 'pay_id'> & { pay_id?: string; files: (AppRow & { mine: boolean })[] };
export type ContractOutput = Omit<AppRow, 'milestones'> & {
  milestones: MilestoneOutput[];
  review: { mine: number; theirs: boolean; tags: string[] };
};
export type OAuthRegistration = { provider: string } & Pick<import('./oauth').OAuthProfile, 'name' | 'email' | 'sub'>;
export interface AdminUserValues { name: string; email: string; role: Role }
export interface AdminJobValues extends ClarityInput {
  client_id: number; ref?: string; budget_type?: string; skills?: string[];
  is_async?: number; is_flex?: number; status?: string;
}
export interface TaskUpdate {
  title?: string; notes?: string; assignee_id?: number | null; due_date?: string; done?: number; done_at?: string;
}
export interface MilestoneFlow { who: Role; from: string[]; to: string; msg(m: AppRow): string }
export interface AdminOption { v: string; l: string }
export interface AdminField { k: string; label: string; type: string; max?: number; min?: number; len?: number; req?: boolean; ph?: string; tbl?: string; json?: boolean; create?: boolean; locked?(): boolean; options?: AdminOption[] | (() => AdminOption[]) }
export type AdminValues = Record<string, string | number | string[] | undefined>;
export interface AdminEntity { label: string; table: string; canCreate?: boolean; fields: AdminField[]; cols: string[][]; list(q: string, offset: number, query?: URLSearchParams): unknown[]; summary?(): unknown; get(id: number): AppRow | undefined; create?(values: AdminValues, user: SessionUser): Promise<{id:number;tempPassword?:string}> | {id:number;tempPassword?:string}; check?(values: AdminValues, id: number): void; beforeDelete?(id: number, user: SessionUser): void; after?(id: number): void }
export interface TmdbItem { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; vote_average?: number; poster_path?: string; backdrop_path?: string; overview?: string }
export interface TmdbResponse { results: TmdbItem[] }
export interface VideoMetadata { order?: unknown; title?: unknown; year?: unknown; overview?: unknown }
export type SqlParameters = SQLInputValue[];
export type { HttpMethod, SQLInputValue };
