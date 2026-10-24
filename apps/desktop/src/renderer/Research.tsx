import React,{useEffect,useMemo,useState} from 'react';
import type {Status} from '../../../../packages/shared/src/protocol';
import {DEFAULT_RESEARCH_FILTERS,filterResearchPeers,RESEARCH_SEARCH_LIMIT} from '../../../../packages/shared/src/research';
import type {ResearchAction,ResearchPeer,ResearchResponse,ResearchSnapshot} from '../../../../packages/shared/src/research';
const empty:ResearchSnapshot={accountId:'',records:[],runs:[],totalSaved:0};
const labels:Record<string,string>={user:'Cá nhân',bot:'Bot',group:'Nhóm',channel:'Kênh',personalized:'Cá nhân hóa',discovery:'Tìm kiếm Telegram',exact:'Tra chính xác',new:'Mới phát hiện',seen:'Đã thấy',changed:'Thông tin thay đổi',not_public:'Không có username'};
export function Research({status,busy,onSearch}:{status:Status;busy:boolean;onSearch:(query:string,exact:boolean)=>void}){
 const [query,setQuery]=useState(''),[exact,setExact]=useState(false),[tab,setTab]=useState<'results'|'saved'|'history'>('results');
 const [results,setResults]=useState<ResearchPeer[]>([]),[snapshot,setSnapshot]=useState(empty),[selected,setSelected]=useState<Set<string>>(new Set());
 const [kind,setKind]=useState('all'),[source,setSource]=useState('all'),[publicOnly,setPublicOnly]=useState(DEFAULT_RESEARCH_FILTERS.publicOnly),[contains,setContains]=useState('');
 const [notice,setNotice]=useState(''),[working,setWorking]=useState(false),[editing,setEditing]=useState<ResearchPeer|null>(null);
 async function request(action:ResearchAction):Promise<ResearchResponse>{
  const reply=await window.spike.research(action);
  if(!reply.ok)throw Error(reply.error);
  if(reply.snapshot)setSnapshot(reply.snapshot);
  return reply;
 }
 async function refresh(){try{await request({type:'list'});}catch{setNotice('Không đọc được dữ liệu nghiên cứu trên máy.');}}
 useEffect(()=>{setResults([]);setSelected(new Set());setEditing(null);void refresh();},[status.userIdentity?.id]);
 useEffect(()=>{
  if(status.state==='searching'){setResults([]);setSelected(new Set());setTab('results');}
  if(status.researchResults){setResults(status.researchResults);setSelected(new Set());void refresh();}
 },[status]);
 useEffect(()=>{setSelected(new Set());setEditing(null);},[tab,kind,source,publicOnly,contains,status.userIdentity?.id]);
 const data=tab==='saved'?snapshot.records:results;
 const filtered=useMemo(()=>filterResearchPeers(data,{kind,source,publicOnly,contains}),[data,kind,source,publicOnly,contains]);
 const eligible=filtered.filter(p=>p.username);
 const keys=[...selected].filter(key=>eligible.some(p=>p.key===key));
 async function perform(action:ResearchAction){
  setWorking(true);setNotice('');
  try{const reply=await request(action);if(reply.ok){if(reply.cancelled)setNotice('Đã hủy xuất file.');else if(reply.fileName)setNotice(`Đã xuất ${keys.length} hồ sơ: ${reply.fileName}`);else if(action.type==='save'){setResults(previous=>previous.map(p=>action.keys.includes(p.key)?{...p,saved:true}:p));setNotice('Đã lưu hồ sơ.');}else if(action.type==='delete'){setResults(previous=>previous.filter(p=>!action.keys.includes(p.key)));setNotice('Đã xóa hồ sơ và lịch sử quan sát của hồ sơ đã chọn.');}else setNotice('Đã lưu ghi chú.');}setSelected(new Set());setEditing(null);}catch(error){setNotice(error instanceof Error?error.message:'Không thực hiện được thao tác.');}finally{setWorking(false);}
 }
 return <>
 <section><div className="section-title"><div><h2>Nghiên cứu ngành</h2><p>Mẫu dữ liệu từ tìm kiếm Telegram, không đại diện toàn bộ ngành. Không có tính năng gửi tin trong module này.</p></div><span className="badge">DỮ LIỆU LƯU TRÊN MÁY</span></div>
 <form className="search-form" onSubmit={e=>{e.preventDefault();setNotice('');onSearch(query,exact);}}>
 <label>Chủ đề hoặc username<input required minLength={3} maxLength={80} value={query} placeholder="seo, guest post, công nghệ…" onChange={e=>setQuery(e.target.value)}/></label>
 <label>Kiểu tìm<select value={String(exact)} onChange={e=>setExact(e.target.value==='true')}><option value="false">Tìm theo từ khóa</option><option value="true">Tra username chính xác</option></select></label>
 <button disabled={busy||working||!status.userConnected}>Tìm kiếm</button></form>
 {!status.userConnected&&<p>Vào tab Tài khoản và bấm Khôi phục phiên đã lưu để tìm kiếm. Hồ sơ đã lưu vẫn có thể xem khi chưa kết nối.</p>}
 <p className="hint">Một yêu cầu chủ động mỗi lần tìm, giới hạn yêu cầu {RESEARCH_SEARCH_LIMIT} kết quả (không bảo đảm đủ 100 username). Kết quả có thể ít hơn hoặc lặp lại; không có quét tự động. “Tìm kiếm Telegram” là nguồn API, không chứng minh chưa từng tương tác.</p>
 </section>
 <div className="stats"><section><strong>{snapshot.totalSaved}</strong><span>Hồ sơ đã lưu</span></section><section><strong>{results.length}</strong><span>Kết quả lần này</span></section><section><strong>{results.filter(p=>p.comparison==='new').length}</strong><span>Mới trong dữ liệu local</span></section><section><strong>{results.filter(p=>p.comparison==='changed').length}</strong><span>Thông tin thay đổi</span></section></div>
 <section><div className="tabs"><button className={tab==='results'?'active':''} onClick={()=>setTab('results')}>Kết quả tìm kiếm</button><button className={tab==='saved'?'active':''} onClick={()=>setTab('saved')}>Hồ sơ đã lưu</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử tìm kiếm</button></div>
 {tab!=='history'?<>
 <div className="filters"><label>Loại<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Tất cả</option>{['user','bot','group','channel'].map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label><label>Nguồn<select value={source} onChange={e=>setSource(e.target.value)}><option value="all">Tất cả</option>{['personalized','discovery','exact'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label><label>Username chứa<input value={contains} onChange={e=>setContains(e.target.value)} placeholder="Lọc kết quả đang có"/></label><label className="check"><input type="checkbox" checked={publicOnly} onChange={e=>setPublicOnly(e.target.checked)}/>Chỉ có username</label></div>
 <p className="hint">Trong {data.length} kết quả: {data.filter(p=>p.username).length} có username · {data.filter(p=>!p.username).length} không có username · {data.filter(p=>p.sources.includes('personalized')).length} thuộc nguồn cá nhân hóa · {data.filter(p=>p.sources.includes('discovery')).length} thuộc nguồn tìm kiếm Telegram. Một hồ sơ có thể thuộc cả hai nguồn.</p>
 {tab==='results'&&data.length>0&&!data.some(p=>p.sources.includes('discovery')||p.sources.includes('exact'))&&<p className="notice">Telegram chưa trả kết quả ở nguồn “Tìm kiếm Telegram” cho truy vấn này. Tăng giới hạn không bảo đảm có thêm hồ sơ. Nhóm không có username vẫn được hiển thị, nhưng không thể xuất thành username.</p>}
 <div className="toolbar"><span>Hiển thị {filtered.length}/{data.length} · Bị lọc {data.length-filtered.length} · Chọn {keys.length}</span>{tab==='results'?<button disabled={!keys.length||working||busy} onClick={()=>void perform({type:'save',keys})}>Lưu hồ sơ đã chọn</button>:<button className="secondary" disabled={!keys.length||working} onClick={()=>{if(confirm('Xóa hồ sơ đã chọn và các quan sát đã lưu của chúng trên máy?'))void perform({type:'delete',keys});}}>Xóa đã chọn</button>}<button disabled={!keys.length||working} onClick={()=>void perform({type:'export',scope:tab,format:'xlsx',keys})}>Xuất Excel (.xlsx)</button><button className="secondary" disabled={!keys.length||working} onClick={()=>void perform({type:'export',scope:tab,format:'csv',keys})}>Xuất CSV</button></div>
 {notice&&<p role="status" className="notice">{notice}</p>}
 <div className="table-wrap"><table><thead><tr><th><input aria-label="Chọn tất cả hồ sơ đang hiển thị có username" type="checkbox" disabled={!eligible.length} checked={eligible.length>0&&eligible.every(p=>selected.has(p.key))} onChange={e=>setSelected(e.target.checked?new Set(eligible.map(p=>p.key)):new Set())}/></th><th>Hồ sơ</th><th>Username / ID</th><th>Nguồn</th><th>Đối chiếu</th><th>Chủ đề / Ghi chú</th></tr></thead><tbody>{filtered.map(p=><tr key={p.key}><td><input aria-label={`Chọn ${p.username??p.name}`} disabled={!p.username||working} type="checkbox" checked={selected.has(p.key)} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(p.key);else next.delete(p.key);return next;})}/></td><td><strong>{p.name||'Không có tên'}</strong><small>{labels[p.kind]} {p.saved?'· Đã lưu':''}</small></td><td>{p.username?'@'+p.username:'Không có username'}<small>{p.key}</small></td><td>{p.sources.map(s=><span key={s} className="chip">{labels[s]}</span>)}</td><td>{labels[p.comparison]}<small>{new Date(p.lastSeen).toLocaleString('vi-VN')}</small></td><td>{p.category||'Chưa phân loại'}<small>{p.note.slice(0,100)}</small>{tab==='saved'&&<button className="small secondary" onClick={()=>setEditing({...p})}>Ghi chú</button>}</td></tr>)}</tbody></table></div>
 {!filtered.length&&<p>Chưa có hồ sơ phù hợp. Hãy tìm kiếm hoặc điều chỉnh bộ lọc.</p>}
 {tab==='saved'&&snapshot.totalSaved>5000&&<p>Hiển thị 5.000 hồ sơ lưu gần nhất trong bản này.</p>}
 {editing&&<form className="editor" onSubmit={e=>{e.preventDefault();void perform({type:'note',key:editing.key,note:editing.note,tags:editing.tags,category:editing.category});}}><h3>Ghi chú @{editing.username}</h3><label>Chủ đề<input maxLength={150} value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></label><label>Nhãn (phân cách bằng dấu phẩy)<input maxLength={500} value={editing.tags} onChange={e=>setEditing({...editing,tags:e.target.value})}/></label><label>Ghi chú<textarea rows={3} maxLength={4000} value={editing.note} onChange={e=>setEditing({...editing,note:e.target.value})}/></label><button disabled={working}>Lưu ghi chú</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Đóng</button></form>}
 </>:<><p>100 lần tìm thành công gần nhất. “Mới” được so với mọi quan sát trước của cùng tài khoản trên máy, không chỉ lần tìm cùng từ khóa.</p><div className="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Truy vấn</th><th>Kiểu</th><th>Trả về</th><th>Có username</th><th>Mới</th><th>Thay đổi</th></tr></thead><tbody>{snapshot.runs.map(run=><tr key={run.id}><td>{new Date(run.at).toLocaleString('vi-VN')}</td><td>{run.query}</td><td>{run.exact?'Chính xác':'Từ khóa'}</td><td>{run.returned}</td><td>{run.publicCount}</td><td>{run.newCount}</td><td>{run.changedCount}</td></tr>)}</tbody></table></div></>}
 </section>
 </>;
}
