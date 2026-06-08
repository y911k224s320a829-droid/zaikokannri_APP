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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  if (res.status === 204) return null;
  return res.json();
}

const CATEGORIES = ["すべて", "食品・飲料", "衣料品・雑貨", "部品・資材", "電子機器", "文具・事務用品", "その他"];
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
      <div style={{ background: "#1c1c1e", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 20px 36px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8e8e93", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input {...props} style={{ width: "100%", background: "#2c2c2e", border: "1px solid #3a3a3c", borderRadius: 10, color: "#fff", fontSize: 15, padding: "10px 12px", boxSizing: "border-box", outline: "none", ...props.style }} />
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedCategory, setSelectedCategory] = useState("すべて");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [form, setForm] = useState({ name: "", sku: "", category: "その他", stock: "", unit: "個" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    try {
      setLoading(true);
      setError(null);
      const data = await sbFetch("inventory?select=*&order=created_at.desc");
      setItems(data || []);
    } catch (e) {
      setError("データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchCat = selectedCategory === "すべて" || item.category === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchQ = !q || (item.name || "").toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [items, selectedCategory, searchQuery]);

  const lowStockItems = items.filter(i => i.stock <= LOW_STOCK_THRESHOLD);
  const outOfStock = items.filter(i => i.stock === 0).length;

  function openAdd() {
    setForm({ name: "", sku: "", category: "その他", stock: "", unit: "個" });
    setShowAddModal(true);
  }

  function openEdit(item) {
    setForm({ name: item.name, sku: item.sku || "", category: item.category || "その他", stock: String(item.stock), unit: item.unit || "個" });
    setEditItem(item);
  }

  async function saveAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await sbFetch("inventory", {
        method: "POST",
        prefer: "return=representation",
        body: JSON.stringify({ name: form.name, sku: form.sku, category: form.category, stock: Number(form.stock) || 0, unit: form.unit }),
      });
      setShowAddModal(false);
      await loadItems();
    } catch (e) {
      alert("追加に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await sbFetch(`inventory?id=eq.${editItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: form.name, sku: form.sku, category: form.category, stock: Number(form.stock) || 0, unit: form.unit }),
      });
      setEditItem(null);
      await loadItems();
    } catch (e) {
      alert("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await sbFetch(`inventory?id=eq.${deleteItem.id}`, { method: "DELETE" });
      setDeleteItem(null);
      await loadItems();
    } catch (e) {
      alert("削除に失敗しました");
    }
  }

  async function adjustStock(item, delta) {
    const newStock = Math.max(0, item.stock + delta);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: newStock } : i));
    try {
      await sbFetch(`inventory?id=eq.${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: newStock }),
      });
    } catch (e) {
      await loadItems();
    }
  }

  const accent = "#0a84ff";
  const cardBg = "#1c1c1e";

  return (
    <div style={{ background: "#000", minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", color: "#fff", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: "54px 20px 16px", background: "linear-gradient(180deg, #1c1c1e 0%, #000 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#8e8e93", fontWeight: 600, letterSpacing: 1 }}>INVENTORY</p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>在庫管理</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={loadItems} style={{ background: "#2c2c2e", border: "none", borderRadius: 50, width: 36, height: 36, color: "#8e8e93", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>↻</button>
            <button onClick={openAdd} style={{ background: accent, border: "none", borderRadius: 50, width: 40, height: 40, color: "#fff", fontSize: 22, fontWeight: 300, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>＋</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, padding: "0 20px 12px" }}>
        {["list", "alert"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: activeTab === tab ? accent : "#1c1c1e", color: activeTab === tab ? "#fff" : "#8e8e93", position: "relative" }}>
            {tab === "list" ? "在庫一覧" : "アラート"}
            {tab === "alert" && lowStockItems.length > 0 && (
              <span style={{ position: "absolute", top: 4, right: 10, background: "#ff3b30", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{lowStockItems.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
      {loading && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0" }}>読み込み中...</div>}
      {error && <div style={{ textAlign: "center", color: "#ff3b30", padding: "20px", fontSize: 13 }}>{error}<br /><button onClick={loadItems} style={{ marginTop: 8, background: "#2c2c2e", border: "none", borderRadius: 8, color: "#fff", padding: "6px 16px", cursor: "pointer" }}>再試行</button></div>}

      {!loading && !error && activeTab === "list" && (
        <>
          {/* Stats */}
          <div style={{ display: "flex", gap: 10, padding: "0 20px 16px" }}>
            {[
              { label: "総商品数", value: items.length, color: "#0a84ff" },
              { label: "在庫切れ", value: outOfStock, color: "#ff3b30" },
              { label: "残少", value: lowStockItems.length - outOfStock, color: "#ff9500" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: cardBg, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 10, color: "#8e8e93", fontWeight: 600, marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 20px 10px" }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍　商品名・在庫番号で検索"
              style={{ width: "100%", background: "#1c1c1e", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, padding: "10px 14px", boxSizing: "border-box", outline: "none" }} />
          </div>

          {/* Category filter */}
          <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", overflowX: "auto", scrollbarWidth: "none" }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                style={{ whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 999, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
                  background: selectedCategory === cat ? accent : "#2c2c2e", color: selectedCategory === cat ? "#fff" : "#8e8e93" }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Items */}
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: "40px 0", fontSize: 14 }}>該当する商品がありません</div>}
            {filtered.map(item => (
              <div key={item.id} style={{ background: cardBg, borderRadius: 16, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                      <StatusBadge stock={item.stock} />
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "#8e8e93" }}>
                      在庫番号: <span style={{ color: "#aeaeb2", fontWeight: 600 }}>{item.sku || "—"}</span>　
                      カテゴリ: <span style={{ color: "#aeaeb2" }}>{item.category || "—"}</span>
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => adjustStock(item, -1)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#ff3b30", width: 32, height: 32, fontSize: 20, cursor: "pointer", fontWeight: 700 }}>−</button>
                    <span style={{ fontSize: 20, fontWeight: 800, minWidth: 40, textAlign: "center" }}>{item.stock}<span style={{ fontSize: 11, color: "#8e8e93", fontWeight: 400, marginLeft: 3 }}>{item.unit}</span></span>
                    <button onClick={() => adjustStock(item, 1)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#34c759", width: 32, height: 32, fontSize: 20, cursor: "pointer", fontWeight: 700 }}>＋</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(item)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#0a84ff", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>編集</button>
                    <button onClick={() => setDeleteItem(item)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#ff3b30", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>削除</button>
                  </div>
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

      {/* Add Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <h2 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 800 }}>商品を追加</h2>
        <InputField label="商品名 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: コピー用紙 A4" />
        <InputField label="在庫番号 (SKU)" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="例: STN-001" />
        <SelectField label="カテゴリ" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CATEGORIES.filter(c => c !== "すべて").map(c => <option key={c}>{c}</option>)}
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

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)}>
        <h2 style={{ margin: "0 0 18px", fontSize: 18, fontWeight: 800 }}>商品を編集</h2>
        <InputField label="商品名 *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例: コピー用紙 A4" />
        <InputField label="在庫番号 (SKU)" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="例: STN-001" />
        <SelectField label="カテゴリ" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CATEGORIES.filter(c => c !== "すべて").map(c => <option key={c}>{c}</option>)}
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

      {/* Delete Modal */}
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
