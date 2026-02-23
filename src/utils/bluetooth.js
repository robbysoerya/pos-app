/**
 * ESC/POS Bluetooth Printing Utility
 * Handles connection, receipt formatting, and printing
 */

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb'

// ESC/POS commands
const ESC = 0x1B
const GS = 0x1D
const INIT = [ESC, 0x40]
const CUT = [GS, 0x56, 0x41, 0x00]
const ALIGN_CENTER = [ESC, 0x61, 0x01]
const ALIGN_LEFT = [ESC, 0x61, 0x00]
const BOLD_ON = [ESC, 0x45, 0x01]
const BOLD_OFF = [ESC, 0x45, 0x00]
const DOUBLE_HEIGHT = [ESC, 0x21, 0x10]
const NORMAL_SIZE = [ESC, 0x21, 0x00]
const LINE_FEED = [0x0A]

// Store the Bluetooth device reference
let _device = null
let _char = null

export async function connectPrinter() {
    const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [PRINTER_SERVICE_UUID] }],
    })

    const server = await device.gatt.connect()
    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID)
    const char = await service.getCharacteristic(PRINTER_CHAR_UUID)

    _device = device
    _char = char

    // Persist device name for display
    localStorage.setItem('bt_printer_name', device.name || 'Bluetooth Printer')

    device.addEventListener('gattserverdisconnected', () => {
        _device = null
        _char = null
    })

    return device.name || 'Bluetooth Printer'
}

export function getPrinterName() {
    return localStorage.getItem('bt_printer_name') || null
}

export function isPrinterConnected() {
    return _device?.gatt?.connected ?? false
}

export async function disconnectPrinter() {
    if (_device?.gatt?.connected) _device.gatt.disconnect()
    _device = null
    _char = null
}

/** Send raw bytes to printer */
async function sendData(bytes) {
    if (!_char) throw new Error('Printer not connected')
    const CHUNK = 512
    for (let i = 0; i < bytes.length; i += CHUNK) {
        await _char.writeValueWithoutResponse(new Uint8Array(bytes.slice(i, i + CHUNK)))
    }
}

/** Format a receipt and print it */
export async function printReceipt(transaction, storeName = 'My Store', retry = true) {
    try {
        if (!isPrinterConnected()) throw new Error('Printer not connected')

        const lines = buildReceipt(transaction, storeName)
        await sendData(lines)
    } catch (err) {
        if (retry) {
            // attempt to reconnect once if device reference exists
            try {
                if (_device) {
                    const server = await _device.gatt.connect()
                    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID)
                    _char = await service.getCharacteristic(PRINTER_CHAR_UUID)
                    await printReceipt(transaction, storeName, false)
                    return
                }
            } catch { }
        }
        throw err
    }
}

function buildReceipt(txn, storeName) {
    const bytes = []
    const push = (...cmds) => cmds.forEach(c => bytes.push(...(Array.isArray(c) ? c : [c])))
    const text = (str) => [...new TextEncoder().encode(str + '\n')]

    const pad = (left, right, width = 32) => {
        const space = Math.max(1, width - left.length - right.length)
        return left + ' '.repeat(space) + right
    }

    push(...INIT)
    push(...ALIGN_CENTER, ...BOLD_ON, ...DOUBLE_HEIGHT)
    push(...text(storeName))
    push(...NORMAL_SIZE, ...BOLD_OFF)
    push(...text('================================'))
    push(...ALIGN_LEFT)

    const date = new Date(txn.createdAt)
    push(...text(`Date: ${date.toLocaleDateString('id-ID')}`))
    push(...text(`Time: ${date.toLocaleTimeString('id-ID')}`))
    push(...text(`No:   #${String(txn.id).padStart(6, '0')}`))
    push(...text('--------------------------------'))

    txn.items.forEach(item => {
        push(...text(`${item.name}`))
        push(...text(pad(`  ${item.qty}x ${fmtCurrency(item.price)}`, fmtCurrency(item.price * item.qty))))
    })

    push(...text('--------------------------------'))
    push(...BOLD_ON)
    push(...text(pad('TOTAL', fmtCurrency(txn.total))))
    push(...BOLD_OFF)
    push(...text(pad('Bayar', fmtCurrency(txn.payment))))
    push(...text(pad('Kembali', fmtCurrency(txn.change))))
    push(...text('================================'))
    push(...ALIGN_CENTER)
    push(...text('Terima kasih!'))
    push(...text(''))
    push(...text(''))
    push(...CUT)

    return bytes
}

function fmtCurrency(n) {
    return 'Rp' + Number(n).toLocaleString('id-ID')
}
