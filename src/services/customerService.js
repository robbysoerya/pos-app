import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch all customers.
 */
export const getCustomersQuery = () => {
    return db.customers.toArray()
}

/**
 * Adds a new customer.
 * @param {string} name
 * @param {string} phone
 */
export const addCustomer = async (name, phone) => {
    const cleanName = name.trim()
    const existing = await db.customers.where('name').equalsIgnoreCase(cleanName).count()
    if (existing > 0) {
        throw new Error('Nama pelanggan sudah digunakan')
    }
    return db.customers.add({ name: cleanName, phone: phone.trim() })
}

/**
 * Returns a query promise to retrieve debts for a specific customer.
 * @param {number|string} customerId
 */
export const getCustomerDebtsQuery = (customerId) => {
    return db.debts.where('customerId').equals(customerId).toArray()
}

/**
 * Fetches a single transaction by ID (helper).
 * @param {number|string} id
 */
export const getTransactionById = (id) => {
    return db.transactions.get(id)
}

/**
 * Fetches all payments recorded for a specific debt.
 * @param {number|string} debtId
 */
export const getDebtPayments = (debtId) => {
    return db.debt_payments.where('debtId').equals(debtId).toArray()
}

/**
 * Processes a payment towards a customer's debt.
 */
export const recordDebtPayment = async ({ debt, payAmountNum, note }) => {
    const now = new Date().toISOString()
    const nextPaidAmount = debt.paidAmount + payAmountNum
    const nextStatus = nextPaidAmount >= debt.amount ? 'lunas' : 'partial'

    await db.transaction('rw', [db.debts, db.debt_payments], async () => {
        await db.debt_payments.add({
            debtId: debt.id,
            amount: payAmountNum,
            note: note.trim() || 'Bayar Cicilan',
            createdAt: now
        })
        await db.debts.update(debt.id, {
            paidAmount: nextPaidAmount,
            status: nextStatus
        })
    })
}

/**
 * Distributes a lump-sum payment across all unpaid debts, oldest first.
 */
export const recordBulkDebtPayments = async ({ unpaidDebts, amount, note }) => {
    const now = new Date().toISOString()
    const oldestFirstUnpaid = [...unpaidDebts].reverse()

    await db.transaction('rw', [db.debts, db.debt_payments], async () => {
        let remainingPayment = amount

        for (const debt of oldestFirstUnpaid) {
            if (remainingPayment <= 0) break

            const debtOwed = debt.amount - debt.paidAmount
            if (debtOwed <= 0) continue

            const appliedAmount = Math.min(debtOwed, remainingPayment)

            await db.debt_payments.add({
                debtId: debt.id,
                amount: appliedAmount,
                note: note.trim() || 'Bayar Piutang',
                createdAt: now,
            })

            const newPaid = debt.paidAmount + appliedAmount
            const newStatus = newPaid >= debt.amount ? 'lunas' : 'partial'
            await db.debts.update(debt.id, {
                paidAmount: newPaid,
                status: newStatus,
            })

            remainingPayment -= appliedAmount
        }
    })
}

/**
 * Returns a list of all debt payments with their resolved customer names.
 */
export const getResolvedDebtPaymentsQuery = async () => {
    const p = await db.debt_payments.toArray()
    return Promise.all(p.map(async (pay) => {
        const debt = await db.debts.get(pay.debtId)
        let customerName = 'Pelanggan'
        if (debt) {
            const customer = await db.customers.get(debt.customerId)
            if (customer) customerName = customer.name
        }
        return { ...pay, customerName }
    }))
}

/**
 * Resolves customer name for a transaction if it was checked out as a debt.
 * @param {number|string} txnId
 */
export const getCustomerNameByTransactionId = async (txnId) => {
    const debt = await db.debts.where('transactionId').equals(txnId).first()
    if (debt) {
        const customer = await db.customers.get(debt.customerId)
        return customer?.name || 'Pelanggan'
    }
    return null
}
