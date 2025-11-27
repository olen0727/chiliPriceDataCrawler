import { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ReferenceArea } from 'recharts';
import { Calendar, TrendingUp, BarChart3, Filter, PieChart, ChevronDown, Check, ZoomOut } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DataPoint {
  Date: string;
  Market: string;
  Code: string;
  Name: string;
  Variety: string;
  High: number;
  Mid: number;
  Low: number;
  Avg: number;
  Volume: number;
  // 計算出的欄位
  ISODate?: string;
}

interface AggregatedPoint {
  Date: string;
  ISODate: string;
  Volume: number;
  Avg: number;
  Market: string;
  Name: string;
  [key: string]: string | number | undefined | null;
}

// 自定義的多選元件
const MultiSelect = ({
  options,
  selected,
  onChange,
  label
}: {
  options: string[],
  selected: string[],
  onChange: (selected: string[]) => void,
  label: string
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const toggleAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
        <Filter className="w-3 h-3" /> {label}
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[42px] bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-left flex items-center justify-between hover:border-slate-600 transition-colors"
      >
        <span className="truncate">
          {selected.length === 0 ? '請選擇...' :
            selected.length === options.length ? '全部已選' :
              `已選 ${selected.length} 項`}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          <div
            className="px-3 py-2 border-b border-slate-700 hover:bg-slate-700 cursor-pointer flex items-center gap-2 text-sm text-slate-300"
            onClick={toggleAll}
          >
            <div className={cn(
              "w-4 h-4 rounded border flex items-center justify-center transition-colors",
              selected.length === options.length ? "bg-blue-500 border-blue-500" : "border-slate-500"
            )}>
              {selected.length === options.length && <Check className="w-3 h-3 text-white" />}
            </div>
            全選 (Select All)
          </div>
          {options.map(option => (
            <div
              key={option}
              className="px-3 py-2 hover:bg-slate-700 cursor-pointer flex items-center gap-2 text-sm text-slate-200"
              onClick={() => toggleOption(option)}
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                selected.includes(option) ? "bg-blue-500 border-blue-500" : "border-slate-500"
              )}>
                {selected.includes(option) && <Check className="w-3 h-3 text-white" />}
              </div>
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // 篩選器狀態
  const [markets, setMarkets] = useState<string[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>('');

  const [products, setProducts] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');

  const [varieties, setVarieties] = useState<string[]>([]);
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);

  // 預設為月視圖
  const [timeScale, setTimeScale] = useState<'day' | 'month'>('month');

  // 用於切換圖表線條顯示的狀態
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);

  // 縮放狀態
  const [refAreaLeft, setRefAreaLeft] = useState('');
  const [refAreaRight, setRefAreaRight] = useState('');
  const [zoomLeftIndex, setZoomLeftIndex] = useState<number | null>(null);
  const [zoomRightIndex, setZoomRightIndex] = useState<number | null>(null);

  const handleLegendClick = (o: any) => {
    let { dataKey } = o;
    // 處理交易量圖表的 key (移除 _Volume 後綴)
    if (typeof dataKey === 'string' && dataKey.endsWith('_Volume')) {
      dataKey = dataKey.replace('_Volume', '');
    }

    if (hiddenSeries.includes(dataKey)) {
      setHiddenSeries(hiddenSeries.filter(k => k !== dataKey));
    } else {
      setHiddenSeries([...hiddenSeries, dataKey]);
    }
  };

  // 用來將民國日期轉換為 ISO 日期以便排序的輔助函式
  const convertDate = (rocDate: string) => {
    const parts = rocDate.split('/');
    if (parts.length === 3) {
      const year = parseInt(parts[0]) + 1911;
      return `${year}-${parts[1]}-${parts[2]}`;
    }
    return rocDate;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/data/vegetables_fv.csv');
        const reader = response.body?.getReader();
        const result = await reader?.read();
        const decoder = new TextDecoder('utf-8');
        const csv = decoder.decode(result?.value);

        Papa.parse(csv, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<DataPoint>) => {
            const rawData = results.data as DataPoint[];
            // 過濾掉空行並處理日期和數字格式
            const validData = rawData
              .filter(d => d.Date && d.Name)
              .map(d => {
                const parseNum = (val: any) => {
                  if (typeof val === 'number') return val;
                  if (typeof val === 'string') {
                    return parseFloat(val.replace(/,/g, '')) || 0;
                  }
                  return 0;
                };

                return {
                  ...d,
                  High: parseNum(d.High),
                  Mid: parseNum(d.Mid),
                  Low: parseNum(d.Low),
                  Avg: parseNum(d.Avg),
                  Volume: parseNum(d.Volume),
                  ISODate: convertDate(d.Date)
                };
              })
              .sort((a, b) => (a.ISODate || '').localeCompare(b.ISODate || ''));

            setData(validData);

            // 提取唯一的市場和產品列表
            const uniqueMarkets = Array.from(new Set(validData.map(d => d.Market)));
            const uniqueProducts = Array.from(new Set(validData.map(d => d.Name)));

            setMarkets(uniqueMarkets);
            setProducts(uniqueProducts);

            if (uniqueMarkets.length > 0) setSelectedMarket(uniqueMarkets[0]);
            if (uniqueProducts.length > 0) setSelectedProduct(uniqueProducts[0]);

            setLoading(false);
          }
        });
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 當產品變更時，更新品種列表
  useEffect(() => {
    if (selectedProduct) {
      const productVarieties = Array.from(new Set(
        data
          .filter(d => d.Name === selectedProduct)
          .map(d => d.Variety)
      ));
      setVarieties(productVarieties);

      // 如果存在特定品種，預設選取它們
      const defaultVarieties = ["青小", "紅小", "朝天椒", "進口朝天椒"];
      const availableDefaults = defaultVarieties.filter(v => productVarieties.includes(v));

      if (availableDefaults.length > 0) {
        setSelectedVarieties(availableDefaults);
      } else {
        setSelectedVarieties(productVarieties); // 如果沒有預設品種，就全選
      }

      setHiddenSeries([]); // 重置隱藏的線條
    }
  }, [selectedProduct, data]);

  // Reset zoom when filters change
  useEffect(() => {
    setZoomLeftIndex(null);
    setZoomRightIndex(null);
    setRefAreaLeft('');
    setRefAreaRight('');
  }, [selectedMarket, selectedProduct, selectedVarieties, timeScale]);

  // 多線圖的顏色設定
  const COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
  ];

  // 處理並聚合數據以供圖表使用
  const chartData = useMemo(() => {
    if (!selectedMarket || !selectedProduct) return [];

    // 1. 篩選數據
    let filtered = data.filter(d =>
      d.Market === selectedMarket &&
      d.Name === selectedProduct
    );

    // 根據選取的品種進行篩選
    if (selectedVarieties.length > 0) {
      filtered = filtered.filter(d => selectedVarieties.includes(d.Variety));
    } else {
      return []; // 沒有選取品種
    }

    // 2. 分組與聚合
    const groups = new Map<string, DataPoint[]>();

    filtered.forEach(d => {
      let key = d.Date; // 預設為 '日'
      if (timeScale === 'month' && d.ISODate) {
        // 提取 YYYY-MM
        key = d.ISODate.substring(0, 7);
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(d);
    });

    const aggregated: AggregatedPoint[] = [];

    groups.forEach((groupData, key) => {
      // 設定顯示日期
      let displayDate = key;
      let isoDate = groupData[0].ISODate || '';

      if (timeScale === 'month') {
        // 將 YYYY-MM 轉換為民國年月 (例如 114/11)
        const [y, m] = key.split('-');
        displayDate = `${parseInt(y) - 1911}/${m}`;
        isoDate = `${key}-01`;
      }

      const entry: AggregatedPoint = {
        Date: displayDate,
        ISODate: isoDate,
        Volume: 0,
        Avg: 0,
        Market: selectedMarket,
        Name: selectedProduct
      };

      // 計算長條圖的總交易量
      entry.Volume = Math.round(groupData.reduce((sum, d) => sum + d.Volume, 0));

      // 為每個選取的品種計算價格和交易量
      selectedVarieties.forEach(v => {
        const vData = groupData.filter(d => d.Variety === v);
        if (vData.length > 0) {
          const vVol = vData.reduce((sum, d) => sum + d.Volume, 0);
          const vAvg = vVol > 0
            ? vData.reduce((sum, d) => sum + (d.Avg * d.Volume), 0) / vVol
            : vData.reduce((sum, d) => sum + d.Avg, 0) / vData.length;

          entry[v] = Math.round(vAvg);
          entry[`${v}_Volume`] = Math.round(vVol); // 儲存該品種的交易量
        } else {
          entry[v] = null;
          entry[`${v}_Volume`] = 0;
        }
      });

      // 計算整體平均價格作為參考 (可選，但對統計摘要很有用)
      const totalVol = groupData.reduce((sum, d) => sum + d.Volume, 0);
      const overallAvg = totalVol > 0
        ? groupData.reduce((sum, d) => sum + (d.Avg * d.Volume), 0) / totalVol
        : groupData.reduce((sum, d) => sum + d.Avg, 0) / groupData.length;
      entry.Avg = Math.round(overallAvg);

      aggregated.push(entry);
    });

    return aggregated.sort((a, b) => a.ISODate.localeCompare(b.ISODate));

  }, [data, selectedMarket, selectedProduct, selectedVarieties, timeScale, varieties.length]);

  // 計算顯示的數據 (考慮縮放)
  const displayedData = useMemo(() => {
    if (zoomLeftIndex !== null && zoomRightIndex !== null && chartData.length > 0) {
      return chartData.slice(zoomLeftIndex, zoomRightIndex + 1);
    }
    return chartData;
  }, [chartData, zoomLeftIndex, zoomRightIndex]);

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === '') {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }

    // 找出左右邊界在 chartData 中的索引
    let leftIndex = chartData.findIndex(d => d.Date === refAreaLeft);
    let rightIndex = chartData.findIndex(d => d.Date === refAreaRight);

    if (leftIndex < 0 || rightIndex < 0) {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }

    // 確保 left < right
    if (leftIndex > rightIndex) {
      [leftIndex, rightIndex] = [rightIndex, leftIndex];
    }

    setZoomLeftIndex(leftIndex);
    setZoomRightIndex(rightIndex);
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  const zoomOut = () => {
    setZoomLeftIndex(null);
    setZoomRightIndex(null);
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 bg-blue-500 rounded-full mb-4"></div>
          <p>載入市場數據中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* 標頭 */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              市場行情儀表板
            </h1>
            <p className="text-slate-400 mt-1">蔬菜交易行情分析與視覺化</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
            <Calendar className="w-4 h-4" />
            <span>最後更新: {data.length > 0 ? data[data.length - 1].Date : '-'}</span>
          </div>
        </header>

        {/* 篩選器 */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
              <Filter className="w-3 h-3" /> 市場 (Market)
            </label>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="w-full h-[42px] bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {markets.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
              <PieChart className="w-3 h-3" /> 產品 (Product)
            </label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full h-[42px] bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm relative z-20">
            <MultiSelect
              label="品種 (Variety)"
              options={varieties}
              selected={selectedVarieties}
              onChange={setSelectedVarieties}
            />
          </div>

          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-2">
              <Calendar className="w-3 h-3" /> 統計區間
            </label>
            <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1 h-[42px]">
              <button
                onClick={() => setTimeScale('day')}
                className={cn(
                  "flex-1 py-1 px-3 rounded-md text-sm transition-all",
                  timeScale === 'day' ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                )}
              >
                日 (Day)
              </button>
              <button
                onClick={() => setTimeScale('month')}
                className={cn(
                  "flex-1 py-1 px-3 rounded-md text-sm transition-all",
                  timeScale === 'month' ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                )}
              >
                月 (Month)
              </button>
            </div>
          </div>
        </section>

        {/* 統計摘要 */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">目前平均價格 (綜合)</div>
              <div className="text-2xl font-bold text-emerald-400">
                ${displayedData.length > 0 ? displayedData[displayedData.length - 1].Avg : 0}
              </div>
            </div>
            <TrendingUp className="w-8 h-8 text-emerald-500/20" />
          </div>
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">總交易量 (區間)</div>
              <div className="text-2xl font-bold text-purple-400">
                {displayedData.reduce((acc, curr) => acc + curr.Volume, 0).toLocaleString()} <span className="text-sm text-slate-500">kg</span>
              </div>
            </div>
            <BarChart3 className="w-8 h-8 text-purple-500/20" />
          </div>
        </section>

        {/* 圖表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* 價格走勢圖 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20 relative group">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                價格走勢 (Price Trend)
              </h3>
              {zoomLeftIndex !== null && (
                <button
                  onClick={zoomOut}
                  className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 transition-colors"
                >
                  <ZoomOut className="w-3 h-3" /> 重置縮放
                </button>
              )}
            </div>
            <div className="h-[300px] w-full relative select-none">
              <div className="absolute bottom-2 right-2 text-xs text-slate-500 pointer-events-none z-10">
                (元/公斤)
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={displayedData}
                  syncId="dashboard"
                  onMouseDown={(e) => e && e.activeLabel && setRefAreaLeft(e.activeLabel)}
                  onMouseMove={(e) => refAreaLeft && e && e.activeLabel && setRefAreaRight(e.activeLabel)}
                  onMouseUp={zoom}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="Date"
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickLine={false}
                    allowDataOverflow
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', fontSize: '12px' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    labelStyle={{ color: '#94a3b8' }}
                    itemSorter={(item) => (typeof item.value === 'number' ? -item.value : 0)}
                  />
                  <Legend onClick={handleLegendClick} cursor="pointer" />
                  {selectedVarieties.map((variety, index) => (
                    <Line
                      key={variety}
                      name={variety}
                      type="monotone"
                      dataKey={variety}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                      connectNulls
                      hide={hiddenSeries.includes(variety)}
                    />
                  ))}
                  {refAreaLeft && refAreaRight ? (
                    <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#3b82f6" fillOpacity={0.1} />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 交易量分析圖 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                交易量分析 (Volume Analysis)
              </h3>
            </div>
            <div className="h-[300px] w-full relative">
              <div className="absolute bottom-2 right-2 text-xs text-slate-500 pointer-events-none z-10">
                (公斤)
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={displayedData} syncId="dashboard">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="Date"
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#1e293b', opacity: 0.4 }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', fontSize: '12px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend onClick={handleLegendClick} cursor="pointer" />
                  {selectedVarieties.map((variety, index) => (
                    <Bar
                      key={`${variety}_Volume`}
                      name={variety}
                      dataKey={`${variety}_Volume`}
                      stackId="a"
                      fill={COLORS[index % COLORS.length]}
                      hide={hiddenSeries.includes(variety)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* 數據表格預覽 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50">
            <h3 className="font-semibold text-slate-300">近期數據 (Recent Data)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-400">
              <thead className="text-xs text-slate-500 uppercase bg-slate-950">
                <tr>
                  <th className="px-6 py-3">日期</th>
                  <th className="px-6 py-3">市場</th>
                  <th className="px-6 py-3">產品</th>
                  <th className="px-6 py-3">品種</th>
                  <th className="px-6 py-3 text-right">平均價</th>
                  <th className="px-6 py-3 text-right">交易量</th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice().reverse().slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">{row.Date}</td>
                    <td className="px-6 py-4">{row.Market}</td>
                    <td className="px-6 py-4 font-medium text-slate-200">{row.Name}</td>
                    <td className="px-6 py-4">{row.Variety}</td>
                    <td className="px-6 py-4 text-right text-emerald-400">${row.Avg}</td>
                    <td className="px-6 py-4 text-right">{row.Volume}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
