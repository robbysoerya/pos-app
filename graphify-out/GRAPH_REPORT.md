# Graph Report - pos-app  (2026-06-05)

## Corpus Check
- 27 files · ~16,589 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 104 nodes · 111 edges · 5 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]

## God Nodes (most connected - your core abstractions)
1. `DebtCard()` - 7 edges
2. `fmtCurrency()` - 7 edges
3. `fmtDateTime()` - 6 edges
4. `printReceipt()` - 6 edges
5. `fmtTxnId()` - 5 edges
6. `PiutangPage()` - 4 edges
7. `SettingsPage()` - 4 edges
8. `ReceiptPreview()` - 4 edges
9. `HistoryPage()` - 4 edges
10. `POSRight()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `SettingsPage()` --calls--> `fmtDateTime()`  [INFERRED]
  src/features/settings/SettingsPage.jsx → src/utils/format.js
- `POSRight()` --calls--> `fmtCurrency()`  [INFERRED]
  src/features/pos/components/POSRight.jsx → src/utils/bluetooth.js
- `PiutangPage()` --calls--> `fmtCurrency()`  [INFERRED]
  src/features/piutang/PiutangPage.jsx → src/utils/bluetooth.js
- `PiutangPage()` --calls--> `fmtTxnId()`  [INFERRED]
  src/features/piutang/PiutangPage.jsx → src/utils/format.js
- `PiutangPage()` --calls--> `fmtDateTime()`  [INFERRED]
  src/features/piutang/PiutangPage.jsx → src/utils/format.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.28
Nodes (10): ReceiptPreview(), HistoryPage(), ageBarClass(), ageBarWidth(), ageDaysLabel(), DebtCard(), PiutangPage(), fmtCurrency() (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.31
Nodes (8): SettingsPage(), autoConnectPrinter(), buildReceipt(), connectPrinter(), getPrinterName(), isPrinterConnected(), printReceipt(), sendData()

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (4): CategoriesPage(), POSRight(), fmtCapitalize(), parseAmount()

### Community 5 - "Community 5"
Cohesion: 0.52
Nodes (6): compressJSON(), decompressBlob(), exportBackup(), getBackupData(), importBackup(), sendBackupToTelegram()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (2): getTransactionsByDateRangeQuery(), getTransactionsQuery()

## Knowledge Gaps
- **Thin community `Community 6`** (7 nodes): `createCashCheckout()`, `createDebtCheckout()`, `createQrisCheckout()`, `getTransactionItems()`, `getTransactionsByDateRangeQuery()`, `getTransactionsQuery()`, `transactionService.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fmtCurrency()` connect `Community 0` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `fmtDateTime()` connect `Community 0` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `DebtCard()` (e.g. with `fmtDateTime()` and `fmtTxnId()`) actually correct?**
  _`DebtCard()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `fmtCurrency()` (e.g. with `PiutangPage()` and `DebtCard()`) actually correct?**
  _`fmtCurrency()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `fmtDateTime()` (e.g. with `PiutangPage()` and `DebtCard()`) actually correct?**
  _`fmtDateTime()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `fmtTxnId()` (e.g. with `PiutangPage()` and `DebtCard()`) actually correct?**
  _`fmtTxnId()` has 4 INFERRED edges - model-reasoned connections that need verification._