/** Format number as IDR currency */
export function fmtCurrency(n) {
    return 'Rp\u00a0' + Number(n).toLocaleString('id-ID')
}

/** Format ISO date string as localized date */
export function fmtDate(isoStr) {
    return new Date(isoStr).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric',
    })
}

/** Format ISO date string as localized date+time */
export function fmtDateTime(isoStr) {
    return new Date(isoStr).toLocaleString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

/** Format transaction number */
export function fmtTxnId(id) {
    return '#' + String(id).padStart(6, '0')
}

/** Parse raw numeric string from numpad to integer */
export function parseAmount(str) {
    return parseInt(str || '0', 10) || 0
}
