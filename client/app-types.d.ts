/** Browser DTOs follow the JSON contracts served by /api. */
type OsmoRole = "freela" | "cliente";
type OsmoId = number | string;
type OsmoFlag = boolean | number;
interface OsmoHow { com: string; resp: string; fb: string; foco: string }
interface OsmoPortfolio { id: number; title: string; link: string; image: string }
interface OsmoAttachment { id: number; name: string; size: number; ext: string; mine?: boolean }
interface OsmoReview { author: string; rating: number; job: string; created_at: string; tags: string[]; comment: string }
interface OsmoRating { avg: number; n: number; tags: { tag: string; n: number }[] }
interface OsmoProfile {
  avatar: string; title: string; location: string; rate: number; hours: number;
  skills: string[]; bio: string; tag: string; company: string;
  how: OsmoHow; portfolio: OsmoPortfolio[]; verified: string;
  searchVisible: boolean; done: number; rating: OsmoRating;
}
interface OsmoUser {
  id: number; name: string; role: OsmoRole; roles: OsmoRole[]; email: string;
  unread: number; isAdmin: boolean; needPhone: boolean; profile: OsmoProfile;
  hasDoc: boolean; payout: { active: boolean; escrow: boolean; connected?: boolean } | null; energy: string; notify: string;
}
interface OsmoTalent extends OsmoProfile { id: number; name: string; reviews: OsmoReview[] }
interface OsmoPayments { provider?: string; enabled: boolean; fee: number; autoRelease: number; sandbox?: boolean }
interface OsmoMeResponse { v: string; user: OsmoUser | null; payments?: OsmoPayments; oauth?: string[]; mail?: boolean; phone?: boolean; push?: string; analytics?: string }
interface OsmoBrief { obj: string; ent: string[]; fora: string[]; com: string; fb: string; ref: string }
interface OsmoJob { id: number; title: string; company: string; client: string; client_id: number; created_at: string; proposals: number; budget_type: string; budget: number; duration: string; clarity: number; async: OsmoFlag; flex: OsmoFlag; skills: string[]; cat: string; status: string; brief: OsmoBrief }
interface OsmoJobDetail extends OsmoJob { files: OsmoAttachment[]; filesCount: number; clientRating: OsmoRating; clientReviews: OsmoReview[] }
interface OsmoProposal { id: number; status: string; files: OsmoAttachment[]; value: number; days: number; milestones: { title: string; value: number }[]; text: string; freela_id: number; freela_name: string; freela: OsmoTalent; job_id: number; job_title: string; client_name: string; created_at: string }
interface OsmoJobResponse { job: OsmoJobDetail; mine: OsmoProposal | null; proposals: OsmoProposal[] }
interface OsmoPagination { total: number; pages: number; page: number }
interface OsmoJobsResponse { jobs: OsmoJob[]; pagination?: OsmoPagination }
interface OsmoTalentsResponse { talents: OsmoTalent[]; pagination?: OsmoPagination }
interface OsmoWizard { step: number; text: string; value: string; days: string; qs: string; split: boolean; ms: { title: string; value: string }[] }
interface OsmoPhoneStart { pid: string; code: string; link: string; number: string; minutes: number; dev: boolean }
type OsmoPhoneStatus = { state: "pending" } | { state: "expired" } | { state: "taken"; pretty: string } | { state: "ok"; pretty: string; ticket: string };
interface OsmoAuthBody { email: string; password: string; name?: string; role?: string; phoneTicket?: string }
interface OsmoPerson { id: number; name: string; title: string; avatar: string; verified: string }
interface OsmoSquad { id: number; color: number; name: string; members: OsmoPerson[] }
interface OsmoSquadsResponse { contacts: OsmoPerson[]; squads: OsmoSquad[]; memberOf: { id: number; color: number; name: string; owner: string }[] }
interface OsmoThreadSummary { id: number; with: string; withId: number; withAvatar: string; withVerified: string; unread: number; job: string; last: string }
interface OsmoThreadResponse { thread: { id: number; with: OsmoPerson & { role: OsmoRole | "suporte"; how?: OsmoHow | null }; support: boolean; job: { id: number; title: string } | null; pin: string }; messages: { id: number; system: boolean; body: string; mine: boolean; created_at: string; file?: OsmoAttachment }[] }
interface OsmoMilestone { id: number; status: string; pay_status: string; invoice_url: string; files: OsmoAttachment[]; title: string; value: number }
interface OsmoContract { id: number; freela_id: number; client_name: string; freela_name: string; job_title: string; status: string; value: number; thread: number; milestones: OsmoMilestone[]; review: { mine: number; theirs: boolean; tags: string[] } }
interface OsmoContractsResponse { contracts: OsmoContract[]; stats: { net: number; paid: number; held: number; payments: boolean; toPay: number } }
interface OsmoMyProposals { open: number; cap: number; proposals: OsmoProposal[] }
interface OsmoTask { id: number; title: string; done: OsmoFlag; due_date: string; assignee: string; assignee_id: number | null; comments: number; parent_id: number | null; section_id: number; pos: number; project_id: number; project: string; notes: string }
interface OsmoSection { id: number; name: string }
interface OsmoProject { id: number; name: string; contract_id: number | null; kind: string; open: number; done: number; late: number }
interface OsmoProjectResponse { project: OsmoProject; tasks: OsmoTask[]; sections: OsmoSection[]; members: { id: number; name: string }[]; canManage: boolean }
interface OsmoTaskResponse { task: OsmoTask; subtasks: OsmoTask[]; comments: { author: string; created_at: string; body: string }[] }
type OsmoAdminValue = string | number | boolean | string[] | null;
interface OsmoAdminField { k: string; label: string; type: string; locked?: boolean; req?: boolean; ph?: string; create?: boolean; options: { v: string | number; l: string }[] }
interface OsmoAdminEntity { k: string; label: string; fields: OsmoAdminField[]; cols: [string, string][]; canCreate: boolean }
interface OsmoAdminSchema { entities: OsmoAdminEntity[] }
interface OsmoAdminLog { created_at: string; admin: string; action: string; entity: string; entity_id: number; detail: string }
interface OsmoAdminRow { id: number; [key: string]: OsmoAdminValue }
interface OsmoAdminProposalSummary { total: number; totalValue: number; byStatus: Record<string, number> }
interface OsmoAdminProposalFull {
  id: number; job_id: number; job: string; job_status: string; client_id: number; client: string;
  freela_id: number; freela: string; verified: string; avatar: string;
  value: number; days: number; status: string; text: string; questions: string;
  milestones_list?: { title: string; value: number }[];
  files?: OsmoAttachment[];
  contract_id?: number | null; created_at: string;
}
interface OsmoWeekly { week: string; users: number; jobs: number; contracts: number; value: number }
interface OsmoAttention { id: number; job_id: number; title: string; value: number; job: string; client: string; freela: string; at: string; clarity: number }
interface OsmoOverview {
 generatedAt: string;
 people: { freelas: number; clientes: number; new7: number; new30: number; active7: number; profilesReady: number; verified: number; withPayout: number };
 money: { contracts: Record<string, number>; contracted: number; released: number; feeEarned: number; held: number; toPay: number; milestones: Record<string, number> };
 funnel: { published: number; withProposal: number; hired: number; done: number };
 attention: { deliveredWaiting: OsmoAttention[]; proposalsWaiting: OsmoAttention[]; jobsNoProposal: OsmoAttention[]; unpaid: OsmoAttention[] };
 jobs: { total: number; avgClarity: number; byStatus: Record<string, number>; byCat: Record<string, number> };
 config: { payments: boolean; fee: number; mail: boolean; oauth: string[]; version: string; autoRelease: number };
 tasks: { open: number; late: number; done: number; projects: number };
 weekly: OsmoWeekly[]; proposals: { perJob: number; byStatus: Record<string, number> };
 talk: { messages7: number; threads7: number; reviews: { avg: number; n: number } };
 recent: { users: { role: OsmoRole; id: number; name: string; verified: string; email: string; at: string }[]; jobs: { id: number; title: string; client: string; status: string; clarity: number; props: number; at: string }[]; contracts: { job: string; client: string; freela: string; value: number; done: number; total: number; status: string; at: string }[] };
}
interface OsmoTopItem { rank: number; title: string; year: string; rating: number; poster: string }
interface OsmoTopResponse { updatedAt: string; filmes: OsmoTopItem[]; series: OsmoTopItem[] }
interface OsmoPostDraft { title: string; cat: string; obj: string; ent: string; fora: string; com: string; fb: string; ref: string; budget_type: string; budget: string; duration: string; skills: string; async: boolean; flex: boolean }
interface OsmoPomo { on: boolean; open: boolean; mode: string; running: boolean; endsAt: number; left: number; cycles: number; mins: Record<string, number>; sound: boolean; side: string; y: number | null }
interface OsmoPortfolioEdit { id?: number; title: string; link: string; image: string; newImage?: string; removeImage?: boolean }

interface OsmoElementIds {
  "a11yBtn": HTMLButtonElement;
  "a11yClose": HTMLButtonElement;
  "a_email": HTMLInputElement;
  "a_name": HTMLInputElement;
  "a_pass": HTMLInputElement;
  "admForm": HTMLFormElement;
  "admPass": HTMLInputElement;
  "admQ": HTMLInputElement;
  "authForm": HTMLFormElement;
  "avatarIn": HTMLInputElement;
  "compose": HTMLFormElement;
  "f_async": HTMLInputElement;
  "f_clear": HTMLInputElement;
  "f_email": HTMLInputElement;
  "f_flex": HTMLInputElement;
  "fbox": HTMLDetailsElement;
  "fcat": HTMLSelectElement;
  "forgotForm": HTMLFormElement;
  "fq": HTMLInputElement;
  "fsort": HTMLSelectElement;
  "gaSw": HTMLInputElement;
  "heroQ": HTMLInputElement;
  "heroSearch": HTMLFormElement;
  "invJob": HTMLSelectElement;
  "jFiles": HTMLInputElement;
  "langSel": HTMLSelectElement;
  "menuBtn": HTMLButtonElement;
  "mmA11y": HTMLButtonElement;
  "msgFile": HTMLInputElement;
  "msgIn": HTMLTextAreaElement;
  "newMsg": HTMLButtonElement;
  "notifyForm": HTMLFormElement;
  "pFiles": HTMLInputElement;
  "p_async": HTMLInputElement;
  "p_bio": HTMLTextAreaElement;
  "p_bt": HTMLSelectElement;
  "p_budget": HTMLInputElement;
  "p_cat": HTMLSelectElement;
  "p_com": HTMLSelectElement;
  "p_company": HTMLInputElement;
  "p_doc": HTMLInputElement;
  "p_dur": HTMLInputElement;
  "p_ent": HTMLTextAreaElement;
  "p_fb": HTMLInputElement;
  "p_flex": HTMLInputElement;
  "p_fora": HTMLTextAreaElement;
  "p_hours": HTMLInputElement;
  "p_loc": HTMLInputElement;
  "p_name": HTMLInputElement;
  "p_obj": HTMLTextAreaElement;
  "p_rate": HTMLInputElement;
  "p_ref": HTMLInputElement;
  "p_searchVisible": HTMLInputElement;
  "p_skills": HTMLInputElement;
  "p_skills_in": HTMLInputElement;
  "p_tag": HTMLInputElement;
  "p_title": HTMLInputElement;
  "peImg": HTMLInputElement;
  "pe_link": HTMLInputElement;
  "pe_title": HTMLInputElement;
  "pinIn": HTMLInputElement;
  "po_addr": HTMLInputElement;
  "po_birth": HTMLInputElement;
  "po_cep": HTMLInputElement;
  "po_comp": HTMLInputElement;
  "po_doc": HTMLInputElement;
  "po_income": HTMLInputElement;
  "po_num": HTMLInputElement;
  "po_phone": HTMLInputElement;
  "po_prov": HTMLInputElement;
  "po_type": HTMLSelectElement;
  "pomoBubble": HTMLButtonElement;
  "pomoSound": HTMLInputElement;
  "postForm": HTMLFormElement;
  "profForm": HTMLFormElement;
  "resetForm": HTMLFormElement;
  "sqName": HTMLInputElement;
  "sqNewForm": HTMLFormElement;
  "sqNewName": HTMLInputElement;
  "sqq": HTMLInputElement;
  "tbSearch": HTMLButtonElement;
  "tkDue": HTMLInputElement;
  "tkNotes": HTMLTextAreaElement;
  "tkSec": HTMLSelectElement;
  "tkWho": HTMLSelectElement;
  "tq": HTMLInputElement;
  "vConsent": HTMLInputElement;
  "vFile": HTMLInputElement;
  "wFiles": HTMLInputElement;
  "w_com": HTMLInputElement;
  "w_fb": HTMLInputElement;
  "w_foco": HTMLInputElement;
  "w_resp": HTMLInputElement;
  "waForm": HTMLFormElement;
  "wdays": HTMLInputElement;
  "wqs": HTMLTextAreaElement;
  "wsplit": HTMLInputElement;
  "wtext": HTMLTextAreaElement;
  "wval": HTMLInputElement;
}
type OsmoSelected<S extends string> = S extends `#${infer Id}` ? Id extends keyof OsmoElementIds ? OsmoElementIds[Id] : HTMLElement : S extends `[data-lang-set]` ? HTMLSelectElement : S extends `[data-social]` ? HTMLAnchorElement : S extends `input${string}` ? HTMLInputElement : S extends `select${string}` ? HTMLSelectElement : S extends `textarea${string}` ? HTMLTextAreaElement : HTMLElement;
