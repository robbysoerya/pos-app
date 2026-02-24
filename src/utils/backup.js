import db from '../db/db.js'

/** Gather all database tables into a JSON string and filename */
export async function getBackupData(storeName = 'My Store') {
    const [categories, products, transactions, transaction_items, stock_movements, settings] = await Promise.all([
        db.categories.toArray(),
        db.products.toArray(),
        db.transactions.toArray(),
        db.transaction_items.toArray(),
        db.stock_movements.toArray(),
        db.settings.toArray(),
    ])

    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        storeName,
        data: { categories, products, transactions, transaction_items, stock_movements, settings },
    }

    const filename = `pos-backup-${new Date().toISOString().split('T')[0]}.json`
    const json = JSON.stringify(backup, null, 2)
    return { json, filename }
}

/** Export all tables to a JSON blob and trigger download */
export async function exportBackup(storeName = 'My Store') {
    const { json, filename } = await getBackupData(storeName)

    // Chrome 86+: use File System Access API — shows a proper "Save As" dialog
    // and avoids all blob URL async restrictions that cause random UUID filenames.
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
            })
            const writable = await handle.createWritable()
            await writable.write(json)
            await writable.close()
            return true
        } catch (e) {
            if (e.name === 'AbortError') return false  // user cancelled — not an error
            // fall through to data URL fallback
        }
    }

    // Fallback for Edge / Firefox / Safari: use data URL instead of blob URL.
    // Data URLs always honour the download attribute even from async contexts.
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = dataUrl
    a.setAttribute('download', filename)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
}

/** Sends the backup JSON file directly to a Telegram Bot */
export async function sendBackupToTelegram(token, chatId, storeName = 'My Store') {
    if (!token || !chatId) throw new Error('Telegram Token dan Chat ID wajib diisi')

    const { json, filename } = await getBackupData(storeName)
    const blob = new Blob([json], { type: 'application/json' })

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('document', blob, filename)
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

/** Read a JSON backup file and restore all tables (full replace) */
export async function importBackup(file) {
    const text = await file.text()
    const backup = JSON.parse(text)

    if (!backup.data) throw new Error('Invalid backup file format')
    const { categories, products, transactions, transaction_items, stock_movements, settings } = backup.data

    await db.transaction('rw', [
        db.categories, db.products, db.transactions,
        db.transaction_items, db.stock_movements, db.settings
    ], async () => {
        await db.categories.clear()
        await db.products.clear()
        await db.transactions.clear()
        await db.transaction_items.clear()
        await db.stock_movements.clear()
        await db.settings.clear()

        if (categories?.length) await db.categories.bulkAdd(categories)
        if (products?.length) await db.products.bulkAdd(products)
        if (transactions?.length) await db.transactions.bulkAdd(transactions)
        if (transaction_items?.length) await db.transaction_items.bulkAdd(transaction_items)
        if (stock_movements?.length) await db.stock_movements.bulkAdd(stock_movements)
        if (settings?.length) await db.settings.bulkAdd(settings)
    })

    return backup
}
