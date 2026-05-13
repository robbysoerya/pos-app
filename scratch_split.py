import re

with open("src/pages/POS.jsx", "r") as f:
    original_code = f.read()

# We know the imports:
imports_left = """import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { showToast } from './Toast.jsx'
import { useCartStore } from '../store/cartStore.js'
import db from '../db/db.js'
import { fmtCapitalize, fmtCurrency } from '../utils/format.js'
"""

imports_right = """import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import NumPad from './NumPad.jsx'
import { showToast } from './Toast.jsx'
import { useCartStore } from '../store/cartStore.js'
import db from '../db/db.js'
import { printReceipt } from '../utils/bluetooth.js'
import { fmtCurrency, fmtDateTime, fmtTxnId, parseAmount } from '../utils/format.js'
"""

imports_pos = """import POSLeft from '../components/POSLeft.jsx'
import POSRight from '../components/POSRight.jsx'
import './POS.css'

export default function POS() {
    return (
        <div className="pos-layout">
            <POSLeft />
            <POSRight />
        </div>
    )
}
"""

# Now we extract the body
lines = original_code.split('\n')

left_body = []
right_body = []

# states left
left_states = [
    "    const addItem = useCartStore(s => s.addItem)",
    "    const addCustomItem = useCartStore(s => s.addCustomItem)",
    "    const isReseller = useCartStore(s => s.isReseller)",
    "    const [activeCat, setActiveCat] = useState(null)",
    "    const [barcodeInput, setBarcodeInput] = useState('')",
    "    const [searchInput, setSearchInput] = useState('')",
    "    const [customModal, setCustomModal] = useState(false)",
    "    const [customForm, setCustomForm] = useState({ name: '', price: '', qty: '1' })",
    "    const [newProductModal, setNewProductModal] = useState(null)",
    "    const [barcodePickerModal, setBarcodePickerModal] = useState(null)",
    "    const barcodeRef = useRef()",
    "    const lastScanRef = useRef({ code: '', at: 0 })",
]

# queries left
left_queries = [
    "    const categories = useLiveQuery(() => db.categories.toArray(), [])",
    "    const unknownBarcodeActionRow = useLiveQuery(() => db.settings.get('unknownBarcodeAction'), [])",
    "    const unknownBarcodeAction = unknownBarcodeActionRow?.value || 'prompt_create'",
    "    const products = useLiveQuery(",
    "        async () => {",
    "            let q = db.products",
    "            if (activeCat !== null) q = q.where('categoryId').equals(activeCat)",
    "            let arr = await q.toArray()",
    "            if (searchInput.trim()) {",
    "                const s = searchInput.toLowerCase()",
    "                arr = arr.filter(p => p.name.toLowerCase().includes(s) || (p.barcode && p.barcode.includes(s)))",
    "            }",
    "            return arr",
    "        },",
    "        [activeCat, searchInput]",
    "    )"
]

# states right
right_states = [
    "    const items = useCartStore(s => s.rawItems)",
    "    const removeItem = useCartStore(s => s.removeItem)",
    "    const updateQty = useCartStore(s => s.updateQty)",
    "    const clearCart = useCartStore(s => s.clearCart)",
    "    const isReseller = useCartStore(s => s.isReseller)",
    "    const setIsReseller = useCartStore(s => s.setIsReseller)",
    "    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)",
    "    const [paymentStr, setPaymentStr] = useState('0')",
    "    const [checkoutLoading, setCheckoutLoading] = useState(false)",
    "    const [receiptModal, setReceiptModal] = useState(null)",
    "    const [confirmBayarModal, setConfirmBayarModal] = useState(false)",
    "    const [confirmResetModal, setConfirmResetModal] = useState(false)",
    "    const [qrisModal, setQrisModal] = useState(false)",
    "    const [qrisLoading, setQrisLoading] = useState(false)",
    "    const [qrisImage] = useState(() => localStorage.getItem('qris_image') || null)",
    "    const [debtModal, setDebtModal] = useState(false)",
    "    const [debtSearch, setDebtSearch] = useState('')",
    "    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })",
    "    const [showNewCustomer, setShowNewCustomer] = useState(false)",
    "    const [confirmDebtCustomer, setConfirmDebtCustomer] = useState(null)",
    "    const [debtLoading, setDebtLoading] = useState(false)",
]

# queries right
right_queries = [
    "    const allCustomers = useLiveQuery(() => db.customers.toArray(), [])",
    "    const payment = parseAmount(paymentStr)",
    "    const change = payment - total",
    "    const canCheckout = items.length > 0 && payment >= total",
    "    const canDebt = items.length > 0",
    "    const canQris = items.length > 0",
    "    const filteredCustomers = (allCustomers || []).filter(c =>",
    "        c.name.toLowerCase().includes(debtSearch.toLowerCase()) ||",
    "        (c.phone || '').includes(debtSearch)",
    "    )"
]

# Now we need functions. We can just use string slicing on original_code.
handleBarcodeScan_start = original_code.find("    async function handleBarcodeScan(e) {")
handleCreateAndAddProduct_start = original_code.find("    async function handleCreateAndAddProduct() {")
handleCheckout_start = original_code.find("    const handleCheckout = useCallback(async () => {")

handleBarcodeScan_end = handleCreateAndAddProduct_start
handleCreateAndAddProduct_end = handleCheckout_start

handleQrisCheckout_start = original_code.find("    const handleQrisCheckout = useCallback(async () => {")
handleDebtCheckout_start = original_code.find("    const handleDebtCheckout = useCallback(async (customer) => {")
return_start = original_code.find("    return (")

left_funcs = original_code[handleBarcodeScan_start:handleCreateAndAddProduct_end]
right_funcs = original_code[handleCheckout_start:return_start]

# JSX splitting
pos_left_start = original_code.find('            {/* Left: Product Grid */}')
pos_right_start = original_code.find('            {/* Right: Cart + Payment */}')

pos_left_jsx = original_code[pos_left_start:pos_right_start].rstrip()

# right side up to customModal
customModal_start = original_code.find('            <Modal open={customModal} onClose={() => setCustomModal(false)} title="Tambah Item Kustom" width="400px">')
pos_right_jsx = original_code[pos_right_start:customModal_start].rstrip()

newProductModal_start = original_code.find('            <Modal open={!!newProductModal}')
barcodePickerModal_start = original_code.find('            {/* ── Barcode Picker Modal (duplicate barcodes) ── */}')
receiptModal_start = original_code.find('            <Modal open={!!receiptModal}')

left_modals_1 = original_code[customModal_start:receiptModal_start].rstrip()

confirmBayarModal_start = original_code.find('            <Modal open={confirmBayarModal}')
right_modals_1 = original_code[receiptModal_start:confirmBayarModal_start].rstrip()

closing_div_start = original_code.find('        </div>\n    )\n}')
right_modals_2 = original_code[confirmBayarModal_start:closing_div_start].rstrip()

receiptPreview_start = original_code.find('function ReceiptPreview({ txn, onClose }) {')
receiptPreview_code = original_code[receiptPreview_start:] if receiptPreview_start != -1 else ""

with open("src/components/POSLeft.jsx", "w") as f:
    f.write(imports_left)
    f.write("\nexport default function POSLeft() {\n")
    f.write("\n".join(left_states))
    f.write("\n\n")
    f.write("\n".join(left_queries))
    f.write("\n\n")
    f.write(left_funcs)
    f.write("    return (\n")
    f.write(pos_left_jsx)
    f.write("\n")
    f.write(left_modals_1)
    f.write("\n    )\n}\n")

with open("src/components/POSRight.jsx", "w") as f:
    f.write(imports_right)
    f.write("\nexport default function POSRight() {\n")
    f.write("\n".join(right_states))
    f.write("\n\n")
    f.write("\n".join(right_queries))
    f.write("\n\n")
    f.write(right_funcs)
    f.write("    return (\n")
    f.write(pos_right_jsx)
    f.write("\n")
    f.write(right_modals_1)
    f.write("\n")
    f.write(right_modals_2)
    f.write("\n    )\n}\n\n")
    f.write(receiptPreview_code)

with open("src/pages/POS.jsx", "w") as f:
    f.write(imports_pos)

print("Split completed successfully.")
