import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import NumPad from '../components/NumPad.jsx'
import { showToast } from '../components/Toast.jsx'
import { useCart } from '../context/CartContext.jsx'
import db from '../db/db.js'
import { isPrinterConnected, printReceipt } from '../utils/bluetooth.js'
import { fmtCurrency, parseAmount } from '../utils/format.js'
import './POS.css'

export default function POS() {
    const { items, addItem, removeItem, updateQty, clearCart, total } = useCart()
    const [activeCat, setActiveCat] = useState(null)
    const [paymentStr, setPaymentStr] = useState('0')
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [receiptModal, setReceiptModal] = useState(null)
    const [barcodeInput, setBarcodeInput] = useState('')
    const barcodeRef = useRef()

    const categories = useLiveQuery(() => db.categories.toArray(), [])
    const products = useLiveQuery(
        () => activeCat === null
            ? db.products.toArray()
            : db.products.where('categoryId').equals(activeCat).toArray(),
        [activeCat]
    )

    const payment = parseAmount(paymentStr)
    const change = payment - total
    const canCheckout = items.length > 0 && payment >= total

    async function handleBarcodeScan(e) {
        e.preventDefault()
        const code = barcodeInput.trim()
        if (!code) return
        const product = await db.products.where('barcode').equals(code).first()
        if (!product) { showToast(`Barcode "${code}" tidak ditemukan`, 'error'); setBarcodeInput(''); return }
        addItem(product)
        showToast(`${product.name} ditambahkan`, 'success')
        setBarcodeInput('')
        barcodeRef.current?.focus()
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
            setReceiptModal(fullTxn)

            if (isPrinterConnected()) {
                const storeName = (await db.settings.get('storeName'))?.value || 'My Store'
                printReceipt(fullTxn, storeName).catch(e => showToast('Gagal print: ' + e.message, 'error'))
            }
            showToast('Transaksi berhasil!', 'success')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setCheckoutLoading(false)
        }
    }, [canCheckout, checkoutLoading, items, total, payment, change, clearCart])

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
                            <div className="product-price">{fmtCurrency(p.price)}</div>
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
                    <h3 className="cart-title">
                        <Icon name="shopping_cart" size={18} />
                        Keranjang <span className="text2">({items.length} item)</span>
                    </h3>
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
                        <button className="btn btn-ghost" onClick={() => { clearCart(); setPaymentStr('0') }}>
                            <Icon name="refresh" size={18} /> Reset
                        </button>
                        <button
                            id="checkout-btn"
                            className="btn btn-success btn-lg"
                            style={{ flex: 1 }}
                            disabled={!canCheckout || checkoutLoading}
                            onClick={handleCheckout}
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
            <div className="receipt-row"><span>Waktu</span><span>{new Date(txn.createdAt).toLocaleString('id-ID')}</span></div>
            <div className="divider" />
            {txn.items.map((item, i) => (
                <div key={i} className="receipt-row">
                    <span>{item.name} x{item.qty}</span>
                    <span>{fmtCurrency(item.price * item.qty)}</span>
                </div>
            ))}
            <div className="divider" />
            <div className="receipt-row font-bold"><span>Total</span><span>{fmtCurrency(txn.total)}</span></div>
            <div className="receipt-row"><span>Bayar</span><span>{fmtCurrency(txn.payment)}</span></div>
            <div className="receipt-row text-success"><span>Kembalian</span><span>{fmtCurrency(txn.change)}</span></div>
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
