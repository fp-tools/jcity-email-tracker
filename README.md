# jcity GA4 Email Tracker

Node.js, Express, React, SQLite, and GA4 Measurement Protocol tracking for jcity HTML email campaigns.

## Features

- Open tracking pixel: `GET /pixel/:campaignId/:emailId`
- Click tracking redirect: `GET /click/:campaignId/:emailId/:linkId?url=...`
- Conversion tracking: `POST /api/conversions` or `GET /conversion/:campaignId/:emailId`
- Campaign dashboard with unique open, click, and conversion rates
- GA4 Measurement Protocol v2 server-side dispatch
- SQLite storage through `better-sqlite3`
- Railway-ready single-service deployment

GA4 calls are dispatched with `setImmediate()` and are not awaited by the pixel or redirect response.

## Local Setup

```bash
cd email-tracker
cp .env.example .env
npm install
npm run build
npm start
```

Open `http://localhost:3000`.

For frontend development:

```bash
npm run dev:frontend
```

Set `VITE_API_BASE=http://localhost:3000` when running Vite separately.

## Environment Variables

| Name | Purpose |
| --- | --- |
| `PORT` | Express port. Railway injects this automatically. |
| `DATA_DIR` | Directory for SQLite data. Defaults to `./data`. |
| `DATABASE_PATH` | Full SQLite file path. Defaults to `DATA_DIR/email-tracker.sqlite`. |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins. Omit to allow all origins. |
| `APPEND_TRACKING_PARAMS` | Set to `false` to stop click redirects from appending `jcity_campaign_id`, `jcity_email_id`, and `jcity_link_id`. |
| `GA4_MEASUREMENT_ID` | Optional environment override for dashboard GA4 config. |
| `GA4_API_SECRET` | Optional environment override for dashboard GA4 config. |
| `VITE_API_BASE` | Frontend API base for separate frontend/backend development. |

## API

### Create Campaign

```http
POST /api/campaigns
Content-Type: application/json

{
  "name": "June newsletter",
  "subject": "New campaign",
  "jcity_id": "JCITY-2026-06",
  "total_sent": 12000
}
```

### List Campaigns

```http
GET /api/campaigns
```

### Campaign Stats

```http
GET /api/campaigns/:id/stats
```

Rates are calculated as:

- Open rate: `unique opens / total_sent`
- Click rate: `unique clicks / total_sent`
- Conversion rate: `unique conversions / total_sent`

### GA4 Config

```http
POST /api/config/ga4
Content-Type: application/json

{
  "measurement_id": "G-XXXXXXXXXX",
  "api_secret": "your_secret"
}
```

## jcity Snippets

The campaign detail page generates ready-to-paste snippets. Example:

```html
<!-- Open Tracking Pixel (paste before </body>) -->
<img src="https://your-domain.com/pixel/CAMPAIGN_ID/{{EMAIL_ID}}" width="1" height="1" alt="" style="display:none">

<!-- Tracked Link Example -->
<a href="https://your-domain.com/click/CAMPAIGN_ID/{{EMAIL_ID}}/main-cta?url=https%3A%2F%2Fyour-site.com%2Flp">Click Here</a>
```

Conversion example:

```html
<script>
fetch("https://your-domain.com/api/conversions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ campaign_id: "CAMPAIGN_ID", email_id: "{{EMAIL_ID}}" })
});
</script>
```

## Deployment Notes

Railway is the recommended target because the app uses SQLite. Configure a persistent volume and set `DATA_DIR` to that mounted path.

If deploying to a serverless platform, use a persistent database instead of local SQLite because serverless filesystems are typically ephemeral.
