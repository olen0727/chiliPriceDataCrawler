# 市場行情儀表板 (Market Dashboard)

這是一個整合資料爬蟲與視覺化的專案，旨在抓取並分析「臺北農產運銷公司」的蔬菜交易行情。專案包含自動化爬蟲與現代化的前端儀表板。

## 🚀 功能特色

*   **自動化爬蟲**: 定期抓取市場交易數據 (價格、交易量)。
*   **互動式儀表板**: 提供價格走勢圖與交易量分析。
*   **多維度篩選**: 支援依市場、產品、品種及時間區間 (日/月) 進行篩選。
*   **響應式設計**: 完美支援各種裝置瀏覽。

## 🛠️ 技術堆疊 (Tech Stack)

### 1. 前端 (Frontend)
位於 `frontend-vite` 目錄，是一個現代化的單頁應用程式 (SPA)。

*   **核心框架**:
    *   **React (v18)**: 用於建構使用者介面。
    *   **TypeScript**: 提供靜態型別檢查，增加程式碼的穩健性。
    *   **Vite**: 作為建置工具與開發伺服器，提供快速的開發體驗。
*   **樣式與 UI**:
    *   **Tailwind CSS**: Utility-first 的 CSS 框架，用於快速切版與設計。
    *   **clsx / tailwind-merge**: 用於動態合併與管理 CSS class 名稱。
    *   **Lucide React**: 提供美觀且一致的圖示 (Icons)。
*   **資料視覺化與處理**:
    *   **Recharts**: 基於 React 的圖表庫，用於繪製價格走勢圖 (LineChart) 與交易量分析圖 (BarChart)。
    *   **PapaParse**: 用於在前端解析 CSV 格式的資料檔案。

### 2. 資料爬蟲 (Crawler)
位於 `crawler` 目錄，負責抓取市場資料。

*   **Node.js 版本 (`index.js`)** (主要):
    *   **Axios**: 用於發送 HTTP 請求。
    *   **Cheerio**: 用於解析 HTML，提取 ViewState 和表格資料。
    *   **csv-stringify**: 將資料轉換並儲存為 CSV 格式。
    *   **特色**: 直接將資料寫入前端的 `public/data` 目錄，實現無縫整合。

*   **Python 版本 (`main.py`)** (備用):
    *   **Requests**: 用於發送 HTTP 請求。
    *   **BeautifulSoup4**: 用於解析 HTML。
    *   **Pandas**: 用於資料處理與 CSV 輸出。

## 📂 資料流 (Data Flow)

1.  **爬蟲** (Node.js) 抓取網站資料。
2.  資料被儲存為 **CSV 檔案** (`vegetables_fv.csv`) 並放置於前端的 `public/data` 資料夾。
3.  **前端** (React) 啟動時讀取該 CSV 檔案，並透過 PapaParse 解析後呈現於儀表板上。

## ⚙️ 自動化部署與更新 (CI/CD)

本專案採用 **GitHub Actions** 與 **Vercel** 實現全自動化的資料更新與部署流程：

1.  **每日排程**: GitHub Actions 於每日 **台灣時間 08:00 (UTC 00:00)** 自動觸發爬蟲任務。
2.  **資料抓取**: 爬蟲程式執行，從來源網站抓取最新的市場交易數據。
3.  **自動提交**: 若有新數據，GitHub Actions 會自動將更新後的 `vegetables_fv.csv` 提交 (Commit) 並推送 (Push) 至 GitHub 儲存庫。
4.  **觸發部署**: Vercel 偵測到 GitHub 儲存庫有新的提交，自動重新建置並部署前端網站，確保使用者看到的永遠是最新的數據。

## 📦 安裝與執行

### 前端開發
```bash
cd frontend-vite
npm install
npm run dev
```

### 執行爬蟲
```bash
cd crawler
npm install
node index.js
```
