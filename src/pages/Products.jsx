import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { showToast } from '../components/Toast.jsx'
import db from '../db/db.js'
import { fmtCurrency } from '../utils/format.js'
import './Products.css'

const EMPTY_FORM = { name: '', categoryId: '', price: '', stock: '', low_stock_threshold: '', barcode: '' }

export default function Products() {
    const categories = useLiveQuery(() => db.categories.toArray(), [])
    const products = useLiveQuery(() =>
        db.products.toArray().then(ps => ps.sort((a, b) => a.name.localeCompare(b.name))), [])

    const [modal, setModal] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [pendingDelete, setPendingDelete] = useState(null)

    function openAdd() {
        setForm({ ...EMPTY_FORM, categoryId: categories?.[0]?.id ?? '' })
        setModal({ id: null })
    }
    function openEdit(p) {
        setForm({
            name: p.name, categoryId: p.categoryId ?? '', price: String(p.price),
            stock: String(p.stock), low_stock_threshold: String(p.low_stock_threshold ?? ''),
            barcode: p.barcode ?? ''
        })
        setModal({ id: p.id })
    }
    function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

    async function handleSave() {
        if (!form.name.trim()) return showToast('Nama produk diperlukan', 'error')
        if (!form.price || isNaN(Number(form.price))) return showToast('Harga tidak valid', 'error')
        const payload = {
            name: form.name.trim(),
            categoryId: form.categoryId ? Number(form.categoryId) : null,
            price: Number(form.price), stock: Number(form.stock) || 0,
            low_stock_threshold: Number(form.low_stock_threshold) || 0,
            barcode: form.barcode.trim() || null,
        }
        setLoading(true)
        try {
            if (modal.id) { await db.products.update(modal.id, payload); showToast('Produk diperbarui', 'success') }
            else { await db.products.add(payload); showToast('Produk ditambahkan', 'success') }
            setModal(null)
        } catch (e) { showToast('Error: ' + e.message, 'error') }
        finally { setLoading(false) }
    }

    function openDelete(p) { setPendingDelete(p) }

    async function confirmDelete() {
        const p = pendingDelete
        setPendingDelete(null)
        if (!p) return
        await db.products.delete(p.id)
        showToast('Produk dihapus', 'success')
    }

    async function adjustStock(p, delta) {
        const newStock = Math.max(0, (p.stock || 0) + delta)
        await db.products.update(p.id, { stock: newStock })
        await db.stock_movements.add({
            productId: p.id, delta, reason: delta > 0 ? 'restock' : 'adjust',
            createdAt: new Date().toISOString(),
        })
    }

    const filtered = (products || []).filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    const catMap = Object.fromEntries((categories || []).map(c => [c.id, c.name]))

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="inventory_2" size={26} filled style={{ marginRight: 8 }} />Produk</h1>
                <button id="add-product-btn" className="btn btn-primary" onClick={openAdd}>
                    <Icon name="add" size={20} /> Tambah
                </button>
            </div>

            <div className="page-body">
                <div className="mb4" style={{ position: 'relative' }}>
                    <Icon name="search" size={20} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }} />
                    <input
                        className="input"
                        style={{ paddingLeft: 44 }}
                        placeholder="Cari produk..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {filtered.length === 0 && (
                    <div className="empty-state">
                        <Icon name="inventory_2" size={48} className="empty-icon" />
                        <p>{search ? 'Produk tidak ditemukan' : 'Belum ada produk'}</p>
                        {!search && <button className="btn btn-primary" onClick={openAdd}>Tambah produk pertama</button>}
                    </div>
                )}

                <div className="product-table">
                    {filtered.map(p => {
                        const isLow = p.stock <= (p.low_stock_threshold || 0)
                        const isOut = p.stock <= 0
                        return (
                            <div key={p.id} className="product-row">
                                <div className="product-row-info">
                                    <div className="product-row-name">{p.name}</div>
                                    <div className="product-row-meta">
                                        <span className="text2">{catMap[p.categoryId] || '—'}</span>
                                        <span>{fmtCurrency(p.price)}</span>
                                        {p.barcode && <span className="text2" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{p.barcode}</span>}
                                        {isOut
                                            ? <span className="badge badge-danger">Habis</span>
                                            : isLow ? <span className="badge badge-warning">Stok Rendah</span> : null
                                        }
                                    </div>
                                </div>
                                <div className="product-row-stock">
                                    <button className="qty-btn" onClick={() => adjustStock(p, -1)}>−</button>
                                    <span className={'stock-val' + (isLow ? ' low' : '')}>{p.stock}</span>
                                    <button className="qty-btn" onClick={() => adjustStock(p, +1)}>+</button>
                                </div>
                                <div className="flex gap2">
                                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                                        <Icon name="edit" size={16} />
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={() => openDelete(p)}>
                                        <Icon name="delete" size={16} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Produk' : 'Tambah Produk'} width="500px">
                <div className="flex-col gap4">
                    <div className="form-group">
                        <label>Nama Produk</label>
                        <input id="prod-name" className="input" placeholder="Nama produk" value={form.name} onChange={e => setField('name', e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Kategori</label>
                        <select className="input" value={form.categoryId} onChange={e => setField('categoryId', e.target.value)}>
                            <option value="">— Tanpa Kategori —</option>
                            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Barcode <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(opsional)</span></label>
                        <input className="input" placeholder="Scan atau ketik barcode..." value={form.barcode} onChange={e => setField('barcode', e.target.value)} style={{ fontFamily: 'monospace' }} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Harga (Rp)</label>
                            <input className="input" type="number" min="0" placeholder="0" value={form.price} onChange={e => setField('price', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Stok Awal</label>
                            <input className="input" type="number" min="0" placeholder="0" value={form.stock} onChange={e => setField('stock', e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Batas Stok Rendah</label>
                        <input className="input" type="number" min="0" placeholder="5" value={form.low_stock_threshold} onChange={e => setField('low_stock_threshold', e.target.value)} />
                    </div>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setModal(null)}>Batal</button>
                        <button className="btn btn-primary btn-block" onClick={handleSave} disabled={loading}>
                            <Icon name="save" size={18} /> {loading ? 'Menyimpan...' : 'Simpan'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete product confirmation modal */}
            <Modal
                open={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                title="Hapus Produk"
                width="380px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                        Hapus produk <strong>"{pendingDelete?.name}"</strong>?<br />
                        <span style={{ color: 'var(--text2)', fontSize: '0.88rem' }}>Aksi ini tidak bisa dibatalkan.</span>
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
                            <Icon name="close" size={18} /> Batal
                        </button>
                        <button className="btn btn-danger" onClick={confirmDelete}>
                            <Icon name="delete" size={18} /> Ya, Hapus
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
