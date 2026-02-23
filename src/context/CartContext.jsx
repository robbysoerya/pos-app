import { createContext, useCallback, useContext, useState } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
    const [rawItems, setRawItems] = useState([]) // [{productId, name, retailPrice, resellerPrice, qty, stock}]
    const [isReseller, setIsReseller] = useState(false)

    const addItem = useCallback((product) => {
        setRawItems(prev => {
            const existing = prev.find(i => i.productId === product.id)
            if (existing) {
                if (existing.qty >= product.stock) return prev // can't exceed stock
                return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i)
            }
            if (product.stock <= 0) return prev
            return [...prev, {
                productId: product.id,
                name: product.name,
                retailPrice: product.price,
                resellerPrice: product.resellerPrice || product.price,
                qty: 1,
                stock: product.stock
            }]
        })
    }, [])

    const addCustomItem = useCallback(({ name, price, qty }) => {
        setRawItems(prev => {
            const tempId = 'custom_' + Date.now()
            return [...prev, {
                productId: tempId,
                name: name,
                retailPrice: price,
                resellerPrice: price,
                qty: qty,
                stock: Infinity,
                isCustom: true
            }]
        })
    }, [])

    const removeItem = useCallback((productId) => {
        setRawItems(prev => prev.filter(i => i.productId !== productId))
    }, [])

    const updateQty = useCallback((productId, qty) => {
        setRawItems(prev => prev.map(i => {
            if (i.productId !== productId) return i
            const newQty = Math.max(1, Math.min(qty, i.stock))
            return { ...i, qty: newQty }
        }))
    }, [])

    const clearCart = useCallback(() => setRawItems([]), [])

    const items = rawItems.map(i => ({
        ...i,
        price: isReseller ? i.resellerPrice : i.retailPrice
    }))

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const itemCount = items.reduce((sum, i) => sum + i.qty, 0)

    return (
        <CartContext.Provider value={{
            items, addItem, addCustomItem, removeItem, updateQty, clearCart, total, itemCount,
            isReseller, setIsReseller
        }}>
            {children}
        </CartContext.Provider>
    )
}

export function useCart() {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error('useCart must be inside CartProvider')
    return ctx
}
