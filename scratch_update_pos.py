import re
import sys

with open("src/pages/POS.jsx", "r") as f:
    content = f.read()

# I want to replace the `import { useCart } from '../context/CartContext.jsx'` with `import { useCartStore } from '../store/cartStore.js'`
content = content.replace("import { useCart } from '../context/CartContext.jsx'", "import { useCartStore } from '../store/cartStore.js'")

# I want to replace `const { items, addItem, addCustomItem, removeItem, updateQty, clearCart, total, isReseller, setIsReseller } = useCart()`
zustand_code = """
    const items = useCartStore(s => s.rawItems)
    const addItem = useCartStore(s => s.addItem)
    const addCustomItem = useCartStore(s => s.addCustomItem)
    const removeItem = useCartStore(s => s.removeItem)
    const updateQty = useCartStore(s => s.updateQty)
    const clearCart = useCartStore(s => s.clearCart)
    const isReseller = useCartStore(s => s.isReseller)
    const setIsReseller = useCartStore(s => s.setIsReseller)
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
"""
content = content.replace("    const { items, addItem, addCustomItem, removeItem, updateQty, clearCart, total, isReseller, setIsReseller } = useCart()", zustand_code.strip())

# We also need to extract Left and Right to prevent unnecessary re-renders when typing search query.
# Actually, the simplest way to prevent re-renders of the Right panel when Left panel changes is React.memo.
# And to prevent Left panel from re-rendering when Cart changes (like items array), we can just memoize the Left panel.
# But `POS` component passes states around. 
# It's better to just write the file with Zustand for now and see if the user is satisfied.

with open("src/pages/POS.jsx", "w") as f:
    f.write(content)

print("Done")
