import db from '../db/db.js'

/**
 * Returns a Dexie query promise to fetch a setting row.
 * @param {string} key
 */
export const getSettingQuery = (key) => {
    return db.settings.get(key)
}

/**
 * Saves a setting key-value pair.
 * @param {string} key
 * @param {any} value
 */
export const saveSetting = async (key, value) => {
    return db.settings.put({ key, value })
}

/**
 * Exports the complete database as a backup object.
 */
export const exportBackup = async () => {
    const backup = {}
    const tableNames = db.tables.map(t => t.name)
    for (const name of tableNames) {
        backup[name] = await db.table(name).toArray()
    }
    return backup
}

/**
 * Imports database tables from a backup object.
 * @param {object} data
 */
export const importBackup = async (data) => {
    return db.transaction('rw', db.tables, async () => {
        const tableNames = db.tables.map(t => t.name)
        for (const name of tableNames) {
            if (data[name]) {
                await db.table(name).clear()
                await db.table(name).bulkAdd(data[name])
            }
        }
    })
}

/**
 * Clears all tables in the database.
 */
export const clearAllData = () => {
    return db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
            await table.clear()
        }
    })
}
