# Optional Google Custom Search for GENE Research

GENE's research route can use Google Programmable Search Engine results in addition to Wikipedia, Wikimedia Commons, and the Poly Haven catalog. This integration is optional and fails open: if the credentials are absent or the API is unavailable, the route continues with the public sources that are reachable and reports the missing source instead of pretending Google was searched.

## Environment variables

Configure these as server-side Vercel environment variables for the GENE web project:

- `GOOGLE_CSE_API_KEY`: a Google Custom Search JSON API key.
- `GOOGLE_CSE_ID`: the Programmable Search Engine ID (`cx`) configured for the sites/search scope you want.

Do not expose either variable through a `NEXT_PUBLIC_*` name or return it to the browser. Keep API usage and billing/quota limits in mind.

## Behavior

- Uses the official `https://www.googleapis.com/customsearch/v1` endpoint with a bounded query and at most five results.
- Uses a short timeout and records a clear unavailable reason for HTTP errors or timeouts.
- Accepts only HTTPS result URLs and non-empty titles/snippets.
- Ranks results by topic-term overlap and exact-phrase relevance before adding them to builder research notes.
- Includes a source count and relevance score for each result; a relevance score is a heuristic, not a claim that the source is authoritative or correct.
- Does not treat a search result snippet as verified fact. GENE should open/verify primary documentation where possible and distinguish evidence from assumptions.

The research route remains usable without these variables. Google integration is not considered configured or tested until real credentials are supplied and a successful live search is observed.
