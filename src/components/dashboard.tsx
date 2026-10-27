"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Bill = { id:number; billDate:string|null; periodFrom:string|null; periodTo:string|null; ac:number|null; other:number|null; total:number|null; avgPerDay:number|null; generation:number|null; transmission:number|null; systemLoss:number|null; ancillary:number|null; bill:number|null; pricePerKwh:number|null; comment:string|null };
type AcReading = { id:number; room:string; from:string; to:string; kwh:number; source:string };
type MeterReading = { id:number; date:string; reading:number };
type Data = { user:{id:number;username:string}; bills:Bill[]; ac:AcReading[]; meters:MeterReading[] };
type EntryType = "bill" | "ac" | "meter";

const money=(v:number|null|undefined)=>v==null?"—":new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const quantity=(v:number|null|undefined,d=1)=>v==null?"—":new Intl.NumberFormat("en-PH",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const dateLabel=(value:string|null|undefined)=>value?new Date(`${value}T12:00:00`).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"—";
const periodLabel=(row:Bill)=>`${dateLabel(row.periodFrom)} – ${dateLabel(row.periodTo)}`;

export default function Dashboard({ username }: { username:string }) {
  const [data,setData]=useState<Data|null>(null),[view,setView]=useState("overview"),[range,setRange]=useState("12"),[metric,setMetric]=useState<"total"|"bill"|"pricePerKwh">("total");
  const [entryType,setEntryType]=useState<EntryType|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[theme,setTheme]=useState("light");
  const [provider,setProvider]=useState("openai"),[model,setModel]=useState(""),[apiKey,setApiKey]=useState(""),[consent,setConsent]=useState(false),[analysis,setAnalysis]=useState(""),[analysisBusy,setAnalysisBusy]=useState(false);

  async function loadData() {
    const response=await fetch("/api/data",{cache:"no-store"});
    if(response.status===401){window.location.assign("/login");return}
    const json=await response.json();if(!response.ok)throw new Error(json.error??"Could not load dashboard data.");setData(json);
  }
  useEffect(()=>{void loadData().catch(()=>setNotice("Could not load your dashboard. Refresh the page to try again."));const saved=localStorage.getItem("current-theme");if(saved)setTheme(saved)},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("current-theme",theme)},[theme]);

  const bills=useMemo(()=>[...(data?.bills??[])].sort((a,b)=>(b.billDate??"").localeCompare(a.billDate??"")),[data]);
  const latest=bills[0],prior=bills[1];
  const chartBills=useMemo(()=>range==="all"?bills.slice().reverse():bills.slice(0,Number(range)).reverse(),[bills,range]);
  const maxValues=useMemo(()=>{
    const keys:(keyof Bill)[]=["total","ac","other","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh"];
    return Object.fromEntries(keys.map(k=>[k,Math.max(-Infinity,...bills.map(b=>typeof b[k]==="number"?b[k] as number:-Infinity))])) as Partial<Record<keyof Bill,number>>;
  },[bills]);
  const chartPoints=useMemo(()=>{
    const points=chartBills.filter(row=>typeof row[metric]==="number");
    const vals=points.map(row=>row[metric]).filter((v):v is number=>typeof v==="number");
    if(!vals.length)return [];
    const min=Math.min(...vals)*.9,max=Math.max(...vals)*1.08,span=max-min||1;
    return points.map((row,index)=>({row,x:44+(points.length<2?306:index*612/(points.length-1)),y:15+(165-(Number(row[metric])-min)/span*165)}));
  },[chartBills,metric]);

  function flash(message:string){setNotice(message);window.setTimeout(()=>setNotice(""),2800)}
  async function signOut(){await fetch("/api/auth/logout",{method:"POST"});window.location.assign("/login")}
  async function saveEntry(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!entryType)return;setBusy(true);
    try{
      const raw=Object.fromEntries(new FormData(event.currentTarget).entries());
      const numberFields=new Set(["total","ac","other","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh","kwh","reading"]);
      const row=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,numberFields.has(key)?(value===""?null:Number(value)):value]));
      const response=await fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:entryType,row})});
      const result=await response.json();if(response.status===401){window.location.assign("/login");return}if(!response.ok)throw new Error(result.error??"Could not save entry.");
      setData({user:data!.user,bills:result.bills,ac:result.ac,meters:result.meters});setEntryType(null);flash("Entry saved to SQLite");
    }catch(error){flash(error instanceof Error?error.message:"Could not save entry.")}finally{setBusy(false)}
  }
  async function analyze(){
    if(!consent){flash("Confirm the data sharing notice before analysis.");return}
    if(!model.trim()||!apiKey.trim()){flash("Enter a model ID and API key.");return}
    setAnalysisBusy(true);setAnalysis("");
    try{
      const response=await fetch("/api/insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,model:model.trim(),apiKey:apiKey.trim(),consent})});
      const result=await response.json();if(response.status===401){window.location.assign("/login");return}if(!response.ok)throw new Error(result.error??"Analysis failed.");setAnalysis(`${result.provider} · ${result.model}\n\n${result.answer}`);setApiKey("");
    }catch(error){setAnalysis(error instanceof Error?error.message:"Analysis failed.")}finally{setAnalysisBusy(false);setApiKey("");setConsent(false)}
  }
  function exportCsv(){
    const fields:(keyof Bill)[]=["billDate","periodFrom","periodTo","total","ac","other","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh","comment"];
    const lines=[fields.join(","),...bills.map(row=>fields.map(key=>`"${String(row[key]??"").replaceAll('"','""')}"`).join(","))];
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));link.download="electricity-bill-history.csv";link.click();URL.revokeObjectURL(link.href);
  }

  if(!data)return <main className="loading-screen"><div className="logo">ϟ</div><p>Loading your electricity records…</p></main>;
  const usageDelta=latest?.total!=null&&prior?.total!=null?latest.total-prior.total:null;
  const billChange=latest?.bill!=null&&prior?.bill?((latest.bill-prior.bill)/prior.bill)*100:null;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="logo">ϟ</span>current<span className="brand-dot">.</span></a>
      <div className="side-label">Home energy</div>
      <nav className="nav-list">{[["overview","▦","Overview"],["bills","▤","Bill history"],["ac","ϟ","AC tracking"],["meter","◉","Meter readings"]].map(([id,icon,label])=><button key={id} onClick={()=>setView(id)} className={view===id?"active":""}><span>{icon}</span>{label}</button>)}</nav>
      <div className="source-note"><b>Workbook history</b>Imported from your electricity workbook. New entries are stored in the app’s SQLite database.</div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">Electricity dashboard · MECO</div><h1>{({overview:"Your home, in watts.",bills:"Bills tell the bigger story.",ac:"Follow every cool room.",meter:"Every unit, accounted for."} as Record<string,string>)[view]}</h1></div><div className="top-actions"><button className="btn" onClick={exportCsv}>↓ Export CSV</button><button className="btn" onClick={()=>setTheme(theme==="light"?"dark":"light")}>{theme==="light"?"☾":"☼"}</button><button className="btn user-button">{username}</button><button className="btn" onClick={signOut}>Log out</button>{view!=="ac"&&<button className="btn primary" onClick={()=>setEntryType(view==="meter"?"meter":"bill")}>＋ Add entry</button>}</div></header>

      {view==="overview"&&<>
        <div className="period-controls"><span>Bill history</span>{["6","12","all"].map(v=><button key={v} className={range===v?"selected":""} onClick={()=>setRange(v)}>{v==="all"?"All time":`${v} months`}</button>)}<small>{range==="all"?"All recorded history":`Most recent ${range} billing cycles`}</small></div>
        <div className="metric-grid">
          <Metric title="Latest bill" value={money(latest?.bill)} caption={`Billing date ${dateLabel(latest?.billDate)}`} icon="▤" />
          <Metric title="Total usage" value={latest?.total==null?"—":`${quantity(latest.total,0)} kWh`} caption={latest?periodLabel(latest):"No billing cycles yet"} icon="ϟ" />
          <Metric title="Average per day" value={latest?.avgPerDay==null?"—":`${quantity(latest.avgPerDay,1)} kWh`} caption="Average household use" icon="◷" />
          <Metric title="Price per kWh" value={latest?.pricePerKwh==null?"—":money(latest.pricePerKwh)} caption={billChange==null?"Blended rate from bill":`${billChange>=0?"+":""}${billChange.toFixed(1)}% bill vs prior cycle`} icon="₱" />
        </div>
        <div className="content-grid chart-grid">
          <section className="card"><div className="card-heading"><div><h2>Usage & bill trend</h2><p>Hover over a point to see its value.</p></div><div className="segmented">{([["total","kWh"],["bill","Bill"],["pricePerKwh","₱/kWh"]] as const).map(([id,label])=><button className={metric===id?"active":""} key={id} onClick={()=>setMetric(id)}>{label}</button>)}</div></div>
            <div className="chart-wrap"><svg className="trend-chart" viewBox="0 0 700 220" role="img" aria-label="Bill history trend">{[0,1,2,3].map(i=><line key={i} className="gridline" x1="44" x2="688" y1={20+i*55} y2={20+i*55}/>)}{chartPoints.length>1&&<polyline className="trend-line" points={chartPoints.map(p=>`${p.x},${p.y}`).join(" ")}/>}{chartPoints.map((point,i)=><g key={point.row.id}><circle className="trend-dot" cx={point.x} cy={point.y} r="5"><title>{dateLabel(point.row.billDate)} · {metric==="bill"?money(point.row.bill):metric==="total"?`${quantity(point.row.total,1)} kWh`:`${money(point.row.pricePerKwh)} / kWh`}</title></circle>{(i===0||i===chartPoints.length-1||i%Math.max(1,Math.ceil(chartPoints.length/6))===0)&&<text className="chart-label" x={point.x} y="211" textAnchor="middle">{point.row.billDate?new Date(`${point.row.billDate}T12:00:00`).toLocaleDateString("en-PH",{month:"short",year:"2-digit"}):""}</text>}</g>)}</svg></div><div className="chart-legend"><span>●</span>{metric==="total"?"Household usage (kWh)":metric==="bill"?"Electricity bill (₱)":"Blended price (₱/kWh)"}</div>
          </section>
          <section className="card"><div className="card-heading"><div><h2>What shaped this bill</h2><p>{latest?`${dateLabel(latest.billDate)} · ${periodLabel(latest)}`:"No bill recorded"}</p></div><span className="badge">Latest bill</span></div><RateRows bill={latest}/><div className="insight"><span>✦</span><p>Compare the blended rate and individual charge lines before attributing a bill change to appliance use.</p></div></section>
        </div>
        <div className="content-grid lower-grid"><section className="card"><div className="card-heading"><div><h2>Recent billing cycles</h2><p>AC and other-appliance split when recorded</p></div><button className="btn" onClick={()=>setView("bills")}>View all</button></div><div className="table-wrap"><table><thead><tr><th>Billing period</th><th className="num">Usage</th><th className="num">AC</th><th className="num">Other</th><th className="num">Bill</th><th className="num">₱/kWh</th></tr></thead><tbody>{bills.slice(0,5).map(row=><tr key={row.id}><td>{periodLabel(row)}</td><td className="num">{row.total==null?"—":`${quantity(row.total,0)} kWh`}</td><td className="num">{quantity(row.ac,1)}</td><td className="num">{quantity(row.other,1)}</td><td className="num">{money(row.bill)}</td><td className="num">{money(row.pricePerKwh)}</td></tr>)}</tbody></table></div></section>
          <section className="card"><div className="card-heading"><div><h2>AC consumption</h2><p>Latest LG ThinQ log · cycle in progress</p></div><button className="btn" onClick={()=>setView("ac")}>Details</button></div><div className="ac-mini-list">{data.ac.slice(0,3).map(row=><div className="appliance-row" key={row.id}><span className="appliance-icon">ϟ</span><div><b>{row.room}</b><small>{dateLabel(row.from)} – {dateLabel(row.to)}</small></div><strong>{quantity(row.kwh,1)} kWh</strong></div>)}</div><div className="notice">These readings are tracked separately. Match their dates to a bill cycle before calculating the AC/other split.</div></section></div>
        <section className="card ai-card"><div className="card-heading"><div><h2>Monthly energy review</h2><p>Compare usage and bill rates, then plan the next cycle.</p></div><span className="badge">AI analysis</span></div>
          <div className="ai-controls"><label>AI provider<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="openai">ChatGPT · OpenAI</option><option value="gemini">Gemini · Google</option><option value="anthropic">Claude · Anthropic</option></select></label><label>Model ID<input value={model} onChange={e=>setModel(e.target.value)} placeholder="Enter the provider model ID" required/></label><label>Provider API key<input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off" placeholder="Used for this request only" required/></label></div>
      <div className="data-consent"><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree to send up to 24 bills and notes, recent AC readings, and meter readings to the selected AI provider for this analysis.</label><small>The API key is sent through this app’s server and is not saved. The provider may charge for use and process submitted data under its own policy.</small></div>
          <button className="btn primary" onClick={()=>void analyze()} disabled={analysisBusy}>{analysisBusy?"Analyzing…":"Analyze latest bills"}</button>{analysis&&<pre className="analysis-output">{analysis}</pre>}
        </section>
        <p className="page-footnote">Imported from the workbook. Blank source values remain blank until you enter them.</p>
      </>}

      {view==="bills"&&<section className="card full-card"><div className="card-heading"><div><h2>Bill history</h2><p>Largest values in each numeric column are highlighted, beginning with kWh.</p></div><button className="btn primary" onClick={()=>setEntryType("bill")}>＋ Add bill</button></div><div className="table-wrap"><table className="wide-table"><thead><tr><th>Bill date</th><th>Period</th><th className="num">kWh</th><th className="num">AC kWh</th><th className="num">Other kWh</th><th className="num">Avg/day</th><th className="num">Generation</th><th className="num">Transmission</th><th className="num">System loss</th><th className="num">Ancillary</th><th className="num">Bill total</th><th className="num">₱/kWh</th></tr></thead><tbody>{bills.map(row=>{const fields:(keyof Bill)[]=["total","ac","other","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh"];const values:(number|null)[]=[row.total,row.ac,row.other,row.avgPerDay,row.generation,row.transmission,row.systemLoss,row.ancillary,row.bill,row.pricePerKwh];return <tr key={row.id}><td>{dateLabel(row.billDate)}</td><td>{periodLabel(row)}</td>{values.map((value,index)=><td key={fields[index]} className={`num ${value!=null&&value===maxValues[fields[index]]?"largest-cell":""}`}>{index>=6?money(value):quantity(value,index<3?1:2)}</td>)}</tr>})}</tbody></table></div></section>}

      {view==="ac"&&<><div className="section-heading"><div><h2>AC tracking</h2><p>Log LG ThinQ readings by room and billing dates.</p></div><button className="btn primary" onClick={()=>setEntryType("ac")}>＋ Add AC reading</button></div><div className="metric-grid ac-grid">{[...new Set(data.ac.map(row=>row.room))].map(room=>{const values=data.ac.filter(row=>row.room===room);return <section className="card" key={room}><h3>{room}</h3><div className="metric-value">{quantity(values.reduce((sum,row)=>sum+row.kwh,0),1)} <small>kWh logged</small></div><p className="muted">{values.length} reading periods</p></section>})}</div><section className="card section-card"><div className="card-heading"><div><h2>AC reading log</h2><p>Match readings to the utility’s period dates for accurate bill reconciliation.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room / unit</th><th>Date range</th><th className="num">Consumption</th><th>Source</th></tr></thead><tbody>{data.ac.map(row=><tr key={row.id}><td>{row.room}</td><td>{dateLabel(row.from)} – {dateLabel(row.to)}</td><td className="num">{quantity(row.kwh,2)} kWh</td><td><span className="badge">{row.source}</span></td></tr>)}</tbody></table></div></section></>}

      {view==="meter"&&<><div className="section-heading"><div><h2>Daily meter readings</h2><p>Track household use between utility bills.</p></div><button className="btn primary" onClick={()=>setEntryType("meter")}>＋ Add reading</button></div><div className="metric-grid two-metrics"><Metric title="Latest meter reading" value={data.meters[0]?`${quantity(data.meters[0].reading,1)} kWh`:"—"} caption={data.meters[0]?dateLabel(data.meters[0].date):"No reading yet"} icon="◉"/><Metric title="Since previous reading" value={data.meters.length>1?`${quantity(data.meters[0].reading-data.meters[1].reading,1)} kWh`:"—"} caption={data.meters.length>1?`${dateLabel(data.meters[1].date)} to ${dateLabel(data.meters[0].date)}`:"Add another reading"} icon="ϟ"/></div><section className="card section-card"><div className="card-heading"><div><h2>Reading log</h2><p>Daily meter values imported from your workbook.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th className="num">Meter reading</th><th className="num">Daily usage</th></tr></thead><tbody>{data.meters.map((row,index)=><tr key={row.id}><td>{dateLabel(row.date)}</td><td className="num">{quantity(row.reading,1)} kWh</td><td className="num">{data.meters[index+1]?`${quantity(row.reading-data.meters[index+1].reading,1)} kWh`:"—"}</td></tr>)}</tbody></table></div></section></>}
    </main>
    {entryType&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEntryType(null)}}><section className="modal-card"><div className="modal-head"><h2>{entryType==="bill"?"Add a bill":entryType==="ac"?"Add an AC reading":"Add a meter reading"}</h2><button className="btn icon" onClick={()=>setEntryType(null)} aria-label="Close">×</button></div><form className="entry-form" onSubmit={saveEntry}>
      {entryType==="bill"&&<><Field name="billDate" label="Bill date" type="date" required/><Field name="periodFrom" label="Period starts" type="date" required/><Field name="periodTo" label="Period ends" type="date" required/><Field name="total" label="Total usage (kWh)" type="number" required/><Field name="bill" label="Electricity bill (₱)" type="number" required/><Field name="avgPerDay" label="Average kWh / day" type="number"/><Field name="ac" label="AC use (kWh)" type="number"/><Field name="other" label="Other appliance use (kWh)" type="number"/><Field name="generation" label="Generation charge / kWh" type="number"/><Field name="transmission" label="Transmission charge / kWh" type="number"/><Field name="systemLoss" label="System loss charge / kWh" type="number"/><Field name="ancillary" label="Ancillary service charge" type="number"/><Field name="pricePerKwh" label="Blended price / kWh" type="number"/><Field name="comment" label="Notes"/> </>}
      {entryType==="ac"&&<><Field name="room" label="Room / AC name" required/><Field name="from" label="Period starts" type="date" required/><Field name="to" label="Period ends" type="date" required/><Field name="kwh" label="Consumption (kWh)" type="number" required/></>}
      {entryType==="meter"&&<><Field name="date" label="Reading date" type="date" required/><Field name="reading" label="Meter reading (kWh)" type="number" required/></>}
      <div className="modal-actions"><button type="button" className="btn" onClick={()=>setEntryType(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?"Saving…":"Save entry"}</button></div>
    </form></section></div>}
    {notice&&<div className="toast" role="status">{notice}</div>}
  </div>;
}

function Metric({title,value,caption,icon}:{title:string;value:string;caption:string;icon:string}){return <section className="card metric-card"><div className="metric-head"><span>{title}</span><i>{icon}</i></div><div className="metric-value">{value}</div><div className="metric-caption">{caption}</div></section>}
function RateRows({bill}:{bill?:Bill}){const rows:Array<[string,number|null|undefined,boolean]>=[["Generation charge / kWh",bill?.generation,true],["Transmission charge / kWh",bill?.transmission,true],["System loss / kWh",bill?.systemLoss,true],["Ancillary service charge",bill?.ancillary,false],["Blended price / kWh",bill?.pricePerKwh,true]];return <div className="rate-list">{rows.map(([label,value,perKwh])=><div className="rate-row" key={label}><span>{label}</span><strong>{value==null?"—":`${money(value)}${perKwh?" / kWh":""}`}</strong></div>)}</div>}
function Field({name,label,type="text",required=false}:{name:string;label:string;type?:string;required?:boolean}){return <label>{label}<input name={name} type={type} step={type==="number"?"any":undefined} required={required}/></label>}

