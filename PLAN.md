# PaperBank — Detailed Foundation Plan v0.2

> HCB-style clarity, zero integration. No Stripe, no bank, no cards, no transfers — ever. Track proposals → approvals → purchases → receipts + manual reimbursement with proof.

**Zero-integration principle (non-negotiable):** PaperBank never moves money, never holds balances, never connects to Stripe / Plaid / banks / cards. All amounts are ledger-only `requested / approved / spent / owed / reimbursed`. Reimbursement = human pays offline (cash/Venmo/etc), then marks `paid` in app as record-keeping. No payment rails in code, no secrets, no webhooks.

## 1. Product Definition

**What it is:** Collaborative spend-tracking + manual reimbursement log for clubs/teams.
**What it is NOT:** No bank accounts, no cards, no transfers, no holding balances, no Stripe Connect, no payouts API — now or later.

Core loop:
1. Member creates **Proposal** (list of items + qty + est. price)
2. Approver **Approves / Denies / Requests changes**
3. Member buys out-of-pocket, uploads **Receipt(s)** → creates **Purchase** (`paidById` = who fronted cash)
4. System **matches Purchase ↔ Proposal**, flags variances
5. System creates **Reimbursement** (`org owes paidBy amount`) → later manually marked `reimbursed`
6. Dashboard shows team spend, pending reimbursements, receipt completeness

Standalone path: **Purchase without Proposal** (direct expense log) must be first-class. Still creates Reimbursement.

## 2. Key Design Choices

### 2.1 Monolith-first
**Choice: Next.js App Router + TypeScript monolith.**
`/app` for UI, Server Actions for mutations, `/app/api` only for uploads / OCR callbacks / Amazon preview. No duplicate mutation paths: UI uses Server Actions, external reads use API.
Alternative rejected: Separate Express/Django API — doubles ops cost for no benefit at MVP.

### 2.2 Postgres as source of truth
**Choice: Postgres + Prisma + app-layer `orgId` scoping.**
Why: Relational fits ledger (orgs → proposals → items → purchases → receipts → reimbursements). Prisma migrations + type safety. No RLS in v0; every query filters `orgId` via `requireMembership()` helper + audit log.
File blobs go to S3-compatible storage (Supabase Storage / R2 / S3), DB stores only `imageUrl + ocrJson`. No DB blobs.

### 2.3 Auth + Teams
**Choice: Auth.js (NextAuth v5) — Google + GitHub OAuth + Email magic link. Multi-org from day 1.**
Roles linear: `owner > admin > approver > member > viewer`

Permission matrix (enforced server-side, not just `minimumRole`):
- `viewer`: read only
- `member`: create/edit own proposals+purchases, upload receipts, comment
- `approver`: + approve/deny/request-changes any proposal, verify any receipt, link/unlink purchases
- `admin`: + invite/remove members (except owner), change member/approver roles, edit settings, mark reimbursed
- `owner`: + change admin roles, delete org, transfer ownership

Rules:
- `Membership { userId, orgId, role } @@unique([userId, orgId])`
- Session JWT carries `userId`; org role looked up per-request via `requireRole(orgId, action)`, never trusted from client.
- Self-approval forbidden: `authorId == approverId` → reject unless `owner` override with audit.
- Invite: `Invite { email, role, tokenHash, expiresAt 7d }`. Store SHA-256 hash only, compare constant-time. Single-use, delete on accept.
- Admin UI = members/invites/roles + audit log viewer.

### 2.4 HCB-slick UI
**Choice: Tailwind + shadcn/ui, CSS vars for light/dark, mobile-first.**
- Layout: left sidebar (desktop) → bottom nav (mobile), feed-style list, status pills, org balance = `approved - spent`
- `next-themes` for light/dark, system default
- Components only: Card, Dialog, Dropdown, Badge, Avatar, Table, Form, Sonner toasts

### 2.5 Money handling (ledger-only)
- Store **integer minor units** (`Int amountCents`), never float. Display with `Intl.NumberFormat(locale, {currency})`.
- `Org.currency` default USD, immutable after first purchase. No FX in v1. Each Proposal/Purchase snapshots `currency` to prevent mid-stream change.
- Zero-decimal currencies (JPY, KRW): minor = major (no /100). Use `currencyDecimals` map: `JPY:0 else 2`.
- Tax: `org.defaultTaxRateBps` (e.g. 887 = 8.87%, basis points avoid float) + per-item `taxable + taxRateBpsOverride?`. Server computes:
  ```
  lineSubtotal = qty * unitCents
  lineTax = taxable ? round(lineSubtotal * rateBps / 10000) : 0  // half-up per line
  subtotalCents = sum(lineSubtotal)
  taxCents = sum(lineTax)
  totalCents = subtotalCents + taxCents
  ```
  Never trust client totals. Recompute on every write, Vitest-covered.
- No negative amounts except variance display. Refunds = separate Purchase with `isRefund bool`.

### 2.6 Receipts + OCR pipeline (manual-first)
Manual entry is primary; OCR is suggest-only, never auto-finalizes.
1. **v0:** Upload → preview → manual total entry. Optional Tesseract.js **lazy client-side** (`dynamic import`, own route `/purchases/[id]/scan`) suggests `total + subtotal`. Keeps main bundle small, zero server CPU, zero vendor cost.
2. **v1 (only if needed):** Server queue + one cloud vendor (pick Mistral OCR, fixed budget cap). Strict JSON: `{ merchant, date, subtotal_cents, tax_cents, total_cents, items[] }`.
3. **v2:** LLM cleanup — deferred, out of MVP.

```
Receipt { ocrStatus: uploaded|processing|needs_review|verified|failed, confidence Float?, ocrRawJson Json? }
Human override: verifiedTotalCents + verifiedById + verifiedAt. Money = verified* if present else manual total.
```
Flow: `uploaded → (processing → needs_review) → verified`. `failed` → manual entry required. Verifier cannot be uploader unless admin override + audit.

Upload flow: client requests signed PUT URL → PUT to private bucket → server `api/receipts/confirm` validates type/size → server strips EXIF via `sharp` → creates Receipt row.

### 2.7 Amazon fetch (best-effort, manual wins)
No unauthenticated Amazon API is ToS-safe. Assume fetch usually blocked.
- User pastes URL → `GET /api/amazon/preview?url=` normalizes URL (strip `ref=`, `tag=`, query except `dp|gp|asin`), checks `PriceCache(normalizedUrl PK, 7d TTL)`.
- Server fetches with desktop UA + 5s timeout, parses `og:title/image/price` only. CAPTCHA/block → return `{ blocked:true }` → UI falls back to manual immediately, no retry loop.
- Never scrape at scale. No PA-API (would imply affiliate/money integration — out of scope).
Store: `ProposalItem { name, url?, normalizedUrl?, imageUrl?, unitCents, priceSource: manual|amazon, priceFetchedAt? }`

### 2.8 Proposal ↔ Purchase matching
Explicit link + fuzzy suggest, not auto-merge.
- `Purchase.proposalId?` nullable, `linkStatus: unmatched|suggested|linked`, separate from verification.
- v0 matcher = pure JS (no `pg_trgm` dependency): normalized lowercase/trim/punct-strip + token overlap + levenshtein ≤2 for short names, unit price within `min(10%, $5)`, qty overlap counts as bonus.
- UI picker shows top-3 + variance badge (`over/under by $X`, computed `purchase.total - proposal.total`).
- Approved proposal is immutable. Variances append `AuditLog`, never edit in place.

### 2.9 States (enforced server-side with zod)
```
Proposal: draft → submitted → approved | denied | changes_requested → submitted ...
  approved → completed (trigger: linked verified Purchase total >= approved total OR author/admin clicks Mark complete)
  completed terminal. denied terminal unless cloned to new draft.

Purchase: logged → verified (requires ≥1 verified Receipt + totals match receipts sum ±$0.01)
  linkStatus orthogonal: unmatched | suggested | linked

Receipt: uploaded → processing → needs_review → verified | failed → (re-upload)

Reimbursement (auto-created on Purchase verified, 1:1):
  owed → reimbursed (trigger: admin/owner clicks Mark paid + optional note `paidVia: cash|venmo|other` text-only, no integration)
  No auto-transitions, no partial payments in v0 (split = multiple Purchases).
```
Every transition checks current state in DB transaction + writes `AuditLog`.

## 3. Data Model (Prisma sketch)

```
Org { id, name, slug @unique, currency, defaultTaxRateBps Int, imageUrl?, createdAt, updatedAt }
User { id, email @unique, name?, image?, createdAt, updatedAt }
Membership { userId, orgId, role: owner|admin|approver|member|viewer, createdAt @@unique([userId, orgId]) @@index([orgId]) }
Proposal { id, orgId, authorId, title, reason?, status, currency, subtotalCents, taxCents, totalCents, createdAt, updatedAt @@index([orgId, status]) }
ProposalItem { id, proposalId, name, url?, normalizedUrl?, imageUrl?, qty, unitCents, taxable, taxRateBpsOverride?, priceSource @@index([proposalId]) }
Purchase { id, orgId, proposalId?, authorId, paidById, merchant?, purchasedAt, currency, subtotalCents, taxCents, totalCents, status: logged|verified, linkStatus, isRefund, notes?, createdAt, updatedAt @@index([orgId, status]) }
Receipt { id, purchaseId, imageUrl, ocrStatus, ocrRawJson?, merchant?, purchasedAt?, subtotalCents?, taxCents?, totalCents?, confidence?, verifiedTotalCents?, verifiedById?, verifiedAt? @@index([purchaseId]) }
Reimbursement { id, orgId, purchaseId @unique, payeeId, amountCents, currency, status: owed|reimbursed, paidViaNote?, markedPaidById?, markedPaidAt?, createdAt @@index([orgId, status]) }
Comment { id, orgId, proposalId?, purchaseId?, authorId, body, createdAt @@index([proposalId]) @@index([purchaseId]) }
AuditLog { id, orgId, actorId, action, entity, entityId, diffJson?, createdAt @@index([orgId, createdAt]) }
Invite { id, orgId, email, role, tokenHash @unique, expiresAt, createdAt @@index([orgId]) }
PriceCache { normalizedUrl @id, title?, imageUrl?, priceCents?, currency?, fetchedAt }
```

Notes: all tables `createdAt+updatedAt`. No soft-delete v0 — deletes forbidden except drafts; everything else via status. `diffJson { before, after }`.

## 4. Routes / IA

```
(o)/[slug]/ → dashboard (spend, pending approvals, owed reimbursements, missing receipts)
(o)/[slug]/proposals, (o)/[slug]/proposals/[id]
(o)/[slug]/purchases, (o)/[slug]/purchases/[id]
(o)/[slug]/reimbursements (owed / paid log, Mark paid button admin-only)
(o)/[slug]/team, (o)/[slug]/settings
/admin (superadmin only, via ADMIN_EMAILS env allowlist — orgs, users, flags)
/api/receipts/upload-url, /api/receipts/confirm, /api/amazon/preview, /api/match/suggest
Mutations = Server Actions only. API = signed URLs + previews + suggestions (GET/POST read-only-ish).
```

## 5. Build Phases

**Phase 0a — Scaffold:** Next.js+TS+Tailwind+shadcn+dark, ESLint+Prettier, Vitest+Playwright skeleton, CI, `docker-compose` Postgres, Prisma init + seed (demo org/users).
**Phase 0b — Auth+Orgs:** Auth.js, Memberships, `requireRole` matrix, invites with hashed tokens, base `(o)/[slug]` layout + empty states.
**Phase 1 — Core ledger:** Proposals CRUD + items + tax math + approve/deny + comments + audit.
**Phase 2 — Purchases + Receipts + Reimbursements:** Upload+confirm+EXIF strip, manual verify, standalone purchases, auto-create Reimbursement, Mark paid.
**Phase 3 — Intelligence:** Tesseract lazy route, Amazon preview+cache, JS fuzzy matcher + variance UI.
**Phase 4 — Polish:** Admin UI, email notifications only (no SMS), mobile QA, search/filter, CSV export, rate limiting (Upstash or in-memory).

## 6. Non-functionals
- Security: `orgId` scope every query, zod on every input, signed PUT URLs (5min expiry, 10MB limit, allowlist `image/*,application/pdf`), server EXIF strip, invite hash + 7d expiry, `ADMIN_EMAILS` allowlist, rate-limit uploads + auth.
- Privacy: private bucket, signed GET URLs 1h expiry, receipts PII — no public URLs, no logs of image bytes.
- Cost control: zero vendor spend in v0 (no cloud OCR, no paid APIs). Cloud OCR only behind explicit flag + budget cap.
- Testing: Vitest for tax/match/currency-rounding, Playwright for propose→approve→purchase→receipt→reimbursed flow. Block merge on fail.

## 7. Open Questions (updated)
1. Auth providers OK (Google+GitHub+email)? → default yes.
2. Postgres host (Supabase vs Neon)? Use same provider for storage to cut ops.
3. Cloud OCR needed at all, or Tesseract-manual sufficient forever? → default: defer, stay $0.
4. Amazon preview worth keeping given ~always-blocked, or cut to manual-only? → keep best-effort preview, manual primary.
5. Multi-org day 1? → yes, decided.
6. `paidViaNote` free-text OK, or fixed enum `cash|venmo|zelle|other`? → propose enum+note.
