import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
    rawItems: [],
    isReseller: false,

    setIsReseller: (val) => set({ isReseller: val }),

    addItem: (product) => set(state => {
        const appliedPrice = state.isReseller ? (product.resellerPrice || product.price) : product.price
        const cartItemId = `${product.id}_${appliedPrice}`

        const currentTotalQty = state.rawItems.filter(i => i.productId === product.id).reduce((sum, i) => sum + i.qty, 0)
        if (product.trackStock && currentTotalQty >= product.stock) return state

        const existing = state.rawItems.find(i => i.cartItemId === cartItemId)
        if (existing) {
            return { rawItems: state.rawItems.map(i => i.cartItemId === cartItemId ? { ...i, qty: i.qty + 1 } : i) }
        }
        if (product.trackStock && product.stock <= 0) return state
        return {
            rawItems: [...state.rawItems, {
                cartItemId,
                productId: product.id,
                name: product.name,
                price: appliedPrice,
                qty: 1,
                stock: product.trackStock ? product.stock : Infinity
            }]
        }
    }),

    addCustomItem: ({ name, price, qty }) => set(state => {
        const tempId = 'custom_' + Date.now()
        return {
            rawItems: [...state.rawItems, {
                cartItemId: tempId,
                productId: tempId,
                name: name,
                price: price,
                qty: qty,
                stock: Infinity,
                isCustom: true
            }]
        }
    }),

    removeItem: (cartItemId) => set(state => ({
        rawItems: state.rawItems.filter(i => i.cartItemId !== cartItemId)
    })),

    updateQty: (cartItemId, qty) => set(state => {
        const item = state.rawItems.find(i => i.cartItemId === cartItemId)
        if (!item) return state
        
        const otherItemsQty = state.rawItems.filter(i => i.productId === item.productId && i.cartItemId !== cartItemId).reduce((sum, i) => sum + i.qty, 0)
        const maxAllowedQty = item.stock === Infinity ? Infinity : item.stock - otherItemsQty
        const newQty = Math.max(1, Math.min(qty, maxAllowedQty))
        
        return {
            rawItems: state.rawItems.map(i => i.cartItemId === cartItemId ? { ...i, qty: newQty } : i)
        }
    }),

    clearCart: () => set({ rawItems: [], isReseller: false }),
}))
