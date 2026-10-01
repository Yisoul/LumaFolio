import { SCOPE_LABELS, SCOPE_PRIORITY, formatKeys, useShortcut, useShortcutList } from './shortcuts'

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useShortcut({ id: 'help.close', keys: ['escape'], scope: 'help', label: '关闭快捷键面板', run: onClose })
  const commands = useShortcutList()

  const groups = [...SCOPE_PRIORITY]
    .reverse()
    .map((scope) => ({ scope, items: commands.filter((command) => command.scope === scope && command.id !== 'help.close') }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal shortcut-modal">
        <header><h2>快捷键</h2><button aria-label="关闭" onClick={onClose}>×</button></header>
        <div className="modal-body">
          <div className="shortcut-groups">
            {groups.map((group) => <section className="shortcut-group" key={group.scope}>
              <h3>{SCOPE_LABELS[group.scope]}</h3>
              <div className="shortcut-list">
                {group.items.map((item) => <div className="shortcut-row" key={item.id}>
                  <span>{item.label}</span>
                  <kbd>{formatKeys(item.keys)}</kbd>
                </div>)}
              </div>
            </section>)}
          </div>
          <p className="subtle">在输入框里打字时，单字母和空格快捷键不会触发。</p>
        </div>
      </div>
    </div>
  )
}
