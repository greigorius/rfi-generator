# RFI Generator

A construction RFI (Request for Information) generator with Notion database integration and local draft queue.

## Features

- Structured RFI form mapped to your Notion RFI database schema
- Local draft queue — hold multiple RFIs before filing
- Export as PDF (print-ready) or PNG
- Screen capture + image/sketch upload support
- Completeness score to ensure all key fields are filled
- Direct link to Notion RFI database for manual filing

## Stack

- React 18 + Vite
- No external UI libraries — pure CSS-in-JS
- IBM Plex Mono typeface

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/` — ready for Netlify.

## Deployment

### Netlify (recommended)

1. Push to GitHub (`greigorius/rfi-generator`)
2. Connect repo in Netlify dashboard
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

Or drag-and-drop the `dist/` folder into Netlify's manual deploy.

### Notion Database

The app links to:
`https://www.notion.so/22d210e4582e80189f63f2cee93be4b3`

RFI fields mapped from your database schema:
- RFI Number (number)
- RFI Description (title)
- RFI Status: Raise / Open / Close Out / Closed
- TBC by: Structural Engineer / Design Consultant / Main Contractor / M&E / Architect
- Date Raised (date)
- Source (manual tag — not a Notion property)
- Urgency (manual tag — not a Notion property)
