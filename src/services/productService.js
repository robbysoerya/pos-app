import * as XLSX from 'xlsx'
import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch all products sorted by name.
 */
export const getAllProductsQuery = () => {
    return db.products.toArray().then(ps => ps.sort((a, b) => a.name.localeCompare(b.name)))
}

/**
 * Returns a query promise to retrieve products, optionally filtered by category and/or search term.
 * @param {number|null} activeCat
 * @param {string} searchInput
 */
export const getFilteredProductsQuery = async (activeCat, searchInput, limit = 50) => {
    let q
    if (activeCat !== null) {
        q = db.products.where('categoryId').equals(activeCat)
    } else {
        q = db.products.orderBy('name')
    }
    if (!searchInput.trim()) {
        return q.limit(limit).toArray()
    }
    const s = searchInput.toLowerCase()
    return q.filter(p => p.name.toLowerCase().includes(s) || (p.barcode && p.barcode.includes(s))).limit(limit).toArray()
}

/**
 * Find products matching a specific barcode.
 * @param {string} barcode
 */
export const getProductsByBarcode = (barcode) => {
    return db.products.where('barcode').equals(barcode).toArray()
}

/**
 * Adds a new product.
 * @param {object} payload
 */
export const addProduct = (payload) => {
    return db.products.add(payload)
}

/**
 * Updates an existing product.
 * @param {number|string} id
 * @param {object} payload
 */
export const updateProduct = (id, payload) => {
    return db.products.update(id, payload)
}

/**
 * Deletes a product by id.
 * @param {number|string} id
 */
export const deleteProduct = (id) => {
    return db.products.delete(id)
}

/**
 * Fetches a product by its id.
 * @param {number|string} id
 */
export const getProductById = (id) => {
    return db.products.get(id)
}

/**
 * Updates product stock and creates a stock movement record.
 * @param {number|string} productId
 * @param {number} newStock
 * @param {number} delta
 * @param {string} reason
 */
export const updateProductStock = async (productId, newStock, delta, reason = 'manual') => {
    return db.transaction('rw', [db.products, db.stock_movements], async () => {
        await db.products.update(productId, { stock: newStock })
        await db.stock_movements.add({
            productId,
            delta,
            reason,
            createdAt: new Date().toISOString()
        })
    })
}

/**
 * Handles Excel import bulk processing in a single transaction.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName
 */
export const importExcelProducts = async (arrayBuffer, fileName) => {
    const wb = XLSX.read(arrayBuffer, { type: 'array' })
    let totalProducts = 0
    let updatedProducts = 0

    await db.transaction('rw', [db.categories, db.products], async () => {
        for (let sheetIdx = 0; sheetIdx < wb.SheetNames.length; sheetIdx++) {
            const sheetName = wb.SheetNames[sheetIdx]
            const ws = wb.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 })

            if (jsonData.length === 0) continue

            const headers = jsonData[0].map(h => String(h).toLowerCase().trim())
            const namaIdx = headers.indexOf('nama')
            const hargaJualIdx = headers.indexOf('harga jual')
            const hargaGrosirIdx = headers.indexOf('harga grosir')
            const barcodeIdx = headers.indexOf('barcode')

            if (namaIdx === -1 || hargaJualIdx === -1) {
                throw new Error(`Sheet "${sheetName}": Kolom "nama" dan "harga jual" wajib ada`)
            }

            let categoryName = sheetName.toLowerCase().trim()
            if (wb.SheetNames.length === 1 && fileName.toLowerCase().endsWith('.csv')) {
                const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
                categoryName = fileNameWithoutExt.toLowerCase().trim()
            }
            let categoryId = null

            if (categoryName) {
                let existingCat = await db.categories.where('name').equalsIgnoreCase(categoryName).first()
                if (!existingCat) {
                    categoryId = await db.categories.add({ name: categoryName })
                } else {
                    categoryId = existingCat.id
                }
            }

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i]
                const nama = String(row[namaIdx] || '').trim()
                if (!nama) continue

                const hargaJual = Number(String(row[hargaJualIdx] || '').replace(/[^0-9]/g, ''))
                if (!hargaJual || isNaN(hargaJual)) continue

                const hargaGrosir = hargaGrosirIdx !== -1 ? Number(String(row[hargaGrosirIdx] || '').replace(/[^0-9]/g, '')) : hargaJual
                const barcode = barcodeIdx !== -1 ? String(row[barcodeIdx] || '').trim() : null

                const payload = {
                    name: nama,
                    categoryId,
                    price: hargaJual,
                    resellerPrice: hargaGrosir || hargaJual,
                    stock: 0,
                    low_stock_threshold: 0,
                    barcode: barcode || null,
                    trackStock: false,
                }

                if (barcode) {
                    const existing = await db.products.where('barcode').equals(barcode).toArray()
                    const sameName = existing.find(p => p.name.toLowerCase() === nama.toLowerCase())
                    if (sameName) {
                        await db.products.update(sameName.id, {
                            name: nama,
                            categoryId,
                            price: hargaJual,
                            resellerPrice: hargaGrosir || hargaJual,
                        })
                        updatedProducts++
                        continue
                    }
                }

                await db.products.add(payload)
                totalProducts++
            }
        }
    })

    return { totalProducts, updatedProducts }
}
