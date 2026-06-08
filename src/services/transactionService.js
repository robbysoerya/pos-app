import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch transactions, optionally filtered by paymentType.
 * @param {string} filter 'all' | 'cash' | 'qris' | 'debt'
 * @param {number} [limit]
 */
export const getTransactionsQuery = async (filter = 'all', limit) => {
    let q
    if (filter && filter !== 'all') {
        q = db.transactions.where('paymentType').equals(filter).reverse()
    } else {
        q = db.transactions.orderBy('id').reverse()
    }
    if (limit) {
        return q.limit(limit).toArray()
    }
    return q.toArray()
}
/**
 * Returns a query promise to retrieve transactions within a date range using the createdAt index.
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 * @param {string} filter 'all' | 'cash' | 'qris' | 'debt'
 */
export const getTransactionsByDateRangeQuery = async (startDate, endDate, filter = 'all') => {
    if (!startDate && !endDate) {
        return getTransactionsQuery(filter)
    }
    
    // Construct ISO bounds for the local YYYY-MM-DD dates (assuming local dates are compatible with ISO text sorting)
    const startISO = startDate ? `${startDate}T00:00:00.000` : '0000-00-00T00:00:00.000'
    const endISO = endDate ? `${endDate}T23:59:59.999` : '9999-12-31T23:59:59.999'
    
    let collection = db.transactions.where('createdAt').between(startISO, endISO, true, true)
    
    if (filter && filter !== 'all') {
        collection = collection.filter(t => t.paymentType === filter)
    }
    
    return collection.reverse().toArray()
}


/**
 * Retrieves all items associated with a transaction.
 * @param {number|string} transactionId
 */
export const getTransactionItems = (transactionId) => {
    return db.table('transaction_items').where('transactionId').equals(transactionId).toArray()
}

/**
 * Processes a Cash Checkout.
 */
export const createCashCheckout = async ({ total, payment, change, items }) => {
    const now = new Date().toISOString()
    const txnItems = items.map(i => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
    }))

    let txnId
    await db.transaction('rw', [db.transactions, db.products, db.stock_movements, db.table('transaction_items')], async () => {
        txnId = await db.transactions.add({
            createdAt: now,
            total,
            payment,
            change,
            itemCount: items.length,
            paymentType: 'cash' // Explicit type
        })

        for (const item of items) {
            if (typeof item.productId === 'string' && item.productId.startsWith('custom_')) {
                continue // Skip stock deduction for manual items
            }
            await db.products.where('id').equals(item.productId).modify(p => {
                p.stock = Math.max(0, p.stock - item.qty)
            })
            await db.stock_movements.add({
                productId: item.productId,
                delta: -item.qty,
                reason: 'sale',
                createdAt: now,
                transactionId: txnId,
            })
        }

        for (const item of txnItems) {
            await db.table('transaction_items').add({ transactionId: txnId, ...item })
        }
    })

    return { id: txnId, createdAt: now, total, payment, change, items: txnItems, paymentType: 'cash' }
}

/**
 * Processes a QRIS Checkout.
 */
export const createQrisCheckout = async ({ total, items }) => {
    const now = new Date().toISOString()
    const txnItems = items.map(i => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
    }))

    let txnId
    await db.transaction('rw', [db.transactions, db.products, db.stock_movements, db.table('transaction_items')], async () => {
        txnId = await db.transactions.add({
            createdAt: now,
            total,
            payment: total,
            change: 0,
            itemCount: items.length,
            paymentType: 'qris',
        })

        for (const item of items) {
            if (typeof item.productId === 'string' && item.productId.startsWith('custom_')) {
                continue
            }
            await db.products.where('id').equals(item.productId).modify(p => {
                p.stock = Math.max(0, p.stock - item.qty)
            })
            await db.stock_movements.add({
                productId: item.productId,
                delta: -item.qty,
                reason: 'sale',
                createdAt: now,
                transactionId: txnId,
            })
        }

        for (const item of txnItems) {
            await db.table('transaction_items').add({ transactionId: txnId, ...item })
        }
    })

    return { id: txnId, createdAt: now, total, payment: total, change: 0, items: txnItems, paymentType: 'qris' }
}

/**
 * Processes a Debt (Pay Later) Checkout.
 */
export const createDebtCheckout = async ({ total, payment, customer, items }) => {
    const now = new Date().toISOString()
    const txnItems = items.map(i => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty
    }))

    let txnId
    await db.transaction('rw', [
        db.transactions,
        db.products,
        db.stock_movements,
        db.table('transaction_items'),
        db.debts,
        db.debt_payments
    ], async () => {
        txnId = await db.transactions.add({
            createdAt: now,
            total,
            payment,
            change: 0,
            itemCount: items.length,
            paymentType: 'debt',
        })

        for (const item of items) {
            if (typeof item.productId === 'string' && item.productId.startsWith('custom_')) {
                continue
            }
            await db.products.where('id').equals(item.productId).modify(p => {
                p.stock = Math.max(0, p.stock - item.qty)
            })
            await db.stock_movements.add({
                productId: item.productId,
                delta: -item.qty,
                reason: 'sale',
                createdAt: now,
                transactionId: txnId,
            })
        }

        for (const item of txnItems) {
            await db.table('transaction_items').add({ transactionId: txnId, ...item })
        }

        const newDebtId = await db.debts.add({
            customerId: customer.id,
            transactionId: txnId,
            amount: total,
            paidAmount: payment,
            status: payment > 0 ? 'partial' : 'pending',
            createdAt: now,
        })

        if (payment > 0) {
            await db.debt_payments.add({
                debtId: newDebtId,
                amount: payment,
                note: 'DP / Bayar Sebagian',
                createdAt: now
            })
        }
    })

    return {
        id: txnId,
        createdAt: now,
        total,
        payment,
        change: 0,
        items: txnItems,
        paymentType: 'debt',
        customerName: customer.name
    }
}
