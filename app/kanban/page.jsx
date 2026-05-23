"use client";
import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";

const COLUMNS = [
  { id: "todo",        label: "To Do",      color: "#4A90D9", icon: "📋" },
  { id: "in_progress", label: "In Progress", color: "#F5A623", icon: "⚡" },
  { id: "review",      label: "Review",      color: "#9B59B6", icon: "👀" },
  { id: "done",        label: "Done",        color: "#27AE60", icon: "✅" },
];

const PRIORITY_COLORS = {
  high:   { bg: "#FFE8E8", text: "#C0392B", dot: "#E74C3C" },
  medium: { bg: "#FFF4E0", text: "#D68910", dot: "#F39C12" },
  low:    { bg: "#E8F8F0", text: "#1E8449", dot: "#27AE60" },
};

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function fetchSheet(sheetName) {
  const res = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheetName)}`);
  if (!res.ok) throw new Error(`Failed to fetch ${sheetName}`);
  const data = await res.json();
  return data.values || [];
}

async function updateStatus(taskId, newStatus, assignedTo) {
  await fetch("https://n8n.solvtree.in/webhook/kanban-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, newStatus, assignedTo, source: "kanban" })
  });
}

function parseMasterRows(rows) {
  return rows.filter(r => r[0]).map((r, i) => ({
    _rowIndex: i,
    id:         r[0]  || "",
    task:       r[1]  || "",
    assignedTo: r[2]  || "",
    client:     r[3]  || "",
    dueDate:    r[4]  || "",
    priority:  (r[5]  || "medium").toLowerCase(),
    entryType:  r[6]  || "",
    status:    (r[7]  || "todo").toLowerCase().replace(/ /g, "_"),
    sourceMsg:  r[8]  || "",
    postedBy:   r[9]  || "",
    postedAt:   r[10] || "",
    slackTs:    r[11] || "",
    channelId:  r[12] || "",
    permalink:  r[13] || "",
  }));
}

function parseConfigRows(rows) {
  return rows.filter(r => r[0]).map(r => ({
    name:        r[0] || "",
    email:       r[1] || "",
    slackUserId: r[2] || "",
    tabName:     r[3] || "",
    active:     (r[4] || "yes").toLowerCase() === "yes",
  }));
}

function getDueStatus(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr); due.setHours(0,0,0,0);
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0)   return { label: "Overdue",      color: "#E74C3C" };
  if (diff === 0)  return { label: "Due Today",    color: "#E67E22" };
  if (diff === 1)  return { label: "Due Tomorrow", color: "#F39C12" };
  if (diff <= 3)   return { label: `${diff} days`, color: "#3498DB" };
  return null;
}

// ─── SELECTOR SCREEN ─────────────────────────────────────────────────────────
function SelectorScreen({ accountants, onSelect }) {
  const [adminMode,    setAdminMode]    = useState(false);
  const [adminPass,    setAdminPass]    = useState("");
  const [adminError,   setAdminError]   = useState(false);
  const [hoveredName,  setHoveredName]  = useState(null);

  function handleAdminSubmit() {
    if (adminPass === ADMIN_PASSWORD) {
      onSelect("admin");
    } else {
      setAdminError(true);
      setTimeout(() => setAdminError(false), 1500);
    }
  }

  const avatarColors = ["#4A90D9","#E74C3C","#27AE60","#9B59B6","#F39C12","#1ABC9C"];

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg, #0F1724 0%, #1A2840 50%, #0F1724 100%)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'DM Mono', monospace",
      padding:"40px 20px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>

      {/* Logo */}
      <div style={{
        animation:"fadeUp 0.5s ease forwards",
        textAlign:"center", marginBottom:48,
      }}>
        <div style={{
          width:64, height:64, borderRadius:18,
          background:"linear-gradient(135deg, #4A90D9, #1A5FA8)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:30, margin:"0 auto 16px",
          boxShadow:"0 8px 32px rgba(74,144,217,0.4)",
        }}>📊</div>
        <div style={{
          fontSize:28, fontWeight:700, color:"#FFFFFF",
          fontFamily:"'Fraunces', serif", marginBottom:8,
          background:"linear-gradient(90deg, #FFFFFF, #4A90D9, #FFFFFF)",
          backgroundSize:"200% auto",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          animation:"shimmer 3s linear infinite",
        }}>AccountantBot</div>
        <div style={{fontSize:12, color:"#4A90D9", letterSpacing:"3px", textTransform:"uppercase"}}>
          Task Board
        </div>
      </div>

      {/* Who are you */}
      <div style={{
        animation:"fadeUp 0.5s ease 0.1s both",
        textAlign:"center", marginBottom:32,
      }}>
        <div style={{fontSize:14, color:"#8896A5", marginBottom:8}}>
          Who are you?
        </div>
        <div style={{fontSize:11, color:"#4D5E70", letterSpacing:"1px"}}>
          SELECT YOUR NAME TO VIEW YOUR TASKS
        </div>
      </div>

      {/* Accountant cards */}
      <div style={{
        display:"flex", flexWrap:"wrap",
        gap:16, justifyContent:"center",
        maxWidth:600, marginBottom:40,
      }}>
        {accountants.map((acc, idx) => {
          const color   = avatarColors[acc.name.charCodeAt(0) % avatarColors.length];
          const initials = acc.name.slice(0,2).toUpperCase();
          const isHovered = hoveredName === acc.name;
          return (
            <div
              key={acc.name}
              onClick={() => onSelect(acc.name)}
              onMouseEnter={() => setHoveredName(acc.name)}
              onMouseLeave={() => setHoveredName(null)}
              style={{
                animation:`fadeUp 0.5s ease ${0.15 + idx * 0.07}s both`,
                background: isHovered ? "rgba(74,144,217,0.15)" : "rgba(255,255,255,0.05)",
                border:`2px solid ${isHovered ? "#4A90D9" : "rgba(255,255,255,0.08)"}`,
                borderRadius:16,
                padding:"20px 28px",
                cursor:"pointer",
                textAlign:"center",
                transition:"all 0.2s ease",
                transform: isHovered ? "translateY(-4px)" : "none",
                boxShadow: isHovered ? `0 12px 32px rgba(74,144,217,0.2)` : "none",
                minWidth:140,
              }}
            >
              <div style={{
                width:52, height:52, borderRadius:"50%",
                background:`linear-gradient(135deg, ${color}, ${color}99)`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#fff", fontSize:18, fontWeight:700,
                margin:"0 auto 12px",
                boxShadow:`0 4px 16px ${color}44`,
              }}>{initials}</div>
              <div style={{
                fontSize:14, fontWeight:600, color:"#FFFFFF",
                fontFamily:"'Fraunces', serif",
              }}>{acc.name}</div>
              <div style={{
                fontSize:10, color:"#4A90D9", marginTop:4,
                textTransform:"uppercase", letterSpacing:"1px",
              }}>View My Tasks →</div>
            </div>
          );
        })}
      </div>

      {/* Admin section */}
      <div style={{
        animation:"fadeUp 0.5s ease 0.5s both",
        borderTop:"1px solid rgba(255,255,255,0.06)",
        paddingTop:32, textAlign:"center", width:"100%", maxWidth:360,
      }}>
        {!adminMode ? (
          <button
            onClick={() => setAdminMode(true)}
            style={{
              background:"none",
              border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:8, padding:"8px 20px",
              color:"#4D5E70", cursor:"pointer",
              fontSize:12, fontFamily:"'DM Mono', monospace",
              transition:"all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="#4A90D9"; e.currentTarget.style.color="#4A90D9"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.color="#4D5E70"; }}
          >🔐 Admin Access</button>
        ) : (
          <div style={{display:"flex", flexDirection:"column", gap:10, alignItems:"center"}}>
            <div style={{fontSize:12, color:"#8896A5", marginBottom:4}}>Enter admin password</div>
            <input
              type="password"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdminSubmit()}
              placeholder="Password"
              autoFocus
              style={{
                background:"rgba(255,255,255,0.06)",
                border:`1px solid ${adminError ? "#E74C3C" : "rgba(255,255,255,0.12)"}`,
                borderRadius:8, padding:"10px 16px",
                color:"#FFFFFF", fontSize:13,
                fontFamily:"'DM Mono', monospace",
                outline:"none", width:220,
                transition:"border-color 0.2s",
              }}
            />
            {adminError && (
              <div style={{fontSize:11, color:"#E74C3C"}}>Wrong password</div>
            )}
            <div style={{display:"flex", gap:8}}>
              <button
                onClick={handleAdminSubmit}
                style={{
                  background:"#4A90D9", border:"none",
                  borderRadius:8, padding:"8px 20px",
                  color:"#fff", cursor:"pointer",
                  fontSize:12, fontFamily:"'DM Mono', monospace",
                  fontWeight:600,
                }}
              >Enter</button>
              <button
                onClick={() => { setAdminMode(false); setAdminPass(""); }}
                style={{
                  background:"none",
                  border:"1px solid rgba(255,255,255,0.12)",
                  borderRadius:8, padding:"8px 16px",
                  color:"#8896A5", cursor:"pointer",
                  fontSize:12, fontFamily:"'DM Mono', monospace",
                }}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────
function Avatar({ name }) {
  const initials = name.slice(0,2).toUpperCase();
  const colors   = ["#4A90D9","#E74C3C","#27AE60","#9B59B6","#F39C12","#1ABC9C"];
  const color    = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width:28, height:28, borderRadius:"50%", background:color,
      display:"flex", alignItems:"center", justifyContent:"center",
      color:"#fff", fontSize:11, fontWeight:700, flexShrink:0,
    }}>{initials}</div>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, onDragStart, onClick }) {
  const prio    = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const dueInfo = getDueStatus(task.dueDate);
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task)}
      onClick={() => onClick(task)}
      style={{
        background:"#FFFFFF",
        border:"1px solid #E8ECF0",
        borderLeft:`4px solid ${prio.dot}`,
        borderRadius:10, padding:"14px 14px 12px",
        marginBottom:10, cursor:"grab",
        transition:"all 0.18s ease",
        boxShadow:"0 1px 4px rgba(0,0,0,0.06)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{
        display:"inline-flex", alignItems:"center", gap:5,
        background:prio.bg, color:prio.text,
        borderRadius:20, padding:"2px 8px",
        fontSize:10, fontWeight:600, marginBottom:8,
        textTransform:"uppercase", letterSpacing:"0.5px",
      }}>
        <div style={{width:5,height:5,borderRadius:"50%",background:prio.dot}}/>
        {task.priority}
      </div>

      <div style={{
        fontSize:14, fontWeight:600, color:"#1A2332",
        lineHeight:1.4, marginBottom:6,
        fontFamily:"'Fraunces', serif",
      }}>{task.task || "Untitled Task"}</div>

      {task.client && (
        <div style={{fontSize:12, color:"#6B7A8D", marginBottom:8}}>
          🏢 {task.client}
        </div>
      )}

      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8}}>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          {task.assignedTo && <Avatar name={task.assignedTo}/>}
          <span style={{fontSize:11, color:"#8896A5"}}>{task.assignedTo || "Unassigned"}</span>
        </div>
        {dueInfo && (
          <div style={{
            background:dueInfo.color+"18", color:dueInfo.color,
            borderRadius:20, padding:"2px 8px",
            fontSize:10, fontWeight:600,
          }}>{dueInfo.label}</div>
        )}
      </div>
    </div>
  );
}

// ─── COLUMN ──────────────────────────────────────────────────────────────────
function Column({ col, tasks, onDragStart, onDrop, onCardClick }) {
  const [isOver, setIsOver] = useState(false);
  return (
    <div style={{flex:"0 0 280px", minWidth:280, display:"flex", flexDirection:"column"}}>
      <div style={{
        background:"#FFFFFF",
        border:"1px solid #E8ECF0",
        borderTop:`3px solid ${col.color}`,
        borderRadius:"10px 10px 0 0",
        padding:"14px 16px",
        display:"flex", alignItems:"center", gap:8,
      }}>
        <span style={{fontSize:16}}>{col.icon}</span>
        <span style={{
          fontSize:12, fontWeight:700, color:"#1A2332",
          textTransform:"uppercase", letterSpacing:"0.8px", flex:1,
        }}>{col.label}</span>
        <div style={{
          background:col.color+"22", color:col.color,
          borderRadius:20, padding:"2px 10px",
          fontSize:12, fontWeight:700,
        }}>{tasks.length}</div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={e => { setIsOver(false); onDrop(e, col.id); }}
        style={{
          flex:1, minHeight:400,
          background: isOver ? col.color+"10" : "#F4F6F9",
          border:"1px solid",
          borderTop:"none",
          borderColor: isOver ? col.color : "#E8ECF0",
          borderRadius:"0 0 10px 10px",
          padding:"12px 10px",
          transition:"all 0.15s ease",
        }}
      >
        {tasks.length === 0 && (
          <div style={{
            textAlign:"center", color:"#B0BBC8",
            fontSize:12, marginTop:40,
          }}>Drop tasks here</div>
        )}
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onDragStart={onDragStart} onClick={onCardClick}/>
        ))}
      </div>
    </div>
  );
}

// ─── TASK MODAL ───────────────────────────────────────────────────────────────
function TaskModal({ task, onClose }) {
  if (!task) return null;
  const prio = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(10,15,25,0.6)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, backdropFilter:"blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#FFFFFF", borderRadius:16,
        width:"90%", maxWidth:520,
        boxShadow:"0 24px 64px rgba(0,0,0,0.2)", overflow:"hidden",
      }}>
        <div style={{
          background:`linear-gradient(135deg, ${prio.dot}22, ${prio.dot}06)`,
          borderBottom:"1px solid #E8ECF0",
          padding:"20px 24px",
          display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        }}>
          <div>
            <span style={{
              background:prio.bg, color:prio.text,
              padding:"2px 10px", borderRadius:20,
              fontSize:10, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"1px",
            }}>{task.priority} priority</span>
            <div style={{
              fontSize:18, fontWeight:700, color:"#1A2332",
              fontFamily:"'Fraunces', serif", lineHeight:1.3, marginTop:8,
            }}>{task.task}</div>
          </div>
          <button onClick={onClose} style={{
            background:"none", border:"none", cursor:"pointer",
            fontSize:20, color:"#8896A5", padding:"4px 8px",
          }}>✕</button>
        </div>

        <div style={{padding:"20px 24px"}}>
          {[
            ["👤 Assigned To", task.assignedTo || "Unassigned"],
            ["🏢 Client",      task.client     || "—"],
            ["📅 Due Date",    task.dueDate    || "—"],
            ["📌 Status",      task.status.replace(/_/g," ")],
            ["📂 Type",        task.entryType  || "—"],
            ["👁 Posted By",   task.postedBy   || "—"],
          ].map(([label, value]) => (
            <div key={label} style={{
              display:"flex", gap:12, marginBottom:12, fontSize:13,
            }}>
              <span style={{color:"#8896A5", minWidth:120, fontSize:12}}>{label}</span>
              <span style={{
                color:"#1A2332", fontWeight:500,
                textTransform: label.includes("Status") ? "capitalize" : "none",
              }}>{value}</span>
            </div>
          ))}

          {task.sourceMsg && (
            <div style={{
              background:"#F4F6F9", borderRadius:10,
              padding:"12px 14px", marginTop:8,
              borderLeft:"3px solid #4A90D9",
            }}>
              <div style={{
                fontSize:10, color:"#8896A5",
                textTransform:"uppercase", letterSpacing:"1px", marginBottom:6,
              }}>💬 Original Message</div>
              <div style={{fontSize:12, color:"#3D4F63", lineHeight:1.6}}>
                "{task.sourceMsg}"
              </div>
            </div>
          )}

          {task.permalink && (
            <a href={task.permalink} target="_blank" rel="noreferrer" style={{
              display:"inline-flex", alignItems:"center", gap:6,
              marginTop:14, color:"#4A90D9",
              fontSize:12, textDecoration:"none", fontWeight:600,
            }}>🔗 Jump to Slack message →</a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN BOARD ───────────────────────────────────────────────────────────────
function Board({ currentUser, accountants, onLogout }) {
  const isAdmin = currentUser === "admin";

  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [modalTask,   setModalTask]   = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchSheet("Mastersheet");
      setTasks(parseMasterRows(rows));
      setLastUpdated(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter tasks — admin sees all, accountant sees only their own
  const visibleTasks = isAdmin
    ? tasks
    : tasks.filter(t => t.assignedTo?.toLowerCase() === currentUser.toLowerCase());

  const tasksByColumn = (colId) =>
    visibleTasks.filter(t => (t.status || "todo") === colId);

  const totalTasks   = visibleTasks.length;
  const doneTasks    = visibleTasks.filter(t => t.status === "done").length;
  const overdueTasks = visibleTasks.filter(t => {
    if (t.status === "done" || !t.dueDate) return false;
    const due = new Date(t.dueDate); due.setHours(0,0,0,0);
    const now = new Date();          now.setHours(0,0,0,0);
    return due < now;
  }).length;

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.status === newStatus) {
      setDraggedTask(null); return;
    }

    setTasks(prev => prev.map(t =>
      t.id === draggedTask.id ? { ...t, status: newStatus } : t
    ));

    setSaving(true);
    try {
      await updateStatus(draggedTask.id, newStatus, draggedTask.assignedTo);
      setLastUpdated(new Date());
    } catch {
      setTasks(prev => prev.map(t =>
        t.id === draggedTask.id ? { ...t, status: draggedTask.status } : t
      ));
      alert("Failed to update. Please try again.");
    } finally {
      setSaving(false);
      setDraggedTask(null);
    }
  };

  const avatarColors = ["#4A90D9","#E74C3C","#27AE60","#9B59B6","#F39C12","#1ABC9C"];
  const userColor    = avatarColors[currentUser.charCodeAt(0) % avatarColors.length];

  return (
    <div style={{minHeight:"100vh", background:"#EEF1F5", fontFamily:"'DM Mono', monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:#C5CDD8; border-radius:3px; }
      `}</style>

      {/* Header */}
      <div style={{
        background:"#FFFFFF", borderBottom:"1px solid #E0E5EC",
        padding:"0 32px", position:"sticky", top:0, zIndex:100,
        boxShadow:"0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          height:64, maxWidth:1400, margin:"0 auto",
        }}>
          {/* Logo + user */}
          <div style={{display:"flex", alignItems:"center", gap:16}}>
            <div style={{
              width:36, height:36, borderRadius:10,
              background:"linear-gradient(135deg, #1A2332, #4A90D9)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18,
            }}>📊</div>
            <div>
              <div style={{
                fontSize:15, fontWeight:700, color:"#1A2332",
                fontFamily:"'Fraunces', serif",
              }}>AccountantBot</div>
              <div style={{fontSize:10, color:"#8896A5", letterSpacing:"0.5px"}}>TASK BOARD</div>
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap:8,
              background:"#F4F6F9", borderRadius:20,
              padding:"4px 12px 4px 6px", marginLeft:8,
            }}>
              <div style={{
                width:24, height:24, borderRadius:"50%",
                background:isAdmin ? "#1A2332" : userColor,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#fff", fontSize:10, fontWeight:700,
              }}>
                {isAdmin ? "A" : currentUser.slice(0,2).toUpperCase()}
              </div>
              <span style={{fontSize:12, color:"#4D5E70", fontWeight:600}}>
                {isAdmin ? "Admin" : currentUser}
              </span>
              {isAdmin && (
                <span style={{
                  background:"#1A2332", color:"#fff",
                  fontSize:9, padding:"1px 6px", borderRadius:10,
                  fontWeight:700, letterSpacing:"0.5px",
                }}>ADMIN</span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{display:"flex", gap:28, alignItems:"center"}}>
            {[
              ["Total",   totalTasks,   "#4A90D9"],
              ["Done",    doneTasks,    "#27AE60"],
              ["Overdue", overdueTasks, "#E74C3C"],
            ].map(([label, count, color]) => (
              <div key={label} style={{textAlign:"center"}}>
                <div style={{fontSize:20, fontWeight:700, color, fontFamily:"'Fraunces', serif"}}>
                  {count}
                </div>
                <div style={{fontSize:9, color:"#8896A5", textTransform:"uppercase", letterSpacing:"0.5px"}}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            {saving && <span style={{fontSize:11, color:"#F39C12"}}>💾 Saving...</span>}
            {lastUpdated && !saving && (
              <span style={{fontSize:11, color:"#B0BBC8"}}>
                ↻ {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button onClick={loadData} style={{
              background:"#F4F6F9", border:"1px solid #E0E5EC",
              borderRadius:8, padding:"6px 14px",
              fontSize:12, cursor:"pointer", color:"#4A90D9", fontWeight:600,
            }}>↺ Refresh</button>
            <button onClick={onLogout} style={{
              background:"none", border:"1px solid #E0E5EC",
              borderRadius:8, padding:"6px 14px",
              fontSize:12, cursor:"pointer", color:"#8896A5",
            }}>← Switch User</button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div style={{padding:"28px 32px", maxWidth:1400, margin:"0 auto"}}>
        {loading && (
          <div style={{textAlign:"center", padding:"80px 0", color:"#8896A5"}}>
            <div style={{fontSize:32, marginBottom:12}}>⏳</div>
            Loading your tasks...
          </div>
        )}

        {error && (
          <div style={{
            background:"#FFE8E8", border:"1px solid #E74C3C33",
            borderRadius:12, padding:"20px 24px", color:"#C0392B", fontSize:13,
          }}>
            <strong>Error:</strong> {error}
            <button onClick={loadData} style={{
              marginLeft:16, background:"#E74C3C", color:"#fff",
              border:"none", borderRadius:6, padding:"4px 14px",
              cursor:"pointer", fontSize:12,
            }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div style={{
            display:"flex", gap:16, overflowX:"auto",
            paddingBottom:16, alignItems:"flex-start",
          }}>
            {COLUMNS.map(col => (
              <Column
                key={col.id}
                col={col}
                tasks={tasksByColumn(col.id)}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onCardClick={setModalTask}
              />
            ))}
          </div>
        )}

        {!loading && !error && visibleTasks.length === 0 && (
          <div style={{textAlign:"center", padding:"60px 0", color:"#B0BBC8"}}>
            <div style={{fontSize:40, marginBottom:12}}>📭</div>
            <div style={{
              fontSize:16, fontFamily:"'Fraunces', serif",
              color:"#8896A5", marginBottom:6,
            }}>
              {isAdmin ? "No tasks yet" : `No tasks assigned to ${currentUser} yet`}
            </div>
            <div style={{fontSize:12}}>
              Tasks appear here once accountants post schedules in Slack.
            </div>
          </div>
        )}
      </div>

      <TaskModal task={modalTask} onClose={() => setModalTask(null)}/>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [accountants,  setAccountants]  = useState([]);
  const [currentUser,  setCurrentUser]  = useState(null);
  const [configLoading,setConfigLoading]= useState(true);

  useEffect(() => {
    fetchSheet("config")
      .then(rows => setAccountants(parseConfigRows(rows).filter(a => a.active)))
      .catch(console.error)
      .finally(() => setConfigLoading(false));
  }, []);

  if (configLoading) return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"#0F1724", color:"#8896A5", fontFamily:"'DM Mono', monospace",
    }}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32, marginBottom:12}}>⏳</div>
        Loading...
      </div>
    </div>
  );

  if (!currentUser) return (
    <SelectorScreen accountants={accountants} onSelect={setCurrentUser}/>
  );

  return (
    <Board
      currentUser={currentUser}
      accountants={accountants}
      onLogout={() => setCurrentUser(null)}
    />
  );
}
