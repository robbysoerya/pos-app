import db from '../db/db.js'

async function compressJSON(jsonString) {
    const stream = new Blob([jsonString], { type: 'application/json' }).stream()
    const compressedReadableStream = stream.pipeThrough(new CompressionStream('gzip'))
    const compressedResponse = new Response(compressedReadableStream)
    return await compressedResponse.blob()
}

async function decompressBlob(blob) {
    const stream = blob.stream()
    const decompressedReadableStream = stream.pipeThrough(new DecompressionStream('gzip'))
    const decompressedResponse = new Response(decompressedReadableStream)
    return await decompressedResponse.text()
}

/** Gather all database tables into a JSON string and filename */
export async function getBackupData(storeName = 'My Store') {
    const [categories, products, transactions, transaction_items, stock_movements, settings, customers, debts, debt_payments] = await Promise.all([
        db.categories.toArray(),
        db.products.toArray(),
        db.transactions.toArray(),
        db.transaction_items.toArray(),
        db.stock_movements.toArray(),
        db.settings.toArray(),
        db.customers?.toArray() || [],
        db.debts?.toArray() || [],
        db.debt_payments?.toArray() || [],
    ])

    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        storeName,
        data: { categories, products, transactions, transaction_items, stock_movements, settings, customers, debts, debt_payments },
    }

    const filename = `pos-backup-${new Date().toISOString().split('T')[0]}.json.gz`
    const json = JSON.stringify(backup)
    return { json, filename }
}

/** Export all tables to a compressed blob and trigger download */
export async function exportBackup(storeName = 'My Store') {
    const { json, filename } = await getBackupData(storeName)
    const compressedBlob = await compressJSON(json)

    // Chrome 86+: use File System Access API
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'GZIP Backup', accept: { 'application/gzip': ['.gz'] } }],
            })
            const writable = await handle.createWritable()
            await writable.write(compressedBlob)
            await writable.close()
            return true
        } catch (e) {
            if (e.name === 'AbortError') return false
        }
    }

    // Fallback for edge/firefox: construct an object URL for the blob
    const blobUrl = URL.createObjectURL(compressedBlob)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = blobUrl
    a.setAttribute('download', filename)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
    return true
}

/** Sends the backup file directly to a Telegram Bot */
export async function sendBackupToTelegram(token, chatId, storeName = 'My Store') {
    if (!token || !chatId) throw new Error('Telegram Token dan Chat ID wajib diisi')

    const { json, filename } = await getBackupData(storeName)
    const compressedBlob = await compressJSON(json)

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', compressedBlob, filename)
    formData.append('caption', `📦 Backup POS ${storeName}\n📅 ${new Date().toLocaleString()}`)

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData
    })

    const result = await response.json()
    if (!result.ok) {
        throw new Error(result.description || 'Gagal mengirim ke Telegram API')
    }
    return true
}

/** Read a backup file (handles .gz and plain .json) and restore all tables */
export async function importBackup(file) {
    let text
    if (file.name.endsWith('.gz')) {
        text = await decompressBlob(file)
    } else {
        text = await file.text()
    }

    const backup = JSON.parse(text)

    if (!backup.data) throw new Error('Invalid backup file format')
    const { categories, products, transactions, transaction_items, stock_movements, settings, customers, debts, debt_payments } = backup.data

    await db.transaction('rw', [
        db.categories, db.products, db.transactions,
        db.transaction_items, db.stock_movements, db.settings,
        db.customers, db.debts, db.debt_payments
    ], async () => {
        await db.categories.clear()
        await db.products.clear()
        await db.transactions.clear()
        await db.transaction_items.clear()
        await db.stock_movements.clear()
        await db.settings.clear()
        if (db.customers) await db.customers.clear()
        if (db.debts) await db.debts.clear()
        if (db.debt_payments) await db.debt_payments.clear()

        if (categories?.length) await db.categories.bulkAdd(categories)
        if (products?.length) await db.products.bulkAdd(products)
        if (transactions?.length) await db.transactions.bulkAdd(transactions)
        if (transaction_items?.length) await db.transaction_items.bulkAdd(transaction_items)
        if (stock_movements?.length) await db.stock_movements.bulkAdd(stock_movements)
        if (settings?.length) await db.settings.bulkAdd(settings)
        if (customers?.length && db.customers) await db.customers.bulkAdd(customers)
        if (debts?.length && db.debts) await db.debts.bulkAdd(debts)
        if (debt_payments?.length && db.debt_payments) await db.debt_payments.bulkAdd(debt_payments)
    })

    return backup
}
