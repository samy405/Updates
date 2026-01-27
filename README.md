# CS Updates

A modern, clean static website for displaying procedural and operational updates extracted from a Word document.

## Overview

This project reads a single Word document (`CSupdates.docx`) that contains Slack messages organized by date, extracts only real procedural/operational updates, categorizes them, and displays them in a structured UI. The site supports versioning (superseded updates) and discussion threads via GitHub Discussions (giscus).

## Features

- **Automatic Update Extraction**: Intelligently identifies procedural updates from Slack messages
- **Categorization**: Organizes updates into 8 predefined categories
- **Versioning**: Tracks when updates supersede previous ones
- **Discussion Threads**: Each update has a dedicated discussion page via giscus
- **Clean UI**: Fountain-inspired design with calm, premium feel
- **Static Site**: No backend required, deploys easily to Vercel

## Tech Stack

- React 19 + TypeScript
- Vite
- React Router
- Mammoth (DOCX parsing)
- Giscus (GitHub Discussions integration)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Giscus** (for discussion threads):
   - Go to [giscus.app](https://giscus.app) and configure it for your GitHub repo
   - Update the giscus configuration in `src/pages/UpdatePage.tsx`:
     - Replace `YOUR_REPO_OWNER/YOUR_REPO_NAME` with your actual repo
     - Replace `YOUR_REPO_ID` with your repo ID
     - Replace `YOUR_CATEGORY_ID` with your category ID
   - Ensure GitHub Discussions are enabled in your repository settings

3. **Place your Word document:**
   - Ensure `CSupdates.docx` is in the project root
   - The document should have date headings (e.g., "January 28, 2026") followed by Slack messages

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Weekly Workflow

1. **Add new content to Word document:**
   - Open `CSupdates.docx`
   - Add a new date heading (e.g., "February 4, 2026")
   - Paste new Slack messages under that date heading
   - Save the document

2. **Run ingestion:**
   ```bash
   npm run ingest
   ```
   This script will:
   - Read `CSupdates.docx`
   - Extract only new date sections (skips already processed dates)
   - Identify updates based on defined criteria
   - Categorize updates
   - Detect superseded updates
   - Update `data/updates.json`

3. **Review and commit:**
   - Review the extracted updates in `data/updates.json`
   - Manually adjust `needsAnswer` flags if needed
   - Commit changes:
     ```bash
     git add CSupdates.docx data/updates.json
     git commit -m "Add updates for [date]"
     git push
     ```

4. **Deploy:**
   - Vercel will automatically deploy on push (if configured)
   - Or manually deploy: `npm run build` and deploy the `dist` folder

## Update Extraction Rules

An update is extracted if it includes at least one of:
- A new process, policy, or SOP
- A change/override to an existing process ("effective immediately", "going forward", "we no longer", "instead", "updated process")
- A new error/incident and the new fix/steps
- Operational changes (labs, pharmacy, billing, tooling, workflows)
- Timing rollouts or deprecations

**Author Priority:**
- Always evaluate messages from: Jessica Booker, Lindsay Burden, Camryn Burden
- Include messages from other authors only if they clearly relay an official update

**Categories:**
- Pharmacy
- Billing
- Labs
- Operations
- Internal Tools / Systems
- Contractor / Staffing
- Compliance / Clinical
- Miscellaneous

## Data Model

Each update in `data/updates.json` contains:
- `id`: Stable unique slug
- `datePosted`: ISO date string
- `author`: Author name or "Unknown"
- `category`: One of the 8 categories
- `title`: Short title
- `body`: Clean summary + key steps
- `sourceExcerpt`: Short excerpt from Slack paste
- `supersedesIds`: Array of update IDs this replaces
- `supersededById`: ID of update that supersedes this (null if active)
- `status`: "active" or "superseded"
- `needsAnswer`: Boolean flag (manually toggleable)

## Project Structure

```
├── CSupdates.docx          # Input Word document
├── data/
│   └── updates.json        # Extracted updates (generated)
├── scripts/
│   └── ingestDocx.ts       # Ingestion script
├── src/
│   ├── components/
│   │   ├── UpdateCard.tsx  # Update card component
│   │   └── UpdateCard.css
│   ├── pages/
│   │   ├── Home.tsx        # Homepage with categories
│   │   ├── Home.css
│   │   ├── UpdatePage.tsx  # Individual update page
│   │   └── UpdatePage.css
│   ├── types.ts            # TypeScript types
│   ├── App.tsx             # Router setup
│   └── main.tsx            # Entry point
└── package.json
```

## Deployment

This is a static site that can be deployed to:
- **Vercel** (recommended): Connect your GitHub repo and it will auto-deploy
- **Netlify**: Connect repo or deploy `dist` folder
- **GitHub Pages**: Deploy `dist` folder to `gh-pages` branch
- Any static hosting service

Ensure `data/updates.json` is included in your build (it should be by default).

## Notes

- The ingestion script only processes new date sections to avoid rewriting existing updates
- Superseded updates are automatically detected based on keyword matching (can be improved)
- The `needsAnswer` flag must be manually toggled in `data/updates.json`
- Giscus requires GitHub Discussions to be enabled in your repository

## License

Internal project - all rights reserved.
