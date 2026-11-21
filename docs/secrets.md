# Secrets: API keys, passwords and tokens

> **Scope:** the code-level guards (`Secret`, `redact()`, the config checks) cover `services/api`, the only API under ADR-0003. Code from PR #2/#3 (`apps/api`, `apps/server`) is not covered until it is ported into `services/api` (ADR-0003 steps A–D). The repo-level guards (scanner, gitleaks, `.gitignore`) cover every file.

**Rule:** a secret lives in exactly one place, the environment's secret store. It never appears in the repo (not even as a mock), in the mobile app, in logs, or in an error response.

## Where each secret lives

| Secret | Used by | Stored in | Required |
|---|---|---|---|
| `DATABASE_URL` (contains the DB password) | API | GitHub environment secret `ENV_FILE` (staging, preprod, production) | staging, preprod, prod |
| `REDIS_URL` (contains the Redis password) | API | `ENV_FILE` | staging, preprod, prod |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | containerised data stores | `ENV_FILE` (staging, preprod) | staging, preprod |
| `HERE_API_KEY` | API → HERE Routing v8 (ADR-0001) | `ENV_FILE`; repo secret `HERE_API_KEY` for the live routing-safety suite | once routing ships |
| `STRIPE_SECRET_KEY` | API → Stripe | `ENV_FILE`: test key everywhere except prod | once billing ships |
| `STRIPE_WEBHOOK_SECRET` | API (verifies Stripe webhooks) | `ENV_FILE` | once billing ships |
| `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER` | deploy workflow | GitHub environment secrets | deploys |

The deploy workflow writes `ENV_FILE` to `deploy/env/<env>.env` on the host with `umask 077`. That file is gitignored and is never baked into the image.

## How the API handles secrets (`services/api/src/secrets.ts`)

- **Environment only:** every secret is read from `NAME`, or from a file named in `NAME_FILE` (Docker and Kubernetes secrets). Setting both is an error.
- **Secrets redact themselves:** they are held as `Secret` objects that print as `[redacted:NAME]` through `console.log`, `JSON.stringify`, template strings and `util.inspect`. Only the code that sends the value calls `.reveal()`.
- **No silent "development" in production:** the runtime image sets `NODE_ENV=production`, and the API **refuses to start** there unless `APP_ENV` is `staging`, `preprod` or `prod`. A missing `APP_ENV` never falls back to development (which would skip every check below).
- **No placeholders when deployed:** in staging, preprod and prod the API **refuses to start** if a secret, or a URL's password, is still a placeholder (`<postgres-password>`, `change-me`, `your-key`, `xxxx`, …). Error messages name the variable, never the value.
- **Stripe mode must match the key:** `STRIPE_MODE=live` is only allowed in prod and requires a `sk_live_`/`rk_live_` key. Everywhere else needs a test key.
- **Safe errors:** clients get `{"error": "Something went wrong."}`. Server logs keep the detail with every known secret, URL credential, `?apiKey=`-style parameter and bearer token redacted.

## Never put a secret in the mobile app

Anything in an `EXPO_PUBLIC_*` variable, or anywhere in the app code, is compiled into the app, and anyone can extract it from the installed app. The app only knows the API's URL (`EXPO_PUBLIC_API_URL`). Calls that need a key (HERE, Stripe) go through the API. CI fails on any secret-named public variable (`EXPO_PUBLIC_*KEY*`, `NEXT_PUBLIC_*SECRET*`, …).

## Mocks and stubs in tests

Never write a key-shaped literal in a test, not even `"test-key"` or `"k"`. Generate one at runtime:

```ts
import { fakeSecret, fakeStripeKey, fakeUrl } from "./helpers/fakeSecrets.js";

const hereKey = fakeSecret();               // random hex, new every run
const stripe = fakeStripeKey("test");       // sk_test_<random>
const db = fakeUrl("postgres");             // postgres://app:<random>@db.internal:5432/truckbeez
```

Mock keys can't then be confused with real ones, reused, or flagged by scanners. If a line genuinely needs a literal (for example a public test vector), end it with `// secrets-scan: allow (<reason>)` (or `# secrets-scan: allow (<reason>)`). The marker only counts as the **last thing on the line** and **with a reason**; CI prints how many lines use it, and changes to the scanner need the owner's review (`.github/CODEOWNERS`).

## Automated guards

| Guard | When | What it blocks |
|---|---|---|
| `.gitignore` | every `git add` | `.env`, `.env.*`, `*.env`, `*.env.*` (e.g. `prod.env.bak`), `.envrc`, Terraform `*.tfvars` and state, keys and certificates (`*.pem`, `*.p12`, `*.jks`, `*.keystore`), Google service-account JSON, Expo/EAS credentials |
| `.githooks/pre-commit` | every commit, **once enabled** (below); `git commit --no-verify` skips it, so CI is the real gate | runs `scripts/check-secrets.mjs --staged`, plus `gitleaks protect` if installed |
| `secret-scan` workflow | every PR, every push to `main`, weekly | scanner self-test, `check-secrets.mjs` on all tracked files (any text file: code, Dockerfile, Terraform, `.properties`, docs), gitleaks across **the full git history**. Actions are SHA-pinned; gitleaks runs with no network, no token and a read-only checkout. Make it a **required status check** on `main`. |
| API config | every start in a deployed env | a missing `APP_ENV` under `NODE_ENV=production`, placeholders, a Stripe key in the wrong mode, missing DB/Redis |

Turn on the pre-commit hook once per clone:

```bash
git config core.hooksPath .githooks
```

Findings show `file:line [rule]` and **never the value**, so CI logs can't leak what they found.

## Local development

```bash
cp apps/server/.env.example apps/server/.env   # gitignored; add your own dev keys
```

Use **your own** HERE freemium key and a Stripe **test** key for development. Never use the production keys locally.

## If a secret leaks

1. **Rotate it first**, in the provider's console (HERE, Stripe, database). Deleting it from git does not make it safe: it stays in history, forks and caches.
2. Update the value in the GitHub environment secret `ENV_FILE` and redeploy.
3. Check the provider's usage logs for activity you don't recognise.
4. Only then remove it from history if needed (`git filter-repo`), and open a Jira ticket with what leaked, when, and how it was caught.
