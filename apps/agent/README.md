# GENE Local Agent

The local agent is a small Node.js HTTP service that lets the GENE web workspace write the current game to real files on your own computer and serve a disk-backed play URL.

## Run

From the repository root:

```bash
npm install
npm run agent:dev
```

Node 18.17+ is recommended for the standalone agent; Node 20 is recommended for the full Next.js workspace.

On first launch, the agent creates a private token at `~/.gene-agent-token` and prints it to the terminal. In GENE, select **Connect Local Agent**, enter the default URL `http://127.0.0.1:38421`, and paste that token. Keep it private.

## Sync

After GENE has generated source files, select **Sync files**. The agent validates the source and writes it under:

`~/GENE/projects/<project-id>/`

The folder contains the current `game.html`, `game.css`, `game.js`, `game-spec.json`, project manifest, reference files and up to 20 stored version snapshots. Previous on-disk project folders are copied under `~/GENE/history/<project-id>/` before being replaced.

The agent returns a local play URL such as:

`http://127.0.0.1:38421/play/<project-id>`

That page serves the files from disk. It is local to the machine running the agent; it is not a public deployment.

## Configuration

- `GENE_AGENT_PORT`: default `38421`
- `GENE_AGENT_HOST`: default `127.0.0.1` (loopback only)
- `GENE_WORKSPACE`: default `~/GENE`; projects and history are stored below it
- `GENE_LOCAL_TOKEN`: optional fixed token. Otherwise a random token is written to `~/.gene-agent-token`
- `GENE_ALLOWED_ORIGINS`: comma-separated web origins allowed to connect. Default: `http://localhost:3000,http://127.0.0.1:3000`

If connecting from a deployed website, explicitly add that site's exact origin to `GENE_ALLOWED_ORIGINS`. Browser secure-origin policies can vary for an HTTPS website connecting to a loopback HTTP service; local development at `http://localhost:3000` is the expected default.

## Security notes

- The server binds to loopback by default; it is not exposed to the LAN.
- Read/write/test API routes require `X-GENE-TOKEN`.
- Project IDs and file paths are validated; traversal and absolute paths are rejected.
- The agent writes only inside its configured workspace.
- Game source is checked for syntax, required files, render/input signatures, budget declarations and external runtime dependencies before sync.
- The source validator is not a substitute for a full gameplay test. The agent never claims that it has verified every gameplay path.
- Generated code is only served by the local game endpoint; it is not executed by the agent process.
