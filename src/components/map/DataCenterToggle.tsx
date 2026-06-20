interface Props {
  value: boolean
  onChange: (on: boolean) => void
}

// Toggling re-skins the whole map (different layers fade in/out) — see
// BUILD_PLAN §4 "Data-center mode".
export function DataCenterToggle({ value, onChange }: Props) {
  return (
    <label className="dc-toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>AI data-center siting mode</span>
    </label>
  )
}
