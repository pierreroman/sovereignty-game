# Sovereign Cloud Debunker — the game

A one-myth-per-page quiz for the **Sovereign Cloud Debunker: Separating fact from fiction** session.
Players read a sovereignty myth, vote **Busted**, **Plausible** or **Confirmed**, and get a
**Correct!** / **Incorrect!** pop-up with the verdict, the reasoning, the tradeoff and links to public sources.

React + TypeScript + Vite + Tailwind CSS v4, with a managed Azure Functions API and a private
Azure Blob Storage catalogue. The game is public; publishing edits requires the shared editor password.

## How it plays

- **Each page load shows a random myth.** Refreshing brings up a different one; the game works through
  all myths before repeating (tracked in the browser's local storage).
- **Pin a myth for a slide:** `?myth=3` or `?myth=residency` always opens that myth, so each slide can
  have its own QR code. **Next myth** from a pinned page goes back to random.
- **Score** in the header counts correct answers on this device; the reset button clears it.
- Votes are not sent anywhere. The game doesn't feed the presenter's live poll results.

| # | Myth | Verdict |
|---|------|---------|
| 1 | Digital sovereignty requires a local cloud provider. | Busted (with an asterisk) |
| 2 | Data residency alone addresses sovereignty. | Busted |
| 3 | Disconnected is always more secure. | Busted |
| 4 | Sovereign means giving up modern AI. | Plausible (and shrinking fast) |
| 5 | The provider's engineers can access my data whenever they like. | Busted |
| 6 | If my provider is headquartered abroad, its home government can get my data. | Plausible |

## Managing myths

Open **Manage myths** in the game footer, or visit `/manage`. Sign in with the shared editor
password to add/remove myths and edit claims, verdicts, qualifiers, risk areas, summaries, rationale
paragraphs, tradeoffs, and source labels/URLs. Microsoft Entra is not used. Anyone who knows the
password can edit; there is no longer a Microsoft-tenant identity restriction.

Select **Publish changes** to save the complete catalogue. Players see updates on their next page
load; a game already in progress keeps its loaded catalogue. Keep existing IDs and display numbers
to preserve slide links and device history. At least one myth, rationale paragraph, risk area, and
source must remain. Source URLs must use HTTP or HTTPS. The limit is 100 myths and 512 KiB.

Changes are stored in the private `myths/catalogue.json` blob, not in Git or browser storage.
[`src/game/myths.ts`](src/game/myths.ts) supplies the initial catalogue only while that blob does
not exist. Once published, deployments do not overwrite the saved catalogue. Storage errors are
shown explicitly rather than silently reverting to initial content. Blob versioning and seven-day
soft delete are enabled for recovery through Azure Storage.

Publishing uses ETag conditional writes. If another editor publishes first, your publish fails
without overwriting their work. Your unsaved draft remains on the page; copy any changes you want
to keep before selecting **Reload catalogue**. Leaving the page with unpublished edits triggers a
browser warning. Drafts are not persisted across browser restarts.

### Password setup and authentication

The setup script stores a salted **PBKDF2-SHA256** password hash (600,000 iterations, 32-byte random
salt, 32-byte derived key) in `EDITOR_PASSWORD_HASH`, plus an independent random signing key in
`EDITOR_SESSION_SECRET`. Neither belongs in Git, chat, logs, `VITE_*` variables, or browser storage.
The plaintext password is sent over HTTPS only during sign-in and is never persisted.

Use PowerShell 7.2+ and Azure CLI to configure the existing Azure game. Password setup does
**not** require Node.js, npm, or an API build:

When upgrading an older scrypt-only deployment, deploy the updated API before running this
script so the server can recognize the new PBKDF2 hash format.

```powershell
.\infra\set-editor-password.ps1 `
  -Subscription dfcf7181-677b-4513-932b-75a4642ab752 `
  -ResourceGroup rg-presentation-poll `
  -Name sovereignty-game
```

The script uses masked input and accepts a 16-256 character passphrase. Invalid lengths or mismatched
confirmation show a reminder of the requirements and prompt for a new passphrase without changing
settings. Press Ctrl+C to cancel. Once a valid passphrase is confirmed, it generates the
hash and signing key locally, and sets only those two Azure application settings. It does not print
credentials, write credential files, or change the catalogue/storage connection. Retain the
password in your password manager and share it only with trusted editors. The API also accepts
previously configured scrypt hashes (`N=32768`, `r=8`, `p=3`) for compatibility.

For a new infrastructure deployment, run `.\infra\set-editor-password.ps1 -GenerateOnly` first.
It sets the two credential environment variables in the current PowerShell process; then run the
deployment script from that same shell. Clear the variables when finished:

```powershell
Remove-Item Env:\EDITOR_PASSWORD_HASH, Env:\EDITOR_SESSION_SECRET
```

`POST /api/session` verifies the password and creates an eight-hour signed session in a
`Secure`, `HttpOnly`, `SameSite=Strict`, `__Host-` cookie. JavaScript cannot read this cookie.
`GET /api/session` checks it, and `DELETE /api/session` signs out by clearing this browser's cookie.
`PUT /api/myths` validates the cookie on the server; SWA identity headers/roles cannot grant access.
API routes are reachable without a SWA role because this application now owns authorization.
Public `GET /api/myths` never needs credentials. Missing or invalid password settings fail closed
for editing without breaking public gameplay. The obsolete `/.auth/*` endpoints return 404.

Login attempts are limited to **10 per fixed 15-minute window across the entire app**, including
successful logins, using conditional writes to the private `editor-login-attempts.json` blob.
This survives restarts and multiple instances. A busy/attacked login can temporarily block all
editors until the next window; this is a deliberately small, shared-editor setup, not an
enterprise identity system with individual accounts, MFA, or per-user audit trails.

Run the password setup script again to rotate credentials and invalidate **all** existing sessions.
Normal sign-out clears only this browser's cookie; a copied session token remains valid until
expiry or credential rotation. If a session expires during editing, sign in again to recover the
in-memory draft without discarding it.

Password authentication does not require the paid Standard tier, but infrastructure continues to
use the existing Standard tier. No automatic billing-tier change is made.

The managed Functions runtime does not support managed identity or Key Vault references. Its
storage connection string is generated by Bicep into server-side SWA settings only; it is never
sent to the browser. The dedicated storage account disables public blob access and requires TLS
1.2/HTTPS. Rotate storage keys and update the application setting together when required.

Reference: [managed API capabilities](https://learn.microsoft.com/azure/static-web-apps/apis-functions).

> Content review: verdicts and rationale follow the session plan as of Oct 20, 2026. The plan flags
> Myth 6 and the Copilot in-country wording for CELA/legal confirmation, and statuses (GA / preview)
> should be re-checked against the Ignite Book of News before the session.

## Run locally

```bash
npm install
npm --prefix api install
npm run dev        # http://localhost:5173; initial catalogue, read-only
npm test           # compile API, run validation/auth/conflict/Blob SDK tests
npm run build      # type-check + production build into dist/
npm --prefix api run build
```

Use Node.js 22.12+ (the hosted API uses Node 22).

Vite serves the seed catalogue and reports no signed-in user; it never accepts writes or simulates
authenticated editing. For local API editing tests, use Azure Functions Core Tools v4 and the Azure
Static Web Apps CLI with a **separate development storage account**, a private `myths` container,
and an ignored `api/local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "MYTHS_STORAGE_CONNECTION_STRING": "<development account connection string>"
  }
}
```

Run Azurite for local Functions host storage, then `npm --prefix api run build` and
`swa start http://localhost:5173 --api-location api --swa-config-location public` alongside Vite.
Run `.\infra\set-editor-password.ps1 -GenerateOnly` and start the emulator from that same shell so
the Functions process inherits the two authentication settings. Do not use emulated SWA identity
roles: the real password/session API enforces editing. Test using HTTPS, or a browser that permits
Secure cookies on localhost. Verify real sign-in on an Azure test deployment before production use.

## Deploy to Azure Static Web Apps (next to the live poll)

The game deploys as its **own** Static Web App in the same tenant and subscription as the poll
(poll.wiredcanuck.com). The poll app is never modified.

```powershell
az login --tenant <the poll's tenant>      # same account you used for the poll
gh auth login
.\infra\set-editor-password.ps1 -GenerateOnly
./infra/deploy.ps1 -Repo pierreroman/sovereignty-game
```

The script finds the poll's Static Web App by its domain (Azure Resource Graph), switches to that
subscription, and deploys [`infra/main.bicep`](infra/main.bicep) (Static Web App `sovereignty-game`,
Standard tier), private storage, and server-side settings into the poll's resource group and region.
This adds Standard-tier and storage charges. It then stores the deployment token as the
`AZURE_STATIC_WEB_APPS_API_TOKEN` Actions secret and starts the first workflow run.

| Parameter | Use |
|---|---|
| `-ResourceGroup rg-sovereignty-game` | Same subscription as the poll, but its own resource group |
| `-CustomDomain game.wiredcanuck.com` | Adds a custom domain (create the CNAME to the app's default hostname first) |
| `-Subscription <id> -ResourceGroup <rg>` | Skip discovery and target explicitly |
| `-Name <name>` | Static Web App name (default `sovereignty-game`) |

Every push to `main` then runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
install, test, type-check, build, upload the frontend and compiled API. Pull requests run validation
only, so preview deployments cannot publish into the production catalogue.

### Deployment troubleshooting

- **"Unable to load myths" / `GET /api/myths` returns 503:** application deployment alone does
  not provision storage. Check that the game has a nonempty `MYTHS_STORAGE_CONNECTION_STRING`
  application setting pointing to its dedicated storage account, and that the private `myths`
  container exists. The poll's storage must not be reused or modified. A missing `catalogue.json`
  blob is normal before the first publish; a missing connection string or container is not.
  The storage module can be deployed independently of password setup:

  ```powershell
  az deployment group create --subscription <subscription-id> `
    --resource-group rg-presentation-poll `
    --template-file .\infra\catalogue-storage.bicep `
    --parameters name=sovereignty-game location=eastus2 `
    --query properties.outputs.storageAccountName.value --output tsv
  ```

  Configure that account's connection string as the game's server-side
  `MYTHS_STORAGE_CONNECTION_STRING` setting without displaying or committing its value. This
  restores public catalogue reads independently of editor password setup.
  Verify that `GET /api/myths` returns
  HTTP 200 with a nonempty `myths` array and `version`, and that anonymous `PUT` returns HTTP 401.
- **Editor sign-in returns 503:** configure `EDITOR_PASSWORD_HASH` and `EDITOR_SESSION_SECRET`
  using the masked setup script, and verify catalogue storage is available for the login limiter.
  A 429 means the shared login window is exhausted; wait for its `Retry-After` interval. Old Entra
  application settings are no longer used and can be removed after deploying this version.
- **Unexpected input `skip_api_build`:** the workflow pins a verified revision of the official
  deployment action that declares this input. Both frontend and API are built explicitly before
  upload. Keep the action revision compatible with these inputs when updating it; do not simply
  enable an isolated API source build, because its shared TypeScript sources live outside the
  API directory.

After deployment, verify anonymous gameplay/write rejection, incorrect-password rejection,
successful password sign-in/publish, persistence after reload, and sign-out. Verify that missing,
expired or tampered session cookies cannot publish. Live sign-in and Azure storage connectivity
require the deployed settings and cannot be verified by local unit tests.

## Project layout

```
.github/workflows/deploy.yml     CI/CD to Azure Static Web Apps
infra/                           Bicep, parameters, provisioning script
public/staticwebapp.config.json  SPA fallback + security headers
api/                            Protected catalogue API + Blob storage + tests
src/App.tsx                      Myth page, voting, result pop-up
src/CatalogueApp.tsx             Load published content before starting the game
src/ManageMyths.tsx              Password sign-in and catalogue editor at /manage
src/game/catalogue.ts            Shared catalogue validation
src/game/myths.ts                Initial myth catalogue (seed content)
src/game/pick.ts                 Random / pinned myth selection
src/game/storage.ts              Score and seen-myth tracking
src/game/risk-map.tsx            Four risk areas panel
src/game/verdict-stamp.tsx       Verdict stamp
src/components/ui/               shadcn/ui primitives (button, dialog, sonner)
```
