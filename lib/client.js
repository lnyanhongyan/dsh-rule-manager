window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-rule-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/index.ts
		/**
		* Browser half of dsh-rule-manager: a "规则管理" settings page (settings.section)
		* that manages rule files (one .md per rule) at global and project scope.
		* Every save/delete re-aggregates the scope's rules/ into its AGENTS.md, which
		* DSH's built-in agent-instructions loader injects into the model prompt.
		*/
		async function post(path, payload) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload ?? {})
				});
			} catch {
				return {
					ok: false,
					error: "rules route unavailable"
				};
			}
			try {
				const envelope = await response.json();
				if (typeof envelope !== "object" || envelope === null) return {
					ok: false,
					error: "bad response"
				};
				const record = envelope;
				if (record.ok === true) return {
					ok: true,
					value: record.value
				};
				return {
					ok: false,
					error: record.error ?? "rules route error"
				};
			} catch {
				return {
					ok: false,
					error: "bad response"
				};
			}
		}
		const CSS = [
			"@keyframes rmFade { from { opacity: 0 } to { opacity: 1 } }",
			"@keyframes rmPop { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }",
			".rm-mask { position: fixed; inset: 0; background: var(--dsw-alias-bg-mask-3); display: flex; align-items: center; justify-content: center; z-index: 9999; animation: rmFade 0.15s ease-out; }",
			".rm-dialog { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.3); padding: 18px 20px; width: min(420px, 90vw); animation: rmPop 0.16s ease-out; font-size: 14px; }",
			".rm-dialog h3 { margin: 0 0 12px; font-size: 16px; color: var(--dsw-alias-label-primary); }",
			".rm-hint { color: var(--dsw-alias-label-secondary); margin-bottom: 8px; }",
			".rm-field { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 14px; outline: none; }",
			".rm-field:focus { border-color: var(--dsw-alias-brand-primary); }",
			".rm-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }",
			".rm-btn { padding: 6px 16px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 14px; }",
			".rm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }",
			".rm-btn:disabled { opacity: 0.5; cursor: not-allowed; }",
			".rm-btn-primary { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }",
			".rm-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); border-color: var(--dsw-alias-button-primary-hover); }",
			".rm-btn-danger { background: transparent; border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }",
			".rm-btn-danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }",
			".rm-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; background: var(--dsw-alias-bg-layer-2); }",
			".rm-tea { width: 100%; box-sizing: border-box; margin-top: 8px; font-family: monospace; resize: vertical; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px; }",
			".rm-muted { color: var(--dsw-alias-label-secondary); }",
			".rm-danger-text { color: var(--dsw-alias-state-error-primary); }",
			".rm-tab-active { font-weight: 700; background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2) !important; }"
		].join("\n");
		function Dialog(props) {
			const okCls = props.danger ? "rm-btn rm-btn-danger" : "rm-btn rm-btn-primary";
			return react.createElement("div", {
				className: "rm-mask",
				onClick: props.onCancel
			}, react.createElement("div", {
				className: "rm-dialog",
				onClick: (e) => e.stopPropagation()
			}, react.createElement("h3", null, props.title), props.children, react.createElement("div", { className: "rm-row" }, react.createElement("button", {
				className: "rm-btn",
				onClick: props.onCancel
			}, "取消"), react.createElement("button", {
				className: okCls,
				onClick: props.onOk
			}, props.okLabel))));
		}
		function RuleCard(props) {
			const [content, setContent] = react.useState(null);
			const [dirty, setDirty] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			react.useEffect(() => {
				let active = true;
				setContent(null);
				setDirty(false);
				setError(null);
				post("/rules/read", {
					dir: props.dir,
					name: props.fileName
				}).then((r) => {
					if (active) setContent(r.value?.content ?? "");
				});
				return () => {
					active = false;
				};
			}, [props.dir, props.fileName]);
			if (content === null) return react.createElement("div", { className: "rm-card" }, "加载 " + props.fileName + "…");
			const save = () => {
				setBusy(true);
				setError(null);
				post("/rules/write", {
					dir: props.dir,
					name: props.fileName,
					content,
					agentsMd: props.agentsMd
				}).then((r) => {
					setBusy(false);
					if (r.ok) {
						setDirty(false);
						props.onChanged();
					} else setError(r.error ?? "save failed");
				});
			};
			return react.createElement("div", { className: "rm-card" }, react.createElement("div", { style: {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center"
			} }, react.createElement("strong", null, props.fileName), react.createElement("span", null, react.createElement("button", {
				className: "rm-btn",
				style: {
					marginLeft: "8px",
					padding: "2px 10px"
				},
				onClick: save,
				disabled: !dirty || busy
			}, dirty ? "保存" : "已保存"), react.createElement("button", {
				className: "rm-btn rm-danger-text",
				style: {
					marginLeft: "8px",
					padding: "2px 10px"
				},
				onClick: () => props.onAskDelete(props.fileName),
				disabled: busy
			}, "删除"))), error ? react.createElement("div", {
				className: "rm-danger-text",
				style: {
					marginTop: "6px",
					fontSize: "12px"
				}
			}, error) : null, react.createElement("textarea", {
				className: "rm-tea",
				value: content,
				onChange: (e) => {
					setContent(e.target.value);
					setDirty(true);
				},
				rows: 5
			}));
		}
		function RuleManager() {
			const [tab, setTab] = react.useState("global");
			const [data, setData] = react.useState(null);
			const [err, setErr] = react.useState(null);
			const [proj, setProj] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [dialog, setDialog] = react.useState(null);
			const [newName, setNewName] = react.useState("rule.md");
			const refresh = () => {
				setBusy(true);
				post("/rules/overview", {}).then((r) => {
					setBusy(false);
					if (!r.ok) {
						setErr(r.error ?? "load failed");
						return;
					}
					const value = r.value;
					setData(value);
					setErr(null);
					if (value.projects.length) setProj((cur) => cur ?? value.projects[0].dir);
				}).catch((e) => {
					setBusy(false);
					setErr(String(e));
				});
			};
			react.useEffect(() => {
				refresh();
			}, []);
			if (err) return react.createElement("div", { className: "rm-danger-text" }, "加载失败: " + err, react.createElement("button", {
				className: "rm-btn",
				style: { marginLeft: "8px" },
				onClick: refresh
			}, "重试"));
			if (data === null) return react.createElement("div", { className: "rm-muted" }, "加载中…");
			const isGlobal = tab === "global";
			const scope = isGlobal ? data.global : data.projects.find((p) => p.dir === proj) ?? null;
			const submitAdd = () => {
				let name = newName.trim();
				if (!name) return;
				if (!/\.md$/i.test(name)) name += ".md";
				if (!scope) return;
				setDialog(null);
				setBusy(true);
				post("/rules/write", {
					dir: scope.dir,
					name,
					content: `# ${name.replace(/\.md$/i, "")}\n`,
					agentsMd: scope.agentsMd
				}).then(() => {
					setBusy(false);
					refresh();
				});
			};
			const submitDel = () => {
				if (!scope || dialog === null || dialog.type !== "confirm-del") return;
				const fileName = dialog.fileName;
				setDialog(null);
				setBusy(true);
				post("/rules/delete", {
					dir: scope.dir,
					name: fileName,
					agentsMd: scope.agentsMd
				}).then(() => {
					setBusy(false);
					refresh();
				});
			};
			let overlay = null;
			if (dialog !== null && dialog.type === "add" && scope) overlay = react.createElement(Dialog, {
				title: "新增规则",
				okLabel: "创建",
				onOk: submitAdd,
				onCancel: () => setDialog(null)
			}, react.createElement("div", { className: "rm-hint" }, "输入规则文件名（自动补全 .md）："), react.createElement("input", {
				className: "rm-field",
				value: newName,
				autoFocus: true,
				onChange: (e) => setNewName(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter") submitAdd();
				}
			}));
			else if (dialog !== null && dialog.type === "confirm-del" && scope) overlay = react.createElement(Dialog, {
				title: "删除规则",
				okLabel: "删除",
				danger: true,
				onOk: submitDel,
				onCancel: () => setDialog(null)
			}, react.createElement("div", null, "确定要删除规则 ", react.createElement("b", null, dialog.fileName), " 吗？此操作不可撤销。"));
			const tabBtn = {
				padding: "5px 14px",
				borderRadius: "6px",
				border: "1px solid transparent",
				background: "transparent",
				color: "var(--dsw-alias-label-primary)",
				cursor: "pointer",
				fontSize: "14px"
			};
			const tabRow = react.createElement("div", { style: {
				display: "flex",
				gap: "8px",
				marginBottom: "12px"
			} }, react.createElement("button", {
				className: tab === "global" ? "rm-tab-active" : "",
				onClick: () => setTab("global"),
				style: tabBtn
			}, "全局"), react.createElement("button", {
				className: tab === "project" ? "rm-tab-active" : "",
				onClick: () => setTab("project"),
				style: tabBtn
			}, "项目"), react.createElement("span", {
				className: "rm-muted",
				style: { marginLeft: "auto" }
			}, busy ? "同步中…" : ""));
			let picker = null;
			if (!isGlobal) picker = react.createElement("div", { style: { marginBottom: "10px" } }, react.createElement("label", {
				className: "rm-muted",
				style: { marginRight: "6px" }
			}, "项目:"), react.createElement("select", {
				className: "rm-field",
				style: { width: "auto" },
				value: proj ?? "",
				onChange: (e) => setProj(e.target.value)
			}, data.projects.length ? data.projects.map((p) => react.createElement("option", {
				key: p.dir,
				value: p.dir
			}, p.name)) : react.createElement("option", { value: "" }, "（无项目）")));
			if (!isGlobal && !scope) return react.createElement("div", null, tabRow, picker, react.createElement("div", { className: "rm-muted" }, "当前没有可用项目工作区。"), overlay);
			const items = scope.rules.map((r) => react.createElement(RuleCard, {
				key: r.name,
				fileName: r.name,
				dir: scope.dir,
				agentsMd: scope.agentsMd,
				onChanged: refresh,
				onAskDelete: (fileName) => setDialog({
					type: "confirm-del",
					fileName
				})
			}));
			return react.createElement("div", null, tabRow, picker, react.createElement("div", { style: {
				fontWeight: "600",
				marginBottom: "8px"
			} }, scope.name), react.createElement("div", {
				className: "rm-muted",
				style: {
					marginBottom: "8px",
					fontSize: "12px"
				}
			}, "保存后自动聚合到 " + scope.agentsMd), react.createElement("div", null, items.length ? items : react.createElement("div", { className: "rm-muted" }, "暂无规则，点击下方按钮新增。")), react.createElement("button", {
				className: "rm-btn",
				style: { marginTop: "4px" },
				onClick: () => {
					setNewName("rule.md");
					setDialog({ type: "add" });
				}
			}, "+ 新增规则"), overlay);
		}
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("rule-manager", "zh", { title: "规则管理" }), "rule-manager: zh dict");
			ctx.effect(() => ctx.locale.register("rule-manager", "en", { title: "Rule Manager" }), "rule-manager: en dict");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "@deepseek-ai/dsh-rule-manager";
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "rule-manager: styles");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "rule-manager",
				order: 50,
				label: () => ctx.locale.bind("rule-manager")("title")
			}, RuleManager));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
