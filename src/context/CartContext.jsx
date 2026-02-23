import { createContext, useCallback, useContext, useState } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
    const [items, setItems] = useState([]) // [{productId, name, price, qty, stock}]

    const addItem = useCallback((product) => {
        setItems(prev => {
            const existing = prev.find(i => i.productId === product.id)
            if (existing) {
                if (existing.qty >= product.stock) return prev // can't exceed stock
                return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i)
            }
            if (product.stock <= 0) return prev
            return [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1, stock: product.stock }]
        })
    }, [])

    const removeItem = useCallback((productId) => {
        setItems(prev => prev.filter(i => i.productId !== productId))
    }, [])

    const updateQty = useCallback((productId, qty) => {
        setItems(prev => prev.map(i => {
            if (i.productId !== productId) return i
            const newQty = Math.max(1, Math.min(qty, i.stock))
            return { ...i, qty: newQty }
        }))
    }, [])

    const clearCart = useCallback(() => setItems([]), [])

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const itemCount = items.reduce((sum, i) => sum + i.qty, 0)

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clearCart, total, itemCount }}>
            {children}
        </CartContext.Provider>
    )
}

export function useCart() {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error('useCart must be inside CartProvider')
    return ctx
}
