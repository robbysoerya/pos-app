import Dexie from 'dexie'

export const db = new Dexie('POSDatabase')

db.version(1).stores({
    categories: '++id, name',
    products: '++id, name, categoryId, price, stock, low_stock_threshold',
    transactions: '++id, createdAt, total, payment, change, paymentType',
    transaction_items: '++id, transactionId, productId, name, price, qty',
    stock_movements: '++id, productId, delta, reason, createdAt',
    settings: 'key',
})

// v2: adds barcode index to products (sparse — only indexed when value is present)
db.version(2).stores({
    products: '++id, name, categoryId, price, stock, low_stock_threshold, barcode',
})

// v3: adds customer debt / pay-later support
db.version(3).stores({
    customers: '++id, name, phone',
    debts: '++id, customerId, transactionId, status, createdAt',
    debt_payments: '++id, debtId, createdAt',
})

export default db
