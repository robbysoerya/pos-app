import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { showToast } from '../components/Toast.jsx'
import db from '../db/db.js'
import { isPrinterConnected, printReceipt } from '../utils/bluetooth.js'
import { fmtCurrency, fmtDateTime, fmtTxnId } from '../utils/format.js'
import './History.css'

export default function History() {
    const transactions = useLiveQuery(() =>
        db.transactions.orderBy('createdAt').reverse().toArray(), [])

    const [detail, setDetail] = useState(null)
    const [dateFilter, setDateFilter] = useState('')

    async function openDetail(txn) {
        const items = await db.table('transaction_items').where('transactionId').equals(txn.id).toArray()
        setDetail({ txn: { ...txn, items }, items })
    }

    async function handleReprint(txn) {
        if (!isPrinterConnected()) return showToast('Printer tidak terhubung. Hubungkan di Pengaturan.', 'error')
        try {
            const storeName = (await db.settings.get('storeName'))?.value || 'My Store'
            await printReceipt(txn, storeName)
            showToast('Berhasil print!', 'success')
        } catch (e) {
            showToast('Gagal print: ' + e.message, 'error')
        }
    }

    const filtered = (transactions || []).filter(txn => !dateFilter || txn.createdAt.startsWith(dateFilter))
    const totalRevenue = filtered.reduce((s, t) => s + t.total, 0)

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="receipt_long" size={26} filled style={{ marginRight: 8 }} />Riwayat Transaksi</h1>
                <div className="flex gap3 items-center">
                    <input
                        type="date" className="input" style={{ width: 'auto' }}
                        value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                    />
                    {dateFilter && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setDateFilter('')}>
                            <Icon name="close" size={16} /> Reset
                        </button>
                    )}
                </div>
            </div>

            {filtered.length > 0 && (
                <div className="history-summary">
                    <div className="summary-stat">
                        <div className="summary-val">{filtered.length}</div>
                        <div className="summary-lbl">Transaksi</div>
                    </div>
                    <div className="summary-stat">
                        <div className="summary-val">{fmtCurrency(totalRevenue)}</div>
                        <div className="summary-lbl">Total Pendapatan</div>
                    </div>
                </div>
            )}

            <div className="page-body">
                {filtered.length === 0 && (
                    <div className="empty-state">
                        <Icon name="receipt_long" size={48} className="empty-icon" />
                        <p>{dateFilter ? 'Tidak ada transaksi pada tanggal ini' : 'Belum ada transaksi'}</p>
                    </div>
                )}
                <div className="txn-list">
                    {filtered.map(txn => (
                        <button key={txn.id} className="txn-card" onClick={() => openDetail(txn)}>
                            <div className="txn-id">{fmtTxnId(txn.id)}</div>
                            <div className="txn-meta">
                                <span>{fmtDateTime(txn.createdAt)}</span>
                                <span className="text2">{txn.itemCount} item</span>
                            </div>
                            <div className="txn-total">{fmtCurrency(txn.total)}</div>
                            <Icon name="chevron_right" size={22} style={{ color: 'var(--text2)' }} />
                        </button>
                    ))}
                </div>
            </div>

            <Modal open={!!detail} onClose={() => setDetail(null)} title={`Detail ${detail ? fmtTxnId(detail.txn.id) : ''}`} width="480px">
                {detail && (
                    <div className="txn-detail">
                        <div className="flex justify-between text2 mb4">
                            <span>{fmtDateTime(detail.txn.createdAt)}</span>
                            <span>{detail.items.length} item</span>
                        </div>
                        <div className="divider" />
                        {detail.items.map((item, i) => (
                            <div key={i} className="detail-row">
                                <span>{item.name}</span>
                                <span className="text2">x{item.qty}</span>
                                <span>{fmtCurrency(item.price * item.qty)}</span>
                            </div>
                        ))}
                        <div className="divider" />
                        <div className="detail-row font-bold"><span>Total</span><span /><span>{fmtCurrency(detail.txn.total)}</span></div>
                        <div className="detail-row"><span>Bayar</span><span /><span>{fmtCurrency(detail.txn.payment)}</span></div>
                        <div className="detail-row text-success"><span>Kembalian</span><span /><span>{fmtCurrency(detail.txn.change)}</span></div>
                        <div className="flex gap3 mt4">
                            <button className="btn btn-ghost" onClick={() => handleReprint(detail.txn)}>
                                <Icon name="print" size={18} /> Cetak Ulang
                            </button>
                            <button className="btn btn-primary btn-block" onClick={() => setDetail(null)}>
                                <Icon name="check" size={18} /> Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
