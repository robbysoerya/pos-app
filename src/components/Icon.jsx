import './Icon.css'

/**
 * Material Symbols Rounded icon wrapper
 * @param {string} name - Material Symbols icon name (e.g. 'shopping_cart')
 * @param {number} size - font-size in px (default 22)
 * @param {string} className - extra CSS classes
 * @param {boolean} filled - use filled variant (default false)
 */
export default function Icon({ name, size = 22, className = '', filled = false, style = {} }) {
    return (
        <span
            className={`mi ${filled ? 'mi-filled' : ''} ${className}`}
            style={{ fontSize: size, ...style }}
            aria-hidden="true"
        >
            {name}
        </span>
    )
}
