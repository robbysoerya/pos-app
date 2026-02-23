import Dexie from 'dexie'

export const db = new Dexie('POSDatabase')

db.version(1).stores({
    categories: '++id, name',
    products: '++id, name, categoryId, price, stock, low_stock_threshold',
    transactions: '++id, createdAt, total, payment, change',
    transaction_items: '++id, transactionId, productId, name, price, qty',
    stock_movements: '++id, productId, delta, reason, createdAt',
    settings: 'key',
})

// v2: adds barcode index to products (sparse — only indexed when value is present)
db.version(2).stores({
    products: '++id, name, categoryId, price, stock, low_stock_threshold, barcode',
})

export default db
