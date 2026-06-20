interface Props {
  value: string
  onChange: (layer: string) => void
  dataCenterMode: boolean
}

const STANDARD_LAYERS = [
  { id: 'pressure', label: 'Development pressure' },
  { id: 'zoning', label: 'Zoning breakdown' },
  { id: 'permits', label: 'Permit volume' },
  { id: 'landCost', label: 'Land cost' },
  { id: 'sentiment', label: 'Family-planning sentiment' },
]

const DATACENTER_LAYERS = [
  { id: 'substations', label: 'Substation proximity' },
  { id: 'gridHeadroom', label: 'Grid headroom' },
  { id: 'waterStress', label: 'Water stress' },
]

export function LayerSwitcher({ value, onChange, dataCenterMode }: Props) {
  const layers = dataCenterMode ? DATACENTER_LAYERS : STANDARD_LAYERS
  return (
    <fieldset className="layer-switcher">
      <legend>Layer</legend>
      {layers.map((l) => (
        <label key={l.id} className="layer-switcher__option">
          <input
            type="radio"
            name="layer"
            checked={value === l.id}
            onChange={() => onChange(l.id)}
          />
          {l.label}
        </label>
      ))}
    </fieldset>
  )
}
