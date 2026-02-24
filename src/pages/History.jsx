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
    const [typeFilter, setTypeFilter] = useState('all')

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

    // Fetch debt payments and resolve customer names for the UI unified list
    const debtPayments = useLiveQuery(async () => {
        const p = await db.debt_payments.toArray();
        const filtered = p.filter(x => !dateFilter || x.createdAt.startsWith(dateFilter));

        // Resolve customer names for each payment
        return Promise.all(filtered.map(async (pay) => {
            const debt = await db.debts.get(pay.debtId);
            let customerName = 'Pelanggan';
            if (debt) {
                const customer = await db.customers.get(debt.customerId);
                if (customer) customerName = customer.name;
            }
            return { ...pay, customerName };
        }));
    }, [dateFilter]) || []

    const allUnifiedItems = [...filtered.map(t => ({ ...t, _type: 'txn' })), ...debtPayments.map(p => ({ ...p, _type: 'payment' }))]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const unifiedItems = allUnifiedItems.filter(item => typeFilter === 'all' || item._type === typeFilter)

    // Revenue = cash txn totals + debt_payments received in that date range
    const totalRevenue = useLiveQuery(async () => {
        const cashTotal = filtered
            .filter(t => t.paymentType !== 'debt')
            .reduce((s, t) => s + t.total, 0)

        // Include DP from debt checkout if any (it exists in debt_payments so we just sum debtPayments!)
        const debtPaymentsTotal = debtPayments.reduce((s, p) => s + p.amount, 0)

        return cashTotal + debtPaymentsTotal
    }, [filtered.length, debtPayments.length, dateFilter])

    const maxTransaction = filtered.reduce((max, t) => Math.max(max, t.total), 0)

    // Calculate total outstanding piutang for the filtered date
    const totalPiutang = useLiveQuery(async () => {
        const debts = await db.debts.toArray()
        return debts
            .filter(d => !dateFilter || d.createdAt.startsWith(dateFilter))
            .reduce((s, d) => s + (d.amount - d.paidAmount), 0)
    }, [dateFilter, unifiedItems.length])

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
                    <div className="summary-lbl" style={{ color: 'var(--primary)' }}>Total Pendapatan {dateFilter === new Date().toISOString().split('T')[0] ? 'Hari Ini' : ''}</div>
                    <div className="summary-val">{fmtCurrency(totalRevenue ?? 0)}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Sisa Piutang</div>
                    <div className="summary-val" style={{ fontSize: '1.05rem', marginTop: 2, color: 'var(--danger)' }}>{fmtCurrency(totalPiutang ?? 0)}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Produk Terlaris</div>
                    <div className="summary-val" style={{ fontSize: '1.05rem', marginTop: 2 }}>{bestSeller || '-'}</div>
                </div>
                <div className="summary-stat">
                    <div className="summary-lbl">Transaksi POS Terbesar</div>
                    <div className="summary-val" style={{ fontSize: '1.05rem', marginTop: 2 }}>{fmtCurrency(maxTransaction)}</div>
                </div>
            </div>

            <div className="page-body">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                    <button
                        className={`btn ${typeFilter === 'all' ? 'btn-primary' : ''}`}
                        style={{ borderRadius: '20px', padding: '6px 16px', fontWeight: typeFilter === 'all' ? 600 : 400, background: typeFilter === 'all' ? 'var(--primary)' : 'var(--surface2)', color: typeFilter === 'all' ? '#fff' : 'var(--text)' }}
                        onClick={() => setTypeFilter('all')}>
                        Semua
                    </button>
                    <button
                        className={`btn ${typeFilter === 'txn' ? 'btn-primary' : ''}`}
                        style={{ borderRadius: '20px', padding: '6px 16px', fontWeight: typeFilter === 'txn' ? 600 : 400, background: typeFilter === 'txn' ? 'var(--primary)' : 'var(--surface2)', color: typeFilter === 'txn' ? '#fff' : 'var(--text)' }}
                        onClick={() => setTypeFilter('txn')}>
                        Kasir (POS)
                    </button>
                    <button
                        className={`btn ${typeFilter === 'payment' ? 'btn-primary' : ''}`}
                        style={{ borderRadius: '20px', padding: '6px 16px', fontWeight: typeFilter === 'payment' ? 600 : 400, background: typeFilter === 'payment' ? 'var(--primary)' : 'var(--surface2)', color: typeFilter === 'payment' ? '#fff' : 'var(--text)' }}
                        onClick={() => setTypeFilter('payment')}>
                        Piutang
                    </button>
                </div>
                {unifiedItems.length === 0 && (
                    <div className="empty-state">
                        <Icon name="receipt_long" size={48} className="empty-icon" />
                        <p>{dateFilter ? 'Tidak ada transaksi pada tanggal ini' : 'Belum ada catatan'}</p>
                    </div>
                )}
                <div className="txn-list">
                    {unifiedItems.map(item => (
                        item._type === 'txn' ? (
                            <button key={'txn-' + item.id} className="txn-card" onClick={() => openDetail(item)}>
                            <div className="txn-id">
                                    {fmtTxnId(item.id)}
                                    {item.paymentType === 'debt' && (
                                    <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.65rem' }}>HUTANG</span>
                                )}
                            </div>
                            <div className="txn-meta">
                                    <span>{fmtDateTime(item.createdAt)}</span>
                                    <span className="text2">{item.itemCount} item</span>
                            </div>
                                <div className="txn-total">
                                    {item.paymentType === 'debt' ? (
                                        <span style={{ color: 'var(--danger)', opacity: 0.6 }}>{fmtCurrency(item.total)}</span>
                                    ) : (
                                        fmtCurrency(item.total)
                                    )}
                                </div>
                            <Icon name="chevron_right" size={22} style={{ color: 'var(--text2)' }} />
                        </button>
                        ) : (
                            <div key={'pay-' + item.id} className="txn-card" style={{ background: 'color-mix(in srgb, var(--success,#10b981) 8%, white)', cursor: 'default' }}>
                                <div className="txn-id" style={{ color: 'var(--success)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <Icon name="payments" size={16} filled style={{ marginRight: 6 }} />
                                        PELUNASAN PIUTANG
                                    </div>
                                    {item.customerName && <div style={{ color: 'var(--text)', fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>{item.customerName}</div>}
                                </div>
                                <div className="txn-meta">
                                    <span>{fmtDateTime(item.createdAt)}</span>
                                    {item.note && <span className="text2" style={{ marginLeft: '12px', fontStyle: 'italic' }}>"{item.note}"</span>}
                                </div>
                                <div className="txn-total" style={{ color: 'var(--success)', fontWeight: 'bold' }}>+ {fmtCurrency(item.amount)}</div>
                                <Icon name="check_circle" filled size={22} style={{ color: 'var(--success, #10b981)', opacity: 0.8 }} />
                            </div>
                        )
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
