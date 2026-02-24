import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import NumPad from '../components/NumPad.jsx'
import { showToast } from '../components/Toast.jsx'
import { useCart } from '../context/CartContext.jsx'
import db from '../db/db.js'
import { isPrinterConnected, printReceipt } from '../utils/bluetooth.js'
import { fmtCurrency, fmtDateTime, fmtTxnId, parseAmount } from '../utils/format.js'
import './POS.css'

export default function POS() {
    const { items, addItem, addCustomItem, removeItem, updateQty, clearCart, total, isReseller, setIsReseller } = useCart()
    const [activeCat, setActiveCat] = useState(null)
    const [paymentStr, setPaymentStr] = useState('0')
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [receiptModal, setReceiptModal] = useState(null)
    const [confirmBayarModal, setConfirmBayarModal] = useState(false)
    const [confirmResetModal, setConfirmResetModal] = useState(false)
    const [barcodeInput, setBarcodeInput] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [customModal, setCustomModal] = useState(false)
    const [customForm, setCustomForm] = useState({ name: '', price: '', qty: '1' })
    const [newProductModal, setNewProductModal] = useState(null)
    const barcodeRef = useRef()

    // Pay Later (Hutang) state
    const [debtModal, setDebtModal] = useState(false)
    const [debtSearch, setDebtSearch] = useState('')
    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
    const [showNewCustomer, setShowNewCustomer] = useState(false)
    const [confirmDebtCustomer, setConfirmDebtCustomer] = useState(null)
    const [debtLoading, setDebtLoading] = useState(false)

    const categories = useLiveQuery(() => db.categories.toArray(), [])
    const allCustomers = useLiveQuery(() => db.customers.toArray(), [])
    const products = useLiveQuery(
        async () => {
            let q = db.products
            if (activeCat !== null) q = q.where('categoryId').equals(activeCat)
            let arr = await q.toArray()
            if (searchInput.trim()) {
                const s = searchInput.toLowerCase()
                arr = arr.filter(p => p.name.toLowerCase().includes(s) || (p.barcode && p.barcode.includes(s)))
            }
            return arr
        },
        [activeCat, searchInput]
    )

    const payment = parseAmount(paymentStr)
    const change = payment - total
    const canCheckout = items.length > 0 && payment >= total
    const canDebt = items.length > 0

    const filteredCustomers = (allCustomers || []).filter(c =>
        c.name.toLowerCase().includes(debtSearch.toLowerCase()) ||
        (c.phone || '').includes(debtSearch)
    )

    async function handleBarcodeScan(e) {
        e.preventDefault()
        const code = barcodeInput.trim()
        if (!code) return
        const product = await db.products.where('barcode').equals(code).first()
        if (!product) {
            // If not found, open a form to register the new product
            setNewProductModal({ barcode: code, name: '', price: '', stock: '' })
            return
        }
        addItem(product)
        showToast(`${product.name} ditambahkan`, 'success')
        setBarcodeInput('')
        barcodeRef.current?.focus()
    }

    async function handleCreateAndAddProduct() {
        try {
            if (!newProductModal.name.trim()) return showToast('Nama diperlukan', 'error')
            if (!newProductModal.price) return showToast('Harga diperlukan', 'error')

            const payload = {
                name: newProductModal.name.trim(),
                categoryId: null,
                price: Number(newProductModal.price),
                resellerPrice: Number(newProductModal.price),
                stock: Number(newProductModal.stock) || 0,
                low_stock_threshold: 0,
                barcode: newProductModal.barcode
            }

            const newId = await db.products.add(payload)
            const created = await db.products.get(newId)

            addItem(created)
            showToast(`${created.name} berhasil ditambahkan ke database & keranjang`, 'success')

            setNewProductModal(null)
            setBarcodeInput('')
            barcodeRef.current?.focus()
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        }
    }

    const handleCheckout = useCallback(async () => {
        if (!canCheckout || checkoutLoading) return
        setCheckoutLoading(true)
        try {
            const now = new Date().toISOString()
            const txnItems = items.map(i => ({
                productId: i.productId, name: i.name, price: i.price, qty: i.qty,
            }))

            let txnId
            await db.transaction('rw', [db.transactions, db.products, db.stock_movements, db.table('transaction_items')], async () => {
                txnId = await db.transactions.add({
                    createdAt: now, total, payment, change, itemCount: items.length,
                })
                for (const item of items) {
                    if (typeof item.productId === 'string' && item.productId.startsWith('custom_')) {
                        continue // Skip stock deduction for custom items
                    }
                    await db.products.where('id').equals(item.productId).modify(p => {
                        p.stock = Math.max(0, p.stock - item.qty)
                    })
                    await db.stock_movements.add({
                        productId: item.productId, delta: -item.qty,
                        reason: 'sale', createdAt: now, transactionId: txnId,
                    })
                }
                for (const item of txnItems) {
                    await db.table('transaction_items').add({ transactionId: txnId, ...item })
                }
            })

            const fullTxn = { id: txnId, createdAt: now, total, payment, change, items: txnItems }
            clearCart()
            setPaymentStr('0')
            setConfirmBayarModal(false)
            setReceiptModal(fullTxn)


            showToast('Transaksi berhasil!', 'success')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setCheckoutLoading(false)
        }
    }, [canCheckout, checkoutLoading, items, total, payment, change, clearCart])

    const handleDebtCheckout = useCallback(async (customer) => {
        if (!canDebt || debtLoading) return
        setDebtLoading(true)
        try {
            const now = new Date().toISOString()
            const txnItems = items.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty }))

            let txnId
            await db.transaction('rw', [db.transactions, db.products, db.stock_movements, db.table('transaction_items'), db.debts, db.debt_payments], async () => {
                txnId = await db.transactions.add({
                    createdAt: now, total, payment, change: 0,
                    itemCount: items.length, paymentType: 'debt',
                })
                for (const item of items) {
                    if (typeof item.productId === 'string' && item.productId.startsWith('custom_')) continue
                    await db.products.where('id').equals(item.productId).modify(p => {
                        p.stock = Math.max(0, p.stock - item.qty)
                    })
                    await db.stock_movements.add({
                        productId: item.productId, delta: -item.qty,
                        reason: 'sale', createdAt: now, transactionId: txnId,
                    })
                }
                for (const item of txnItems) {
                    await db.table('transaction_items').add({ transactionId: txnId, ...item })
                }
                const newDebtId = await db.debts.add({
                    customerId: customer.id, transactionId: txnId,
                    amount: total, paidAmount: payment,
                    status: payment > 0 ? 'partial' : 'pending', createdAt: now,
                })
                if (payment > 0) {
                    await db.debt_payments.add({
                        debtId: newDebtId, amount: payment,
                        note: 'DP / Bayar Sebagian', createdAt: now
                    })
                }
            })

            const fullTxn = { id: txnId, createdAt: now, total, payment, change: 0, items: txnItems, paymentType: 'debt', customerName: customer.name }
            clearCart()
            setPaymentStr('0')
            setDebtModal(false)
            setConfirmDebtCustomer(null)
            setDebtSearch('')
            setShowNewCustomer(false)
            setNewCustomerForm({ name: '', phone: '' })
            setReceiptModal(fullTxn)
            showToast(`Hutang ${customer.name} dicatat!`, 'success')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setDebtLoading(false)
        }
    }, [canDebt, debtLoading, items, total, payment, clearCart])

    return (
        <div className="pos-layout">
            {/* Left: Product Grid */}
            <div className="pos-left">
                {/* Barcode scan bar */}
                <form className="barcode-bar" onSubmit={handleBarcodeScan}>
                    <Icon name="barcode_scanner" size={20} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                    <input
                        ref={barcodeRef}
                        className="barcode-input"
                        placeholder="Scan barcode..."
                        value={barcodeInput}
                        onChange={e => setBarcodeInput(e.target.value)}
                        autoComplete="off"
                    />
                    {barcodeInput && (
                        <button type="submit" className="btn btn-primary btn-sm">
                            <Icon name="add" size={16} /> Tambah
                        </button>
                    )}
                </form>

                {/* Search & Custom Item bar */}
                <div className="search-bar" style={{ display: 'flex', gap: '8px', padding: '8px 12px', background: 'var(--surface)' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--surface2)', borderRadius: 'var(--r2)', padding: '0 8px' }}>
                        <Icon name="search" size={20} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                        <input
                            className="search-input"
                            style={{ padding: '8px' }}
                            placeholder="Cari produk..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                        />
                        {searchInput && (
                            <button className="btn btn-ghost" style={{ border: 'none', padding: '4px' }} onClick={() => setSearchInput('')}>
                                <Icon name="close" size={18} />
                            </button>
                        )}
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, padding: '0 12px', height: '36px' }} onClick={() => setCustomModal(true)}>
                        <Icon name="post_add" size={18} /> Item Kustom
                    </button>
                </div>

                <div className="cat-bar scroll-x">
                    <button
                        className={'cat-btn' + (activeCat === null ? ' active' : '')}
                        onClick={() => setActiveCat(null)}
                    >Semua</button>
                    {categories?.map(c => (
                        <button
                            key={c.id}
                            className={'cat-btn' + (activeCat === c.id ? ' active' : '')}
                            onClick={() => setActiveCat(c.id)}
                        >{c.name}</button>
                    ))}
                </div>

                <div className="product-grid scroll">
                    {products?.length === 0 && (
                        <div className="empty-state">
                            <Icon name="inventory_2" size={48} className="empty-icon" />
                            <p>Belum ada produk</p>
                        </div>
                    )}
                    {products?.map(p => (
                        <button
                            key={p.id}
                            className={'product-card' + (p.stock <= 0 ? ' out-of-stock' : '')}
                            onClick={() => {
                                if (p.stock <= 0) return showToast('Stok habis!', 'error')
                                addItem(p)
                            }}
                        >
                            <div className="product-name">{p.name}</div>
                            <div className="product-price">{fmtCurrency(isReseller && p.resellerPrice ? p.resellerPrice : p.price)}</div>
                            <div className={'product-stock' + (p.stock <= (p.low_stock_threshold || 0) ? ' low' : '')}>
                                Stok: {p.stock}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right: Cart + Payment */}
            <div className="pos-right">
                <div className="cart-section scroll">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 8px' }}>
                        <h3 className="cart-title" style={{ padding: 0, margin: 0 }}>
                            <Icon name="shopping_cart" size={18} />
                            Keranjang <span className="text2">({items.length} item)</span>
                        </h3>
                        <label className="reseller-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--surface2)', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isReseller ? 'var(--primary)' : 'var(--text2)' }}>Pengecer</span>
                            <div style={{ position: 'relative', width: '32px', height: '18px', background: isReseller ? 'var(--primary)' : 'var(--border)', borderRadius: '10px', transition: 'all .2s' }}>
                                <div style={{ position: 'absolute', top: '2px', left: isReseller ? '16px' : '2px', width: '14px', height: '14px', background: '#fff', borderRadius: '50%', transition: 'all .2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                            </div>
                            <input
                                type="checkbox"
                                checked={isReseller}
                                onChange={e => setIsReseller(e.target.checked)}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                    {items.length === 0 && (
                        <div className="empty-state" style={{ padding: '24px' }}>
                            <Icon name="shopping_cart" size={48} className="empty-icon" />
                            <p>Tambah produk dari kiri</p>
                        </div>
                    )}
                    {items.map(item => (
                        <div key={item.productId} className="cart-item">
                            <div className="cart-item-info">
                                <div className="cart-item-name">{item.name}</div>
                                <div className="cart-item-price">{fmtCurrency(item.price)}</div>
                            </div>
                            <div className="cart-item-controls">
                                <button className="qty-btn" onClick={() => updateQty(item.productId, item.qty - 1)}>−</button>
                                <span className="qty-value">{item.qty}</span>
                                <button className="qty-btn" onClick={() => updateQty(item.productId, item.qty + 1)}>+</button>
                                <button className="remove-btn" onClick={() => removeItem(item.productId)}>
                                    <Icon name="delete" size={18} style={{ color: 'var(--danger, #ef4444)' }} />
                                </button>
                            </div>
                            <div className="cart-item-subtotal">{fmtCurrency(item.price * item.qty)}</div>
                        </div>
                    ))}
                </div>

                <div className="payment-section">
                    <div className="total-row">
                        <span>Total</span>
                        <span className="total-amount">{fmtCurrency(total)}</span>
                    </div>

                    <div className="payment-display">
                        <div className="payment-label">Bayar</div>
                        <div className="payment-value">{fmtCurrency(payment)}</div>
                    </div>

                    {payment > 0 && (
                        <div className={`change-row ${change < 0 ? 'insufficient' : ''}`}>
                            <span>{change < 0 ? 'Kurang' : 'Kembalian'}</span>
                            <span>{fmtCurrency(Math.abs(change))}</span>
                        </div>
                    )}

                    <NumPad
                        value={paymentStr}
                        onChange={setPaymentStr}
                        onExact={() => setPaymentStr(String(total))}
                    />

                    <div className="checkout-actions">
                        <button
                            className="btn btn-ghost"
                            onClick={() => setConfirmResetModal(true)}
                            disabled={items.length === 0 && paymentStr === '0'}
                        >
                            <Icon name="refresh" size={18} /> Reset
                        </button>
                        <button
                            className="btn btn-warning"
                            style={{ flexShrink: 0 }}
                            disabled={!canDebt || debtLoading}
                            onClick={() => setDebtModal(true)}
                            title="Catat sebagai hutang"
                        >
                            <Icon name="credit_score" size={20} /> Hutang
                        </button>
                        <button
                            id="checkout-btn"
                            className="btn btn-success btn-lg"
                            style={{ flex: 1 }}
                            disabled={!canCheckout || checkoutLoading}
                            onClick={() => setConfirmBayarModal(true)}
                        >
                            {checkoutLoading
                                ? <><Icon name="hourglass_top" size={20} /> Proses...</>
                                : <><Icon name="check_circle" size={20} filled /> Bayar</>
                            }
                        </button>
                    </div>
                </div>
            </div>

            <Modal open={customModal} onClose={() => setCustomModal(false)} title="Tambah Item Kustom" width="400px">
                <div className="flex-col gap4">
                    <div className="form-group">
                        <label>Nama Item</label>
                        <input
                            className="input"
                            placeholder="Contoh: Ongkos Kirim"
                            value={customForm.name}
                            onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                            autoFocus
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Harga (Rp)</label>
                            <input
                                className="input"
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={customForm.price ? Number(customForm.price).toLocaleString('id-ID') : ''}
                                onChange={e => setCustomForm(f => ({ ...f, price: e.target.value.replace(/\D/g, '') }))}
                            />
                        </div>
                        <div className="form-group" style={{ maxWidth: '100px' }}>
                            <label>Kuantitas</label>
                            <input
                                className="input"
                                type="number"
                                min="1"
                                value={customForm.qty}
                                onChange={e => setCustomForm(f => ({ ...f, qty: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setCustomModal(false)}>Batal</button>
                        <button
                            className="btn btn-primary btn-block"
                            disabled={!customForm.name.trim() || !customForm.price}
                            onClick={() => {
                                addCustomItem({
                                    name: customForm.name.trim(),
                                    price: Number(customForm.price) || 0,
                                    qty: Number(customForm.qty) || 1
                                })
                                setCustomModal(false)
                                setCustomForm({ name: '', price: '', qty: '1' })
                            }}
                        >
                            <Icon name="add" size={18} /> Tambah ke Keranjang
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal open={!!newProductModal} onClose={() => { setNewProductModal(null); setBarcodeInput(''); barcodeRef.current?.focus() }} title="Register Produk Baru" width="400px">
                {newProductModal && (
                    <div className="flex-col gap4">
                        <div className="empty-state" style={{ padding: '8px', background: 'var(--surface2)', borderRadius: 'var(--r2)' }}>
                            <Icon name="barcode_scanner" size={24} style={{ color: 'var(--text3)' }} />
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text2)' }}>Barcode belum terdaftar:</p>
                            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, fontFamily: 'monospace' }}>{newProductModal.barcode}</p>
                        </div>

                        <div className="form-group">
                            <label>Nama Produk <span style={{ color: 'var(--danger, #ef4444)' }}>*</span></label>
                            <input
                                className="input"
                                placeholder="Nama lengkap produk"
                                value={newProductModal.name}
                                onChange={e => setNewProductModal(p => ({ ...p, name: e.target.value }))}
                                autoFocus
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Harga Jual (Rp) <span style={{ color: 'var(--danger, #ef4444)' }}>*</span></label>
                                <input
                                    className="input"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={newProductModal.price ? Number(newProductModal.price).toLocaleString('id-ID') : ''}
                                    onChange={e => setNewProductModal(p => ({ ...p, price: e.target.value.replace(/\D/g, '') }))}
                                />
                            </div>
                            <div className="form-group" style={{ maxWidth: '120px' }}>
                                <label>Stok Awal</label>
                                <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={newProductModal.stock}
                                    onChange={e => setNewProductModal(p => ({ ...p, stock: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex gap3 mt2">
                            <button className="btn btn-ghost" onClick={() => { setNewProductModal(null); setBarcodeInput(''); barcodeRef.current?.focus() }}>Batal</button>
                            <button
                                className="btn btn-primary btn-block"
                                disabled={!newProductModal.name.trim() || !newProductModal.price}
                                onClick={handleCreateAndAddProduct}
                            >
                                <Icon name="save" size={18} /> Simpan & Tambah
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal open={!!receiptModal} onClose={() => setReceiptModal(null)} title="Transaksi Berhasil" width="420px">
                {receiptModal && <ReceiptPreview txn={receiptModal} onClose={() => setReceiptModal(null)} />}
            </Modal>

            {/* ── Pay Later: Customer Picker Modal ── */}
            <Modal open={debtModal} onClose={() => { setDebtModal(false); setDebtSearch(''); setShowNewCustomer(false); setNewCustomerForm({ name: '', phone: '' }) }} title="Pilih Pelanggan — Hutang" width="420px">
                <div className="flex-col gap4">
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface2)', borderRadius: 'var(--r2)', padding: '0 10px', gap: '6px', border: '1px solid var(--border)' }}>
                        <Icon name="search" size={18} style={{ color: 'var(--text3)' }} />
                        <input
                            className="search-input"
                            style={{ padding: '8px 4px' }}
                            placeholder="Cari nama / no HP..."
                            autoFocus
                            value={debtSearch}
                            onChange={e => { setDebtSearch(e.target.value); setShowNewCustomer(false) }}
                        />
                    </div>

                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {filteredCustomers.length === 0 && !showNewCustomer && (
                            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text3)', fontSize: '0.875rem' }}>
                                Pelanggan tidak ditemukan
                            </div>
                        )}
                        {filteredCustomers.map(c => (
                            <button
                                key={c.id}
                                className="btn btn-ghost"
                                style={{ justifyContent: 'flex-start', gap: '10px', padding: '10px 12px', textAlign: 'left' }}
                                disabled={debtLoading}
                                onClick={() => setConfirmDebtCustomer(c)}
                            >
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                                    {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</div>
                                    {c.phone && <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{c.phone}</div>}
                                </div>
                            </button>
                        ))}
                    </div>

                    {!showNewCustomer ? (
                        <button className="btn btn-primary" onClick={() => setShowNewCustomer(true)}>
                            <Icon name="person_add" size={18} /> Pelanggan Baru
                        </button>
                    ) : (
                        <div className="flex-col gap4" style={{ background: 'var(--surface2)', borderRadius: 'var(--r2)', padding: '12px', border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text2)' }}>Tambah Pelanggan Baru</div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Nama <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input
                                    className="input"
                                    placeholder="Nama pelanggan"
                                    autoFocus
                                    value={newCustomerForm.name}
                                    onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>No. HP</label>
                                <input
                                    className="input"
                                    placeholder="08xx..."
                                    type="tel"
                                    value={newCustomerForm.phone}
                                    onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap3">
                                <button className="btn btn-ghost" onClick={() => setShowNewCustomer(false)}>Batal</button>
                                <button
                                    className="btn btn-success btn-block"
                                    disabled={!newCustomerForm.name.trim() || debtLoading}
                                    onClick={async () => {
                                        const cleanName = newCustomerForm.name.trim()
                                        if (!cleanName || debtLoading) return
                                        try {
                                            // Check uniqueness (case-insensitive)
                                            const existing = await db.customers.where('name').equalsIgnoreCase(cleanName).count()
                                            if (existing > 0) return showToast('Nama pelanggan sudah digunakan', 'error')

                                            const id = await db.customers.add({ name: cleanName, phone: newCustomerForm.phone.trim() })
                                            setConfirmDebtCustomer({ id, name: cleanName, phone: newCustomerForm.phone.trim() })
                                        } catch (e) { showToast('Error: ' + e.message, 'error') }
                                    }}
                                >
                                        <Icon name="credit_score" size={18} /> Simpan & Lanjut
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal open={!!confirmDebtCustomer} onClose={() => setConfirmDebtCustomer(null)} title="Konfirmasi Hutang" width="400px">
                <div className="flex-col gap4">
                    <div style={{ textAlign: 'center', margin: '8px 0' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text2)', marginBottom: '4px' }}>Catat Hutang Untuk</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger)' }}>{confirmDebtCustomer?.name}</div>
                    </div>
                    <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--r2)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between mb2">
                            <span className="text2">Total Belanja</span>
                            <span className="font-bold">{fmtCurrency(total)}</span>
                        </div>
                        {payment > 0 && (
                            <div className="flex justify-between mb2">
                                <span className="text2">Dibayar Awal (DP)</span>
                                <span className="font-bold">{fmtCurrency(payment)}</span>
                            </div>
                        )}
                        <div className="divider" />
                        <div className="flex justify-between">
                            <span style={{ fontWeight: 600 }}>Total Hutang</span>
                            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmtCurrency(total - payment)}</span>
                        </div>
                    </div>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setConfirmDebtCustomer(null)}>Batal</button>
                        <button
                            className="btn btn-warning btn-block"
                            disabled={debtLoading}
                            onClick={() => handleDebtCheckout(confirmDebtCustomer)}
                        >
                            {debtLoading ? 'Proses...' : <><Icon name="check" size={18} /> Ya, Catat Hutang</>}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal open={confirmBayarModal} onClose={() => setConfirmBayarModal(false)} title="Konfirmasi Pembayaran" width="400px">
                <div className="flex-col gap4">
                    <div style={{ textAlign: 'center', margin: '8px 0' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text2)', marginBottom: '4px' }}>Total Dibayar</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(payment)}</div>
                    </div>
                    <div style={{ background: 'var(--surface2)', padding: '12px', borderRadius: 'var(--r2)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between mb2">
                            <span className="text2">Total Belanja</span>
                            <span className="font-bold">{fmtCurrency(total)}</span>
                        </div>
                        <div className="divider" />
                        <div className="flex justify-between">
                            <span style={{ fontWeight: 600 }}>Kembalian</span>
                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtCurrency(change)}</span>
                        </div>
                    </div>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setConfirmBayarModal(false)}>Batal</button>
                        <button
                            className="btn btn-success btn-block"
                            disabled={checkoutLoading}
                            onClick={handleCheckout}
                        >
                            {checkoutLoading ? 'Proses...' : <><Icon name="check" size={18} /> Konfirmasi Pembayaran</>}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal open={confirmResetModal} onClose={() => setConfirmResetModal(false)} title="Konfirmasi Reset" width="360px">
                <div className="flex-col gap4 text-center">
                    <Icon name="warning" size={48} style={{ color: 'var(--warning)', margin: '0 auto' }} />
                    <p style={{ margin: '8px 0', fontSize: '1rem' }}>
                        Apakah Anda yakin ingin mengosongkan keranjang?
                    </p>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setConfirmResetModal(false)}>Batal</button>
                        <button
                            className="btn btn-danger btn-block"
                            onClick={() => {
                                clearCart()
                                setPaymentStr('0')
                                setConfirmResetModal(false)
                            }}
                        >
                            <Icon name="delete" size={18} /> Ya, Kosongkan
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

function ReceiptPreview({ txn, onClose }) {
    const handleReprint = async () => {
        try {
            if (!isPrinterConnected()) { showToast('Printer tidak terhubung', 'error'); return }
            const storeName = (await db.settings.get('storeName'))?.value || 'My Store'
            await printReceipt(txn, storeName)
            showToast('Berhasil print!', 'success')
        } catch (e) {
            showToast('Gagal print: ' + e.message, 'error')
        }
    }

    return (
        <div className="receipt-preview">
            {txn.paymentType === 'debt' && (
                <div style={{ background: 'color-mix(in srgb, var(--danger,#ef4444) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger,#ef4444) 30%, transparent)', borderRadius: 'var(--r2)', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="credit_score" size={18} style={{ color: 'var(--danger,#ef4444)' }} />
                    <span style={{ fontWeight: 700, color: 'var(--danger,#ef4444)', fontSize: '0.875rem' }}>
                        HUTANG — {txn.customerName}
                    </span>
                </div>
            )}
            <div className="receipt-row"><span>Waktu</span><span>{fmtDateTime(txn.createdAt)}</span></div>
            <div className="receipt-row"><span>No. Transaksi</span><span>{fmtTxnId(txn.id)}</span></div>
            <div className="divider" />
            {txn.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', fontSize: '0.9rem' }}>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    <span className="text2" style={{ textAlign: 'center', minWidth: '48px', margin: '0 12px' }}>x{item.qty}</span>
                    <span style={{ textAlign: 'right' }}>{fmtCurrency(item.price * item.qty)}</span>
                </div>
            ))}
            <div className="divider" />
            <div className="receipt-row font-bold"><span>Total</span><span>{fmtCurrency(txn.total)}</span></div>
            {txn.paymentType === 'debt' ? (
                <>
                    {txn.payment > 0 && (
                        <div className="receipt-row"><span>Dibayar (DP)</span><span>{fmtCurrency(txn.payment)}</span></div>
                    )}
                    <div className="receipt-row" style={{ color: 'var(--danger,#ef4444)', fontWeight: 600 }}>
                        <span>Status</span><span>Sisa {fmtCurrency(txn.total - txn.payment)} (Hutang)</span>
                    </div>
                </>
            ) : (
                <>
                        <div className="receipt-row"><span>Bayar</span><span>{fmtCurrency(txn.payment)}</span></div>
                        <div className="receipt-row text-success"><span>Kembalian</span><span>{fmtCurrency(txn.change)}</span></div>
                </>
            )}
            <div className="flex gap3 mt4">
                <button className="btn btn-ghost" onClick={handleReprint}>
                    <Icon name="print" size={18} /> Cetak
                </button>
                <button className="btn btn-primary btn-block" onClick={onClose}>
                    <Icon name="check" size={18} /> Selesai
                </button>
            </div>
        </div>
    )
}
