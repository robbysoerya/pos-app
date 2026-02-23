import Icon from './Icon.jsx'
import './NumPad.css'

const KEYS = [
    '7', '8', '9',
    '4', '5', '6',
    '1', '2', '3',
    '000', '0', '⌫',
]

export default function NumPad({ value, onChange, maxLength = 10, onExact, exactLabel }) {
    function press(key) {
        if (key === '⌫') {
            onChange(value.slice(0, -1) || '0')
        } else {
            const next = value === '0' ? key : value + key
            if (next.length > maxLength) return
            onChange(next)
        }
    }

    return (
        <div className="numpad">
            {KEYS.map(k => (
                <button
                    key={k}
                    className={`numpad-key ${k === '⌫' ? 'numpad-back' : ''}`}
                    onPointerDown={() => press(k)}
                    type="button"
                >
                    {k === '⌫' ? <Icon name="backspace" size={20} /> : k}
                </button>
            ))}
            {onExact && (
                <button
                    className="numpad-key numpad-exact"
                    onPointerDown={onExact}
                    type="button"
                >
                    <Icon name="payments" size={18} />
                    {exactLabel || 'Uang Pas'}
                </button>
            )}
        </div>
    )
}
