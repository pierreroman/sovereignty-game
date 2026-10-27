# Sovereign Cloud Debunker — the game

A one-myth-per-page quiz for the **Sovereign Cloud Debunker: Separating fact from fiction** session.
Players read a sovereignty myth, vote **Busted**, **Plausible** or **Confirmed**, and get a
**Correct!** / **Incorrect!** pop-up with the verdict, the reasoning, the tradeoff and links to public sources.

React + TypeScript + Vite + Tailwind CSS v4, with a managed Azure Functions API and a private
Azure Blob Storage catalogue. The game is public; publishing edits requires Microsoft tenant sign-in.

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

Open **Manage myths** in the game footer, or visit `/manage`. Sign in with an account in Microsoft
Entra tenant **`72f988bf-86f1-41af-91ab-2d7cd011db47`**. Accounts in that tenant (including guests
allowed by the tenant's policies) can add/remove myths and edit claims, verdicts, qualifiers, risk
areas, summaries, rationale paragraphs, tradeoffs, and source labels/URLs. No invitation or editor
role is required within this tenant.

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

### Authentication and deployment prerequisites

**The paid Azure Static Web Apps Standard tier is required.** Free-tier built-in Microsoft
authentication accepts accounts from any tenant and is intentionally not used. The custom provider
in [`public/staticwebapp.config.json`](public/staticwebapp.config.json) pins the OpenID issuer to
the tenant above; Azure validates the login and issues the session. `PUT /api/myths` requires an
authenticated role at the Azure routing layer and a Microsoft principal in the API. The management
page also checks the tenant claim. Public `GET /api/myths` never requires authentication. The API
principal header is trusted only behind Static Web Apps; do not expose this Functions API directly
or use the development emulator as a public service.

Before deploying, create an app registration in that tenant:

1. In **Microsoft Entra ID > App registrations > New registration**, select **Accounts in this
   organizational directory only**.
2. Add a **Web** redirect URI for each hostname you will use:
   `https://<site-hostname>/.auth/login/aad/callback` (include the default Azure hostname and your
   custom domain if both will be used).
3. Under **Authentication**, enable **ID tokens** for the web registration. Only normal OIDC
   sign-in is needed; do not add Graph application permissions.
4. Create a client secret and record its expiry. Keep its **value**, not the secret ID, out of Git,
   chat, workflow logs, and client-side `VITE_*` settings. Rotate it before expiry.
5. Provide the registration's client ID and secret to the deployment process as environment
   variables `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET`. Infrastructure stores them in SWA application
   settings. Never commit a populated parameter file.

The managed Functions runtime does not support managed identity or Key Vault references. Its
storage connection string is generated by Bicep into server-side SWA settings only; it is never
sent to the browser. The dedicated storage account disables public blob access and requires TLS
1.2/HTTPS. Rotate storage keys and update the application setting together when required.

References: [SWA custom authentication](https://learn.microsoft.com/azure/static-web-apps/authentication-custom)
and [managed API capabilities](https://learn.microsoft.com/azure/static-web-apps/apis-functions).

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
The SWA CLI emulates authentication locally; it does **not** prove real tenant isolation. Include
the configured tenant's `tid` claim when emulating a Microsoft principal for the management UI.
Verify real sign-in on an Azure test deployment before production use.

## Deploy to Azure Static Web Apps (next to the live poll)

The game deploys as its **own** Static Web App in the same tenant and subscription as the poll
(poll.wiredcanuck.com). The poll app is never modified.

```powershell
az login --tenant <the poll's tenant>      # same account you used for the poll
gh auth login
# Set AAD_CLIENT_ID and AAD_CLIENT_SECRET securely in this shell first.
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

After deployment, verify anonymous gameplay, anonymous write rejection, successful sign-in/publish
from the configured tenant, rejection of an account outside that tenant, and persistence after a
page reload. Real Entra sign-in and Azure storage connectivity require the deployed settings and
cannot be verified by local unit tests.

## Project layout

```
.github/workflows/deploy.yml     CI/CD to Azure Static Web Apps
infra/                           Bicep, parameters, provisioning script
public/staticwebapp.config.json  SPA fallback + security headers
api/                            Protected catalogue API + Blob storage + tests
src/App.tsx                      Myth page, voting, result pop-up
src/CatalogueApp.tsx             Load published content before starting the game
src/ManageMyths.tsx              Tenant sign-in and catalogue editor at /manage
src/game/catalogue.ts            Shared catalogue validation
src/game/myths.ts                Initial myth catalogue (seed content)
src/game/pick.ts                 Random / pinned myth selection
src/game/storage.ts              Score and seen-myth tracking
src/game/risk-map.tsx            Four risk areas panel
src/game/verdict-stamp.tsx       Verdict stamp
src/components/ui/               shadcn/ui primitives (button, dialog, sonner)
```
