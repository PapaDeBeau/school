# Beau School Dashboard

A private family dashboard that reads Beau Vizenor's Sequoia Grove Canvas data through the official Canvas API.

## Current dashboard

- critical information: due today, overdue or missing work, and unread Canvas messages
- important upcoming: incomplete work due in the next seven days
- this week: Beau's live-class schedule, with uncertain times clearly marked for confirmation
- courses and current grades
- source links back to Canvas

## Security

- Canvas passwords are never collected.
- The Canvas token is encrypted with AES-GCM before it is written to D1.
- The token is never returned to the browser after connection.
- API responses are marked `no-store`.
- The production Site is owner-only and requires sign-in.

## Local development

```bash
npm install
npm run setup:local
npm run dev
```

The local setup script creates an ignored `.dev.vars` encryption key. Open `http://localhost:3000`, connect Canvas, then open `/dashboard`.

## Deployment

The managed Sites project ID is stored in `.openai/hosting.json`. Future versions are pushed and deployed through the Sites hosting workflow; WHM is needed only for DNS or the one-time `/school` redirect.

Target entry points:

- canonical app: `https://school.beauvizenor.com`
- family shortcut: `https://beauvizenor.com/school`
