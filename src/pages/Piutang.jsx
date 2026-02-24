import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { showToast } from '../components/Toast.jsx'
import db from '../db/db.js'
import { fmtCurrency, fmtDate, fmtDateTime, fmtTxnId } from '../utils/format.js'
import './Piutang.css'

/* ─── helpers ────────────────────────────────────────── */
function ageColor(createdAt) {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    if (days > 30) return 'danger'
    if (days > 7) return 'warning'
    return 'clear'
}

function ageBarClass(createdAt) {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    if (days > 30) return 'over'
    if (days > 7) return 'warn'
    return 'safe'
}

function ageBarWidth(createdAt) {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    return Math.min(100, Math.round((days / 60) * 100)) + '%'
}

function ageDaysLabel(createdAt) {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
    if (days === 0) return 'Hari ini'
    if (days === 1) return '1 hari lalu'
    return `${days} hari lalu`
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function Piutang() {
    const [search, setSearch] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState(null)
    const [addCustomerModal, setAddCustomerModal] = useState(false)
    const [customerForm, setCustomerForm] = useState({ name: '', phone: '' })
    const [payModal, setPayModal] = useState(null)   // { debt }
    const [payAmount, setPayAmount] = useState('')
    const [payNote, setPayNote] = useState('')
    const [paying, setPaying] = useState(false)
    const [payTotalModal, setPayTotalModal] = useState(false)
    const [payTotalAmount, setPayTotalAmount] = useState('')
    const [payTotalNote, setPayTotalNote] = useState('')
    const [payingTotal, setPayingTotal] = useState(false)
    const [txnDetail, setTxnDetail] = useState(null)  // { txn, items }

    // All customers (plain list)
    const customers = useLiveQuery(() => db.customers.toArray(), [])

    // Summary of outstanding debts per customer
    const debtSummary = useLiveQuery(async () => {
        const allDebts = await db.debts.toArray()
        const map = {}
        for (const d of allDebts) {
            if (d.status === 'lunas') continue
            if (!map[d.customerId]) map[d.customerId] = { outstanding: 0, oldestCreatedAt: d.createdAt }
            map[d.customerId].outstanding += d.amount - d.paidAmount
            if (d.createdAt < map[d.customerId].oldestCreatedAt) {
                map[d.customerId].oldestCreatedAt = d.createdAt
            }
        }
        return map
    }, [])

    // Debts for selected customer
    const customerDebts = useLiveQuery(async () => {
        if (!selectedCustomer) return []
        const debts = await db.debts
            .where('customerId').equals(selectedCustomer.id)
            .toArray()
        // Sort newest first
        debts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        // Attach payment history
        return Promise.all(debts.map(async d => {
            const payments = await db.debt_payments.where('debtId').equals(d.id).toArray()
            return { ...d, payments }
        }))
    }, [selectedCustomer?.id])

    // Merge customer list with debt summary for display
    const enrichedCustomers = (customers || []).map(c => {
        const summary = (debtSummary || {})[c.id]
        return {
            ...c,
            outstanding: summary?.outstanding || 0,
            debtColor: summary ? ageColor(summary.oldestCreatedAt) : 'clear'
        }
    }).sort((a, b) => b.outstanding - a.outstanding)

    const filteredCustomers = enrichedCustomers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
    )

    /* ── Add customer ─────────────────────────────────── */
    async function handleAddCustomer() {
        const cleanName = customerForm.name.trim()
        if (!cleanName) return showToast('Nama wajib diisi', 'error')
        try {
            // Check uniqueness
            const existing = await db.customers.where('name').equalsIgnoreCase(cleanName).count()
            if (existing > 0) return showToast('Nama pelanggan sudah digunakan', 'error')

            const id = await db.customers.add({
                name: cleanName,
                phone: customerForm.phone.trim(),
            })
            showToast('Pelanggan ditambahkan', 'success')
            setAddCustomerModal(false)
            setCustomerForm({ name: '', phone: '' })
            // Auto-select new customer
            setSelectedCustomer({ id, name: cleanName, phone: customerForm.phone.trim() })
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        }
    }

    /* ── Pay debt ─────────────────────────────────────── */
    async function handlePay() {
        const debt = payModal?.debt
        if (!debt) return
        const amount = parseInt(payAmount.replace(/\D/g, '')) || 0
        const remaining = debt.amount - debt.paidAmount
        if (amount <= 0) return showToast('Nominal harus lebih dari 0', 'error')
        if (amount > remaining) return showToast(`Melebihi sisa hutang (${fmtCurrency(remaining)})`, 'error')
        setPaying(true)
        try {
            const now = new Date().toISOString()
            await db.transaction('rw', [db.debts, db.debt_payments], async () => {
                await db.debt_payments.add({ debtId: debt.id, amount, note: payNote.trim(), createdAt: now })
                const newPaid = debt.paidAmount + amount
                const newStatus = newPaid >= debt.amount ? 'lunas' : 'partial'
                await db.debts.update(debt.id, { paidAmount: newPaid, status: newStatus })
            })
            showToast(amount >= remaining ? 'Hutang lunas! 🎉' : 'Pembayaran dicatat', 'success')
            setPayModal(null)
            setPayAmount('')
            setPayNote('')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setPaying(false)
        }
    }

    /* ── Pay custom amount across ALL debts for selected customer ─────────── */
    async function handlePayTotal() {
        if (!selectedCustomer || !customerDebts) return
        const unpaid = customerDebts.filter(d => d.status !== 'lunas')
        if (unpaid.length === 0) return

        const amount = parseInt(payTotalAmount.replace(/\D/g, '')) || 0
        if (amount <= 0) return showToast('Nominal harus lebih dari 0', 'error')

        const totalOutstanding = unpaid.reduce((s, d) => s + (d.amount - d.paidAmount), 0)
        if (amount > totalOutstanding) return showToast(`Melebihi total hutang (${fmtCurrency(totalOutstanding)})`, 'error')

        setPayingTotal(true)
        try {
            const now = new Date().toISOString()
            // Unpaid debts are already sorted newest first by customerDebts liveQuery
            // We need to reverse it to pay OLDEST debts first
            const oldestFirstUnpaid = [...unpaid].reverse()

            await db.transaction('rw', [db.debts, db.debt_payments], async () => {
                let remainingPayment = amount

                for (const debt of oldestFirstUnpaid) {
                    if (remainingPayment <= 0) break

                    const debtOwed = debt.amount - debt.paidAmount
                    if (debtOwed <= 0) continue

                    const appliedAmount = Math.min(debtOwed, remainingPayment)

                    await db.debt_payments.add({
                        debtId: debt.id,
                        amount: appliedAmount,
                        note: payTotalNote.trim() || 'Bayar Piutang',
                        createdAt: now,
                    })

                    const newPaid = debt.paidAmount + appliedAmount
                    const newStatus = newPaid >= debt.amount ? 'lunas' : 'partial'
                    await db.debts.update(debt.id, {
                        paidAmount: newPaid,
                        status: newStatus,
                    })

                    remainingPayment -= appliedAmount
                }
            })
            showToast(amount >= totalOutstanding ? 'Semua hutang lunas! 🎉' : 'Pembayaran piutang dicatat', 'success')
            setPayTotalModal(false)
            setPayTotalAmount('')
            setPayTotalNote('')
        } catch (e) {
            showToast('Error: ' + e.message, 'error')
        } finally {
            setPayingTotal(false)
        }
    }

    /* ── View transaction detail ───────────────────── */
    async function openTxnDetail(transactionId) {
        if (!transactionId) return
        const txn = await db.transactions.get(transactionId)
        if (!txn) return showToast('Transaksi tidak ditemukan', 'error')
        const items = await db.table('transaction_items').where('transactionId').equals(transactionId).toArray()
        setTxnDetail({ txn: { ...txn, items, customerName: selectedCustomer?.name }, items })
    }

    /* ── Render ──────────────────────────────────────── */
    return (
        <div className="piutang-layout">
            {/* ── LEFT: customer list ── */}
            <div className="piutang-left">
                <div className="piutang-header">
                    <h2>
                        <Icon name="account_balance_wallet" size={20} />
                        Piutang
                    </h2>
                    <div className="piutang-search">
                        <Icon name="search" size={18} style={{ color: 'var(--text3)' }} />
                        <input
                            placeholder="Cari pelanggan..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="customer-list">
                    {filteredCustomers.length === 0 && (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.875rem' }}>
                            Belum ada pelanggan
                        </div>
                    )}
                    {filteredCustomers.map(c => (
                        <div
                            key={c.id}
                            className={`customer-item${selectedCustomer?.id === c.id ? ' active' : ''}`}
                            onClick={() => setSelectedCustomer(c)}
                        >
                            <div className="customer-avatar">
                                {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="customer-info">
                                <div className="customer-name">{c.name}</div>
                                <div className="customer-phone">{c.phone || '—'}</div>
                            </div>
                            {c.outstanding > 0
                                ? <div className={`customer-debt-badge ${c.debtColor}`}>{fmtCurrency(c.outstanding)}</div>
                                : <div className="customer-debt-badge clear">Lunas</div>
                            }
                        </div>
                    ))}
                </div>

                <div className="btn-add-customer">
                    <button
                        className="btn btn-primary btn-block"
                        onClick={() => setAddCustomerModal(true)}
                    >
                        <Icon name="person_add" size={18} /> Tambah Pelanggan
                    </button>
                </div>
            </div>

            {/* ── RIGHT: debt detail ── */}
            <div className="piutang-right">
                {!selectedCustomer ? (
                    <div className="piutang-empty-state">
                        <Icon name="account_balance_wallet" size={56} style={{ opacity: 0.2 }} />
                        <p>Pilih pelanggan untuk melihat detail hutang</p>
                    </div>
                ) : (
                    <>
                        <div className="debt-detail-header">
                            <div>
                                <h3>{selectedCustomer.name}</h3>
                                {selectedCustomer.phone && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '2px' }}>
                                        {selectedCustomer.phone}
                                    </div>
                                )}
                            </div>
                            {(() => {
                                const outstanding = (customerDebts || [])
                                    .filter(d => d.status !== 'lunas')
                                    .reduce((s, d) => s + (d.amount - d.paidAmount), 0)
                                return outstanding > 0
                                    ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className="debt-total-chip">Sisa: {fmtCurrency(outstanding)}</div>
                                            <button
                                                className="btn btn-success btn-sm"
                                                onClick={() => setPayTotalModal(true)}
                                                title="Bayar keseluruhan hutang pelanggan ini"
                                            >
                                                <Icon name="payments" size={16} /> Bayar Piutang
                                            </button>
                                        </div>
                                    )
                                    : <div className="debt-total-chip" style={{ background: 'color-mix(in srgb, var(--success,#22c55e) 12%, transparent)', color: 'var(--success,#22c55e)' }}>Semua Lunas ✓</div>
                            })()}
                        </div>

                        <div className="debt-list">
                            {(customerDebts || []).length === 0 && (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)' }}>
                                    Belum ada hutang
                                </div>
                            )}
                            {(customerDebts || []).map(debt => (
                                <DebtCard
                                    key={debt.id}
                                    debt={debt}
                                    onPay={() => { setPayModal({ debt }); setPayAmount('') }}
                                    onViewTxn={() => openTxnDetail(debt.transactionId)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ── Modal: Add Customer ── */}
            <Modal open={addCustomerModal} onClose={() => setAddCustomerModal(false)} title="Tambah Pelanggan" width="380px">
                <div className="customer-form">
                    <div className="form-group">
                        <label>Nama <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input
                            className="input"
                            placeholder="Nama pelanggan"
                            autoFocus
                            value={customerForm.name}
                            onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div className="form-group">
                        <label>No. HP / WhatsApp</label>
                        <input
                            className="input"
                            placeholder="08xx..."
                            type="tel"
                            value={customerForm.phone}
                            onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))}
                        />
                    </div>
                    <div className="flex gap3 mt2">
                        <button className="btn btn-ghost" onClick={() => setAddCustomerModal(false)}>Batal</button>
                        <button
                            className="btn btn-primary btn-block"
                            disabled={!customerForm.name.trim()}
                            onClick={handleAddCustomer}
                        >
                            <Icon name="person_add" size={18} /> Simpan
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── Modal: Receive Payment ── */}
            <Modal
                open={!!payModal}
                onClose={() => { setPayModal(null); setPayAmount(''); setPayNote('') }}
                title="Terima Pembayaran"
                width="400px"
            >
                {payModal && (
                    <div className="pay-form">
                        <div className="pay-summary">
                            <div className="pay-summary-row">
                                <span>Total Hutang</span>
                                <span>{fmtCurrency(payModal.debt.amount)}</span>
                            </div>
                            <div className="pay-summary-row">
                                <span>Sudah Dibayar</span>
                                <span style={{ color: 'var(--success,#22c55e)' }}>{fmtCurrency(payModal.debt.paidAmount)}</span>
                            </div>
                            <div className="pay-summary-row highlight">
                                <span>Sisa Hutang</span>
                                <span style={{ color: 'var(--danger,#ef4444)' }}>
                                    {fmtCurrency(payModal.debt.amount - payModal.debt.paidAmount)}
                                </span>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Nominal Pembayaran (Rp) <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input
                                className="input"
                                inputMode="numeric"
                                placeholder="0"
                                autoFocus
                                value={payAmount ? Number(payAmount.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                                onChange={e => setPayAmount(e.target.value.replace(/\D/g, ''))}
                            />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                {[25, 50, 75, 100].map(pct => {
                                    const remaining = payModal.debt.amount - payModal.debt.paidAmount
                                    const val = Math.round(remaining * pct / 100)
                                    return (
                                        <button
                                            key={pct}
                                            className="btn btn-ghost btn-sm"
                                            style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }}
                                            onClick={() => setPayAmount(String(val))}
                                        >
                                            {pct === 100 ? 'Lunas' : `${pct}%`}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Catatan (opsional)</label>
                            <input
                                className="input"
                                placeholder="Misal: transfer BCA"
                                value={payNote}
                                onChange={e => setPayNote(e.target.value)}
                            />
                        </div>

                        <div className="flex gap3 mt2">
                            <button className="btn btn-ghost" onClick={() => { setPayModal(null); setPayAmount(''); setPayNote('') }}>
                                Batal
                            </button>
                            <button
                                className="btn btn-success btn-block"
                                disabled={!payAmount || paying}
                                onClick={handlePay}
                            >
                                <Icon name="payments" size={18} filled />
                                {paying ? 'Menyimpan...' : 'Konfirmasi Bayar'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Modal: Pay Total Debts ── */}
            <Modal
                open={payTotalModal}
                onClose={() => setPayTotalModal(false)}
                title="Bayar Piutang Total"
                width="400px"
            >
                {payTotalModal && (() => {
                    const unpaid = (customerDebts || []).filter(d => d.status !== 'lunas')
                    const totalOutstanding = unpaid.reduce((s, d) => s + (d.amount - d.paidAmount), 0)
                    return (
                        <div className="pay-form">
                            <div className="pay-summary">
                                <div className="pay-summary-row">
                                    <span>Pelanggan</span>
                                    <span style={{ fontWeight: 600 }}>{selectedCustomer?.name}</span>
                                </div>
                                <div className="pay-summary-row">
                                    <span>Jumlah Hutang</span>
                                    <span>{unpaid.length} hutang aktif</span>
                                </div>
                                <div className="pay-summary-row highlight">
                                    <span>Total Outstanding</span>
                                    <span style={{ color: 'var(--danger,#ef4444)' }}>
                                        {fmtCurrency(totalOutstanding)}
                                    </span>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginTop: '16px' }}>
                                <label>Nominal Pembayaran <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input
                                    className="input"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Rp 0"
                                    value={payTotalAmount ? `Rp ${parseInt(payTotalAmount.replace(/\D/g, '') || 0).toLocaleString('id-ID')}` : ''}
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '')
                                        if (parseInt(val) > totalOutstanding) val = totalOutstanding.toString()
                                        setPayTotalAmount(val)
                                    }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                    {[25, 50, 75, 100].map(pct => {
                                        const val = Math.round(totalOutstanding * pct / 100)
                                        return (
                                            <button
                                                key={pct}
                                                className="btn btn-ghost btn-sm"
                                                style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }}
                                                onClick={() => setPayTotalAmount(String(val))}
                                            >
                                                {pct === 100 ? 'Lunas' : `${pct}%`}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Catatan (opsional)</label>
                                <input
                                    className="input"
                                    placeholder="Misal: cicilan pertama"
                                    value={payTotalNote}
                                    onChange={e => setPayTotalNote(e.target.value)}
                                />
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', lineHeight: 1.5, marginTop: '12px' }}>
                                Pembayaran ini akan dialokasikan secara otomatis ke hutang yang paling lama terlebih dahulu.
                            </div>

                            <div className="flex gap3 mt2">
                                <button className="btn btn-ghost" onClick={() => { setPayTotalModal(false); setPayTotalAmount(''); setPayTotalNote('') }}>
                                    Batal
                                </button>
                                <button
                                    className="btn btn-success btn-block"
                                    disabled={payingTotal || !payTotalAmount || parseInt(payTotalAmount.replace(/\D/g, '')) <= 0}
                                    onClick={handlePayTotal}
                                >
                                    <Icon name="payments" size={18} />
                                    {payingTotal ? 'Memproses...' : 'Konfirmasi Bayar'}
                                </button>
                            </div>
                        </div>
                    )
                })()}
            </Modal>

            {/* ── Modal: Transaction Detail ── */}
            <Modal
                open={!!txnDetail}
                onClose={() => setTxnDetail(null)}
                title={`Detail ${txnDetail ? fmtTxnId(txnDetail.txn.id) : ''}`}
                width="480px"
            >
                {txnDetail && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {txnDetail.txn.paymentType === 'debt' && (
                            <div style={{ background: 'color-mix(in srgb, var(--danger,#ef4444) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger,#ef4444) 30%, transparent)', borderRadius: 'var(--r2)', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icon name="credit_score" size={18} style={{ color: 'var(--danger,#ef4444)' }} />
                                <span style={{ fontWeight: 700, color: 'var(--danger,#ef4444)', fontSize: '0.875rem' }}>
                                    HUTANG — {txnDetail.txn.customerName || 'Pelanggan'}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between text2 mb4">
                            <span>{fmtDateTime(txnDetail.txn.createdAt)}</span>
                            <span>{txnDetail.items.length} item</span>
                        </div>
                        <div className="divider" />
                        {txnDetail.items.map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
                                <span style={{ flex: 1 }}>{item.name}</span>
                                <span className="text2" style={{ textAlign: 'center', minWidth: '48px', margin: '0 12px' }}>x{item.qty}</span>
                                <span style={{ textAlign: 'right' }}>{fmtCurrency(item.price * item.qty)}</span>
                            </div>
                        ))}
                        <div className="divider" />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '4px 0' }}>
                            <span>Total</span>
                            <span>{fmtCurrency(txnDetail.txn.total)}</span>
                        </div>
                        {txnDetail.txn.paymentType === 'debt' ? (
                            <>
                                {txnDetail.txn.payment > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                        <span>Dibayar (DP)</span>
                                        <span>{fmtCurrency(txnDetail.txn.payment)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger,#ef4444)', fontWeight: 600, padding: '4px 0' }}>
                                    <span>Status</span>
                                    <span>Sisa {fmtCurrency(txnDetail.txn.total - txnDetail.txn.payment)} (Hutang)</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <span>Bayar</span>
                                    <span>{fmtCurrency(txnDetail.txn.payment)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success,#22c55e)', padding: '4px 0' }}>
                                    <span>Kembalian</span>
                                    <span>{fmtCurrency(txnDetail.txn.change)}</span>
                                </div>
                            </>
                        )}
                        <div className="flex gap3 mt4">
                            <button className="btn btn-primary btn-block" onClick={() => setTxnDetail(null)}>
                                <Icon name="check" size={18} /> Tutup
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}

/* ─── DebtCard component ─────────────────────────────── */
function DebtCard({ debt, onPay, onViewTxn }) {
    const remaining = debt.amount - debt.paidAmount

    return (
        <div className="debt-card">
            <div className="debt-card-top">
                <div className="debt-card-meta">
                    <div className="debt-card-date">{fmtDateTime(debt.createdAt)}</div>
                    {debt.transactionId && (
                        <div
                            className="debt-card-txn"
                            onClick={e => { e.stopPropagation(); onViewTxn?.() }}
                            style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                            title="Lihat detail transaksi"
                        >
                            Transaksi {fmtTxnId(debt.transactionId)}
                        </div>
                    )}
                </div>
                <div className={`debt-status-badge ${debt.status}`}>
                    {debt.status === 'lunas' ? 'Lunas' : debt.status === 'partial' ? 'Sebagian' : 'Belum Bayar'}
                </div>
            </div>

            <div className="debt-amounts">
                <div className="debt-amount-col">
                    <span className="debt-amount-label">Total Hutang</span>
                    <span className="debt-amount-value">{fmtCurrency(debt.amount)}</span>
                </div>
                <div className="debt-amount-col">
                    <span className="debt-amount-label">Dibayar</span>
                    <span className="debt-amount-value paid">{fmtCurrency(debt.paidAmount)}</span>
                </div>
                <div className="debt-amount-col">
                    <span className="debt-amount-label">Sisa</span>
                    <span className={`debt-amount-value ${remaining > 0 ? 'remaining' : ''}`}>
                        {fmtCurrency(remaining)}
                    </span>
                </div>
            </div>

            <div className="debt-age-bar-wrap">
                <span className="debt-age-label">{ageDaysLabel(debt.createdAt)}</span>
                <div className="debt-age-bar">
                    <div
                        className={`debt-age-bar-fill ${ageBarClass(debt.createdAt)}`}
                        style={{ width: ageBarWidth(debt.createdAt) }}
                    />
                </div>
            </div>

            {debt.payments?.length > 0 && (
                <div className="debt-payments-row">
                    {debt.payments.map((p, i) => (
                        <span key={i} className="payment-chip">
                            +{fmtCurrency(p.amount)} · {fmtDate(p.createdAt)}{p.note ? ` · ${p.note}` : ''}
                        </span>
                    ))}
                </div>
            )}

            {debt.status !== 'lunas' && (
                <button className="btn btn-primary btn-sm" onClick={onPay}>
                    <Icon name="payments" size={16} /> Terima Pembayaran
                </button>
            )}
        </div>
    )
}
