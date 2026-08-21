import { homedir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
//#region src/index.ts
const BODY_CAP_BYTES = 1 << 20;
function json(res, body, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const part = chunk;
		total += part.length;
		if (total > BODY_CAP_BYTES) {
			req.destroy();
			return null;
		}
		chunks.push(part);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
function field(payload, key) {
	if (typeof payload !== "object" || payload === null) return void 0;
	const value = payload[key];
	return typeof value === "string" ? value : void 0;
}
/** Rule-file store: read/write/list/delete individual rule files, then aggregate into AGENTS.md. */
var RuleStore = class {
	fs;
	dshHome;
	ws;
	constructor(fs, dshHome, ws) {
		this.fs = fs;
		this.dshHome = dshHome;
		this.ws = ws;
	}
	async dirTarget(dirPath) {
		try {
			return await this.fs.resolve(dirPath);
		} catch {
			return;
		}
	}
	/** List *.md rule files in a rules/ directory; [] when absent/empty. */
	async listRuleFiles(rulesDir) {
		const target = await this.dirTarget(rulesDir);
		if (target === void 0) return [];
		const info = await this.fs.stat(target).catch(() => void 0);
		if (info === void 0 || info.type !== "directory") return [];
		return (await this.fs.listDir(target).catch(() => [])).filter((e) => e.type === "file" && /\.md$/i.test(e.name)).map((e) => ({
			name: e.name,
			path: this.fs.processPath(e.target)
		})).sort((a, b) => a.name.localeCompare(b.name));
	}
	workspaceDir(w) {
		return w.cwd ?? w.path ?? "";
	}
	/**
	* Parse a rule file's optional YAML front-matter block.
	*
	* A rule file may start with a `---`-delimited block:
	*   ---
	*   when: 当需要访问外部网络资源时参考此规则
	*   ---
	*   # 规则正文
	* ...
	* Returns the extracted `when` hint (or the fallback) plus the body text.
	*/
	parseRule(fileName, content) {
		const base = fileName.replace(/\.md$/i, "");
		const trimmed = content.replace(/^\uFEFF/, "");
		const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(trimmed);
		let hint = "";
		let body = trimmed;
		if (fm) {
			const meta = fm[1];
			const when = /(?:^|\n)\s*when\s*:\s*(.+?)\s*(?:\r?\n|$)/.exec(meta);
			if (when) hint = when[1].replace(/^["']|["']$/g, "").trim();
			body = trimmed.slice(fm[0].length);
		}
		if (!hint) {
			const head = /^\s*#+\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
			hint = head ? head[1].trim() : base;
		}
		const text = body.trim();
		return {
			hint,
			body: text.startsWith("#") ? text : `# ${base}\n\n${text}`
		};
	}
	/**
	* Build the AGENTS.md index for every rule file under `rulesDir`.
	* Unlike inlining the full rule bodies, the index only records each rule's
	* name, a `when` trigger hint (from front-matter or the first heading), and
	* the rule file's ABSOLUTE path — so the model prompt stays lean while an
	* agent (whose session cwd may differ) can still locate and read the rule
	* file regardless of its working directory.
	*/
	async buildIndex(rulesDir) {
		const files = await this.listRuleFiles(rulesDir);
		if (files.length === 0) return "";
		const entries = [];
		for (const file of files) {
			const target = await this.fs.resolve(file.path);
			const content = await this.fs.readText(target).catch(() => "");
			const { hint } = this.parseRule(file.name, content);
			const abs = this.fs.processPath(target);
			entries.push(`- **${file.name}**\n  - 触发：${hint}\n  - 位置：\`${abs}\`\n  - 规则：当满足上述触发条件时，读取 \`${abs}\` 的完整内容后再执行。`);
		}
		return [
			"# 规则索引",
			"",
			"本仓库的规则以独立 .md 文件存放于各作用域的 `rules/` 目录（全局在 `{DSH_HOME}/rules/`，项目在工作区根 `rules/`）。下列「位置」为规则的**绝对路径**，与本会话当前工作目录无关，请直接按该路径读取完整内容，再按其要求执行。",
			"",
			...entries,
			""
		].join("\n");
	}
	/**
	* Re-aggregate every rule file under `rulesDir` into `targetAgentsMd` (AGENTS.md)
	* as an index of trigger hints (not the full rule bodies). Creates the rules/
	* dir + AGENTS.md as needed. Returns false on failure.
	*/
	async aggregate(rulesDir, targetAgentsMd, policy) {
		const text = await this.buildIndex(rulesDir);
		try {
			const target = await this.fs.resolve(targetAgentsMd);
			return await this.fs.writeText(target, text, void 0, void 0, policy).catch(() => null) !== null;
		} catch {
			return false;
		}
	}
	async overview() {
		const globalRules = join(this.dshHome, "rules");
		const global = {
			kind: "global",
			name: this.dshHome,
			dir: globalRules,
			agentsMd: join(this.dshHome, "AGENTS.md"),
			rules: await this.listRuleFiles(globalRules)
		};
		const projects = [];
		for (const w of this.ws?.list() ?? []) {
			const workdir = this.workspaceDir(w);
			if (!workdir) continue;
			const pdir = join(workdir, "rules");
			projects.push({
				kind: "project",
				id: String(w.id),
				name: w.title ?? w.name ?? workdir,
				dir: pdir,
				agentsMd: join(workdir, "AGENTS.md"),
				rules: await this.listRuleFiles(pdir)
			});
		}
		return {
			dshHome: this.dshHome,
			global,
			projects
		};
	}
	async read(dir, name) {
		if (!dir || !name) return {
			ok: false,
			error: "missing dir or name"
		};
		if (!/\.md$/i.test(name)) return {
			ok: false,
			error: "rule name must end with .md"
		};
		const target = await this.fs.resolve(join(dir, name));
		return {
			ok: true,
			content: await this.fs.readText(target).catch(() => "")
		};
	}
	async write(dir, name, content, policy) {
		if (!dir || !name) return {
			ok: false,
			error: "missing dir or name"
		};
		if (!/\.md$/i.test(name)) return {
			ok: false,
			error: "rule name must end with .md"
		};
		const target = await this.fs.resolve(join(dir, name));
		if (await this.fs.writeText(target, content, void 0, void 0, policy).catch(() => null) === null) return {
			ok: false,
			error: "write failed"
		};
		return { ok: true };
	}
};
/** Build the /rules route handlers. */
function registerRules(ctx, store, shell) {
	const policyOf = () => {
		return ctx.get("sandboxPolicy")?.resolve?.({ mode: "danger-full-access" });
	};
	const reAggregate = async (dir, agentsMd) => {
		if (dir === void 0 || agentsMd === void 0) return {
			ok: false,
			error: "unknown scope"
		};
		return await store.aggregate(dir, agentsMd, policyOf()) ? { ok: true } : {
			ok: false,
			error: "aggregate failed"
		};
	};
	const handler = async (req, res) => {
		if (req.method !== "POST") {
			res.writeHead(405);
			res.end();
			return;
		}
		const pathname = new URL(req.url ?? "/", "http://x").pathname;
		const payload = await readJsonBody(req);
		if (pathname === "/rules/overview") {
			json(res, {
				ok: true,
				value: await store.overview()
			});
			return;
		}
		if (pathname === "/rules/read") {
			const dir = field(payload, "dir");
			const name = field(payload, "name");
			if (dir === void 0 || name === void 0) {
				json(res, {
					ok: false,
					error: "missing dir or name"
				});
				return;
			}
			const result = await store.read(dir, name);
			json(res, result.ok ? {
				ok: true,
				value: { content: result.content }
			} : result);
			return;
		}
		if (pathname === "/rules/write") {
			const dir = field(payload, "dir");
			const name = field(payload, "name");
			const agentsMd = field(payload, "agentsMd");
			const content = typeof payload === "object" && payload !== null ? String(payload.content ?? "") : "";
			if (dir === void 0 || name === void 0) {
				json(res, {
					ok: false,
					error: "missing dir or name"
				});
				return;
			}
			const written = await store.write(dir, name, content, policyOf());
			if (!written.ok) {
				json(res, written);
				return;
			}
			json(res, await reAggregate(dir, agentsMd));
			return;
		}
		if (pathname === "/rules/delete") {
			const dir = field(payload, "dir");
			const name = field(payload, "name");
			const agentsMd = field(payload, "agentsMd");
			if (dir === void 0 || name === void 0) {
				json(res, {
					ok: false,
					error: "missing dir or name"
				});
				return;
			}
			if (!/\.md$/i.test(name)) {
				json(res, {
					ok: false,
					error: "rule name must end with .md"
				});
				return;
			}
			const abs = join(dir, name);
			try {
				await unlink(abs);
				json(res, await reAggregate(dir, agentsMd));
			} catch (error) {
				json(res, {
					ok: false,
					error: `delete failed: ${error instanceof Error ? error.message : String(error)}`
				});
			}
			return;
		}
		if (pathname === "/rules/projects") {
			json(res, {
				ok: true,
				value: { projects: (await store.overview()).projects }
			});
			return;
		}
		res.writeHead(404);
		res.end();
	};
	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/rules",
		handler
	});
	return () => {
		dispose();
	};
}
const inject = [
	"webServer",
	"fs",
	"workspaceRegistry"
];
function apply(ctx) {
	const fs = ctx.get("fs");
	const workspaceRegistry = ctx.get("workspaceRegistry");
	const shell = ctx.get("shell");
	if (fs === void 0) {
		ctx.logger.warn("[rule-manager] fs unavailable; rules routes disabled");
		return;
	}
	const store = new RuleStore(fs, process.env.DSH_HOME ?? join(homedir(), ".dsh"), workspaceRegistry);
	ctx.effect(() => registerRules(ctx, store, shell), "rule-manager: /rules routes");
}
//#endregion
export { apply, inject };
