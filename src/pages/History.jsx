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
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])

    async function openDetail(txn) {
        const items = await db.table('transaction_items').where('transactionId').equals(txn.id).toArray()
        let customerName = null
        if (txn.paymentType === 'debt') {
            const debt = await db.debts.where('transactionId').equals(txn.id).first()
            if (debt) {
                const customer = await db.customers.get(debt.customerId)
                customerName = customer?.name || 'Pelanggan'
            }
        }
        setDetail({ txn: { ...txn, items, customerName }, items })
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

    // Revenue = cash txn totals + debt_payments received in that date range
    const totalRevenue = useLiveQuery(async () => {
        const cashTotal = filtered
            .filter(t => t.paymentType !== 'debt')
            .reduce((s, t) => s + t.total, 0)

        // Sum all debt payments
        const allPayments = await db.debt_payments.toArray()
        const debtPaymentsTotal = allPayments
            .filter(p => !dateFilter || p.createdAt.startsWith(dateFilter))
            .reduce((s, p) => s + p.amount, 0)

        return cashTotal + debtPaymentsTotal
    }, [filtered.length, dateFilter])

    const maxTransaction = filtered.reduce((max, t) => Math.max(max, t.total), 0)

    // Calculate Best Seller for the current filtered date
    const bestSeller = useLiveQuery(async () => {
        if (!filtered.length) return null
        const txnIds = filtered.map(t => t.id)
        const items = await db.table('transaction_items')
            .where('transactionId').anyOf(txnIds).toArray()

        const counts = {}
        for (const i of items) counts[i.name] = (counts[i.name] || 0) + i.qty

        let bestName = null
        let maxQty = 0
        for (const [name, qty] of Object.entries(counts)) {
            if (qty > maxQty) { maxQty = qty; bestName = name }
        }
        return bestName ? `${bestName} (${maxQty})` : '-'
    }, [filtered.length]) // re-run when filtered txns change

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

            <div className="history-summary">
                <div className="summary-stat">
                    <div className="summary-lbl" style={{ color: 'var(--primary)' }}>Pendapatan {dateFilter === new Date().toISOString().split('T')[0] ? 'Hari Ini' : ''}</div>
                    <div className="summary-val">{fmtCurrency(totalRevenue ?? 0)}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Total Transaksi</div>
                    <div className="summary-val">{filtered.length}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Produk Terlaris</div>
                    <div className="summary-val" style={{ fontSize: '1.05rem', marginTop: 2 }}>{bestSeller || '-'}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Transaksi Terbesar</div>
                    <div className="summary-val">{fmtCurrency(maxTransaction)}</div>
                </div>
            </div>

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
                            <div className="txn-id">
                                {fmtTxnId(txn.id)}
                                {txn.paymentType === 'debt' && (
                                    <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.65rem' }}>HUTANG</span>
                                )}
                            </div>
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
                        {detail.txn.paymentType === 'debt' && (
                            <div style={{ background: 'color-mix(in srgb, var(--danger,#ef4444) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger,#ef4444) 30%, transparent)', borderRadius: 'var(--r2)', padding: '8px 12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icon name="credit_score" size={18} style={{ color: 'var(--danger,#ef4444)' }} />
                                <span style={{ fontWeight: 700, color: 'var(--danger,#ef4444)', fontSize: '0.875rem' }}>
                                    HUTANG — {detail.txn.customerName || 'Pelanggan'}
                                </span>
                            </div>
                        )}
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
                        <div className="detail-row font-bold">
                            <span>Total</span>
                            <span />
                            <span>{fmtCurrency(detail.txn.total)}</span>
                        </div>
                        {detail.txn.paymentType === 'debt' ? (
                            <>
                                {detail.txn.payment > 0 && (
                                    <div className="detail-row">
                                        <span>Dibayar (DP)</span>
                                        <span />
                                        <span>{fmtCurrency(detail.txn.payment)}</span>
                                    </div>
                                )}
                                <div className="detail-row" style={{ color: 'var(--danger,#ef4444)', fontWeight: 600 }}>
                                    <span>Status</span>
                                    <span />
                                    <span>Sisa {fmtCurrency(detail.txn.total - detail.txn.payment)} (Hutang)</span>
                                </div>
                            </>
                        ) : (
                            <>
                                    <div className="detail-row">
                                        <span>Bayar</span>
                                        <span />
                                        <span>{fmtCurrency(detail.txn.payment)}</span>
                                    </div>
                                    <div className="detail-row text-success">
                                        <span>Kembalian</span>
                                        <span />
                                        <span>{fmtCurrency(detail.txn.change)}</span>
                                    </div>
                            </>
                        )}
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
