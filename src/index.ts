/**
 * Host half of dsh-rule-manager.
 *
 * Manages rule files as one .md file per rule under a `rules/` directory at
 * global (DSH_HOME) and per-project (workspace) scope, then AGGREGATES every
 * rule file into the AGENTS.md that DSH's built-in agent-instructions loader
 * injects into the model prompt (global -> DSH_HOME/AGENTS.md, project ->
 * <workspace>/AGENTS.md). So rule editing is per-file (maintainable) while
 * injection stays on the native AGENTS.md path, scoped by session cwd.
 *
 * HTTP routes (community-plugin pattern; browser half calls with fetch):
 *   POST /rules/overview  -> { global:{dir,rules:[{name,path}]}, projects:[...] }
 *   POST /rules/read      -> { ok, content }
 *   POST /rules/write     -> { ok }   (creates/updates a rule file, then re-aggregates)
 *   POST /rules/delete    -> { ok }   (deletes a rule file, then re-aggregates)
 *   POST /rules/projects  -> { projects:[{id,name,path}] }
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

interface FsLike {
  resolve(path: string, opts?: { cwd?: string }): Promise<unknown>
  stat(target: unknown): Promise<{ type: string } | undefined>
  listDir(target: unknown): Promise<Array<{ name: string; type: string; target: unknown }>>
  processPath(target: unknown): string
  readText(target: unknown): Promise<string>
  writeText(
    target: unknown,
    content: string,
    expected?: unknown,
    signal?: unknown,
    policy?: unknown,
  ): Promise<{ operation: 'create' | 'update' }>
}
interface WorkspaceLike {
  list(): Array<{ id: string; title?: string; name?: string; cwd?: string; path?: string }>
}
interface ShellLike {
  resolve(req: { command: string; workdir: string; timeoutMs: number; sandboxPolicy?: unknown }): unknown
  run(spec: unknown): Promise<{ exitCode: number | null; stderr?: string }>
}

const BODY_CAP_BYTES = 1 << 20

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const part = chunk as Buffer
    total += part.length
    if (total > BODY_CAP_BYTES) {
      req.destroy()
      return null
    }
    chunks.push(part)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function field(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/** Rule-file store: read/write/list/delete individual rule files, then aggregate into AGENTS.md. */
class RuleStore {
  constructor(
    private readonly fs: FsLike,
    private readonly dshHome: string,
    private readonly ws: WorkspaceLike | undefined,
  ) {}

  private async dirTarget(dirPath: string): Promise<unknown | undefined> {
    try {
      return await this.fs.resolve(dirPath)
    } catch {
      return undefined
    }
  }

  /** List *.md rule files in a rules/ directory; [] when absent/empty. */
  async listRuleFiles(rulesDir: string): Promise<Array<{ name: string; path: string }>> {
    const target = await this.dirTarget(rulesDir)
    if (target === undefined) return []
    const info = await this.fs.stat(target).catch(() => undefined)
    if (info === undefined || info.type !== 'directory') return []
    const entries = await this.fs.listDir(target).catch(() => [])
    return entries
      .filter((e) => e.type === 'file' && /\.md$/i.test(e.name))
      .map((e) => ({ name: e.name, path: this.fs.processPath(e.target) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private workspaceDir(w: { cwd?: string; path?: string }): string {
    return w.cwd ?? w.path ?? ''
  }

  private async listFilesTexts(rulesDir: string): Promise<string> {
    const files = await this.listRuleFiles(rulesDir)
    const parts: string[] = []
    for (const file of files) {
      const target = await this.fs.resolve(file.path)
      const content = await this.fs.readText(target).catch(() => '')
      const heading = content.trim().startsWith('#')
        ? content.trimEnd()
        : `# ${file.name.replace(/\.md$/i, '')}\n\n${content}`.trimEnd()
      parts.push(heading)
    }
    return parts.join('\n\n')
  }

  /**
   * Re-aggregate every rule file under `rulesDir` into `targetAgentsMd` (AGENTS.md).
   * Creates the rules/ dir + AGENTS.md as needed. Returns false on failure.
   */
  async aggregate(rulesDir: string, targetAgentsMd: string, policy: unknown): Promise<boolean> {
    const text = await this.listFilesTexts(rulesDir)
    try {
      const target = await this.fs.resolve(targetAgentsMd)
      const out = await this.fs.writeText(target, text, undefined, undefined, policy).catch(() => null)
      return out !== null
    } catch {
      return false
    }
  }

  async overview(): Promise<unknown> {
    const globalRules = join(this.dshHome, 'rules')
    const global = {
      kind: 'global',
      name: this.dshHome,
      dir: globalRules,
      agentsMd: join(this.dshHome, 'AGENTS.md'),
      rules: await this.listRuleFiles(globalRules),
    }
    const projects: unknown[] = []
    for (const w of this.ws?.list() ?? []) {
      const workdir = this.workspaceDir(w)
      if (!workdir) continue
      const pdir = join(workdir, 'rules')
      projects.push({
        kind: 'project',
        id: String(w.id),
        name: w.title ?? w.name ?? workdir,
        dir: pdir,
        agentsMd: join(workdir, 'AGENTS.md'),
        rules: await this.listRuleFiles(pdir),
      })
    }
    return { dshHome: this.dshHome, global, projects }
  }

  async read(dir: string, name: string): Promise<{ ok: boolean; content?: string; error?: string }> {
    if (!dir || !name) return { ok: false, error: 'missing dir or name' }
    if (!/\.md$/i.test(name)) return { ok: false, error: 'rule name must end with .md' }
    const target = await this.fs.resolve(join(dir, name))
    const content = await this.fs.readText(target).catch(() => '')
    return { ok: true, content }
  }

  async write(dir: string, name: string, content: string, policy: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!dir || !name) return { ok: false, error: 'missing dir or name' }
    if (!/\.md$/i.test(name)) return { ok: false, error: 'rule name must end with .md' }
    const target = await this.fs.resolve(join(dir, name))
    const out = await this.fs.writeText(target, content, undefined, undefined, policy).catch(() => null)
    if (out === null) return { ok: false, error: 'write failed' }
    return { ok: true }
  }
}

/** Build the /rules route handlers. */
function registerRules(ctx: Context, store: RuleStore, shell: ShellLike | undefined): () => void {
  const policyOf = (): unknown | undefined => {
    const sp = ctx.get('sandboxPolicy') as { resolve(o?: { mode?: string }): unknown } | undefined
    // Rules live under DSH_HOME or any workspace root, not necessarily under the
    // current session cwd, so request full access; a sandbox that cannot grant it
    // falls back to the session policy and the write reports the failure verbatim.
    return sp?.resolve?.({ mode: 'danger-full-access' })
  }
  // Map a scope's rules dir + AGENTS.md, then re-aggregate.
  const reAggregate = async (dir: string | undefined, agentsMd: string | undefined): Promise<{ ok: boolean; error?: string }> => {
    if (dir === undefined || agentsMd === undefined) return { ok: false, error: 'unknown scope' }
    const ok = await store.aggregate(dir, agentsMd, policyOf())
    return ok ? { ok: true } : { ok: false, error: 'aggregate failed' }
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    const payload = await readJsonBody(req)

    if (pathname === '/rules/overview') {
      json(res, { ok: true, value: await store.overview() })
      return
    }
    if (pathname === '/rules/read') {
      const dir = field(payload, 'dir')
      const name = field(payload, 'name')
      if (dir === undefined || name === undefined) {
        json(res, { ok: false, error: 'missing dir or name' })
        return
      }
      json(res, await store.read(dir, name))
      return
    }
    if (pathname === '/rules/write') {
      const dir = field(payload, 'dir')
      const name = field(payload, 'name')
      const agentsMd = field(payload, 'agentsMd')
      const content = typeof payload === 'object' && payload !== null
        ? String((payload as Record<string, unknown>).content ?? '')
        : ''
      if (dir === undefined || name === undefined) {
        json(res, { ok: false, error: 'missing dir or name' })
        return
      }
      const written = await store.write(dir, name, content, policyOf())
      if (!written.ok) {
        json(res, written)
        return
      }
      json(res, await reAggregate(dir, agentsMd))
      return
    }
    if (pathname === '/rules/delete') {
      const dir = field(payload, 'dir')
      const name = field(payload, 'name')
      const agentsMd = field(payload, 'agentsMd')
      if (dir === undefined || name === undefined) {
        json(res, { ok: false, error: 'missing dir or name' })
        return
      }
      if (!/\.md$/i.test(name)) {
        json(res, { ok: false, error: 'rule name must end with .md' })
        return
      }
      // Delete with Node's fs unlink directly — the bash `rm` path is unreliable on
      // Windows (bash not on PATH in some deployments). The target is a rule file the
      // UI explicitly asked to remove, so this in-process unlink is the right tool.
      const abs = join(dir, name)
      try {
        await unlink(abs)
        json(res, await reAggregate(dir, agentsMd))
      } catch (error) {
        json(res, { ok: false, error: `delete failed: ${error instanceof Error ? error.message : String(error)}` })
      }
      return
    }
    if (pathname === '/rules/projects') {
      const overview = await store.overview() as { projects: Array<{ id: string; name: string; dir: string; agentsMd: string }> }
      json(res, { ok: true, value: { projects: overview.projects } })
      return
    }
    res.writeHead(404)
    res.end()
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: '/rules', handler })
  return () => { dispose() }
}

export const inject = ['webServer', 'fs', 'workspaceRegistry']

export function apply(ctx: Context): void {
  const fs = ctx.get('fs') as FsLike | undefined
  const workspaceRegistry = ctx.get('workspaceRegistry') as WorkspaceLike | undefined
  const shell = ctx.get('shell') as ShellLike | undefined
  if (fs === undefined) {
    ctx.logger.warn('[rule-manager] fs unavailable; rules routes disabled')
    return
  }
  // DSH config root; global rules live under DSH_HOME/rules and aggregate to DSH_HOME/AGENTS.md.
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const store = new RuleStore(fs, dshHome, workspaceRegistry)
  ctx.effect(() => registerRules(ctx, store, shell), 'rule-manager: /rules routes')
}
