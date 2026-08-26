import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import Modal from '../../components/Modal.jsx'
import { showToast } from '../../components/Toast.jsx'
import { getSettingQuery, saveSetting, clearAllData } from '../../services/settingsService.js'
import { exportBackup, importBackup, sendBackupToTelegram } from '../../utils/backup.js'
import { connectPrinter, disconnectPrinter, getPrinterName, isPrinterConnected } from '../../utils/bluetooth.js'
import { fmtDateTime } from '../../utils/format.js'
import './SettingsPage.css'

export default function SettingsPage() {
    const [storeName, setStoreName] = useState('')
    const [storeAddress, setStoreAddress] = useState('')
    const [storePhone, setStorePhone] = useState('')
    const [receiptFooter, setReceiptFooter] = useState('Terima kasih!')
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
    const [qrisImage, setQrisImage] = useState(() => localStorage.getItem('qris_image') || null)
    const [unknownBarcodeAction, setUnknownBarcodeAction] = useState('prompt_create')
    const qrisFileRef = useRef()
    const fileRef = useRef()

    // Read reactive backup data
    const backupRow = useLiveQuery(() => getSettingQuery('lastBackupTime'), [])
    const txnCount = useLiveQuery(async () => {
        // Direct query to transactions count is fine here
        const m = await import('../../db/db.js')
        return m.default.transactions.count()
    }, [])
    const needsBackup = txnCount > 0 && (!backupRow || (Date.now() - new Date(backupRow.value).getTime() > 7 * 24 * 60 * 60 * 1000))

    useEffect(() => {
        getSettingQuery('storeName').then(s => { if (s) setStoreName(s.value) })
        getSettingQuery('storeAddress').then(s => { if (s) setStoreAddress(s.value) })
        getSettingQuery('storePhone').then(s => { if (s) setStorePhone(s.value) })
        getSettingQuery('receiptFooter').then(s => { if (s) setReceiptFooter(s.value) })
        getSettingQuery('telegramToken').then(s => { if (s) setTelegramToken(s.value) })
        getSettingQuery('telegramChatId').then(s => { if (s) setTelegramChatId(s.value) })
        getSettingQuery('unknownBarcodeAction').then(s => { if (s?.value) setUnknownBarcodeAction(s.value) })
    }, [])

    useEffect(() => {
        const handler = e => { e.preventDefault(); setDeferredPrompt(e) }
        window.addEventListener('beforeinstallprompt', handler)
        return () => window.removeEventListener('beforeinstallprompt', handler)
    }, [])

    async function saveStoreInfo() {
        await saveSetting('storeName', storeName.trim() || 'My Store')
        await saveSetting('storeAddress', storeAddress.trim())
        await saveSetting('storePhone', storePhone.trim())
        showToast('Informasi toko disimpan', 'success')
    }

    async function saveReceiptFooter() {
        await saveSetting('receiptFooter', receiptFooter.trim() || 'Terima kasih!')
        showToast('Footer struk disimpan', 'success')
    }

    function handleQrisImageChange(e) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) return showToast('File harus berupa gambar', 'error')
        const reader = new FileReader()
        reader.onload = (ev) => {
            const dataUrl = ev.target.result
            localStorage.setItem('qris_image', dataUrl)
            setQrisImage(dataUrl)
            showToast('Gambar QRIS disimpan', 'success')
        }
        reader.readAsDataURL(file)
        qrisFileRef.current.value = ''
    }

    function clearQrisImage() {
        localStorage.removeItem('qris_image')
        setQrisImage(null)
        showToast('Gambar QRIS dihapus', 'info')
    }

    async function saveTelegramConfig() {
        await saveSetting('telegramToken', telegramToken.trim())
        await saveSetting('telegramChatId', telegramChatId.trim())
        showToast('Pengaturan Telegram disimpan', 'success')
    }

    async function saveBarcodeConfig() {
        await saveSetting('unknownBarcodeAction', unknownBarcodeAction)
        showToast('Pengaturan barcode disimpan', 'success')
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
                await saveSetting('lastBackupTime', new Date().toISOString())
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
                await saveSetting('lastBackupTime', new Date().toISOString())
                showToast('Backup berhasil diunduh', 'success')
            }
        } catch (e) { showToast('Gagal export: ' + e.message, 'error') }
    }

    function handleImport(e) {
        const file = e.target.files?.[0]
        if (!file) return
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
        try {
            await clearAllData()
            showToast('Semua data dihapus', 'info')
            setStoreName('')
            setStoreAddress('')
            setStorePhone('')
        } catch (e) {
            showToast('Gagal menghapus data: ' + e.message, 'error')
        }
    }

    return (
        <div className="page">
            <div className="page-header">
                <h1><Icon name="settings" size={26} filled style={{ marginRight: 8 }} />Pengaturan</h1>
            </div>
            <div className="page-body">
                <div className="settings-sections">

                    <section className="settings-card">
                        <h2><Icon name="storefront" size={20} style={{ marginRight: 6 }} />Informasi Toko</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>Tampil di bagian header struk pembayaran.</p>
                        <div className="flex-col gap3">
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label htmlFor="store-name-input">Nama Toko</label>
                                <input
                                    id="store-name-input"
                                    className="input"
                                    placeholder="My Store"
                                    value={storeName}
                                    onChange={e => setStoreName(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label htmlFor="store-address-input">Alamat Toko</label>
                                <textarea
                                    id="store-address-input"
                                    className="input"
                                    placeholder="Contoh: Jl. Sudirman No. 12, Jakarta"
                                    rows={2}
                                    style={{ minHeight: '60px', height: 'auto', resize: 'vertical', fontFamily: 'inherit' }}
                                    value={storeAddress}
                                    onChange={e => setStoreAddress(e.target.value)}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label htmlFor="store-phone-input">Nomor Telepon / WhatsApp</label>
                                <input
                                    id="store-phone-input"
                                    className="input"
                                    type="tel"
                                    placeholder="Contoh: 081234567890"
                                    value={storePhone}
                                    onChange={e => setStorePhone(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && saveStoreInfo()}
                                />
                            </div>
                            <button id="save-store-info-btn" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={saveStoreInfo}>
                                <Icon name="save" size={18} /> Simpan Informasi Toko
                            </button>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="notes" size={20} style={{ marginRight: 6 }} />Footer Struk</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>Tampil di bagian bawah struk.</p>
                        <div className="flex gap3">
                            <textarea id="receipt-footer-input" className="input" placeholder="Terima kasih!" rows={3} style={{ minHeight: '80px', height: 'auto', resize: 'vertical', fontFamily: 'inherit' }}
                                value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} />
                            <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={saveReceiptFooter}>
                                <Icon name="save" size={18} /> Simpan
                            </button>
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="qr_code_2" size={20} style={{ marginRight: 6 }} />Gambar QRIS</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                            Upload foto/gambar QRIS Anda. Disimpan di perangkat ini saja — tidak ikut backup.
                        </p>
                        {qrisImage && (
                            <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                                <img
                                    src={qrisImage}
                                    alt="QRIS Preview"
                                    style={{ maxWidth: '240px', width: '100%', borderRadius: 'var(--r2)', border: '1.5px solid var(--border)', display: 'block' }}
                                />
                            </div>
                        )}
                        <div className="flex gap3">
                            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                                <Icon name="upload" size={18} /> {qrisImage ? 'Ganti Gambar' : 'Upload Gambar'}
                                <input
                                    ref={qrisFileRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleQrisImageChange}
                                />
                            </label>
                            {qrisImage && (
                                <button className="btn btn-ghost" onClick={clearQrisImage}>
                                    <Icon name="delete" size={18} /> Hapus
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="settings-card">
                        <h2><Icon name="barcode_scanner" size={20} style={{ marginRight: 6 }} />Pengaturan Barcode</h2>
                        <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
                            Tentukan perilaku saat barcode yang discan di Kasir belum terdaftar.
                        </p>
                        <div className="flex gap3">
                            <select
                                className="input"
                                value={unknownBarcodeAction}
                                onChange={e => setUnknownBarcodeAction(e.target.value)}
                            >
                                <option value="prompt_create">Tampilkan form tambah produk</option>
                                <option value="reject">Tolak & tampilkan peringatan</option>
                            </select>
                            <button className="btn btn-primary" onClick={saveBarcodeConfig}>
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
                            Export semua data to file JSON. Import to restore.<br />
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
                                <input ref={fileRef} type="file" accept=".json,.gz" style={{ display: 'none' }} onChange={handleImport} />
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

                    {deferredPrompt && (
                        <section className="settings-card">
                            <h2><Icon name="install_desktop" size={20} style={{ marginRight: 6 }} />Instal Aplikasi</h2>
                            <p className="text2" style={{ fontSize: '0.85rem', marginBottom: 12 }}>Jalankan aplikasi POS ini sebagai aplikasi native offline di perangkat Anda.</p>
                            <button className="btn btn-primary" onClick={handleInstall}>
                                <Icon name="get_app" size={18} /> Instal POS App
                            </button>
                        </section>
                    )}

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
