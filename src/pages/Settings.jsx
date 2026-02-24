import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { showToast } from '../components/Toast.jsx'
import db from '../db/db.js'
import { exportBackup, importBackup, sendBackupToTelegram } from '../utils/backup.js'
import { connectPrinter, disconnectPrinter, getPrinterName, isPrinterConnected } from '../utils/bluetooth.js'
import { fmtDateTime } from '../utils/format.js'
import './Settings.css'

export default function Settings() {
    const [storeName, setStoreName] = useState('')
    const [telegramToken, setTelegramToken] = useState('')
    const [telegramChatId, setTelegramChatId] = useState('')
    const [printerName, setPrinterName] = useState(getPrinterName())
    const [printerConnected, setPrinterConnected] = useState(isPrinterConnected())
    const [connecting, setConnecting] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [sendingTelegram, setSendingTelegram] = useState(false)
    const [deferredPrompt, setDeferredPrompt] = useState(null)
    const [pendingImportFile, setPendingImportFile] = useState(null)
    const [showClearModal, setShowClearModal] = useState(false)
    const [showExportFallbackModal, setShowExportFallbackModal] = useState(false)
    const [exportErrorMsg, setExportErrorMsg] = useState('')
    const fileRef = useRef()

    const backupRow = useLiveQuery(() => db.settings.get('lastBackupTime'), [])
    const txnCount = useLiveQuery(() => db.transactions.count(), [])
    const needsBackup = txnCount > 0 && (!backupRow || (Date.now() - new Date(backupRow.value).getTime() > 7 * 24 * 60 * 60 * 1000))

    useEffect(() => {
        db.settings.get('storeName').then(s => { if (s) setStoreName(s.value) })
        db.settings.get('telegramToken').then(s => { if (s) setTelegramToken(s.value) })
        db.settings.get('telegramChatId').then(s => { if (s) setTelegramChatId(s.value) })
    }, [])

    useEffect(() => {
        const handler = e => { e.preventDefault(); setDeferredPrompt(e) }
        window.addEventListener('beforeinstallprompt', handler)
        return () => window.removeEventListener('beforeinstallprompt', handler)
    }, [])

    async function saveStoreName() {
        await db.settings.put({ key: 'storeName', value: storeName.trim() || 'My Store' })
        showToast('Nama toko disimpan', 'success')
    }

    async function saveTelegramConfig() {
        await db.settings.put({ key: 'telegramToken', value: telegramToken.trim() })
        await db.settings.put({ key: 'telegramChatId', value: telegramChatId.trim() })
        showToast('Pengaturan Telegram disimpan', 'success')
    }

    async function handleConnect() {
        if (!navigator.bluetooth) return showToast('Web Bluetooth tidak didukung browser ini', 'error')
        setConnecting(true)
        try {
            const name = await connectPrinter()
            setPrinterName(name); setPrinterConnected(true)
            showToast(`Terhubung ke ${name}`, 'success')
        } catch (e) {
            if (e.name !== 'NotFoundError') showToast('Gagal: ' + e.message, 'error')
        } finally { setConnecting(false) }
    }

    async function handleDisconnect() {
        await disconnectPrinter(); setPrinterConnected(false)
        showToast('Printer terputus', 'info')
    }

    async function handleExport() {
        if (telegramToken && telegramChatId) {
            setSendingTelegram(true)
            try {
                await sendBackupToTelegram(telegramToken, telegramChatId, storeName || 'My Store')
                await db.settings.put({ key: 'lastBackupTime', value: new Date().toISOString() })
                showToast('Backup berhasil dikirim ke Telegram', 'success')
            } catch (e) {
                setExportErrorMsg(e.message)
                setShowExportFallbackModal(true)
            } finally {
                setSendingTelegram(false)
            }
        } else {
            await executeManualExport()
        }
    }

    async function executeManualExport() {
        setShowExportFallbackModal(false)
        try {
            const saved = await exportBackup(storeName || 'My Store')
            if (saved) {
                await db.settings.put({ key: 'lastBackupTime', value: new Date().toISOString() })
                showToast('Backup berhasil diunduh', 'success')
            }
        } catch (e) { showToast('Gagal export: ' + e.message, 'error') }
    }

    function handleImport(e) {
        const file = e.target.files?.[0]
        if (!file) return
        // Store the file and show a React modal for confirmation.
        // Chrome blocks window.confirm() after a file-picker gesture, so
        // we use a custom modal instead.
        setPendingImportFile(file)
        fileRef.current.value = ''
    }

    async function confirmImport() {
        const file = pendingImportFile
        setPendingImportFile(null)
        if (!file) return
        setRestoring(true)
        try {
            await importBackup(file)
            showToast('Restore berhasil!', 'success')
        } catch (e) { showToast('Gagal import: ' + e.message, 'error') }
        finally { setRestoring(false) }
    }

    function cancelImport() {
        setPendingImportFile(null)
    }

    async function handleInstall() {
        if (!deferredPrompt) return showToast('Gunakan tombol install di address bar Chrome', 'info')
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') { setDeferredPrompt(null); showToast('App berhasil diinstal!', 'success') }
    }

    async function confirmClearAll() {
        setShowClearModal(false)
        await db.transaction('rw', [db.categories, db.products, db.transactions, db.table('transaction_items'), db.stock_movements, db.settings], async () => {
            await db.categories.clear(); await db.products.clear()
            await db.transactions.clear(); await db.table('transaction_items').clear()
            await db.stock_movements.clear(); await db.settings.clear()
        })
        showToast('Semua data dihapus', 'info'); setStoreName('')
    }

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="settings" size={26} filled style={{ marginRight: 8 }} />Pengaturan</h1>
            </div>
            <div className="page-body">
                <div className="settings-sections">

                    <section className="settings-card">
                        <h2><Icon name="storefront" size={20} style={{ marginRight: 6 }} />Nama Toko</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>Tampil di header struk.</p>
                        <div className="flex gap3">
                            <input id="store-name-input" className="input" placeholder="My Store"
                                value={storeName} onChange={e => setStoreName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveStoreName()} />
                            <button className="btn btn-primary" onClick={saveStoreName}>
                                <Icon name="save" size={18} /> Simpan
                            </button>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="print" size={20} style={{ marginRight: 6 }} />Printer Bluetooth</h2>
                        <div className="printer-status">
                            <div className={`printer-dot ${printerConnected ? 'connected' : ''}`} />
                            <span>{printerConnected ? `Terhubung: ${printerName}` : (printerName ? `Terputus: ${printerName}` : 'Belum ada printer')}</span>
                        </div>
                        <div className="flex gap3 mt3">
                            <button id="connect-printer-btn" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                                <Icon name={connecting ? 'hourglass_top' : 'bluetooth_searching'} size={18} />
                                {connecting ? 'Menghubungkan...' : 'Cari & Hubungkan'}
                            </button>
                            {printerConnected && (
                                <button className="btn btn-ghost" onClick={handleDisconnect}>
                                    <Icon name="bluetooth_disabled" size={18} /> Putuskan
                                </button>
                            )}
                        </div>
                        <p className="text2 mt3" style={{ fontSize: '0.8rem' }}>
                            Web Bluetooth membutuhkan Chrome di Android/desktop. Printer harus support ESC/POS via BLE.
                        </p>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="backup" size={20} style={{ marginRight: 6 }} />Backup & Restore</h2>
                        {needsBackup && (
                            <div style={{ background: 'var(--danger, #ef4444)', color: '#fff', padding: '12px 16px', borderRadius: 'var(--r2)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <Icon name="warning" size={24} style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                                    <strong style={{ display: 'block', marginBottom: '4px' }}>Waktunya Backup Data!</strong>
                                    Sudah lebih dari seminggu (atau belum pernah) sejak backup terakhir. Cegah kehilangan data penjualan Anda sekarang.
                                </div>
                            </div>
                        )}
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                            Export semua data ke file JSON. Import untuk restore.<br />
                            {backupRow && <strong style={{ color: 'var(--text)' }}>Terakhir backup: {fmtDateTime(backupRow.value)}</strong>}
                        </p>
                        <div className="flex gap3 flex-wrap">
                            <button 
                                id="export-btn" 
                                className="btn btn-primary" 
                                onClick={handleExport}
                                disabled={sendingTelegram}
                            >
                                <Icon name={sendingTelegram ? "hourglass_top" : "download"} size={18} />
                                {sendingTelegram ? 'Mengirim Telegram...' : 'Export Backup'}
                            </button>
                            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                                <Icon name="upload" size={18} /> {restoring ? 'Restoring...' : 'Import Restore'}
                                <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                            </label>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="send" size={20} style={{ marginRight: 6 }} />Integrasi Telegram</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>Atur bot untuk menerima file backup otomatis dengan tombol di atas.</p>

                        <div className="flex-col gap3">
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Bot Token</label>
                                <input
                                    className="input"
                                    type="password"
                                    placeholder="e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                                    value={telegramToken}
                                    onChange={e => setTelegramToken(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Chat ID</label>
                                <input
                                    className="input"
                                    type="password"
                                    placeholder="e.g. 123456789"
                                    value={telegramChatId}
                                    onChange={e => setTelegramChatId(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && saveTelegramConfig()}
                                />
                                <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '4px' }}>Dapatkan dari @userinfobot atau sejenisnya.</div>
                            </div>
                            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={saveTelegramConfig}>
                                <Icon name="save" size={18} /> Simpan Telegram
                            </button>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="install_mobile" size={20} style={{ marginRight: 6 }} />Install App</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                            Install sebagai aplikasi di tablet untuk pengalaman layar penuh.
                        </p>
                        <button className="btn btn-primary" onClick={handleInstall}>
                            <Icon name="install_mobile" size={18} />
                            {deferredPrompt ? 'Install Sekarang' : 'Buka dari address bar Chrome'}
                        </button>
                    </section>

                    <section className="settings-card danger-zone">
                        <h2><Icon name="warning" size={20} filled style={{ marginRight: 6, color: 'var(--danger)' }} />Zona Bahaya</h2>
                        <button className="btn btn-danger" onClick={() => setShowClearModal(true)}>
                            <Icon name="delete_forever" size={18} /> Hapus Semua Data
                        </button>
                    </section>

                </div>
            </div>

            {/* Import confirmation modal */}
            <Modal
                open={!!pendingImportFile}
                onClose={cancelImport}
                title="Konfirmasi Import"
                width="400px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                        Import akan <strong>MENGGANTI SEMUA DATA</strong> yang ada dengan isi file backup.<br />
                        Aksi ini tidak bisa dibatalkan. Lanjutkan?
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={cancelImport}>
                            <Icon name="close" size={18} /> Batal
                        </button>
                        <button className="btn btn-danger" onClick={confirmImport}>
                            <Icon name="upload" size={18} /> Ya, Import
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Clear all data confirmation modal */}
            <Modal
                open={showClearModal}
                onClose={() => setShowClearModal(false)}
                title="Hapus Semua Data"
                width="400px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <Icon name="warning" size={28} filled style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0, lineHeight: 1.6 }}>
                            Tindakan ini akan <strong>menghapus seluruh data</strong> termasuk produk, kategori,
                            riwayat transaksi, dan pengaturan.<br />
                            <strong>Aksi ini tidak bisa dibatalkan.</strong>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setShowClearModal(false)}>
                            <Icon name="close" size={18} /> Batal
                        </button>
                        <button className="btn btn-danger" onClick={confirmClearAll}>
                            <Icon name="delete_forever" size={18} /> Ya, Hapus Semua
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Telegram Export Fallback Modal */}
            <Modal
                open={showExportFallbackModal}
                onClose={() => setShowExportFallbackModal(false)}
                title="Gagal Mengirim ke Telegram"
                width="400px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                        Terjadi kesalahan saat mencoba mengirim backup ke Telegram: <br />
                        <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{exportErrorMsg}</span>
                        <br /><br />
                        Penyebabnya mungkin karena tidak ada koneksi internet. Apakah Anda ingin mengunduh file backup secara manual ke perangkat ini?
                    </p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => setShowExportFallbackModal(false)}>
                            <Icon name="close" size={18} /> Batal
                        </button>
                        <button className="btn btn-primary" onClick={executeManualExport}>
                            <Icon name="download" size={18} /> Ya, Unduh Manual
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
