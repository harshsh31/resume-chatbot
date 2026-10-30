# Resume Chatbot: Design

## Goal

A public chat assistant that answers recruiter questions about Harsh's experience, projects and skills. It is a resume showcase, so it should be easy to try and hard to abuse.

## Approach

The whole CV plus a few project write-ups go into the system prompt, and Claude answers from them. The corpus is a few thousand tokens, so there is no vector DB. If the corpus grows (blog posts, READMEs), upgrade to real RAG.

## Stack

Next.js on Vercel. One repo holds the chat UI and a streaming API route that calls the Claude API (Vercel AI SDK or the Anthropic SDK directly).

## Components

- `app/page.tsx`: streaming chat UI, suggested starter questions, mobile-friendly layout.
- `app/api/chat/route.ts`: takes message history, streams the Claude reply.
- `content/about.md`: CV and project notes. Single source of truth, read into the system prompt.
- `lib/prompt.ts`: system prompt. Answer only from `about.md`. If the answer isn't there, say so and point to Harsh's contact details. Professional tone.

## Public-endpoint safeguards

- Per-IP rate limit.
- Caps on message length and conversation length.
- Hard spend limit set in the Anthropic console.
- API key only in Vercel env vars, never in the client bundle.

## Showcase extras (in scope)

- `evals/`: a script with about 15 test questions, including "invent a fake job" hallucination traps, run against the route.
- README with an architecture diagram and a live demo link.

## Testing

The eval script is the only real test. The route and UI are thin.

## Out of scope

Auth, database, conversation persistence, vector search. Add only on request.

## Decisions

- Project path: `~/projects/resume-chatbot`
- Hosting: Vercel free tier
- Upgrade path: RAG over a vector store if the corpus outgrows the system prompt
