# Sovereign Cloud Debunker — the game

A one-myth-per-page quiz for the **Sovereign Cloud Debunker: Separating fact from fiction** session.
Players read a sovereignty myth, vote **Busted**, **Plausible** or **Confirmed**, and get a
**Correct!** / **Incorrect!** pop-up with the verdict, the reasoning, the tradeoff and links to public sources.

Same look and feel as the Live Session Poll app: React + TypeScript + Vite + Tailwind CSS v4, no backend.

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

## Adding or editing myths

All content is in [`src/game/myths.ts`](src/game/myths.ts). Append an entry to `MYTHS` with a unique `id`,
a display `number`, the `claim`, the `verdict` (`busted` | `plausible` | `confirmed`), the risk `areas` it
tests (`data`, `keys`, `operations`, `law`), a one-line `summary`, `rationale` paragraphs, the `tradeoff`
and public `sources`. The lightning-round myths from the session plan are good next candidates.

> Content review: verdicts and rationale follow the session plan as of Oct 20, 2026. The plan flags
> Myth 6 and the Copilot in-country wording for CELA/legal confirmation, and statuses (GA / preview)
> should be re-checked against the Ignite Book of News before the session.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Requires Node.js 20.19+ or 22.12+.

## Deploy to Azure Static Web Apps (next to the live poll)

The game deploys as its **own** Static Web App in the same tenant and subscription as the poll
(poll.wiredcanuck.com). The poll app is never modified.

```powershell
az login --tenant <the poll's tenant>      # same account you used for the poll
gh auth login
./infra/deploy.ps1 -Repo pierreroman/sovereignty-game
```

The script finds the poll's Static Web App by its domain (Azure Resource Graph), switches to that
subscription, and deploys [`infra/main.bicep`](infra/main.bicep) (Static Web App `sovereignty-game`,
Free tier) into the poll's resource group and region. It then stores the deployment token as the
`AZURE_STATIC_WEB_APPS_API_TOKEN` Actions secret and starts the first workflow run.

| Parameter | Use |
|---|---|
| `-ResourceGroup rg-sovereignty-game` | Same subscription as the poll, but its own resource group |
| `-CustomDomain game.wiredcanuck.com` | Adds a custom domain (create the CNAME to the app's default hostname first) |
| `-Subscription <id> -ResourceGroup <rg>` | Skip discovery and target explicitly |
| `-Name <name>` | Static Web App name (default `sovereignty-game`) |

Every push to `main` then runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
install, type-check, build, upload `dist/`.

## Project layout

```
.github/workflows/deploy.yml     CI/CD to Azure Static Web Apps
infra/                           Bicep, parameters, provisioning script
public/staticwebapp.config.json  SPA fallback + security headers
src/App.tsx                      Myth page, voting, result pop-up
src/game/myths.ts                Myth catalogue (content)
src/game/pick.ts                 Random / pinned myth selection
src/game/storage.ts              Score and seen-myth tracking
src/game/risk-map.tsx            Four risk areas panel
src/game/verdict-stamp.tsx       Verdict stamp
src/components/ui/               shadcn/ui primitives (button, dialog, sonner)
```
