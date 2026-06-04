import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch all categories sorted by name.
 */
export const getCategoriesQuery = () => db.categories.orderBy('name').toArray()

/**
 * Adds a new category (lower-cased and trimmed).
 * @param {string} name
 */
export const addCategory = (name) => {
    return db.categories.add({ name: name.trim().toLowerCase() })
}

/**
 * Updates an existing category's name.
 * @param {number|string} id
 * @param {string} name
 */
export const updateCategory = (id, name) => {
    return db.categories.update(id, { name: name.trim().toLowerCase() })
}

/**
 * Deletes a category by id.
 * @param {number|string} id
 */
export const deleteCategory = (id) => {
    return db.categories.delete(id)
}

/**
 * Counts the number of products that are under a given category ID.
 * @param {number|string} categoryId
 */
export const getProductCountByCategory = (categoryId) => {
    return db.products.where('categoryId').equals(categoryId).count()
}
