import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { showToast } from '../components/Toast.jsx'
import db from '../db/db.js'
import './Categories.css'

export default function Categories() {
    const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [])
    const [modal, setModal] = useState(null)
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [pendingDelete, setPendingDelete] = useState(null)

    function openAdd() { setName(''); setModal({ id: null }) }
    function openEdit(cat) { setName(cat.name); setModal({ id: cat.id }) }

    async function handleSave() {
        if (!name.trim()) return showToast('Nama kategori tidak boleh kosong', 'error')
        setLoading(true)
        try {
            if (modal.id) {
                await db.categories.update(modal.id, { name: name.trim() })
                showToast('Kategori diperbarui', 'success')
            } else {
                await db.categories.add({ name: name.trim() })
                showToast('Kategori ditambahkan', 'success')
            }
            setModal(null)
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete(cat) {
        const count = await db.products.where('categoryId').equals(cat.id).count()
        if (count > 0) return showToast(`Tidak bisa hapus: ada ${count} produk dalam kategori ini`, 'error')
        setPendingDelete(cat)
    }

    async function confirmDelete() {
        const cat = pendingDelete
        setPendingDelete(null)
        if (!cat) return
        await db.categories.delete(cat.id)
        showToast('Kategori dihapus', 'success')
    }

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="label" size={26} filled style={{ marginRight: 8 }} />Kategori</h1>
                <button id="add-category-btn" className="btn btn-primary" onClick={openAdd}>
                    <Icon name="add" size={20} /> Tambah
                </button>
            </div>

            <div className="page-body">
                {categories?.length === 0 && (
                    <div className="empty-state">
                        <Icon name="label" size={48} className="empty-icon" />
                        <p>Belum ada kategori</p>
                        <button className="btn btn-primary" onClick={openAdd}>Tambah kategori pertama</button>
                    </div>
                )}
                <div className="cat-list">
                    {categories?.map(cat => (
                        <div key={cat.id} className="cat-list-item">
                            <span className="cat-list-name">{cat.name}</span>
                            <div className="flex gap2">
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(cat)}>
                                    <Icon name="edit" size={16} /> Edit
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat)}>
                                    <Icon name="delete" size={16} /> Hapus
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Kategori' : 'Tambah Kategori'}>
                <div className="form-group">
                    <label htmlFor="cat-name-input">Nama Kategori</label>
                    <input
                        id="cat-name-input"
                        className="input"
                        placeholder="Contoh: Makanan"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        autoFocus
                    />
                </div>
                <div className="flex gap3 mt4">
                    <button className="btn btn-ghost" onClick={() => setModal(null)}>Batal</button>
                    <button className="btn btn-primary btn-block" onClick={handleSave} disabled={loading}>
                        <Icon name="save" size={18} /> {loading ? 'Menyimpan...' : 'Simpan'}
                    </button>
                </div>
            </Modal>

            {/* Delete category confirmation modal */}
            <Modal
                open={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                title="Hapus Kategori"
                width="380px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                        Hapus kategori <strong>"{pendingDelete?.name}"</strong>?<br />
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
