import { useState, useMemo, useEffect } from "react";

const SUPABASE_URL = "https://ahfecfutgsjattdbotyk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoZmVjZnV0Z3NqYXR0ZGJvdHlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkxNjMsImV4cCI6MjA5NjUwNTE2M30.YK9dAY98cs1VnNR-cJrV21GCOmU0rwYNCNyEPrBMRXk";

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "",
      ...options.headers,
    },
  });
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  if (res.status === 204) return null;
  return res.json();
}

const LOW_STOCK_THRESHOLD = 5;

function StatusBadge({ stock }) {
  if (stock === 0) return <span style={{ background: "#ff3b30", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>在庫切れ</span>;
  if (stock <= LOW_STOCK_THRESHOLD) return <span style={{ background: "#ff9500", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>残少</span>;
  return <span style={{ background: "#34c759", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>在庫あり</span>;
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div style={{ background: "#1c1c1e", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 20px 36px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8e8e93", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input {...props} style={{ width: "100%", background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 10, color: "#fff", fontSize: 15, padding: "10px 12px", boxSizing: "border-box", outline: "none" }} />
    </div>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8e8e93", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <select {...props} style={{ width: "100%", background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 10, color: "#fff", fontSize: 15, padding: "10px 12px", boxSizing: "border-box", outline: "none" }}>
        {children}
      </select>
    </div>
  );
}

export default function InventoryApp() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedCategory, setSelectedCategory] = useState("すべて");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(null);
  const [form, setForm] = useState({ name: "", sku: "", category: "", stock: "", unit: "個" });
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");
  const [showNameModal, setShowNameModal] = useState(!localStorage.getItem("userName"));
  const [tempName, setTempName] = useState("");
  const [stockAction, setStockAction] = useState({ type: "out", quantity: "1" });
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      setLoading(true); setError(null);
      const [itemData, catData, logData] = await Promise.all([
        sbFetch("inventory?select=*&order=created_at.desc"),
        sbFetch("categories?select=*&order=name.asc"),
        sbFetch("inventory_log?select=*&order=created_at.desc&limit=100"),
      ]);
      setItems(itemData || []);
      setCategories(catData || []);
      setLogs(logData || []);
    } catch (e) { setError("データの読み込みに失敗しました"); }
    finally { setLoading(false); }
  }

  function saveName() {
    if (!tempName.trim()) return;
    localStorage.setItem("userName", tempName.trim());
    setUserName(tempName.trim());
    setShowNameModal(false);
  }

  const filtered = useMemo(() => items.filter(item => {
    const matchCat = selectedCategory === "すべて" || item.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchQ = !q || (item.name || "").toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q);
    return matchCat && matchQ;
  }), [items, selectedCategory, searchQuery]);

  const lowStockItems = items.filter(i => i.stock <= LOW_STOCK_THRESHOLD);
  const outOfStock = items.filter(i => i.stock === 0).length;

  function openAdd() {
    setForm({ name: "", sku: "", category: categories[0]?.name || "", stock: "", unit: "個" });
    setShowAddModal(true);
  }

  function openEdit(item) {
    setForm({ name: item.name, sku: item.sku || "", category: item.category || "", stock: String(item.stock), unit: item.unit || "個" });
    setEditItem(item);
  }

  async function saveAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await sbFetch("inventory", { method: "POST", headers: { "Prefer": "return=minimal" }, body: JSON.stringify({ name: form.name, sku: form.sku, category: form.category, stock: Number(form.stock) || 0, unit: form.unit }) });
      setShowAddModal(false);
      await loadAll();
    } catch (e) { alert("追加に失敗しました"); } finally { setSaving(false); }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await sbFetch(`inventory?id=eq.${editItem.id}`, { method: "PATCH", body: JSON.stringify({ name: form.name, sku: form.sku, category: form.category, stock: Number(form.stock) || 0, unit: form.unit }) });
      setEditItem(null);
      await loadAll();
    } catch (e) { alert("更新に失敗しました"); } finally { setSaving(false); }
  }

  async function confirmDelete() {
    try {
      await sbFetch(`inventory?id=eq.${deleteItem.id}`, { method: "DELETE" });
      setDeleteItem(null);
      await loadAll();
    } catch (e) { alert("削除に失敗しました"); }
  }

  async function handleStockAction() {
    if (!userName) { setShowNameModal(true); return; }
    const qty = Number(stockAction.quantity) || 0;
    if (qty <= 0) return;
    const item = showStockModal;
    const delta = stockAction.type === "in" ? qty : -qty;
    const newStock = Math.max(0, item.stock + delta);
    setSaving(true);
    try {
      await sbFetch(`inventory?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ stock: newStock }) });
      await sbFetch("inventory_log", { method: "POST", headers: { "Prefer": "return=minimal" }, body: JSON.stringify({ inventory_id: item.id, item_name: item.name, action: stockAction.type === "in" ? "入庫" : "出庫", quantity: qty, user_name: userName }) });
      setShowStockModal(null);
      await loadAll();
    } catch (e) { alert("更新に失敗しました"); } finally { setSaving(false); }
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      await sbFetch("categories", { method: "POST", headers: { "Prefer": "return=minimal" }, body: JSON.stringify({ name: newCategory.trim() }) });
      setNewCategory("");
      await loadAll();
    } catch (e) { alert("追加に失敗しました（同じ名前がすでにあるかもしれません）"); }
  }

  async function deleteCategory(cat) {
    if (!window.confirm(`「${cat.name}」を削除しますか？`)) return;
    try {
      await sbFetch(`categories?id=eq.${cat.id}`, { method: "DELETE" });
      await loadAll();
    } catch (e) { alert("削除に失敗しました"); }
  }

  const accent = "#0a84ff";
  const cardBg = "#1c1c1e";

  return (
    <div style={{ background: "#000", minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", color: "#fff", paddingBottom: 80 }}>

      {/* 名前設定モーダル */}
      <Modal open={showNameModal} onClose={() => {}}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>あなたの名前を入力</h2>
        <p style={{ color: "#8e8e93", fontSize: 13, marginBottom: 16 }}>入出庫の履歴に記録されます</p>
        <InputField label="名前" value={tempName} onChange={e => setTempName(e.target.value)} placeholder="例: 田中" onKeyDown={e => e.key === "Enter" && saveName()} />
        <button onClick={saveName} style={{ width: "100%", background: accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>決定</button>
      </Modal>

      {/* Header */}
      <div style={{ padding: "54px 20px 16px", background: "linear-gradient(180deg, #1c1c1e 0%, #000 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#8e8e93", fontWeight: 600, letterSpacing: 1 }}>INVENTORY</p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>在庫管理</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setShowNameModal(true)} style={{ background: "#2c2c2e", border: "none", borderRadius: 20, color: "#8e8e93", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>👤 {userName || "名前未設定"}</button>
            <button onClick={loadAll} style={{ background: "#2c2c2e", border: "none", borderRadius: 50, width: 36, height: 36, color: "#8e8e93", fontSize: 16, cursor: "pointer" }}>↻</button>
            <button onClick={openAdd} style={{ background: accent, border: "none", borderRadius: 50, width: 40, height: 40, color: "#fff", fontSize: 22, cursor: "pointer" }}>＋</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 20px 12px" }}>
        {["list", "alert", "log", "category"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer",
              background: activeTab === tab ? accent : "#1c1c1e", color: activeTab === tab ? "#fff" : "#8e8e93", position: "relative" }}>
            {tab === "list" ? "一覧" : tab === "alert" ? "アラート" : tab === "log" ? "履歴" : "カテゴリ"}
            {tab === "alert" && lowStockItems.length > 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, background: "#ff3b30", borderRadius: 999, padding: "1px 5px", fontSize: 9, fontWeight: 800 }}>{lowStockItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0" }}>読み込み中...</div>}
      {error && <div style={{ textAlign: "center", color: "#ff3b30", padding: "20px", fontSize: 13 }}>{error}<br /><button onClick={loadAll} style={{ marginTop: 8, background: "#2c2c2e", border: "none", borderRadius: 8, color: "#fff", padding: "6px 16px", cursor: "pointer" }}>再試行</button></div>}

      {!loading && !error && activeTab === "list" && (
        <>
          <div style={{ display: "flex", gap: 10, padding: "0 20px 16px" }}>
            {[{ label: "総商品数", value: items.length, color: "#0a84ff" }, { label: "在庫切れ", value: outOfStock, color: "#ff3b30" }, { label: "残少", value: lowStockItems.length - outOfStock, color: "#ff9500" }].map(s => (
              <div key={s.label} style={{ flex: 1, background: cardBg, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 10, color: "#8e8e93", fontWeight: 600, marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: "0 20px 10px" }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍　商品名・在庫番号で検索"
              style={{ width: "100%", background: "#1c1c1e", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, padding: "10px 14px", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", overflowX: "auto", scrollbarWidth: "none" }}>
            {["すべて", ...categories.map(c => c.name)].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                style={{ whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 999, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  background: selectedCategory === cat ? accent : "#2c2c2e", color: selectedCategory === cat ? "#fff" : "#8e8e93" }}>
                {cat}
              </button>
            ))}
          </div>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0", fontSize: 14 }}>該当する商品がありません</div>}
            {filtered.map(item => (
              <div key={item.id} style={{ background: cardBg, borderRadius: 16, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                      <StatusBadge stock={item.stock} />
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "#8e8e93" }}>
                      在庫番号: <span style={{ color: "#aeaeb2", fontWeight: 600 }}>{item.sku || "—"}</span>　カテゴリ: <span style={{ color: "#aeaeb2" }}>{item.category || "—"}</span>
                    </p>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800 }}>{item.stock}<span style={{ fontSize: 11, color: "#8e8e93", fontWeight: 400, marginLeft: 2 }}>{item.unit}</span></span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowStockModal(item); setStockAction({ type: "in", quantity: "1" }); }}
                    style={{ flex: 1, background: "#1a3a1a", border: "none", borderRadius: 8, color: "#34c759", padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>＋ 入庫</button>
                  <button onClick={() => { setShowStockModal(item); setStockAction({ type: "out", quantity: "1" }); }}
                    style={{ flex: 1, background: "#3a1a1a", border: "none", borderRadius: 8, color: "#ff3b30", padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>− 出庫</button>
                  <button onClick={() => openEdit(item)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#0a84ff", padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>編集</button>
                  <button onClick={() => setDeleteItem(item)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#ff3b30", padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>削除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && activeTab === "alert" && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>在庫数が {LOW_STOCK_THRESHOLD} 以下の商品</p>
          {lowStockItems.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0", fontSize: 14 }}>アラート対象の商品はありません</div>}
          {lowStockItems.map(item => (
            <div key={item.id} style={{ background: item.stock === 0 ? "#2c1010" : "#2a1d00", borderRadius: 16, padding: "14px 16px", marginBottom: 10, borderLeft: `4px solid ${item.stock === 0 ? "#ff3b30" : "#ff9500"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{item.name}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#8e8e93" }}>在庫番号: {item.sku || "—"} | {item.category || "—"}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <StatusBadge stock={item.stock} />
                  <p style={{ margin: "4px 0 0", fontWeight: 800, fontSize: 18 }}>{item.stock}<span style={{ fontSize: 11, color: "#8e8e93", fontWeight: 400, marginLeft: 2 }}>{item.unit}</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && activeTab === "log" && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>直近100件の入出庫履歴</p>
          {logs.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0", fontSize: 14 }}>履歴がありません</div>}
          {logs.map(log => (
            <div key={log.id} style={{ background: cardBg, borderRadius: 12, padding: "12px 14px", marginBottom: 8, borderLeft: `4px solid ${log.action === "入庫" ? "#34c759" : "#ff3b30"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: log.action === "入庫" ? "#1a3a1a" : "#3a1a1a", color: log.action === "入庫" ? "#34c759" : "#ff3b30", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{log.action}</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{log.item_name}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#8e8e93" }}>
                    👤 {log.user_name}　数量: {log.quantity}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 10, color: "#636366", textAlign: "right" }}>
                  {new Date(log.created_at).toLocaleDateString("ja-JP")}<br />
                  {new Date(log.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && activeTab === "category" && (
        <div style={{ padding: "0 20px" }}>
          <p style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>カテゴリの管理</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="新しいカテゴリ名"
              onKeyDown={e => e.key === "Enter" && addCategory()}
              style={{ flex: 1, background: "#1c1c1e", border: "1px solid #3a3a3c", borderRadius: 10, color: "#fff", fontSize: 14, padding: "10px 12px", outline: "none" }} />
            <button onClick={addCategory} style={{ background: accent, border: "none", borderRadius: 10, color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>追加</button>
          </div>
          {categories.map(cat => (
            <div key={cat.id} style={{ background: cardBg, borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{cat.name}</span>
              <button onClick={() => deleteCategory(cat)} style={{ background: "#3a1a1a", border: "none", borderRadius: 8, color: "#ff3b30", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>削除</button>
            </div>
          ))}
        </div>
      )}

      {/* 入出庫モーダル */}
      <Modal open={!!showStockModal} onClose={() => setShowStockModal(null)}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>{showStockModal?.name}</h2>
        <p style={{ margin: "0 0 16px", color: "#8e8e93", fontSize: 13 }}>現在の在庫: {showStockModal?.stock}{showStockModal?.unit}</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["in", "out"].map(type => (
            <button key={type} onClick={() => setStockAction(s => ({ ...s, type }))}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer",
                background: stockAction.type === type ? (type === "in" ? "#1a3a1a" : "#3a1a1a") : "#2c2c2e",
                color: stockAction.type === type ? (type === "in" ? "#34c759" : "#ff3b30") : "#8e8e93" }}>
              {type === "in" ? "＋ 入庫" : "− 出庫"}
            </button>
          ))}
        </div>
        <InputField label="数量" type="number" value={stockAction.quantity} onChange={e => setStockAction(s => ({ ...s, quantity: e.target.value }))} placeholder="1" />
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={() => setShowStockModal(null)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>キャンセル</button>
          <button onClick={handleStockAction} disabled={saving}
            style={{ flex: 2, background: stockAction.type === "in" ? "#34c759" : "#ff3b30", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "処理中..." : "確定"}
          </button>
        </div>
      </Modal>

      {/* 追加モーダル */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <h2 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 800 }}>商品を追加</h2>
        <InputField label="商品名 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: コピー用紙 A4" />
        <InputField label="在庫番号 (SKU)" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="例: STN-001" />
        <SelectField label="カテゴリ" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {categories.map(c => <option key={c.id}>{c.name}</option>)}
        </SelectField>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 2 }}><InputField label="在庫数" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" /></div>
          <div style={{ flex: 1 }}><InputField label="単位" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="個" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={() => setShowAddModal(false)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>キャンセル</button>
          <button onClick={saveAdd} disabled={saving} style={{ flex: 2, background: accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "追加中..." : "追加する"}</button>
        </div>
      </Modal>

      {/* 編集モーダル */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)}>
        <h2 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 800 }}>商品を編集</h2>
        <InputField label="商品名 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: コピー用紙 A4" />
        <InputField label="在庫番号 (SKU)" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="例: STN-001" />
        <SelectField label="カテゴリ" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {categories.map(c => <option key={c.id}>{c.name}</option>)}
        </SelectField>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 2 }}><InputField label="在庫数" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" /></div>
          <div style={{ flex: 1 }}><InputField label="単位" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="個" /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={() => setEditItem(null)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>キャンセル</button>
          <button onClick={saveEdit} disabled={saving} style={{ flex: 2, background: accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "保存中..." : "保存する"}</button>
        </div>
      </Modal>

      {/* 削除モーダル */}
      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>削除の確認</h2>
        <p style={{ color: "#8e8e93", fontSize: 14, marginBottom: 20 }}>「{deleteItem?.name}」を削除しますか？この操作は元に戻せません。</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setDeleteItem(null)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>キャンセル</button>
          <button onClick={confirmDelete} style={{ flex: 1, background: "#ff3b30", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>削除する</button>
        </div>
      </Modal>
    </div>
  );
}
