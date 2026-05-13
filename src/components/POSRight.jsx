import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import NumPad from './NumPad.jsx'
import { showToast } from './Toast.jsx'
import { useCartStore } from '../store/cartStore.js'
import db from '../db/db.js'
import { printReceipt } from '../utils/bluetooth.js'
import { fmtCurrency, fmtDateTime, fmtTxnId, parseAmount } from '../utils/format.js'

export default function POSRight() {
    const items = useCartStore(s => s.rawItems)
    const removeItem = useCartStore(s => s.removeItem)
    const updateQty = useCartStore(s => s.updateQty)
    const clearCart = useCartStore(s => s.clearCart)

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const [paymentStr, setPaymentStr] = useState('0')
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [receiptModal, setReceiptModal] = useState(null)
    const [confirmBayarModal, setConfirmBayarModal] = useState(false)
    const [confirmResetModal, setConfirmResetModal] = useState(false)
    const [qrisModal, setQrisModal] = useState(false)
    const [qrisLoading, setQrisLoading] = useState(false)
    const [qrisImage] = useState(() => localStorage.getItem('qris_image') || null)
    const [debtModal, setDebtModal] = useState(false)
    const [debtSearch, setDebtSearch] = useState('')
    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
    const [showNewCustomer, setShowNewCustomer] = useState(false)
    const [confirmDebtCustomer, setConfirmDebtCustomer] = useState(null)
    const [debtLoading, setDebtLoading] = useState(false)

    const allCustomers = useLiveQuery(() => db.customers.toArray(), [])
    const payment = parseAmount(paymentStr)
    const change = payment - total
    const canCheckout = items.length > 0 && payment >= total
    const canDebt = items.length > 0
    const canQris = items.length > 0
    const filteredCustomers = (allCustomers || []).filter(c =>
        c.name.toLowerCase().includes(debtSearch.toLowerCase()) ||
        (c.phone || '').includes(debtSearch)
    )

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

    const handleQrisCheckout = useCallback(async () => {
        if (!canQris || qrisLoading) return
        setQrisLoading(true)
        try {
            const now = new Date().toISOString()
            const txnItems = items.map(i => ({
                productId: i.productId, name: i.name, price: i.price, qty: i.qty,
            }))

            let txnId
            await db.transaction('rw', [db.transactions, db.products, db.stock_movements, db.table('transaction_items')], async () => {
                txnId = await db.transactions.add({
                    createdAt: now, total, payment: total, change: 0,
                    itemCount: items.length, paymentType: 'qris',
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
            })

            const fullTxn = { id: txnId, createdAt: now, total, payment: total, change: 0, items: txnItems, paymentType: 'qris' }
            clearCart()
            setPaymentStr('0')
            setQrisModal(false)
            setReceiptModal(fullTxn)
            showToast('Pembayaran QRIS berhasil!', 'success')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setQrisLoading(false)
        }
    }, [canQris, qrisLoading, items, total, clearCart])

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
        <>
            {/* Right: Cart + Payment */}
            <div className="pos-right">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 8px 12px', background: 'var(--surface)', flexShrink: 0, borderBottom: '1.5px solid var(--border)' }}>
                    <h3 className="cart-title" style={{ padding: 0, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icon name="shopping_cart" size={18} />
                        Keranjang <span className="text2" style={{ fontSize: '0.85rem', fontWeight: 'normal' }}>({items.length} item)</span>
                    </h3>

                </div>
                <div className="cart-section scroll" style={{ paddingTop: '8px' }}>
                    {items.length === 0 && (
                        <div className="empty-state" style={{ padding: '24px' }}>
                            <Icon name="shopping_cart" size={48} className="empty-icon" />
                            <p>Tambah produk dari kiri</p>
                        </div>
                    )}
                    {items.map(item => (
                        <div key={item.cartItemId} className="cart-item">
                            <div className="cart-item-info">
                                <div className="cart-item-name">{item.name}</div>
                                <div className="cart-item-price">{fmtCurrency(item.price)}</div>
                            </div>
                            <div className="cart-item-controls">
                                <button className="qty-btn" onClick={() => updateQty(item.cartItemId, item.qty - 1)}>−</button>
                                <span className="qty-value">{item.qty}</span>
                                <button className="qty-btn" onClick={() => updateQty(item.cartItemId, item.qty + 1)}>+</button>
                                <button className="remove-btn" onClick={() => removeItem(item.cartItemId)}>
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
                        onReset={() => setConfirmResetModal(true)}
                        resetDisabled={items.length === 0 && paymentStr === '0'}
                    />

                    <div className="checkout-actions">
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
                            id="qris-btn"
                            className="btn btn-qris"
                            style={{ flexShrink: 0 }}
                            disabled={!canQris || qrisLoading}
                            onClick={() => setQrisModal(true)}
                            title="Bayar dengan QRIS"
                        >
                            <Icon name="qr_code_2" size={20} /> QRIS
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
            <Modal open={!!receiptModal} onClose={() => setReceiptModal(null)} title="Transaksi Berhasil" width="420px">
                {receiptModal && <ReceiptPreview txn={receiptModal} onClose={() => setReceiptModal(null)} />}
            </Modal>

            {/* ── QRIS Payment Modal ── */}
            <Modal open={qrisModal} onClose={() => setQrisModal(false)} title="Pembayaran QRIS" width="400px">
                <div className="flex-col gap4" style={{ alignItems: 'center', textAlign: 'center' }}>
                    {qrisImage ? (
                        <div style={{
                            background: 'linear-gradient(135deg, #e8f4fd 0%, #f0fdf4 100%)',
                            border: '2px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                            borderRadius: 'var(--r3)',
                            padding: '8px',
                            width: '70%',
                            maxWidth: '320px',
                        }}>
                            <img
                                src={qrisImage}
                                alt="QRIS QR Code"
                                style={{ width: '100%', borderRadius: 'var(--r2)', display: 'block' }}
                            />
                        </div>
                    ) : (
                        <div style={{ padding: '24px', background: 'var(--surface2)', borderRadius: 'var(--r3)', border: '2px dashed var(--border)', width: '100%', color: 'var(--text2)', fontSize: '0.875rem' }}>
                            <Icon name="qr_code_2" size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                            Gambar QRIS belum diatur.<br />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>Pergi ke Pengaturan → QRIS untuk upload gambar.</span>
                        </div>
                    )}
                    <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r2)', padding: '12px 20px', width: '100%', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '4px' }}>Total yang harus dibayar</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.5px' }}>{fmtCurrency(total)}</div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.5 }}>
                        Minta pelanggan scan QR di atas, lalu konfirmasi setelah pembayaran diterima.
                    </p>
                    <div className="flex gap3" style={{ width: '100%' }}>
                        <button className="btn btn-ghost" onClick={() => setQrisModal(false)}>Batal</button>
                        <button
                            id="qris-confirm-btn"
                            className="btn btn-success btn-block"
                            disabled={!canQris || qrisLoading}
                            onClick={handleQrisCheckout}
                        >
                            {qrisLoading ? <><Icon name="hourglass_top" size={18} /> Proses...</> : <><Icon name="check_circle" size={18} filled /> Pembayaran Diterima</>}
                        </button>
                    </div>
                </div>
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
        </>
    )
}

function ReceiptPreview({ txn, onClose }) {
    const handleReprint = async () => {
        try {
            const storeName = (await db.settings.get('storeName'))?.value || 'My Store'
            await printReceipt(txn, storeName)
            showToast('Berhasil print!', 'success')
        } catch (e) {
            showToast(e.message, 'error')
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
            {txn.paymentType === 'qris' && (
                <div style={{ background: 'color-mix(in srgb, #2563eb 10%, transparent)', border: '1px solid color-mix(in srgb, #2563eb 25%, transparent)', borderRadius: 'var(--r2)', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="qr_code_2" size={18} style={{ color: '#2563eb' }} />
                    <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.875rem' }}>QRIS</span>
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
            ) : txn.paymentType === 'qris' ? (
                <>
                    <div className="receipt-row"><span>Metode</span><span style={{ color: '#2563eb', fontWeight: 600 }}>QRIS</span></div>
                    <div className="receipt-row text-success"><span>Lunas</span><span>{fmtCurrency(txn.total)}</span></div>
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
