import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { showToast } from './Toast.jsx'
import { useCartStore } from '../store/cartStore.js'
import db from '../db/db.js'
import { fmtCapitalize, fmtCurrency } from '../utils/format.js'

export default function POSLeft() {
    const addItem = useCartStore(s => s.addItem)
    const addCustomItem = useCartStore(s => s.addCustomItem)
    const isReseller = useCartStore(s => s.isReseller)
    const setIsReseller = useCartStore(s => s.setIsReseller)
    const [activeCat, setActiveCat] = useState(null)
    const [barcodeInput, setBarcodeInput] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [limit, setLimit] = useState(50)

    const observer = useRef(null)
    const lastElementRef = useCallback(node => {
        if (observer.current) observer.current.disconnect()
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setLimit(prev => prev + 50)
            }
        }, { rootMargin: '200px' })
        if (node) observer.current.observe(node)
    }, [])
    const [customModal, setCustomModal] = useState(false)
    const [customForm, setCustomForm] = useState({ name: '', price: '', qty: '1' })
    const [newProductModal, setNewProductModal] = useState(null)
    const [barcodePickerModal, setBarcodePickerModal] = useState(null)
    const barcodeRef = useRef()
    const lastScanRef = useRef({ code: '', at: 0 })

    const categories = useLiveQuery(() => db.categories.toArray(), [])
    const unknownBarcodeActionRow = useLiveQuery(() => db.settings.get('unknownBarcodeAction'), [])
    const unknownBarcodeAction = unknownBarcodeActionRow?.value || 'prompt_create'
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

    async function handleBarcodeScan(e) {
        e.preventDefault()
        const code = barcodeInput.trim()
        if (!code) return
        const now = Date.now()
        if (lastScanRef.current.code === code && now - lastScanRef.current.at < 500) {
            return
        }
        lastScanRef.current = { code, at: now }
        const matches = await db.products.where('barcode').equals(code).toArray()
        if (matches.length === 0) {
            if (unknownBarcodeAction === 'reject') {
                showToast(`Barcode tidak terdaftar: ${code}`, 'error')
                setBarcodeInput('')
                barcodeRef.current?.focus()
                return
            }
            // If not found, open a form to register the new product (default behavior)
            setNewProductModal({ barcode: code, name: '', price: '', stock: '' })
            return
        }
        if (matches.length === 1) {
            addItem(matches[0])
            showToast(`${matches[0].name} ditambahkan`, 'success')
            setBarcodeInput('')
            barcodeRef.current?.focus()
            return
        }
        // Multiple products share the same barcode — let user pick
        setBarcodePickerModal({ barcode: code, products: matches })
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

    return (
        <>
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
                            onChange={e => { setSearchInput(e.target.value); setLimit(50); }}
                        />
                        {searchInput && (
                            <button className="btn btn-ghost" style={{ border: 'none', padding: '4px' }} onClick={() => setSearchInput('')}>
                                <Icon name="close" size={18} />
                            </button>
                        )}
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, padding: '0 12px', height: '36px' }} onClick={() => setCustomModal(true)}>
                        <Icon name="post_add" size={18} /> Produk Manual
                    </button>
                </div>

                <div className="cat-bar scroll-x">
                    <button
                        className={'cat-btn' + (activeCat === null ? ' active' : '')}
                        onClick={() => { setActiveCat(null); setLimit(50); }}
                    >Semua</button>
                    {categories?.map(c => (
                        <button
                            key={c.id}
                            className={'cat-btn' + (activeCat === c.id ? ' active' : '')}
                            onClick={() => { setActiveCat(c.id); setLimit(50); }}
                        >{fmtCapitalize(c.name)}</button>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text2)' }}>
                        Menampilkan {products?.length || 0} produk
                    </span>
                    <label className="reseller-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--surface2)', padding: '4px 10px', borderRadius: '99px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isReseller ? 'var(--primary)' : 'var(--text2)' }}>Grosir</span>
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

                <div className="product-grid scroll">
                    {products?.length === 0 && (
                        <div className="empty-state">
                            <Icon name="inventory_2" size={48} className="empty-icon" />
                            <p>Belum ada produk</p>
                        </div>
                    )}
                    {(products || []).slice(0, limit).map((p, index) => {
                        const isOutOfStock = p.trackStock && p.stock <= 0;
                        const isLast = index === Math.min(products.length, limit) - 1;
                        return (
                            <button
                                key={p.id}
                                ref={isLast ? lastElementRef : null}
                                className={'product-card' + (isOutOfStock ? ' out-of-stock' : '')}
                                onClick={() => {
                                    if (isOutOfStock) return showToast('Stok habis!', 'error');
                                    addItem(p);
                                }}
                            >
                                <div className="product-name">{p.name}</div>
                                <div className="product-price">{fmtCurrency(isReseller && p.resellerPrice ? p.resellerPrice : p.price)}</div>
                                {p.trackStock && (
                                    <div className={'product-stock' + (p.stock <= (p.low_stock_threshold || 0) ? ' low' : '')}>
                                        Stok: {p.stock}
                                    </div>
                                )}
                                {!p.trackStock && (
                                    <div className="product-stock" style={{ color: 'var(--text3)' }}>
                                        Tanpa Stok
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            <Modal open={customModal} onClose={() => setCustomModal(false)} title="Tambah Produk Manual" width="400px">
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

            {/* ── Barcode Picker Modal (duplicate barcodes) ── */}
            <Modal open={!!barcodePickerModal} onClose={() => { setBarcodePickerModal(null); setBarcodeInput(''); barcodeRef.current?.focus() }} title="Pilih Produk" width="420px">
                {barcodePickerModal && (
                    <div className="flex-col gap4">
                        <div className="empty-state" style={{ padding: '8px', background: 'var(--surface2)', borderRadius: 'var(--r2)' }}>
                            <Icon name="warning" size={24} style={{ color: 'var(--warning)' }} />
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text2)' }}>
                                Barcode <strong style={{ fontFamily: 'monospace' }}>{barcodePickerModal.barcode}</strong> ditemukan di {barcodePickerModal.products.length} produk
                            </p>
                        </div>
                        <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {barcodePickerModal.products.map(p => (
                                <button
                                    key={p.id}
                                    className="btn btn-ghost"
                                    style={{ justifyContent: 'space-between', gap: '10px', padding: '12px', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}
                                    onClick={() => {
                                        addItem(p)
                                        showToast(`${p.name} ditambahkan`, 'success')
                                        setBarcodePickerModal(null)
                                        setBarcodeInput('')
                                        barcodeRef.current?.focus()
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                                            {fmtCurrency(isReseller && p.resellerPrice ? p.resellerPrice : p.price)}
                                            {p.trackStock && <span> · Stok: {p.stock}</span>}
                                        </div>
                                    </div>
                                    <Icon name="add_circle" size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                </button>
                            ))}
                        </div>
                        <button className="btn btn-ghost" onClick={() => { setBarcodePickerModal(null); setBarcodeInput(''); barcodeRef.current?.focus() }}>Batal</button>
                    </div>
                )}
            </Modal>
        </>
    )
}
