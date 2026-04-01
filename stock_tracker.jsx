import { useState, useEffect, useRef, useCallback } from "react";

const INITIAL_STOCKS = [
  { id: 1, date: "30/03/2026", ticker: "HHV", source: "VCB", buyPrice: 12.0 },
  { id: 2, date: "30/03/2026", ticker: "TCH", source: "VCB", buyPrice: 16.5 },
  { id: 3, date: "31/03/2026", ticker: "MWG", source: "VCB", buyPrice: 81.8 },
  { id: 4, date: "31/03/2026", ticker: "PDR", source: "VCB", buyPrice: 16.1 },
];

function formatPrice(val) {
  if (val == null) return "—";
  return val.toFixed(1);
}

function formatPct(val) {
  if (val == null) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${(val * 100).toFixed(2)}%`;
}

function getLabel(pct) {
  if (pct == null) return "—";
  if (pct > 0.05) return "Tốt";
  if (pct > 0) return "Ổn";
  return "Kém";
}

function getDaysHeld(dateStr) {
  const [d, m, y] = dateStr.split("/");
  const entryDate = new Date(`${y}-${m}-${d}`);
  const today = new Date();
  return Math.floor((today - entryDate) / 86400000);
}

async function fetchPricesFromEntrade(tickers) {
  const results = {};
  const today = Math.floor(Date.now() / 1000);
  const fewDaysAgo = today - (86400 * 5); // Tính bù 5 ngày cho cuối tuần / lễ nghỉ

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?resolution=1D&symbol=${ticker}&from=${fewDaysAgo}&to=${today}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.c && data.c.length > 0) {
          results[ticker] = data.c[data.c.length - 1]; // Lấy giá cuối cùng của mảng c (close)
        } else {
          results[ticker] = null;
        }
      } catch (e) {
        console.error(`Lỗi lấy giá ${ticker}:`, e);
        results[ticker] = null;
      }
    })
  );

  return results;
}

function MainApp({ onLogout }) {
  const [stocks, setStocks] = useState(() => {
    const saved = localStorage.getItem("app_stocks");
    let baseStocks = INITIAL_STOCKS;
    if (saved) {
      try {
        baseStocks = JSON.parse(saved);
      } catch (e) {}
    }
    return baseStocks.map((s) => ({ ...s, currentPrice: null, loading: false, error: null }));
  });
  
  useEffect(() => {
    const toSave = stocks.map(({ id, date, ticker, source, buyPrice }) => ({ id, date, ticker, source, buyPrice }));
    localStorage.setItem("app_stocks", JSON.stringify(toSave));
  }, [stocks]);
  const [selectedSource, setSelectedSource] = useState("Tất cả");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStock, setNewStock] = useState({ ticker: "", source: "VCB", buyPrice: "", date: new Date().toLocaleDateString("en-GB") });
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem("app_avatar") || null);
  const fileInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target.result;
        setAvatarUrl(url);
        localStorage.setItem("app_avatar", url);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddStock = () => {
    if (!newStock.ticker || !newStock.buyPrice || !newStock.source || !newStock.date) return;
    const newId = stocks.length > 0 ? Math.max(...stocks.map(s => s.id)) + 1 : 1;
    const addedStock = {
      id: newId,
      ticker: newStock.ticker.toUpperCase(),
      date: newStock.date,
      source: newStock.source,
      buyPrice: parseFloat(newStock.buyPrice),
      currentPrice: null,
      loading: false,
      error: null
    };
    setStocks(prev => [...prev, addedStock]);
    setShowAddForm(false);
    setNewStock({ ...newStock, ticker: "", buyPrice: "" });
  };

  const handleDeleteStock = (id) => {
    setStocks(prev => prev.filter(s => s.id !== id));
  };
  const [lastUpdated, setLastUpdated] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const REFRESH_INTERVAL = 300; // 5 phút

  const fetchAll = useCallback(async () => {
    setGlobalLoading(true);
    setStocks((prev) => prev.map((s) => ({ ...s, loading: true, error: null })));
    try {
      const currentStocks = stocksRef.current;
      const tickers = [...new Set(currentStocks.map((s) => s.ticker))];
      const prices = await fetchPricesFromEntrade(tickers);
      setStocks((prev) =>
        prev.map((s) => ({
          ...s,
          currentPrice: prices[s.ticker] ?? null,
          loading: false,
          error: prices[s.ticker] == null ? "Không tìm thấy" : null,
        }))
      );
      setLastUpdated(new Date());
    } catch (e) {
      setStocks((prev) =>
        prev.map((s) => ({ ...s, loading: false, error: "Lỗi kết nối" }))
      );
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      setCountdown(REFRESH_INTERVAL);
      intervalRef.current = setInterval(() => {
        fetchAll();
        setCountdown(REFRESH_INTERVAL);
      }, REFRESH_INTERVAL * 1000);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    }
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [autoRefresh, fetchAll]);

  // Tổng kết
  const displayedStocks = selectedSource === "Tất cả" ? stocks : stocks.filter(s => s.source === selectedSource);
  const validStocks = displayedStocks.filter((s) => s.currentPrice != null);
  const avgPnl =
    validStocks.length > 0
      ? validStocks.reduce((sum, s) => sum + (s.currentPrice - s.buyPrice) / s.buyPrice, 0) /
      validStocks.length
      : null;
  const goodCount = displayedStocks.filter((s) => s.currentPrice != null && getLabel((s.currentPrice - s.buyPrice) / s.buyPrice) === "Tốt").length;
  const badCount = displayedStocks.filter((s) => s.currentPrice != null && getLabel((s.currentPrice - s.buyPrice) / s.buyPrice) === "Kém").length;
  const sources = ["Tất cả", ...new Set(stocks.map((s) => s.source))];

  const timeStr = currentTime.toLocaleTimeString("vi-VN");
  const dateStr = currentTime.toLocaleDateString("vi-VN");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0e17",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: "#c9d1d9",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
        borderBottom: "1px solid #21262d",
        padding: "20px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : "linear-gradient(135deg, #00d68f, #0095ff)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: "bold",
              cursor: "pointer",
            }}
            title="Nhấn để đổi avatar"
          >
            {avatarUrl ? null : "📈"}
          </div>
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleAvatarChange} 
            style={{ display: "none" }} 
          />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3", letterSpacing: "0.03em", textTransform: "uppercase" }}>
              Q. Chien Stock Tracker
            </div>
            <div style={{ fontSize: 11, color: "#6e7681", marginTop: 2 }}>
              {dateStr} · {timeStr}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #30363d",
              background: "#0d1117",
              color: "#c9d1d9",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              outline: "none",
              marginRight: 4,
            }}
          >
            {sources.map(src => <option key={src} value={src}>{src === "Tất cả" ? "Tất cả nguồn" : `Nguồn: ${src}`}</option>)}
          </select>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "#6e7681" }}>
              Cập nhật lúc {lastUpdated.toLocaleTimeString("vi-VN")}
            </span>
          )}
          <button
            onClick={() => setShowAddForm(v => !v)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${showAddForm ? "#0095ff44" : "#30363d"}`,
              background: showAddForm ? "#0095ff18" : "transparent",
              color: showAddForm ? "#0095ff" : "#8b949e",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {showAddForm ? "− Đóng" : "+ Thêm mã"}
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${autoRefresh ? "#00d68f44" : "#30363d"}`,
              background: autoRefresh ? "#00d68f18" : "transparent",
              color: autoRefresh ? "#00d68f" : "#8b949e",
              fontSize: 12,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: autoRefresh ? "#00d68f" : "#6e7681",
              display: "inline-block",
              animation: autoRefresh ? "pulse 1.5s infinite" : "none",
            }} />
            {autoRefresh ? `Auto ${countdown}s` : "Auto OFF"}
          </button>
          <button
            onClick={fetchAll}
            disabled={globalLoading}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #0095ff44",
              background: globalLoading ? "#0095ff18" : "#0095ff22",
              color: globalLoading ? "#6e7681" : "#0095ff",
              fontSize: 12,
              cursor: globalLoading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {globalLoading ? "⟳ Đang tải..." : "⟳ Cập nhật giá"}
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #ff475744",
              background: "#ff475722",
              color: "#ff4757",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {showAddForm && (
        <div style={{ padding: "20px 28px 0", animation: "fadeIn 0.2s" }}>
          <div style={{ background: "#161b22", border: "1px solid #30363d", padding: "16px 20px", borderRadius: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input placeholder="Mã CP (vd: FPT)" value={newStock.ticker} onChange={e => setNewStock({ ...newStock, ticker: e.target.value })} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#0d1117", color: "#c9d1d9", outline: "none", width: 120, fontFamily: "inherit" }} />
            <input placeholder="Ngày (dd/mm/yyyy)" value={newStock.date} onChange={e => setNewStock({ ...newStock, date: e.target.value })} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#0d1117", color: "#c9d1d9", outline: "none", width: 130, fontFamily: "inherit" }} />
            <input placeholder="Nguồn (vd: DNSE)" value={newStock.source} onChange={e => setNewStock({ ...newStock, source: e.target.value })} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#0d1117", color: "#c9d1d9", outline: "none", width: 130, fontFamily: "inherit" }} />
            <input placeholder="Giá mua (nghìn VNĐ)" type="number" step="0.1" value={newStock.buyPrice} onChange={e => setNewStock({ ...newStock, buyPrice: e.target.value })} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#0d1117", color: "#c9d1d9", outline: "none", width: 160, fontFamily: "inherit" }} />
            <button onClick={handleAddStock} style={{ padding: "8px 16px", background: "#00d68f", color: "#000", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", marginLeft: "auto", fontFamily: "inherit" }}>
              Lưu mã
            </button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      <div style={{ padding: "20px 28px", display: "flex", gap: 12 }}>
        {[
          { label: "Tổng mã", value: displayedStocks.length, color: "#e6edf3" },
          { label: "Số mã Tốt", value: goodCount, color: "#00d68f" },
          { label: "Số mã Kém", value: badCount, color: "#ff4757" },
          {
            label: "TB % Lãi/Lỗ",
            value: avgPnl != null ? formatPct(avgPnl) : "—",
            color: avgPnl == null ? "#6e7681" : avgPnl >= 0 ? "#00d68f" : "#ff4757",
          },
        ].map((card) => (
          <div key={card.label} style={{
            flex: 1,
            background: "#161b22",
            border: "1px solid #21262d",
            borderRadius: 10,
            padding: "14px 18px",
          }}>
            <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {card.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: "0 28px 28px" }}>
        <div style={{
          background: "#161b22",
          border: "1px solid #21262d",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0d1117" }}>
                {["STT", "Ngày KN", "Mã CP", "Nguồn", "Giá KN", "Giá hiện tại", "% Lãi/Lỗ", "Đánh giá", "T+", ""].map((h) => (
                  <th key={h} style={{
                    padding: "12px 16px",
                    textAlign: h === "STT" ? "center" : "right",
                    color: "#6e7681",
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid #21262d",
                    ...(["Ngày KN", "Mã CP", "Nguồn"].includes(h) ? { textAlign: "left" } : {}),
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedStocks.map((s, i) => {
                const pnl = s.currentPrice != null ? (s.currentPrice - s.buyPrice) / s.buyPrice : null;
                const label = s.currentPrice != null ? getLabel(pnl) : null;
                const labelColor = label === "Tốt" ? "#00d68f" : label === "Ổn" ? "#ffa500" : label === "Kém" ? "#ff4757" : "#6e7681";
                const pnlColor = pnl == null ? "#6e7681" : pnl > 0 ? "#00d68f" : pnl < 0 ? "#ff4757" : "#6e7681";
                const days = getDaysHeld(s.date);

                return (
                  <tr key={s.id} style={{
                    borderBottom: i < displayedStocks.length - 1 ? "1px solid #21262d" : "none",
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#1c2128"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "14px 16px", textAlign: "center", color: "#6e7681" }}>{s.id}</td>
                    <td style={{ padding: "14px 16px", color: "#8b949e", fontSize: 12 }}>{s.date}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        background: "#0095ff18",
                        color: "#0095ff",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: 13,
                        letterSpacing: "0.05em",
                      }}>{s.ticker}</span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#6e7681", fontSize: 12 }}>{s.source}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: "#c9d1d9" }}>
                      {formatPrice(s.buyPrice)}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      {s.loading ? (
                        <span style={{ color: "#6e7681", fontSize: 12 }}>⟳ loading...</span>
                      ) : s.error ? (
                        <span style={{ color: "#ff4757", fontSize: 12 }}>—</span>
                      ) : (
                        <span style={{ color: "#e6edf3", fontWeight: 600 }}>
                          {formatPrice(s.currentPrice)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: pnlColor, fontWeight: 600 }}>
                      {s.loading ? "—" : formatPct(pnl)}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      {label ? (
                        <span style={{
                          background: labelColor + "22",
                          color: labelColor,
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                        }}>{label}</span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: "#6e7681" }}>
                      {days}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDeleteStock(s.id)}
                        style={{ background: "transparent", border: "none", color: "#ff4757", cursor: "pointer", fontSize: 13, opacity: 0.7 }}
                        title="Xóa mã"
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 14, fontSize: 11, color: "#6e7681", textAlign: "center" }}>
          Giá tính bằng nghìn đồng (VNĐ) · Nguồn: Entrade API · Chỉ mang tính chất tham khảo
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [showChangePass, setShowChangePass] = useState(false);
  
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changeMsg, setChangeMsg] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    const storedPass = localStorage.getItem("app_password") || "@123456";
    if (user === "admin" && pass === storedPass) {
      onLogin();
    } else {
      setError("Sai tài khoản hoặc mật khẩu!");
    }
  };

  const handleChangePass = (e) => {
    e.preventDefault();
    const storedPass = localStorage.getItem("app_password") || "@123456";
    if (oldPass !== storedPass) {
      setChangeMsg("Mật khẩu cũ không đúng!");
      return;
    }
    if (newPass.length < 6) {
      setChangeMsg("Mật khẩu mới phải từ 6 ký tự!");
      return;
    }
    localStorage.setItem("app_password", newPass);
    setChangeMsg("Đổi mật khẩu thành công!");
    setTimeout(() => {
      setShowChangePass(false);
      setChangeMsg("");
      setOldPass("");
      setNewPass("");
    }, 1500);
  };

  const inputStyle = { width: "100%", padding: "14px 16px 14px 44px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", outline: "none", boxSizing: "border-box", fontSize: "14px", background: "rgba(255,255,255,0.07)", color: "white" };
  const iconStyle = { position: "absolute", left: 16, top: 14, color: "#8b949e", fontSize: "16px" };
  const btnStyle = { width: "100%", padding: "14px", background: "#2ed573", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "15px", marginTop: "10px", transition: "all 0.2s" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "url(/login_bg.png) center center / cover no-repeat",
      backgroundColor: "#111", // fallback
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      fontFamily: "'Inter', sans-serif",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{
        width: "350px",
        marginRight: "8%",
        background: "rgba(30, 30, 35, 0.75)",
        borderRadius: "24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "32px",
        boxSizing: "border-box",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
      }}>
        
        {/* LOGO */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "30px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2ed573", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", fontSize: "16px" }}>📈</div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "white", letterSpacing: "1px" }}>STOCK <span style={{ color: "#2ed573" }}>TRACKER</span></div>
        </div>

        {!showChangePass ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h2 style={{ color: "white", textAlign: "center", fontSize: "24px", fontWeight: "bold", margin: 0 }}>Đăng Nhập</h2>
            <p style={{ color: "#8b949e", textAlign: "center", fontSize: "13px", marginTop: "0", marginBottom: "10px" }}>Theo dõi danh mục và bắt sóng thị trường 🚀</p>
            
            {error && <div style={{ color: "#ff4757", background: "rgba(255,71,87,0.1)", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", textAlign: "center", border: "1px solid rgba(255,71,87,0.2)" }}>{error}</div>}
            
            <div style={{ position: "relative" }}>
              <span style={iconStyle}>✉</span>
              <input placeholder="Tài khoản (admin)" value={user} onChange={e => setUser(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ position: "relative" }}>
              <span style={iconStyle}>🔒</span>
              <input type="password" placeholder="Mật khẩu" value={pass} onChange={e => setPass(e.target.value)} style={inputStyle} />
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#8b949e" }}>
               <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input type="checkbox" style={{ accentColor: "#2ed573" }} />
                  Ghi nhớ đăng nhập
               </label>
               <span onClick={() => { setShowChangePass(true); setError(""); }} style={{ color: "#2ed573", cursor: "pointer", textDecoration: "none" }}>Quên mật khẩu?</span>
            </div>

            <button type="submit" style={btnStyle} onMouseOver={e => e.target.style.background="#26b360"} onMouseOut={e => e.target.style.background="#2ed573"}>
              Đăng Nhập
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "10px 0" }}>
               <div style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.1)" }}></div>
               <div style={{ color: "#8b949e", fontSize: "12px" }}>hoặc</div>
               <div style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.1)" }}></div>
            </div>

            <button type="button" onClick={() => alert("Chức năng đang cập nhật!")} style={{ ...btnStyle, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }} onMouseOver={e => e.target.style.background="rgba(255,255,255,0.1)"} onMouseOut={e => e.target.style.background="rgba(255,255,255,0.05)"}>
               Đăng nhập với Google
            </button>

            <p style={{ color: "#8b949e", textAlign: "center", fontSize: "11px", marginTop: "15px", lineHeight: "1.5" }}>
              Thị trường lên xuống thất thường,<br/>đăng nhập để xem tài sản của bạn 💵📉
            </p>
          </form>
        ) : (
          <form onSubmit={handleChangePass} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h2 style={{ color: "white", textAlign: "center", fontSize: "24px", fontWeight: "bold", margin: 0 }}>Đổi Mật Khẩu</h2>
            <p style={{ color: "#8b949e", textAlign: "center", fontSize: "13px", marginTop: "0", marginBottom: "10px" }}>Bảo vệ danh mục đầu tư của bạn 🛡️</p>
            
            {changeMsg && <div style={{ color: changeMsg.includes("thành công") ? "#2ed573" : "#ff4757", background: changeMsg.includes("thành công") ? "rgba(46,213,115,0.1)" : "rgba(255,71,87,0.1)", padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: "bold", textAlign: "center", border: `1px solid ${changeMsg.includes("thành công") ? "rgba(46,213,115,0.2)" : "rgba(255,71,87,0.2)"}` }}>{changeMsg}</div>}
            
            <div style={{ position: "relative" }}>
              <span style={iconStyle}>🔒</span>
              <input type="password" placeholder="Mật khẩu cũ" value={oldPass} onChange={e => setOldPass(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ position: "relative" }}>
              <span style={iconStyle}>🔑</span>
              <input type="password" placeholder="Mật khẩu mới (từ 6 ký tự)" value={newPass} onChange={e => setNewPass(e.target.value)} style={inputStyle} />
            </div>

            <button type="submit" style={btnStyle} onMouseOver={e => e.target.style.background="#26b360"} onMouseOut={e => e.target.style.background="#2ed573"}>
              Lưu Thay Đổi
            </button>

            <div 
              onClick={() => { setShowChangePass(false); setChangeMsg(""); }}
              style={{ textAlign: "center", color: "#8b949e", fontSize: "13px", marginTop: "10px", cursor: "pointer" }}
              onMouseOver={e => e.target.style.color="white"}
              onMouseOut={e => e.target.style.color="#8b949e"}
            >
              ← Quay lại đăng nhập
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function StockTracker() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  return <MainApp onLogout={() => setIsAuthenticated(false)} />;
}
