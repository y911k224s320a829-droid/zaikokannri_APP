import { useState, useMemo, useEffect } from "react";

const SUPABASE_URL = "https://ahfecfutgsjattdbotyk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoZmVjZnV0Z3NqYXR0ZGJvdHlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjkxNjMsImV4cCI6MjA5NjUwNTE2M30.YK9dAY98cs1VnNR-cJrV21GCOmU0rwYNCNyEPrBMRXk";

// ★ 管理者パスワード（変更したい場合はここを書き換えてください）
const ADMIN_PASSWORD = "y911k224";

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
  if (res.status === 204 || res.status === 201) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: "#1c1c1e", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 20px 40px" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("list");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("すべて");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [addForm, setAddForm] = useState({ name: "", sku: "", category: "", stock: 0, unit: "個" });
  const [newCatName, setNewCatName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  // 管理者モード
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 認証後に実行するアクション

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [inv, cats, hist] = await Promise.all([
        sbFetch("inventory?order=created_at.desc"),
        sbFetch("categories?order=name.asc"),
        sbFetch("inventory_log?order=created_at.desc&limit=100"),
      ]);
      setItems(inv || []);
      setCategories(cats || []);
      setHistory(hist || []);
    } catch (e) {
      setError("データの読み込みに失敗しました: " + e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // 管理者認証が必要なアクションを要求する
  function requireAdmin(action) {
    if (isAdmin) {
      action();
    } else {
      setPendingAction(() => action);
      setPasswordInput("");
      setPasswordError(false);
      setShowPasswordModal(true);
    }
  }

  function submitPassword() {
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowPasswordModal(false);
      setPasswordError(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      setPasswordError(true);
    }
  }

  function logout() {
    setIsAdmin(false);
  }

  const filtered = useMemo(() => {
    return items.filter(it => {
      const matchCat = filterCat === "すべて" || it.category === filterCat;
      const matchSearch = !search || it.name.includes(search) || (it.sku || "").includes(search);
      return matchCat && matchSearch;
    });
  }, [items, search, filterCat]);

  const alertItems = items.filter(it => it.stock <= LOW_STOCK_THRESHOLD);

  async function adjustStock(item, delta) {
    const newStock = Math.max(0, item.stock + delta);
    try {
      await sbFetch(`inventory?id=eq.${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: newStock }),
      });
      try {
        await sbFetch("inventory_log", {
          method: "POST",
          prefer: "return=minimal",
          body: JSON.stringify({
            item_id: item.id,
            item_name: item.name,
            change: delta,
            stock_after: newStock,
            operator: isAdmin ? "管理者" : "一般",
          }),
        });
      } catch { /* ログ失敗は無視 */ }
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, stock: newStock } : it));
    } catch (e) {
      alert("更新に失敗しました: " + e.message);
    }
  }

  async function saveAdd() {
    if (!addForm.name.trim()) { alert("商品名を入力してください"); return; }
    try {
      await sbFetch("inventory", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({
          name: addForm.name.trim(),
          sku: addForm.sku.trim() || null,
          category: addForm.category || null,
          stock: Number(addForm.stock) || 0,
          unit: addForm.unit || "個",
        }),
      });
      setShowAdd(false);
      setAddForm({ name: "", sku: "", category: "", stock: 0, unit: "個" });
      await loadAll();
    } catch (e) {
      alert("追加に失敗しました: " + e.message);
    }
  }

  async function saveEdit() {
    try {
      await sbFetch(`inventory?id=eq.${editItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editItem.name,
          sku: editItem.sku,
          category: editItem.category,
          stock: Number(editItem.stock),
          unit: editItem.unit,
        }),
      });
      setEditItem(null);
      await loadAll();
    } catch (e) {
      alert("更新に失敗しました: " + e.message);
    }
  }

  async function confirmDelete() {
    try {
      await sbFetch(`inventory?id=eq.${deleteItem.id}`, { method: "DELETE" });
      setDeleteItem(null);
      await loadAll();
    } catch (e) {
      alert("削除に失敗しました: " + e.message);
    }
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    try {
      await sbFetch("categories", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      setNewCatName("");
      await loadAll();
    } catch (e) {
      alert("カテゴリ追加に失敗しました: " + e.message);
    }
  }

  async function deleteCategory(id) {
    try {
      await sbFetch(`categories?id=eq.${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e) {
      alert("削除に失敗しました: " + e.message);
    }
  }

  const fieldStyle = {
    width: "100%", background: "#2c2c2e", border: "none", borderRadius: 10,
    color: "#fff", fontSize: 15, padding: "12px 14px", boxSizing: "border-box", marginBottom: 10,
  };
  const labelStyle = { color: "#8e8e93", fontSize: 12, marginBottom: 4, display: "block" };

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", fontFamily: "-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* Header */}
      <div style={{ background: "#1c1c1e", padding: "16px 20px 12px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>在庫管理</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isAdmin ? (
              <button onClick={logout} style={{ background: "#ff9500", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🔓 管理者
              </button>
            ) : (
              <button onClick={() => { setPasswordInput(""); setPasswordError(false); setPendingAction(null); setShowPasswordModal(true); }} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#8e8e93", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                🔒 管理者
              </button>
            )}
            <button onClick={loadAll} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>↻</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["list","一覧"],["alert",`アラート${alertItems.length>0?" "+alertItems.length:""}`],["history","履歴"],["category","カテゴリ"]].map(([key,label])=>(
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: tab === key ? "#0a84ff" : "#2c2c2e",
              color: tab === key ? "#fff" : "#8e8e93",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {loading && <div style={{ textAlign: "center", color: "#8e8e93", padding: 40 }}>読み込み中...</div>}
        {error && (
          <div style={{ background: "#3a1c1c", border: "1px solid #ff3b30", borderRadius: 12, padding: 16, marginBottom: 16, color: "#ff3b30", fontSize: 13 }}>
            {error}
            <button onClick={loadAll} style={{ display: "block", marginTop: 8, background: "#ff3b30", border: "none", borderRadius: 8, color: "#fff", padding: "6px 14px", cursor: "pointer" }}>再試行</button>
          </div>
        )}

        {/* 一覧タブ */}
        {!loading && tab === "list" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="商品名・SKUで検索" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
              {["すべて", ...categories.map(c=>c.name)].map(cat=>(
                <button key={cat} onClick={()=>setFilterCat(cat)} style={{
                  whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 13, cursor: "pointer",
                  background: filterCat === cat ? "#0a84ff" : "#2c2c2e",
                  color: filterCat === cat ? "#fff" : "#8e8e93",
                }}>{cat}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ background: "#1c1c1e", borderRadius: 12, padding: "10px 16px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{items.length}</div>
                <div style={{ fontSize: 11, color: "#8e8e93" }}>総商品数</div>
              </div>
              <div style={{ background: "#1c1c1e", borderRadius: 12, padding: "10px 16px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#ff3b30" }}>{items.filter(i=>i.stock===0).length}</div>
                <div style={{ fontSize: 11, color: "#8e8e93" }}>在庫切れ</div>
              </div>
              <div style={{ background: "#1c1c1e", borderRadius: 12, padding: "10px 16px", flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#ff9500" }}>{items.filter(i=>i.stock>0&&i.stock<=LOW_STOCK_THRESHOLD).length}</div>
                <div style={{ fontSize: 11, color: "#8e8e93" }}>残少</div>
              </div>
            </div>
            {filtered.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: 40 }}>商品がありません</div>}
            {filtered.map(item => (
              <div key={item.id} style={{ background: "#1c1c1e", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{item.name}</div>
                    {item.sku && <div style={{ fontSize: 12, color: "#8e8e93" }}>SKU: {item.sku}</div>}
                    {item.category && <div style={{ fontSize: 12, color: "#636366" }}>{item.category}</div>}
                  </div>
                  <StatusBadge stock={item.stock} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={() => adjustStock(item, -1)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#2c2c2e", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>−</button>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{item.stock}<span style={{ fontSize: 13, color: "#8e8e93", marginLeft: 4 }}>{item.unit}</span></span>
                    <button onClick={() => adjustStock(item, 1)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#0a84ff", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>＋</button>
                  </div>
                  {/* 編集・削除は管理者のみ */}
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setEditItem({...item})} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#0a84ff", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>編集</button>
                      <button onClick={() => setDeleteItem(item)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#ff3b30", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>削除</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* アラートタブ */}
        {!loading && tab === "alert" && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>⚠️ 在庫アラート</h2>
            {alertItems.length === 0
              ? <div style={{ textAlign: "center", color: "#34c759", padding: 40 }}>✓ 在庫不足の商品はありません</div>
              : alertItems.map(item => (
                <div key={item.id} style={{ background: "#1c1c1e", borderRadius: 14, padding: 16, marginBottom: 10, borderLeft: `4px solid ${item.stock===0?"#ff3b30":"#ff9500"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      {item.sku && <div style={{ fontSize: 12, color: "#8e8e93" }}>SKU: {item.sku}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.stock===0?"#ff3b30":"#ff9500" }}>{item.stock}<span style={{ fontSize: 13, marginLeft: 4 }}>{item.unit}</span></div>
                      <StatusBadge stock={item.stock} />
                    </div>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* 履歴タブ */}
        {!loading && tab === "history" && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📋 入出庫履歴</h2>
            {history.length === 0
              ? <div style={{ textAlign: "center", color: "#8e8e93", padding: 40 }}>履歴がありません</div>
              : history.map((h, i) => (
                <div key={i} style={{ background: "#1c1c1e", borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{h.item_name}</div>
                    <div style={{ fontSize: 12, color: "#8e8e93" }}>{h.operator} · {new Date(h.created_at).toLocaleString("ja-JP")}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: h.change > 0 ? "#34c759" : "#ff3b30" }}>
                    {h.change > 0 ? "+" : ""}{h.change}
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* カテゴリタブ */}
        {!loading && tab === "category" && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🏷️ カテゴリ管理</h2>
            {isAdmin && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} placeholder="新しいカテゴリ名" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
                <button onClick={addCategory} style={{ background: "#0a84ff", border: "none", borderRadius: 10, color: "#fff", padding: "0 18px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>追加</button>
              </div>
            )}
            {!isAdmin && (
              <div style={{ background: "#2c2c2e", borderRadius: 12, padding: 14, marginBottom: 16, color: "#8e8e93", fontSize: 13, textAlign: "center" }}>
                🔒 カテゴリの追加・削除は管理者のみ
              </div>
            )}
            {categories.length === 0 && <div style={{ textAlign: "center", color: "#8e8e93", padding: 20 }}>カテゴリがありません</div>}
            {categories.map(cat => (
              <div key={cat.id} style={{ background: "#1c1c1e", borderRadius: 12, padding: "14px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{cat.name}</span>
                {isAdmin && (
                  <button onClick={() => deleteCategory(cat.id)} style={{ background: "#2c2c2e", border: "none", borderRadius: 8, color: "#ff3b30", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>削除</button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 追加ボタン（管理者のみ・スマホ対応で中央寄り） */}
      {tab === "list" && isAdmin && (
        <button
          onClick={() => { setAddForm({ name: "", sku: "", category: categories[0]?.name || "", stock: 0, unit: "個" }); setShowAdd(true); }}
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(200px)",  // 中央から200px右（480px幅の右端付近）
            width: 56, height: 56,
            borderRadius: "50%",
            background: "#0a84ff",
            border: "none", color: "#fff", fontSize: 28,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(10,132,255,0.4)",
            zIndex: 20,
          }}>
          ＋
        </button>
      )}
      {tab === "list" && !isAdmin && (
        <button
          onClick={() => requireAdmin(() => { setAddForm({ name: "", sku: "", category: categories[0]?.name || "", stock: 0, unit: "個" }); setShowAdd(true); })}
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(200px)",
            width: 56, height: 56,
            borderRadius: "50%",
            background: "#636366",
            border: "none", color: "#fff", fontSize: 28,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 20,
          }}>
          ＋
        </button>
      )}

      {/* パスワード入力モーダル */}
      <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>🔒 管理者ログイン</h2>
        <p style={{ color: "#8e8e93", fontSize: 13, marginBottom: 16 }}>パスワードを入力してください</p>
        <input
          type="password"
          value={passwordInput}
          onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
          onKeyDown={e => e.key === "Enter" && submitPassword()}
          placeholder="パスワード"
          style={{ ...fieldStyle, border: passwordError ? "1px solid #ff3b30" : "none" }}
          autoFocus
        />
        {passwordError && <p style={{ color: "#ff3b30", fontSize: 13, margin: "-6px 0 10px" }}>パスワードが違います</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={() => setShowPasswordModal(false)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>キャンセル</button>
          <button onClick={submitPassword} style={{ flex: 1, background: "#0a84ff", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>ログイン</button>
        </div>
      </Modal>

      {/* 商品追加モーダル */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800 }}>商品を追加</h2>
        <label style={labelStyle}>商品名 *</label>
        <input value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="例：リレー" style={fieldStyle} />
        <label style={labelStyle}>在庫番号（SKU）</label>
        <input value={addForm.sku} onChange={e=>setAddForm(f=>({...f,sku:e.target.value}))} placeholder="例：REL-001" style={fieldStyle} />
        <label style={labelStyle}>カテゴリ</label>
        <select value={addForm.category} onChange={e=>setAddForm(f=>({...f,category:e.target.value}))} style={fieldStyle}>
          <option value="">選択なし</option>
          {categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>在庫数</label>
            <input type="number" value={addForm.stock} onChange={e=>setAddForm(f=>({...f,stock:e.target.value}))} style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>単位</label>
            <input value={addForm.unit} onChange={e=>setAddForm(f=>({...f,unit:e.target.value}))} placeholder="個" style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={() => setShowAdd(false)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>閉じる</button>
          <button onClick={saveAdd} style={{ flex: 1, background: "#0a84ff", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>追加する</button>
        </div>
      </Modal>

      {/* 編集モーダル */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800 }}>商品を編集</h2>
        <label style={labelStyle}>商品名</label>
        <input value={editItem?.name||""} onChange={e=>setEditItem(f=>({...f,name:e.target.value}))} style={fieldStyle} />
        <label style={labelStyle}>在庫番号（SKU）</label>
        <input value={editItem?.sku||""} onChange={e=>setEditItem(f=>({...f,sku:e.target.value}))} style={fieldStyle} />
        <label style={labelStyle}>カテゴリ</label>
        <select value={editItem?.category||""} onChange={e=>setEditItem(f=>({...f,category:e.target.value}))} style={fieldStyle}>
          <option value="">選択なし</option>
          {categories.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>在庫数</label>
            <input type="number" value={editItem?.stock||0} onChange={e=>setEditItem(f=>({...f,stock:e.target.value}))} style={fieldStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>単位</label>
            <input value={editItem?.unit||""} onChange={e=>setEditItem(f=>({...f,unit:e.target.value}))} style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={() => setEditItem(null)} style={{ flex: 1, background: "#2c2c2e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>閉じる</button>
          <button onClick={saveEdit} style={{ flex: 1, background: "#0a84ff", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 0", cursor: "pointer" }}>保存する</button>
        </div>
      </Modal>

      {/* 削除確認モーダル */}
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
