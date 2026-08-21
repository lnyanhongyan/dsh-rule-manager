/**
 * Browser half of dsh-rule-manager: a "规则管理" settings page (settings.section)
 * that manages rule files (one .md per rule) at global and project scope.
 * Every save/delete re-aggregates the scope's rules/ into its AGENTS.md, which
 * DSH's built-in agent-instructions loader injects into the model prompt.
 */
import * as React from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'

async function post(path: string, payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
  } catch {
    return { ok: false, error: 'rules route unavailable' }
  }
  try {
    const envelope: unknown = await response.json()
    if (typeof envelope !== 'object' || envelope === null) return { ok: false, error: 'bad response' }
    const record = envelope as { ok?: boolean; value?: unknown; error?: string }
    if (record.ok === true) return { ok: true, value: record.value ?? record }
    return { ok: false, error: record.error ?? 'rules route error' }
  } catch {
    return { ok: false, error: 'bad response' }
  }
}

interface RuleRow { name: string; path: string }
interface Scope {
  kind: string
  name: string
  dir: string
  agentsMd: string
  rules: RuleRow[]
}
interface Overview { dshHome: string; global: Scope; projects: Scope[] }

const CSS = [
  '@keyframes rmFade { from { opacity: 0 } to { opacity: 1 } }',
  '@keyframes rmPop { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }',
  '.rm-mask { position: fixed; inset: 0; background: var(--dsw-alias-bg-mask-3); display: flex; align-items: center; justify-content: center; z-index: 9999; animation: rmFade 0.15s ease-out; }',
  '.rm-dialog { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.3); padding: 18px 20px; width: min(420px, 90vw); animation: rmPop 0.16s ease-out; font-size: 14px; }',
  '.rm-dialog h3 { margin: 0 0 12px; font-size: 16px; color: var(--dsw-alias-label-primary); }',
  '.rm-hint { color: var(--dsw-alias-label-secondary); margin-bottom: 8px; }',
  '.rm-field { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 14px; outline: none; }',
  '.rm-field:focus { border-color: var(--dsw-alias-brand-primary); }',
  '.rm-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }',
  '.rm-btn { padding: 6px 16px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 14px; }',
  '.rm-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }',
  '.rm-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
  '.rm-btn-primary { background: var(--dsw-alias-button-primary-fill); border-color: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }',
  '.rm-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); border-color: var(--dsw-alias-button-primary-hover); }',
  '.rm-btn-danger { background: transparent; border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }',
  '.rm-btn-danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }',
  '.rm-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; background: var(--dsw-alias-bg-layer-2); }',
  '.rm-tea { width: 100%; box-sizing: border-box; margin-top: 8px; font-family: monospace; resize: vertical; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px; }',
  '.rm-muted { color: var(--dsw-alias-label-secondary); }',
  '.rm-danger-text { color: var(--dsw-alias-state-error-primary); }',
  '.rm-tab-active { font-weight: 700; background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2) !important; }',
].join('\n')

function Dialog(props: {
  title: string
  okLabel: string
  danger?: boolean
  onOk: () => void
  onCancel: () => void
  children?: React.ReactNode
}): React.ReactElement {
  const okCls = props.danger ? 'rm-btn rm-btn-danger' : 'rm-btn rm-btn-primary'
  return React.createElement('div', { className: 'rm-mask', onClick: props.onCancel },
    React.createElement('div', { className: 'rm-dialog', onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
      React.createElement('h3', null, props.title),
      props.children,
      React.createElement('div', { className: 'rm-row' },
        React.createElement('button', { className: 'rm-btn', onClick: props.onCancel }, '取消'),
        React.createElement('button', { className: okCls, onClick: props.onOk }, props.okLabel))))
}

function RuleCard(props: {
  fileName: string
  dir: string
  agentsMd: string
  onChanged: () => void
  onAskDelete: (fileName: string) => void
}): React.ReactElement {
  const [content, setContent] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    setContent(null)
    setDirty(false)
    setError(null)
    post('/rules/read', { dir: props.dir, name: props.fileName }).then((r) => {
      if (active) setContent((r.value as { content?: string } | undefined)?.content ?? '')
    })
    return () => { active = false }
  }, [props.dir, props.fileName])

  if (content === null) {
    return React.createElement('div', { className: 'rm-card' }, '加载 ' + props.fileName + '…')
  }
  const save = () => {
    setBusy(true)
    setError(null)
    post('/rules/write', { dir: props.dir, name: props.fileName, content, agentsMd: props.agentsMd }).then((r) => {
      setBusy(false)
      if (r.ok) { setDirty(false); props.onChanged() }
      else setError(r.error ?? 'save failed')
    })
  }
  return React.createElement('div', { className: 'rm-card' },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('strong', null, props.fileName),
      React.createElement('span', null,
        React.createElement('button', { className: 'rm-btn', style: { marginLeft: '8px', padding: '2px 10px' }, onClick: save, disabled: !dirty || busy }, dirty ? '保存' : '已保存'),
        React.createElement('button', { className: 'rm-btn rm-danger-text', style: { marginLeft: '8px', padding: '2px 10px' }, onClick: () => props.onAskDelete(props.fileName), disabled: busy }, '删除'))),
    error ? React.createElement('div', { className: 'rm-danger-text', style: { marginTop: '6px', fontSize: '12px' } }, error) : null,
    React.createElement('textarea', { className: 'rm-tea', value: content, onChange: (e: { target: { value: string } }) => { setContent(e.target.value); setDirty(true) }, rows: 5 }))
}

function RuleManager(): React.ReactElement {
  const [tab, setTab] = React.useState<'global' | 'project'>('global')
  const [data, setData] = React.useState<Overview | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [proj, setProj] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dialog, setDialog] = React.useState<{ type: 'add' } | { type: 'confirm-del'; fileName: string } | null>(null)
  const [newName, setNewName] = React.useState('rule.md')

  const refresh = () => {
    setBusy(true)
    post('/rules/overview', {}).then((r) => {
      setBusy(false)
      if (!r.ok) { setErr(r.error ?? 'load failed'); return }
      const value = r.value as Overview
      setData(value)
      setErr(null)
      if (value.projects.length) setProj((cur) => cur ?? value.projects[0].dir)
    }).catch((e: unknown) => { setBusy(false); setErr(String(e)) })
  }

  React.useEffect(() => { refresh() }, [])

  if (err) {
    return React.createElement('div', { className: 'rm-danger-text' },
      '加载失败: ' + err,
      React.createElement('button', { className: 'rm-btn', style: { marginLeft: '8px' }, onClick: refresh }, '重试'))
  }
  if (data === null) return React.createElement('div', { className: 'rm-muted' }, '加载中…')

  const isGlobal = tab === 'global'
  const scope: Scope | null = isGlobal
    ? data.global
    : (data.projects.find((p) => p.dir === proj) ?? null)

  const submitAdd = () => {
    let name = newName.trim()
    if (!name) return
    if (!/\.md$/i.test(name)) name += '.md'
    if (!scope) return
    setDialog(null)
    setBusy(true)
    post('/rules/write', { dir: scope.dir, name, content: `# ${name.replace(/\.md$/i, '')}\n`, agentsMd: scope.agentsMd }).then(() => { setBusy(false); refresh() })
  }
  const submitDel = () => {
    if (!scope || dialog === null || dialog.type !== 'confirm-del') return
    const fileName = dialog.fileName
    setDialog(null)
    setBusy(true)
    post('/rules/delete', { dir: scope.dir, name: fileName, agentsMd: scope.agentsMd }).then(() => { setBusy(false); refresh() })
  }

  let overlay: React.ReactElement | null = null
  if (dialog !== null && dialog.type === 'add' && scope) {
    overlay = React.createElement(Dialog, {
      title: '新增规则', okLabel: '创建', onOk: submitAdd, onCancel: () => setDialog(null),
    },
      React.createElement('div', { className: 'rm-hint' }, '输入规则文件名（自动补全 .md）：'),
      React.createElement('input', { className: 'rm-field', value: newName, autoFocus: true, onChange: (e: { target: { value: string } }) => setNewName(e.target.value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') submitAdd() } }))
  } else if (dialog !== null && dialog.type === 'confirm-del' && scope) {
    overlay = React.createElement(Dialog, {
      title: '删除规则', okLabel: '删除', danger: true, onOk: submitDel, onCancel: () => setDialog(null),
    },
      React.createElement('div', null, '确定要删除规则 ', React.createElement('b', null, dialog.fileName), ' 吗？此操作不可撤销。'))
  }

  const tabBtn: React.CSSProperties = {
    padding: '5px 14px', borderRadius: '6px', border: '1px solid transparent',
    background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer', fontSize: '14px',
  }
  const tabRow = React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
    React.createElement('button', { className: tab === 'global' ? 'rm-tab-active' : '', onClick: () => setTab('global'), style: tabBtn }, '全局'),
    React.createElement('button', { className: tab === 'project' ? 'rm-tab-active' : '', onClick: () => setTab('project'), style: tabBtn }, '项目'),
    React.createElement('span', { className: 'rm-muted', style: { marginLeft: 'auto' } }, busy ? '同步中…' : ''))

  let picker: React.ReactElement | null = null
  if (!isGlobal) {
    picker = React.createElement('div', { style: { marginBottom: '10px' } },
      React.createElement('label', { className: 'rm-muted', style: { marginRight: '6px' } }, '项目:'),
      React.createElement('select', { className: 'rm-field', style: { width: 'auto' }, value: proj ?? '', onChange: (e: { target: { value: string } }) => setProj(e.target.value) },
        data.projects.length
          ? data.projects.map((p) => React.createElement('option', { key: p.dir, value: p.dir }, p.name))
          : React.createElement('option', { value: '' }, '（无项目）')))
  }

  if (!isGlobal && !scope) {
    return React.createElement('div', null, tabRow, picker, React.createElement('div', { className: 'rm-muted' }, '当前没有可用项目工作区。'), overlay)
  }

  const items = scope!.rules.map((r) =>
    React.createElement(RuleCard, {
      key: r.name,
      fileName: r.name,
      dir: scope!.dir,
      agentsMd: scope!.agentsMd,
      onChanged: refresh,
      onAskDelete: (fileName: string) => setDialog({ type: 'confirm-del', fileName }),
    }))

  return React.createElement('div', null,
    tabRow,
    picker,
    React.createElement('div', { style: { fontWeight: '600', marginBottom: '8px' } }, scope!.name),
    React.createElement('div', { className: 'rm-muted', style: { marginBottom: '8px', fontSize: '12px' } }, '保存后自动聚合到 ' + scope!.agentsMd),
    React.createElement('div', null, items.length ? items : React.createElement('div', { className: 'rm-muted' }, '暂无规则，点击下方按钮新增。')),
    React.createElement('button', { className: 'rm-btn', style: { marginTop: '4px' }, onClick: () => { setNewName('rule.md'); setDialog({ type: 'add' }) } }, '+ 新增规则'),
    overlay)
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('rule-manager', 'zh', { title: '规则管理' }), 'rule-manager: zh dict')
  ctx.effect(() => ctx.locale.register('rule-manager', 'en', { title: 'Rule Manager' }), 'rule-manager: en dict')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@deepseek-ai/dsh-rule-manager'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'rule-manager: styles')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'rule-manager',
    order: 50,
    label: () => ctx.locale.bind('rule-manager')('title'),
  }, RuleManager))
}
