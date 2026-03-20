import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';

const COLORS_BUCKET  = ['#ef4444','#f97316','#eab308','#22c55e'];
const COLORS_CHANNEL = ['#8b5cf6','#06b6d4','#10b981'];

// ---------------------------------------------------------------------------
// Robust field reader — tries multiple possible column name variants
// ---------------------------------------------------------------------------
function col(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

const getEscId    = r => col(r, 'Escalation ID', 'escalationId', 'id');
const getChannel  = r => col(r, 'Source Channel', 'sourceChannel', 'channel', 'Channel');
const getDateTime = r => col(r, 'Date & Time', 'dateTime', 'Date', 'date');
const getAccount  = r => col(r, 'Account/Company', 'account', 'Account', 'Company', 'company');
const getBucket   = r => col(r, 'Bucket', 'bucket');
const getPriority = r => col(r, 'Priority Label', 'priorityLabel', 'Priority', 'priority');
const getOwner    = r => col(r, 'Assigned Owner', 'assignedOwner', 'Owner', 'owner');
const getOwnerDep = r => col(r, 'Owner Department', 'ownerDepartment', 'Department');
const getOwnerEm  = r => col(r, 'Owner Email', 'ownerEmail');
const getSlaHrs   = r => col(r, 'SLA (hrs)', 'slaHrs', 'SLA hrs', 'SLA');
const getSlaDeadl = r => col(r, 'SLA Deadline', 'slaDeadline');
const getStatus   = r => col(r, 'Status', 'status');
const getTat      = r => col(r, 'TAT (hrs)', 'tatHrs', 'TAT');
const getFlags    = r => col(r, 'Flags', 'flags');
const getSummary  = r => col(r, 'AI Summary', 'aiSummary', 'Summary', 'summary');
const getSender   = r => col(r, 'Sender', 'sender');
const getOrigId   = r => col(r, 'Original Msg ID', 'originalMsgId');
const getContext  = r => col(r, 'Subject/Context', 'subjectContext', 'Subject', 'Context');
const getContent  = r => col(r, 'Full Email Content', 'Full Message Content', 'Full Content', 'fullContent', 'content');

// Parse date strings — handles "01-Jan-2026 09:28", ISO, and others
function parseDate(str) {
  if (!str) return null;
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  // "01-Jan-2026 09:28" format
  const m = str.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function slaStatus(row) {
  if (getStatus(row).toLowerCase() === 'closed') return 'closed';
  const deadline = parseDate(getSlaDeadl(row));
  if (!deadline) return 'ok';
  const diffHrs = (deadline - new Date('2026-03-20T10:00:00Z')) / 36e5;
  if (diffHrs < 0)  return 'breached';
  if (diffHrs < 2)  return 'approaching';
  return 'ok';
}

function SlaLight({ row }) {
  const s = slaStatus(row);
  const map = {
    ok:'bg-green-500', approaching:'bg-yellow-400', breached:'bg-red-500 animate-pulse', closed:'bg-gray-500'
  };
  const tip = { ok:'Within SLA', approaching:'Approaching SLA', breached:'SLA Breached', closed:'Closed' };
  return <span title={tip[s]} className={`inline-block w-2.5 h-2.5 rounded-full ${map[s]}`} />;
}

function FlagChips({ flags }) {
  if (!flags) return <span className="text-gray-600 text-xs">—</span>;
  const arr = typeof flags === 'string'
    ? flags.split(',').map(f => f.trim()).filter(Boolean)
    : (Array.isArray(flags) ? flags : []);
  if (!arr.length) return <span className="text-gray-600 text-xs">—</span>;
  const redFlags = ['IRDAI Threat','Legal Threat','Emergency/ICU'];
  return (
    <div className="flex flex-wrap gap-1">
      {arr.map(f => (
        <span key={f} className={redFlags.includes(f) ? 'flag-chip-red' : 'flag-chip-orange'}>{f}</span>
      ))}
    </div>
  );
}

function PriorityBadge({ label }) {
  const cls = { Critical:'badge-critical', High:'badge-high', Medium:'badge-medium', Low:'badge-low' };
  return <span className={cls[label] || 'badge-low'}>{label || 'Low'}</span>;
}

function StatusBadge({ status }) {
  const cls = {
    'Open':'status-open','In Progress':'status-inprogress',
    'Blocked':'status-blocked','Closed':'status-closed',
  };
  return <span className={cls[status] || 'status-open'}>{status || 'Open'}</span>;
}

function OwnerCell({ row, employeeMap }) {
  const name = getOwner(row);
  const emp  = employeeMap?.[name];
  const dept = emp?.['Department'] || getOwnerDep(row);
  return (
    <div>
      <p className="text-white font-medium text-xs whitespace-nowrap">{name || 'Unassigned'}</p>
      {dept && <p className="text-gray-400 text-xs mt-0.5">{dept}</p>}
    </div>
  );
}

const CHANNEL_ICON = { Email:'✉️', Slack:'💬', WhatsApp:'📱' };

// ---------------------------------------------------------------------------
export default function VPView({ data, onStatusChange, employeeMap = {} }) {
  const [filterBucket,   setFilterBucket]   = useState('All');
  const [filterStatus,   setFilterStatus]   = useState('All');
  const [filterChannel,  setFilterChannel]  = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [search,         setSearch]         = useState('');
  const [expandedId,     setExpandedId]     = useState(null);

  // KPIs
  const totalOpen   = data.filter(r => getStatus(r).toLowerCase() !== 'closed').length;
  const critical    = data.filter(r => getPriority(r) === 'Critical').length;
  const slaBreached = data.filter(r => slaStatus(r) === 'breached').length;
  const resolved    = data.filter(r => getStatus(r).toLowerCase() === 'closed').length;

  const filtered = useMemo(() => data.filter(r => {
    const s = getSearch => getSearch(r).toLowerCase();
    return (
      (filterBucket   === 'All' || getBucket(r)   === filterBucket)   &&
      (filterStatus   === 'All' || getStatus(r)   === filterStatus)   &&
      (filterChannel  === 'All' || getChannel(r)  === filterChannel)  &&
      (filterPriority === 'All' || getPriority(r) === filterPriority) &&
      (!search ||
        getAccount(r).toLowerCase().includes(search.toLowerCase())  ||
        getEscId(r).toLowerCase().includes(search.toLowerCase())    ||
        getSummary(r).toLowerCase().includes(search.toLowerCase()))
    );
  }), [data, filterBucket, filterStatus, filterChannel, filterPriority, search]);

  // Chart: by bucket
  const bucketData = useMemo(() => {
    const counts = {};
    data.forEach(r => {
      const b = getBucket(r) || 'Unknown';
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace('/Portal',''), value }));
  }, [data]);

  // Chart: by channel
  const channelData = useMemo(() => {
    const counts = {};
    data.forEach(r => {
      const c = getChannel(r) || 'Unknown';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data]);

  // Chart: trend over time (week buckets)
  const timeData = useMemo(() => {
    const byWeek = {};
    data.forEach(r => {
      const d = parseDate(getDateTime(r));
      if (!d) return;
      const mon = d.toLocaleString('default', { month: 'short' });
      const wk  = Math.ceil(d.getDate() / 7);
      const key = `${mon} W${wk}`;
      byWeek[key] = (byWeek[key] || 0) + 1;
    });
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [data]);

  const rowBg = r => {
    const p = getPriority(r);
    if (p === 'Critical') return 'table-row-critical border-l-2 border-red-500';
    if (p === 'High')     return 'table-row-high border-l-2 border-orange-500';
    return 'table-row-default border-l-2 border-transparent';
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi-card bg-gray-900">
          <span className="text-3xl font-bold text-white">{totalOpen}</span>
          <span className="text-sm text-gray-400">Total Open Escalations</span>
          <span className="text-xs text-violet-400 mt-1">↑ across all channels</span>
        </div>
        <div className="kpi-card bg-red-950/50 border-red-800/50">
          <span className="text-3xl font-bold text-red-400">{critical}</span>
          <span className="text-sm text-gray-400">Critical Priority</span>
          <span className="text-xs text-red-400 mt-1">⚠ Needs immediate action</span>
        </div>
        <div className="kpi-card bg-orange-950/40 border-orange-800/50">
          <span className="text-3xl font-bold text-orange-400">{slaBreached}</span>
          <span className="text-sm text-gray-400">SLA Breached</span>
          <span className="text-xs text-orange-400 mt-1">⏰ Past deadline</span>
        </div>
        <div className="kpi-card bg-green-950/40 border-green-800/50">
          <span className="text-3xl font-bold text-green-400">{resolved}</span>
          <span className="text-sm text-gray-400">Resolved (Closed)</span>
          <span className="text-xs text-green-400 mt-1">✓ Closed escalations</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Escalations by Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bucketData} margin={{top:0,right:8,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{fill:'#9ca3af',fontSize:10}} />
              <YAxis tick={{fill:'#9ca3af',fontSize:10}} />
              <Tooltip contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,color:'#f9fafb'}} />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {bucketData.map((_, i) => <Cell key={i} fill={COLORS_BUCKET[i % COLORS_BUCKET.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">By Channel</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={channelData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}
                labelLine={false}
              >
                {channelData.map((_, i) => <Cell key={i} fill={COLORS_CHANNEL[i % COLORS_CHANNEL.length]} />)}
              </Pie>
              <Tooltip contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,color:'#f9fafb'}} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Trend (Jan – Mar 2026)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeData} margin={{top:0,right:8,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{fill:'#9ca3af',fontSize:9}} />
              <YAxis tick={{fill:'#9ca3af',fontSize:10}} />
              <Tooltip contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,color:'#f9fafb'}} />
              <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{r:3,fill:'#8b5cf6'}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search account, ID, summary…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 w-64 placeholder-gray-500"
          />
          {[
            ['Bucket',   filterBucket,   setFilterBucket,   ['All','Escalation','Claim Issue','Policy Issue','Tech/Portal Issue']],
            ['Priority', filterPriority, setFilterPriority, ['All','Critical','High','Medium','Low']],
            ['Status',   filterStatus,   setFilterStatus,   ['All','Open','In Progress','Blocked','Closed']],
            ['Channel',  filterChannel,  setFilterChannel,  ['All','Email','Slack','WhatsApp']],
          ].map(([label, val, setter, opts]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{label}:</span>
              <select className="filter-select" value={val} onChange={e => setter(e.target.value)}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <span className="ml-auto text-xs text-gray-500">{filtered.length} rows</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-gray-900 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-semibold text-gray-200">All Escalations — Audit Log</h3>
          <span className="text-xs text-gray-500">Click any row to expand full message</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase bg-gray-950/60">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Ch</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Bucket</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">SLA Deadline</th>
                <th className="px-4 py-3 text-left">SLA</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r, idx) => {
                const id = getEscId(r) || `row-${idx}`;
                return (
                  <React.Fragment key={id}>
                    <tr
                      className={`${rowBg(r)} cursor-pointer transition-colors`}
                      onClick={() => setExpandedId(expandedId === id ? null : id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-violet-400 whitespace-nowrap">{getEscId(r) || '—'}</td>
                      <td className="px-4 py-3 text-lg" title={getChannel(r)}>{CHANNEL_ICON[getChannel(r)] || '📄'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {getDateTime(r) ? getDateTime(r).slice(0,10) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{getAccount(r) || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{getBucket(r) || '—'}</td>
                      <td className="px-4 py-3"><PriorityBadge label={getPriority(r)} /></td>
                      <td className="px-4 py-3"><OwnerCell row={r} employeeMap={employeeMap} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{getSlaDeadl(r) || '—'}</td>
                      <td className="px-4 py-3"><SlaLight row={r} /></td>
                      <td className="px-4 py-3"><StatusBadge status={getStatus(r)} /></td>
                      <td className="px-4 py-3"><FlagChips flags={getFlags(r)} /></td>
                    </tr>

                    {expandedId === id && (
                      <tr className="bg-gray-800/60">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-xs text-gray-400">
                            <div><span className="text-gray-500">Sender:</span> {getSender(r)}</div>
                            <div><span className="text-gray-500">Owner Email:</span> {getOwnerEm(r)}</div>
                            <div><span className="text-gray-500">Dept:</span> {getOwnerDep(r)}</div>
                            <div><span className="text-gray-500">Context:</span> {getContext(r)}</div>
                            <div><span className="text-gray-500">SLA:</span> {getSlaHrs(r)}h</div>
                            <div><span className="text-gray-500">TAT:</span> {getTat(r) || 0}h</div>
                            <div><span className="text-gray-500">Orig ID:</span> {getOrigId(r)}</div>
                          </div>
                          <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                            {getContent(r) || getSummary(r) || '(no content)'}
                          </div>
                          <div className="mt-3 flex gap-2">
                            {['Open','In Progress','Blocked','Closed'].map(s => (
                              <button
                                key={s}
                                onClick={e => { e.stopPropagation(); onStatusChange(id, s); }}
                                className={`btn-status ${getStatus(r) === s
                                  ? 'bg-violet-700 border-violet-500 text-white'
                                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                              >{s}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-600">
                    No escalations match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
