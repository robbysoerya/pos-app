import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch transactions, optionally filtered by paymentType.
 * @param {string} filter 'all' | 'cash' | 'qris' | 'debt'
 */
export const getTransactionsQuery = async (filter = 'all') => {
    let q = db.transactions
    if (filter && filter !== 'all') {
        q = q.where('paymentType').equals(filter)
    }
    const arr = await q.toArray()
    // Sort in reverse order (newest first)
    return arr.sort((a, b) => b.id - a.id)
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
